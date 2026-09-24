import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// RDS requires TLS; the local Docker database doesn't support it.
const needsSsl = !/localhost|127\.0\.0\.1/.test(url);

export const sqlClient = postgres(url, { max: 10, ssl: needsSsl ? 'require' : false });
export const db = drizzle(sqlClient, { schema, casing: 'snake_case' });
export type Db = typeof db;
