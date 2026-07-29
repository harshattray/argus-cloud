import { createDb, migrate, type Db } from "argus-cloud/db.js";

/**
 * Process-wide database handle. Vercel/Next may instantiate several route
 * modules; globalThis keeps one pool (or one PGlite in local dev) and runs
 * migrations exactly once per process.
 */
const globalStore = globalThis as unknown as { __normaDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalStore.__normaDb) {
    globalStore.__normaDb = (async () => {
      const db = await createDb();
      await migrate(db);
      return db;
    })();
  }
  return globalStore.__normaDb;
}
