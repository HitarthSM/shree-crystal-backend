/**
 * prisma/reencrypt-pii.ts
 *
 * One-off migration: re-encrypts Aadhaar/PAN with FIELD_ENCRYPTION_KEY (they were encrypted with a
 * public fallback key by older builds) and replaces the unsalted SHA-256 Aadhaar hash with the keyed hash.
 *
 *   npx ts-node --project tsconfig.json prisma/reencrypt-pii.ts            # dry run, writes nothing
 *   npx ts-node --project tsconfig.json prisma/reencrypt-pii.ts --apply    # writes
 *
 * BEFORE --apply: take a database backup and keep a copy of FIELD_ENCRYPTION_KEY somewhere safe.
 * Losing that key makes every Aadhaar/PAN unreadable. Safe to re-run: finished rows are skipped.
 * It never prints Aadhaar/PAN values.
 */

import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EncryptionService } from '../src/common/services/encryption.service';
import { planReencryption } from '../src/members/pii-reencryption';

const PAGE_SIZE = 200;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const config = new ConfigService();
  const encryption = new EncryptionService(config);

  if (!encryption.hasDedicatedKey) {
    throw new Error('FIELD_ENCRYPTION_KEY is not set. Nothing to migrate to.');
  }

  const prisma = new PrismaService(config);
  await prisma.$connect();

  let scanned = 0;
  let changed = 0;
  let failed = 0;
  let cursor: string | undefined;

  try {
    for (;;) {
      const rows = await prisma.member.findMany({
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, aadhaarHash: true, aadhaarEncrypted: true, panEncrypted: true },
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;

      const updates: { id: string; data: NonNullable<ReturnType<typeof planReencryption>> }[] = [];
      for (const row of rows) {
        scanned += 1;
        try {
          const data = planReencryption(encryption, row);
          if (data) updates.push({ id: row.id, data });
        } catch {
          failed += 1;
          console.error(`Could not read PII for member row ${row.id}; left untouched.`);
        }
      }

      changed += updates.length;
      if (apply && updates.length > 0) {
        await prisma.$transaction(
          updates.map((u) =>
            prisma.member.update({ where: { id: u.id }, data: u.data, select: { id: true } }),
          ),
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `${apply ? 'APPLIED' : 'DRY RUN'}: scanned ${scanned}, ${apply ? 'updated' : 'would update'} ${changed}, unreadable ${failed}.`,
  );
  if (!apply && changed > 0) console.log('Re-run with --apply after taking a database backup.');
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
