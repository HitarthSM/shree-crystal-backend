/**
 * prisma/seed.ts
 *
 * Creates the initial Super Admin account from environment variables.
 * Run via: npx ts-node --project tsconfig.json prisma/seed.ts
 *          OR: npm run prisma:seed
 *
 * Environment variables required:
 *   SUPER_ADMIN_EMAIL     - email address for the super admin account
 *   SUPER_ADMIN_PASSWORD  - plain-text password (will be hashed with argon2)
 *   SUPER_ADMIN_NAME      - display name for the account
 *
 * The seed is idempotent — re-running it upserts by email so it is safe
 * to call in CI after every `prisma migrate reset`.
 */

import 'dotenv/config'; // must be first — loads .env before env-var validation

import { PrismaClient, AdminRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

// ---------------------------------------------------------------------------
// Validate required env vars before doing anything
// ---------------------------------------------------------------------------

const REQUIRED_VARS = [
  'SUPER_ADMIN_EMAIL',
  'SUPER_ADMIN_PASSWORD',
  'SUPER_ADMIN_NAME',
  'DATABASE_URL',
] as const;

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    console.error(`\n[seed] ❌  Missing required environment variable: ${key}`);
    console.error('[seed]    Add it to your .env file before running the seed.\n');
    process.exit(1);
  }
}

const email = process.env.SUPER_ADMIN_EMAIL!;
const password = process.env.SUPER_ADMIN_PASSWORD!;
const name = process.env.SUPER_ADMIN_NAME!;

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

// Prisma v7 requires a driver adapter — use PrismaPg consistent with PrismaService
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('[seed] 🌱  Starting database seed…');

  // Hash the password with argon2id (the most secure variant)
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });

  // Upsert so re-running is safe in CI / after migrate reset
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      email,
      name,
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
    },
  });

  console.log(`[seed] ✅  Super Admin upserted — id: ${admin.id}, email: ${admin.email}`);
  console.log('[seed] 🎉  Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('[seed] ❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
