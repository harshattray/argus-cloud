import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Database seam. Production and CI set DATABASE_URL and get node-postgres;
 * local dev and the test suite get PGlite — real Postgres (WASM,
 * in-process), same SQL, zero setup. Correctness never depends on the
 * driver: every balance-changing statement is a single conditional UPDATE
 * whose guard runs inside the database, and CHECK constraints back it up.
 */

export interface QueryResult<T> {
  rows: T[];
}

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Multi-statement execution (migrations only — no params, no results). */
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url });
    const wrap = (runner: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
      async query(text, params) {
        const res = await runner.query(text, params);
        return { rows: res.rows as never[] };
      },
      async exec(text) {
        await runner.query(text);
      },
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(wrap(client as never));
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    });
    return wrap(pool as never);
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const lite = new PGlite();
  const wrapLite = (runner: {
    query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>;
  }): Db => ({
    async query(text, params) {
      const res = await runner.query(text, params);
      return { rows: res.rows as never[] };
    },
    async exec(text) {
      await lite.exec(text);
    },
    async transaction(fn) {
      return lite.transaction(async (tx) => fn(wrapLite(tx as never))) as Promise<never>;
    },
    async close() {
      await lite.close();
    },
  });
  return wrapLite(lite as never);
}

/** Applies migrations/*.sql in filename order, tracked in schema_migrations. */
export async function migrate(db: Db): Promise<void> {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const applied = new Set(
    (await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
    await db.exec(sql);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
  }
}
