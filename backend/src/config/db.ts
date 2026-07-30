import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env, isProd } from '@/config/env';
import * as schema from '@/db/schema';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
