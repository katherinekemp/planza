// Recreates an empty `planza_test` database and applies migrations before the test run.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  const admin = postgres('postgres://planza:planza@localhost:5432/planza', {
    max: 1,
    onnotice: () => {},
  });
  await admin.unsafe('drop database if exists planza_test with (force)');
  await admin.unsafe('create database planza_test');
  await admin.end();

  const client = postgres('postgres://planza:planza@localhost:5432/planza_test', {
    max: 1,
    onnotice: () => {},
  });
  await migrate(drizzle(client), {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  });
  await client.end();
}
