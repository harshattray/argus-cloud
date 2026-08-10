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
  // PGLITE_DATA_DIR gives local dev a persistent database (.pgdata/ is
  // gitignored) so the seed script and the dev server share state; unset, it
  // stays in-memory — what the test suites rely on.
  const dataDir = process.env.PGLITE_DATA_DIR?.trim();
  const lite = dataDir ? new PGlite(dataDir) : new PGlite();
  const wrapLite = (runner: {
    query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }>;
    exec?: (t: string) => Promise<unknown>;
  }): Db => ({
    async query(text, params) {
      const res = await runner.query(text, params);
      return { rows: res.rows as never[] };
    },
    async exec(text) {
      // Must go through the *runner*, not the outer `lite`. Inside a
      // transaction the runner is the tx handle; routing multi-statement SQL to
      // `lite` instead would execute it outside the transaction that holds the
      // migration lock — the DDL would commit even when the transaction rolled
      // back. PGlite's Transaction exposes its own `exec`, so this is a
      // one-line difference with a large blast radius.
      if (runner.exec) {
        await runner.exec(text);
        return;
      }
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

/**
 * Advisory lock key for schema migration. Arbitrary, but **fixed forever** —
 * changing it would let a bundle holding the old key migrate concurrently with
 * one holding the new key, which is the exact race the lock exists to close.
 */
const MIGRATION_LOCK_KEY = 8_314_207;

/**
 * Applies migrations/*.sql in filename order, tracked in schema_migrations.
 *
 * Serverless calls this on cold start, so N concurrent boots race one database.
 * Two things make that safe:
 *
 * 1. **A database-level advisory lock**, so exactly one caller runs the body
 *    and the rest block, then re-read `schema_migrations` and find their work
 *    already done. Taken *before* the applied-set is read — reading first and
 *    locking second would just move the race.
 * 2. **One transaction around everything**, so a failure part-way leaves no
 *    half-applied schema and no bookkeeping row for a migration that rolled
 *    back. All-or-nothing is the right trade here: a partially migrated schema
 *    is worse than an unmigrated one, and the next boot simply retries.
 *
 * The lock is **transaction-scoped, not session-scoped**. A session lock taken
 * from a pooled connection is released only by an explicit unlock or by the
 * connection closing, so a crash mid-migration — or a client handed back to the
 * pool with the lock still held — wedges every future boot with no way back in.
 * `pg_advisory_xact_lock` is released by COMMIT or ROLLBACK, including the
 * implicit rollback of a dead backend, so the worst case is a retry.
 *
 * An older bundle starting against a newer schema is a no-op: it only iterates
 * the files it ships with, and every one of them is already in
 * `schema_migrations`. Rows naming migrations it has never heard of are left
 * alone — a rollback deploy must not undo anything.
 *
 * **Migration files are append-only.** Never edit one that may have been
 * applied; add a new file. Prefer idempotent DDL (`IF NOT EXISTS`) in new
 * migrations. Never put an application data backfill here — a cold-start path
 * is the wrong place for work that needs progress and retry state; write a
 * resumable job instead.
 *
 * `dir` is injectable for tests only; production always uses `migrations/`.
 */
export async function migrate(db: Db, dir: string = MIGRATIONS_DIR): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_KEY]);

    await tx.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    const applied = new Set(
      (await tx.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = await readFile(path.join(dir, file), "utf-8");
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    }
  });
}
