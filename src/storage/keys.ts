/**
 * Object-key construction and validation for the storage port.
 *
 * Keys are the tenancy boundary in storage the way `org_id` is in SQL
 * (FUTURENORMA.md §5), so they are built here and nowhere else. A caller that
 * concatenates its own key can put org A's bytes under org B's prefix, and no
 * driver would notice — object stores have no foreign keys.
 *
 * Two rules the layout encodes:
 *
 *   - **Content-addressing is scoped to the org**, not global. Identical bytes
 *     in two organizations are two objects. Deduplicating across tenants would
 *     turn a hash collision — or simply knowing a hash — into a cross-tenant
 *     read, and it would make "delete this org" impossible without refcounting
 *     every other org's blobs.
 *   - **An org's objects share one prefix**, so deletion stays a prefix delete
 *     rather than an enumeration the deleter can get half-way through.
 */

/** `org/{orgId}/blob/{sha256}.{ext}` — identical in every driver. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Extensions we are willing to store. An allowlist rather than a denylist:
 * the set of things a browser will execute is larger and more surprising than
 * the set of things we actually upload.
 */
const EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "json", "txt", "html"]);

/** Generous, but bounded — S3 caps keys at 1024 bytes. */
const MAX_KEY_LENGTH = 512;

export class StorageKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageKeyError";
  }
}

/**
 * Rejects anything that could escape its prefix or confuse a driver.
 *
 * The filesystem driver turns keys into paths, so traversal here is a real
 * read/write outside the storage root. S3 would happily accept most of these as
 * literal key names, which is worse in its own way: the two drivers would
 * disagree about what a key means, and the local tests would stop predicting
 * production.
 */
export function assertSafeKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new StorageKeyError("key must be a non-empty string");
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new StorageKeyError(`key exceeds ${MAX_KEY_LENGTH} characters`);
  }
  // Null bytes truncate C strings and DEL confuses path handling; neither
  // has any business in a key we generate ourselves.
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    throw new StorageKeyError("key contains control characters");
  }
  if (key.includes("\\")) {
    throw new StorageKeyError("key contains a backslash");
  }
  if (key.startsWith("/")) {
    throw new StorageKeyError("key must be relative");
  }
  if (key.endsWith("/")) {
    throw new StorageKeyError("key must not end with a separator");
  }
  if (key.includes("//")) {
    throw new StorageKeyError("key contains an empty segment");
  }
  // Checked segment-wise, so a literal ".." is refused but "..png" is allowed.
  if (key.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new StorageKeyError("key contains a relative path segment");
  }
}

export function assertOrgId(orgId: string): void {
  if (!UUID_RE.test(orgId ?? "")) {
    throw new StorageKeyError("orgId must be a UUID");
  }
}

/**
 * Everything belonging to one organization. Deleting an org is deleting this.
 * Trailing slash is deliberate: without it `org/{a}` also matches `org/{ab}`,
 * and a prefix delete would take a neighbouring tenant's objects with it.
 */
export function orgPrefix(orgId: string): string {
  assertOrgId(orgId);
  return `org/${orgId}/`;
}

/** `org/{orgId}/blob/{sha256}.{ext}` (BuildV5 G2). */
export function blobKey(orgId: string, sha256: string, ext: string): string {
  assertOrgId(orgId);
  const hash = String(sha256 ?? "").toLowerCase();
  if (!SHA256_RE.test(hash)) {
    throw new StorageKeyError("sha256 must be 64 hex characters");
  }
  const extension = String(ext ?? "").toLowerCase().replace(/^\./, "");
  if (!EXTENSIONS.has(extension)) {
    throw new StorageKeyError(`unsupported extension: ${extension || "(none)"}`);
  }
  const key = `${orgPrefix(orgId)}blob/${hash}.${extension}`;
  assertSafeKey(key);
  return key;
}

/** True when `key` lives under `prefix`. Used to keep drivers honest in tests. */
export function isUnderPrefix(key: string, prefix: string): boolean {
  return key.startsWith(prefix);
}

/*
 * Presigned-URL lifetimes.
 *
 * These live beside the key rules rather than in `storage.ts` so the drivers
 * can import them without importing the port they implement. Both are input
 * validation for the same port; keeping them together is what stops
 * `storage.ts → driver → storage.ts` from becoming a real module cycle.
 */

/**
 * FUTURENORMA §5 puts a browser-facing GET at 60–120 seconds. This is the upper
 * bound of that range: long enough for a slow connection to start the transfer,
 * short enough that a URL copied out of devtools is stale before it is useful.
 */
export const DEFAULT_GET_TTL_SECONDS = 120;

/** Uploads need a wider window than a render — the client still has to send the bytes. */
export const DEFAULT_PUT_TTL_SECONDS = 300;

/**
 * Hard ceiling. A caller asking for a day-long URL is either wrong or hostile,
 * and either way the answer is no. Refused rather than clamped: silently
 * shortening a TTL produces expiry bugs nobody can reproduce.
 */
export const MAX_TTL_SECONDS = 900;

export function assertTtl(ttlSeconds: number): void {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new StorageKeyError("ttlSeconds must be a positive number");
  }
  if (ttlSeconds > MAX_TTL_SECONDS) {
    throw new StorageKeyError(`ttlSeconds exceeds the ${MAX_TTL_SECONDS}s ceiling`);
  }
}
