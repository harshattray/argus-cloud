import { createStorage, type Storage } from "argus-cloud/storage.js";

/**
 * Process-wide storage handle, for the same reason `db.ts` keeps one pool:
 * Next may instantiate several route modules per process, and the S3 driver
 * builds a client with its own connection pool.
 *
 * `createStorage()` reads the environment and loads a driver by dynamic
 * `import()`, so on the filesystem path the AWS SDK is never evaluated.
 */
const globalStore = globalThis as unknown as { __normaStorage?: Promise<Storage> };

export function getStorage(): Promise<Storage> {
  if (!globalStore.__normaStorage) {
    globalStore.__normaStorage = createStorage();
  }
  return globalStore.__normaStorage;
}
