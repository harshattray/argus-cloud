import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { PresignPutOptions, PresignedGet, PresignedPut, Storage, StorageObject } from "../storage.js";
import {
  assertSafeKey,
  assertTtl,
  DEFAULT_GET_TTL_SECONDS,
  DEFAULT_PUT_TTL_SECONDS,
  StorageKeyError,
} from "./keys.js";

/**
 * Filesystem storage driver — local development and the test suites.
 *
 * It is not a mock. Everything the S3 driver promises, this one keeps: the same
 * keys, the same idempotent delete, the same prefix delete, the same signed
 * URLs with the same expiry rules. The suites run against it (BuildV5 F3.1), so
 * anywhere it is laxer than S3 is somewhere the tests stop predicting
 * production.
 *
 * **Presigning is real here, not stubbed to a plain path.** The URL carries an
 * HMAC over the key, method, expiry, pinned content length and nonce, and
 * `verifyPresigned` re-derives it. A local driver that skipped the signature
 * would mean the route serving blobs is never exercised against a bad
 * signature, and that route is the one that ships.
 */

export interface FilesystemStorageOptions {
  root: string;
  /** Where presigned URLs point — the app route that verifies and serves. */
  publicBaseUrl: string;
  /**
   * Omitted in dev, where a random per-process secret is generated instead.
   * That fails closed across restarts (old URLs stop verifying) rather than
   * falling back to a fixed, guessable default, which would be a signing key
   * committed to the repo in all but name.
   */
  signingSecret?: string;
}

export interface PresignedParams {
  key: string;
  method: "PUT" | "GET";
  expires: number;
  contentLength?: number;
  nonce?: string;
  signature: string;
}

const META_SUFFIX = ".meta.json";

export function createFilesystemStorage(options: FilesystemStorageOptions): Storage {
  const root = path.resolve(options.root);
  const secret = options.signingSecret || randomBytes(32).toString("hex");
  const baseUrl = options.publicBaseUrl.replace(/\/+$/, "");

  /**
   * Resolves a key to a path and proves the result is still inside the root.
   *
   * `assertSafeKey` already rejects traversal, so this is the second of two
   * independent checks rather than the only one — the containment check is
   * cheap and it is the one that holds if the key rules are ever loosened.
   */
  function resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new StorageKeyError("key escapes the storage root");
    }
    return full;
  }

  function sign(params: Omit<PresignedParams, "signature">): string {
    // Field names are in the signed string, so a value cannot be slid from one
    // field into another (`len=1&nonce=2` vs `len=1&nonce=2` built from
    // different parts would otherwise hash identically).
    const canonical = [
      `key=${params.key}`,
      `method=${params.method}`,
      `expires=${params.expires}`,
      `len=${params.contentLength ?? ""}`,
      `nonce=${params.nonce ?? ""}`,
    ].join("\n");
    return createHmac("sha256", secret).update(canonical).digest("hex");
  }

  async function readMeta(full: string): Promise<{ contentType?: string }> {
    try {
      return JSON.parse(await readFile(full + META_SUFFIX, "utf-8")) as { contentType?: string };
    } catch {
      return {};
    }
  }

  /** Recursively counts and removes files under a directory, ignoring metadata sidecars. */
  async function countObjects(dir: string): Promise<number> {
    let total = 0;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await countObjects(full);
      } else if (!entry.name.endsWith(META_SUFFIX)) {
        total += 1;
      }
    }
    return total;
  }

  return {
    driver: "filesystem",

    async put(key, body, opts) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      if (opts?.contentType) {
        await writeFile(full + META_SUFFIX, JSON.stringify({ contentType: opts.contentType }));
      }
    },

    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },

    async head(key): Promise<StorageObject | null> {
      const full = resolve(key);
      try {
        const info = await stat(full);
        if (!info.isFile()) return null;
        return { size: info.size, ...(await readMeta(full)) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
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
      const expiresAt = new Date(Date.now() + ttl * 1000);
      const params = {
        key,
        method: "PUT" as const,
        expires: expiresAt.getTime(),
        contentLength: opts.contentLength,
        nonce: opts.nonce,
      };
      const query = new URLSearchParams({
        key,
        method: "PUT",
        expires: String(params.expires),
        len: String(opts.contentLength),
        sig: sign(params),
      });
      if (opts.nonce) query.set("nonce", opts.nonce);
      return {
        url: `${baseUrl}?${query.toString()}`,
        method: "PUT",
        headers: {
          "content-length": String(opts.contentLength),
          ...(opts.contentType ? { "content-type": opts.contentType } : {}),
        },
        expiresAt,
      };
    },

    async presignGet(key, opts): Promise<PresignedGet> {
      assertSafeKey(key);
      const ttl = opts?.ttlSeconds ?? DEFAULT_GET_TTL_SECONDS;
      assertTtl(ttl);
      const expiresAt = new Date(Date.now() + ttl * 1000);
      const query = new URLSearchParams({
        key,
        method: "GET",
        expires: String(expiresAt.getTime()),
        sig: sign({ key, method: "GET", expires: expiresAt.getTime() }),
      });
      return { url: `${baseUrl}?${query.toString()}`, expiresAt };
    },

    async delete(key) {
      const full = resolve(key);
      await rm(full, { force: true });
      await rm(full + META_SUFFIX, { force: true });
    },

    async deletePrefix(prefix) {
      assertSafeKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
      const full = path.resolve(root, prefix);
      if (full !== root && !full.startsWith(root + path.sep)) {
        throw new StorageKeyError("prefix escapes the storage root");
      }
      // Counted before removal so the receipt reports what actually went, and
      // `force` makes a re-run after a partial failure a no-op rather than an
      // error — deletion jobs retry.
      const deleted = await countObjects(full);
      await rm(full, { recursive: true, force: true });
      return deleted;
    },
  };
}

/**
 * Standalone verifier for the route that serves local presigned URLs.
 *
 * Split from the driver so the serving route can verify without constructing a
 * Storage instance, and so the comparison is a single well-tested function.
 * Returns a reason rather than throwing: the caller turns every failure into
 * one indistinguishable 403, so a probe cannot learn *why* it was refused.
 */
export function verifyPresigned(
  params: PresignedParams,
  signingSecret: string,
  now: Date = new Date()
): { ok: true } | { ok: false; reason: string } {
  if (!params?.key || !params.signature) {
    return { ok: false, reason: "missing parameters" };
  }
  try {
    assertSafeKey(params.key);
  } catch {
    return { ok: false, reason: "invalid key" };
  }
  if (!Number.isFinite(params.expires) || params.expires <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  const canonical = [
    `key=${params.key}`,
    `method=${params.method}`,
    `expires=${params.expires}`,
    `len=${params.contentLength ?? ""}`,
    `nonce=${params.nonce ?? ""}`,
  ].join("\n");
  const expected = createHmac("sha256", signingSecret).update(canonical).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(params.signature, "hex");
  // Length-check first: timingSafeEqual throws on a length mismatch, and a
  // thrown error is itself a timing signal.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true };
}
