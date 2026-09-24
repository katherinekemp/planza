// Applies any pending SQL migrations, then exits.
// Runs locally via `pnpm db:migrate` and in production before each deploy.
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sqlClient } from './client.ts';

const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? new URL('../../drizzle', import.meta.url).pathname;

await migrate(db, { migrationsFolder });
console.log('Migrations applied');
await sqlClient.end();
