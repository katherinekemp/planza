import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// TLS is controlled by the URL: production (RDS) uses `?sslmode=require`.
export const sqlClient = postgres(url, { max: 10, onnotice: () => {} });
export const db = drizzle(sqlClient, { schema, casing: 'snake_case' });
export type Db = typeof db;
