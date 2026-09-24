// Applies any pending SQL migrations in ./drizzle, then exits.
// Runs locally via `pnpm db:migrate` and in production before each deploy.
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sqlClient } from './client.ts';

await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
console.log('Migrations applied');
await sqlClient.end();
