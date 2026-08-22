/**
 * The local sign-in door, and the three locks on it.
 *
 * Signing in locally means running the real magic-link flow and then fishing
 * the URL out of the dev server's console, because with no `RESEND_API_KEY` the
 * mailer prints the whole message instead of sending it. That works, and it is
 * two windows and a copy-paste every time the cookie is cleared. This is the
 * shortcut: one address that gets a session without a link.
 *
 * **It is off unless someone turns it on, and it cannot be turned on in
 * production.** All three conditions have to hold:
 *
 * 1. `NORMA_DEV_SIGNIN_EMAIL` is set. No default — a bypass that is on unless
 *    disabled is a bypass that ships. `next dev` binds to the network as well
 *    as to loopback, so "only local" already means "anyone on this Wi-Fi", and
 *    that is the *guarded* case.
 * 2. `NODE_ENV` is not `production`.
 * 3. `VERCEL` is unset. Belt and braces — a Vercel build already sets
 *    `NODE_ENV=production`, so this is the second lock on the same door, and it
 *    is here because preview deployments are the place someone would be
 *    tempted to make an exception.
 *
 * This is the same shape as the mailer's `allowConsoleFallback`, deliberately:
 * that decides whether a sign-in link may be printed to a log, this decides
 * whether one may be skipped, and neither may ever be true on a deployment.
 *
 * **Only this address is special.** Every other address typed into the form
 * goes through the ordinary route — the abuse ladder, the proof-of-work
 * challenge, the email budget, the fifteen-minute single-use token. There is no
 * code path here that touches them.
 *
 * Returning the address rather than a boolean is what lets the route and the
 * sign-in page agree without reading the environment twice and disagreeing —
 * the button says the address it will sign you in as.
 */
export function devSignInEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  const email = env.NORMA_DEV_SIGNIN_EMAIL?.trim();
  if (!email) {
    return null;
  }
  if (env.NODE_ENV === "production" || env.VERCEL) {
    return null;
  }
  return email;
}
