/**
 * Storage port (PATHWAYS.md Pathway 1 item 2 / §10.3 "1D"; BuildV5 F3).
 *
 * One interface, two drivers: **filesystem** for local development and the
 * suites, **S3/R2** for deployment. Object keys are identical in both, so
 * going live is a configuration change rather than a rewrite.
 *
 * **Nothing above this port may import an S3 SDK type.** That rule is what
 * keeps the swap cheap, and it is enforced by a test, not by good intentions —
 * see `test/storage.test.mjs` S9. The drivers are loaded by dynamic `import()`
 * for the same reason `createDb()` does it: on the filesystem path the AWS SDK
 * is never evaluated at all.
 *
 * Presigned URLs deserve particular care. FUTURENORMA §5 calls them "a new leak
 * vector with no precedent in the earlier design", and the reason is that a
 * presigned URL is a **bearer credential**: whoever holds it can use it, with no
 * session, no cookie, and no further check. Hence short TTLs by default, a hard
 * ceiling on what a caller may ask for, and a nonce so the upload protocol can
 * make one single-use.
 */

export {
  assertSafeKey,
  assertOrgId,
  blobKey,
  orgPrefix,
  isUnderPrefix,
  assertTtl,
  StorageKeyError,
  DEFAULT_GET_TTL_SECONDS,
  DEFAULT_PUT_TTL_SECONDS,
  MAX_TTL_SECONDS,
} from "./storage/keys.js";

export interface StorageObject {
  /** Actual stored byte length — the number commit-verification compares against. */
  size: number;
  contentType?: string;
}

export interface PresignedPut {
  url: string;
  method: "PUT";
  /** Headers the client MUST send; the signature covers them. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PresignedGet {
  url: string;
  expiresAt: Date;
}

export interface PresignPutOptions {
  /** Pinned into the signature, so a client cannot present a URL and then upload something larger. */
  contentLength: number;
  contentType?: string;
  ttlSeconds?: number;
  /** Opaque, echoed back by the driver. The upload protocol uses it to enforce single use. */
  nonce?: string;
}

export interface Storage {
  readonly driver: "filesystem" | "s3";

  put(key: string, body: Uint8Array, options?: { contentType?: string }): Promise<void>;

  /**
   * Not in BuildV5's six-method list, and here on purpose.
   *
   * A filesystem presigned GET points at *our own* app, so some route has to
   * turn that URL back into bytes. Letting that route reach for `node:fs`
   * directly would put a filesystem assumption above the port — precisely what
   * the no-S3-types rule exists to prevent, only in the other direction.
   */
  get(key: string): Promise<Uint8Array | null>;

  /** `null` when the object is absent, rather than throwing — absence is an expected answer. */
  head(key: string): Promise<StorageObject | null>;

  presignPut(key: string, options: PresignPutOptions): Promise<PresignedPut>;
  presignGet(key: string, options?: { ttlSeconds?: number }): Promise<PresignedGet>;

  /** Idempotent: deleting an absent key succeeds. Deletion jobs retry, and a retry must not fail. */
  delete(key: string): Promise<void>;

  /**
   * Deletes everything under `prefix`, returning how many objects went.
   *
   * This is how an organization is erased (FUTURENORMA §5), so it must be
   * resumable: safe to call again after a partial failure, and truthful about
   * the count so a deletion receipt can quote it.
   */
  deletePrefix(prefix: string): Promise<number>;
}

/**
 * Picks a driver from the environment. `NORMA_STORAGE_BUCKET` selects S3/R2;
 * without it, the filesystem driver under `NORMA_STORAGE_DIR`.
 *
 * Deliberately not a silent fallback in the other direction: if a bucket is
 * configured but its credentials are missing, the S3 driver throws rather than
 * quietly writing production artifacts to local disk.
 */
export async function createStorage(): Promise<Storage> {
  const bucket = process.env.NORMA_STORAGE_BUCKET?.trim();
  if (bucket) {
    const { createS3Storage } = await import("./storage/s3.js");
    return createS3Storage({
      bucket,
      region: process.env.NORMA_STORAGE_REGION?.trim() || "auto",
      endpoint: process.env.NORMA_STORAGE_ENDPOINT?.trim() || undefined,
      accessKeyId: process.env.NORMA_STORAGE_ACCESS_KEY_ID?.trim(),
      secretAccessKey: process.env.NORMA_STORAGE_SECRET_ACCESS_KEY?.trim(),
      forcePathStyle: process.env.NORMA_STORAGE_FORCE_PATH_STYLE === "1",
    });
  }
  const { createFilesystemStorage } = await import("./storage/filesystem.js");
  return createFilesystemStorage({
    root: process.env.NORMA_STORAGE_DIR?.trim() || ".storage",
    publicBaseUrl: process.env.NORMA_STORAGE_PUBLIC_URL?.trim() || "http://localhost:3000/api/blob",
    signingSecret: process.env.NORMA_STORAGE_SIGNING_SECRET?.trim(),
  });
}
