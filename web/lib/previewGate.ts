/**
 * Whether a deployment is behind the preview phrase, and what to do about it.
 *
 * **Its own file, with no imports at all.** `gate.ts` pulls in `next/server`
 * for the password exchange, which makes it awkward to load in a plain test
 * process — and this is a three-state decision with security consequences in
 * every branch, so it is the part that most needs a test. Nothing here touches
 * a request or a response; it takes an environment and a path and returns a
 * word. `test/previewGate.test.mjs` holds it.
 */

export const PREVIEW_COOKIE = "np_preview";
export const PREVIEW_SCOPE = "preview";
export const PREVIEW_ENV_VAR = "PREVIEW_PASSWORD";
export const PREVIEW_UNLOCK_PATH = "/unlock";
export const PREVIEW_UNLOCK_ACTION = "/api/preview-unlock";

/**
 * Seven days, not the thirty `/pitch` gets. A preview holds unreleased work,
 * and a phrase typed into a stranger's laptop in a meeting is expected to leak
 * eventually.
 */
export const PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * `VERCEL_ENV` is `production` on the production deployment, `preview` on every
 * other one, and absent on a laptop. Only the middle case is gated — local
 * development is never behind a phrase.
 */
export function isNonProductionDeployment(env: Record<string, string | undefined>): boolean {
  return Boolean(env.VERCEL_ENV) && env.VERCEL_ENV !== "production";
}

export type PreviewGateState = "open" | "gated" | "misconfigured";

/**
 * What the middleware should do about this request, before anything else.
 *
 * **`misconfigured` is the state worth having a name for.** The other gates in
 * `gate.ts` default-deny by 404ing their tree, because a missing variable there
 * means "this surface was never meant to be published". A missing variable on a
 * whole *deployment* means somebody forgot — and the consequence of guessing
 * "open" is publishing unreleased work, which is the thing the gate exists to
 * prevent. So it refuses and says which variable is missing. That is safe: the
 * only people who can reach a preview URL they were not given are people who
 * already know it exists.
 */
export function previewGateState(
  pathname: string,
  env: Record<string, string | undefined>
): PreviewGateState {
  if (!isNonProductionDeployment(env)) {
    return "open";
  }
  if (!env[PREVIEW_ENV_VAR]) {
    return "misconfigured";
  }
  // The unlock screen has to stay reachable, or there is no way in.
  return pathname === PREVIEW_UNLOCK_PATH ? "open" : "gated";
}
