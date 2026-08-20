/**
 * The origin presigned GET URLs are served from — the one value `img-src` has
 * to name.
 *
 * ## Why this exists at all
 *
 * Phase H is the first time the product renders a customer's uploaded images,
 * and they are fetched **directly from storage** rather than proxied through
 * this application. That is deliberate (`storage.ts`, and the 2026-08-19
 * decision that customer bytes never reach `sharp`), and it has one
 * consequence: the report page's `Content-Security-Policy` must permit a host
 * that is not `'self'`.
 *
 * ## Why it is derived rather than configured
 *
 * The obvious shortcut is an env var naming the origin for the CSP. That is a
 * second source for a fact the storage driver already owns, and the failure
 * mode is silent in the worst way — the images simply do not appear, on a page
 * whose entire purpose is showing them, with nothing in any log. So the origin
 * is computed from the *same* variables the driver is constructed from, and
 * `test/storage.test.mjs` asserts it against a URL a real driver actually
 * signed. If the two ever disagree, a check goes red rather than a page going
 * blank.
 *
 * ## What is proven and what is not
 *
 * The filesystem and MinIO shapes are verified by the suite. **The R2 shape is
 * not**, because no real R2 bucket has ever served an object here — that is
 * Step 5's gate (`BuildV5.md` J2), which requires the whole G suite re-run
 * against the real service. Virtual-hosted addressing against a custom endpoint
 * is precisely the sort of thing a local stub gets right and a real service
 * does differently, so treat this as a claim awaiting J2, not a settled fact.
 *
 * Pure string handling, no imports: this is read by Edge middleware.
 */

/**
 * A bag of environment variables. Deliberately an index signature rather than
 * the five named keys: Next types `process.env` as its own `ProcessEnv`, and a
 * struct of optional named fields has no properties in common with it, so the
 * call site in `middleware.ts` would not typecheck against the tighter shape.
 */
export type StorageOriginEnv = Record<string, string | undefined>;

/**
 * `null` means "same origin as the app", which needs no CSP source beyond
 * `'self'`. That is the filesystem driver's ordinary case: it signs URLs
 * pointing back at `/api/blob`.
 */
export function storageImageOrigin(env: StorageOriginEnv): string | null {
  const bucket = env.NORMA_STORAGE_BUCKET?.trim();

  if (!bucket) {
    const publicUrl = env.NORMA_STORAGE_PUBLIC_URL?.trim();
    if (!publicUrl) {
      return null;
    }
    return originOf(publicUrl);
  }

  const endpoint = env.NORMA_STORAGE_ENDPOINT?.trim();
  if (!endpoint) {
    // No endpoint means real AWS S3, which the SDK addresses virtual-hosted
    // against a regional hostname.
    const region = env.NORMA_STORAGE_REGION?.trim() || "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  const origin = originOf(endpoint);
  if (origin === null) {
    return null;
  }
  if (env.NORMA_STORAGE_FORCE_PATH_STYLE === "1") {
    // The bucket rides in the path, so the origin is the endpoint unchanged.
    // This is the MinIO shape the suite runs against.
    return origin;
  }
  // Virtual-hosted: the SDK prefixes the bucket onto the endpoint's host.
  const marker = "://";
  const at = origin.indexOf(marker);
  return `${origin.slice(0, at + marker.length)}${bucket}.${origin.slice(at + marker.length)}`;
}

/** Scheme + host + port, or null if it is not a parseable absolute URL. */
function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
