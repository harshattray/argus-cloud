/**
 * The two facts every auth route needs and must agree on: where this
 * deployment lives, and where GitHub sends people back.
 *
 * Separate from `lib/session.ts` because that module imports `next/headers`,
 * which pins it to a request scope. These are pure.
 */

/**
 * The origin to build links and redirect URIs from.
 *
 * `NEXT_PUBLIC_SITE_URL` first, because a deployment knows its own canonical
 * name and the request's `Host` header does not — a preview URL, a proxy, or a
 * caller-supplied `Host` would all otherwise end up inside an emailed sign-in
 * link. That is the classic host-header injection: the mail arrives, the link
 * looks right, and it points at somebody else's server holding a live token.
 *
 * The request origin is the fallback for local development, where no such
 * variable is set and there is no proxy to lie.
 */
export function siteOrigin(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

/**
 * The GitHub callback, which must match the OAuth app's registered URI exactly
 * (PATHWAYS §10.7 5A.13: "use exact registered redirect URIs").
 *
 * **Never derived from the request**, for the reason {@link siteOrigin} gives:
 * the redirect URI is what GitHub sends the authorization code to, so a caller
 * who can influence it can have the code delivered somewhere else. It comes
 * from configuration or not at all.
 *
 * **`GITHUB_OAUTH_REDIRECT_URI` overrides it, and exists because a preview
 * deployment is a different registered URI.** `NEXT_PUBLIC_SITE_URL` is the
 * site's canonical marketing address — it drives the sitemap, the canonical
 * tags and the Open Graph URLs — and on a preview build it still says
 * `https://normascope.com`. Without an override, clicking "Continue with
 * GitHub" on a preview would send the browser to GitHub with production's
 * redirect URI, and GitHub would deliver the code to *production*: the preview
 * could never test its own sign-in.
 *
 * The two facts coincide on production today and are not the same fact. Keeping
 * them separate is also what makes it possible to point the callback at `www`
 * without moving the canonical off the apex.
 *
 * **The alternative is worse and must not be used.** GitHub offers wildcard
 * matching on redirect URIs, which would make `https://*.vercel.app/…` cover
 * every preview at once — and every *other* Vercel app in the world, any of
 * which could then receive our authorization codes. GitHub's own warning says
 * to enable it only where you control every possible match. We do not.
 */
export function githubRedirectUri(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.GITHUB_OAUTH_REDIRECT_URI?.trim();
  if (configured) {
    return configured;
  }
  return `${siteOrigin(request, env)}/api/auth/github/callback`;
}

/** Where a signed-in person lands when they had no particular destination. */
export const AFTER_SIGN_IN = "/repos";

/** The sign-in page. */
export const SIGN_IN_PATH = "/login";

/**
 * Headers for any surface that has handled a token.
 *
 * `no-referrer` so a redemption URL cannot leak into another site's logs
 * through the `Referer` header, and `no-store` so it is not held in a shared
 * cache (§10.7 5A.13, "Magic-link and token leakage").
 */
export const TOKEN_SURFACE_HEADERS: Record<string, string> = {
  "referrer-policy": "no-referrer",
  "cache-control": "no-store, max-age=0",
};
