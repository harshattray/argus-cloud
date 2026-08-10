import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignPutOptions, PresignedGet, PresignedPut, Storage, StorageObject } from "../storage.js";
import {
  assertSafeKey,
  assertTtl,
  DEFAULT_GET_TTL_SECONDS,
  DEFAULT_PUT_TTL_SECONDS,
  StorageKeyError,
} from "./keys.js";

/**
 * S3/R2 storage driver.
 *
 * **This is the only file in the repository permitted to import an AWS SDK
 * type** (BuildV5 F3.2, enforced by `test/storage.test.mjs` S9). It is reached
 * only through `createStorage()`'s dynamic import, so the filesystem path never
 * evaluates the SDK at all.
 *
 * Cloudflare R2 is S3-compatible, which is why one driver covers both. The two
 * differences that matter are configuration, not code: R2 wants region `auto`
 * and an account-specific endpoint. MinIO — what the suite runs against — wants
 * path-style addressing, because a bucket-as-subdomain does not resolve against
 * `localhost`.
 */

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** MinIO and some R2 setups need `bucket/key` paths rather than `bucket.host`. */
  forcePathStyle?: boolean;
}

/** S3 signals "no such object" through error names rather than a null result. */
function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export function createS3Storage(options: S3StorageOptions): Storage {
  if (!options.bucket) {
    throw new StorageKeyError("NORMA_STORAGE_BUCKET is required for the S3 driver");
  }
  // Fail loudly rather than falling back to the ambient AWS credential chain.
  // An unconfigured deployment silently picking up a developer's default
  // profile is how artifacts end up in the wrong account.
  if (!options.accessKeyId || !options.secretAccessKey) {
    throw new StorageKeyError(
      "NORMA_STORAGE_ACCESS_KEY_ID and NORMA_STORAGE_SECRET_ACCESS_KEY are required for the S3 driver"
    );
  }

  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle ?? false,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });
  const Bucket = options.bucket;

  return {
    driver: "s3",

    async put(key, body, opts) {
      assertSafeKey(key);
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: opts?.contentType })
      );
    },

    async get(key) {
      assertSafeKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!res.Body) return null;
        return new Uint8Array(await res.Body.transformToByteArray());
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async head(key): Promise<StorageObject | null> {
      assertSafeKey(key);
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async presignPut(key, opts: PresignPutOptions): Promise<PresignedPut> {
      assertSafeKey(key);
      const ttl = opts.ttlSeconds ?? DEFAULT_PUT_TTL_SECONDS;
      assertTtl(ttl);
      if (!Number.isInteger(opts.contentLength) || opts.contentLength < 0) {
        throw new StorageKeyError("contentLength must be a non-negative integer");
      }
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentLength: opts.contentLength,
          ContentType: opts.contentType,
        }),
        {
          expiresIn: ttl,
          // Pins the byte count into the signature. Without this the URL
          // authorises "a PUT to this key" of any size, and the storage quota
          // reserved at declare time stops meaning anything at transfer time.
          signableHeaders: new Set(["content-length"]),
        }
      );
      return {
        url,
        method: "PUT",
        headers: {
          "content-length": String(opts.contentLength),
          ...(opts.contentType ? { "content-type": opts.contentType } : {}),
        },
        expiresAt: new Date(Date.now() + ttl * 1000),
      };
    },

    async presignGet(key, opts): Promise<PresignedGet> {
      assertSafeKey(key);
      const ttl = opts?.ttlSeconds ?? DEFAULT_GET_TTL_SECONDS;
      assertTtl(ttl);
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: ttl,
      });
      return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
    },

    async delete(key) {
      assertSafeKey(key);
      // S3 delete is already idempotent — deleting an absent key returns 204.
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async deletePrefix(prefix) {
      assertSafeKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
      let deleted = 0;
      let ContinuationToken: string | undefined;

      // Paginated, and re-listing on each pass rather than collecting every key
      // first: an org prefix can hold far more objects than fit comfortably in
      // memory, and a job that dies half-way must be able to resume by simply
      // being called again.
      do {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken })
        );
        const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
        if (keys.length > 0) {
          // DeleteObjects caps at 1000 per call, which is also ListObjectsV2's
          // default page size — but the cap is asserted here rather than assumed.
          for (let i = 0; i < keys.length; i += 1000) {
            const batch = keys.slice(i, i + 1000);
            const res = await client.send(
              new DeleteObjectsCommand({
                Bucket,
                Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
              })
            );
            const errors = res.Errors ?? [];
            if (errors.length > 0) {
              // Partial failure is reported, not swallowed. The caller retries;
              // the objects already gone stay gone, so the retry converges.
              throw new Error(
                `deletePrefix: ${errors.length} object(s) failed to delete, first: ${errors[0]?.Code ?? "unknown"}`
              );
            }
            deleted += batch.length;
          }
        }
        ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (ContinuationToken);

      return deleted;
    },
  };
}
