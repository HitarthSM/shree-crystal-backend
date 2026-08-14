// Prisma configuration — loaded by all CLI commands
// Requires: npm install --save-dev prisma dotenv
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Run seed after `prisma migrate reset` or `prisma db seed`
    seed: 'ts-node --project tsconfig.json prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    directUrl: process.env['DIRECT_URL'],
  },
});
