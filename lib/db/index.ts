import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';
import { env } from '@/lib/env';

export type DB = NeonHttpDatabase<typeof schema>;

let cached: DB | null = null;

/**
 * Lazily-created Drizzle client over Neon's serverless HTTP driver.
 * The connection string is read through env() at first use (never at import).
 */
export function getDb(): DB {
  if (cached) return cached;
  const sql = neon(env().DATABASE_URL);
  cached = drizzle(sql, { schema });
  return cached;
}

/**
 * Proxy so callers can `import { db } from '@/lib/db'` and use it directly,
 * while the underlying connection is still created lazily on first access.
 */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export { schema };
