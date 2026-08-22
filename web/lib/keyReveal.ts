import { cookies } from "next/headers";

/**
 * Showing a new API key exactly once, across a redirect.
 *
 * **The problem.** §10.7 5A.10 says a key is *"shown once, stored only as a
 * hash"*. We hold no plaintext — `createApiKey` hashes it and returns the
 * original, and that return value is the only copy that will ever exist. But the
 * console posts a form and answers 303, so the request that *has* the plaintext
 * is not the request that renders the page. Something has to carry it across one
 * redirect.
 *
 * **What was rejected, and why.**
 *
 * - *Render the key in the POST response instead of redirecting.* Then a refresh
 *   re-submits the form and mints a second key. A credential created by pressing
 *   F5 is worse than any of this.
 * - *Keep it in memory keyed by an id.* The next request can land on a different
 *   instance, so it works locally and fails in production — the worst failure
 *   mode available.
 * - *Store it, even briefly, even encrypted.* Then we hold plaintext key
 *   material, which is the one thing the whole design is arranged to avoid.
 *
 * **What this does instead.** A short-lived cookie, held by the browser that is
 * about to display the value on screen anyway. It never touches our storage, it
 * is `HttpOnly` so no script can read it, `SameSite=Lax` so it does not ride on
 * a cross-site request, `Path=/organization` so it is not sent to any other
 * route, and it expires in two minutes whether or not the page is ever loaded.
 *
 * **The honest cost**, stated rather than glossed: for those two minutes the
 * plaintext exists in the browser's cookie jar, and a refresh inside the window
 * shows it again. So the page carries a control that clears it, and the expiry
 * is the backstop for a reader who navigates away instead. "Once" here means
 * once on our side and once in practice on theirs — not a cryptographic
 * guarantee, and it should not be described as one.
 */

export const KEY_REVEAL_COOKIE = "norma-key-once";

/** Two minutes: long enough to copy a key, short enough to forget about. */
const REVEAL_SECONDS = 120;

function cookieAttributes(value: string, maxAge: number): string {
  return [
    `${KEY_REVEAL_COOKIE}=${value}`,
    "Path=/organization",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Hands the plaintext to the redirect that follows.
 *
 * The key id travels with it so the page can show the label and kind from the
 * database rather than from the cookie — the cookie is the secret and nothing
 * else, and a cookie that also carried display text would be a second, forgeable
 * source for what the page says.
 */
export function setKeyReveal(response: Response, keyId: string, plaintext: string): void {
  response.headers.append("set-cookie", cookieAttributes(`${keyId}.${plaintext}`, REVEAL_SECONDS));
}

export function clearKeyReveal(response: Response): void {
  response.headers.append("set-cookie", cookieAttributes("", 0));
}

export interface RevealedKey {
  keyId: string;
  plaintext: string;
}

/**
 * The key to show on this render, or null.
 *
 * Deliberately does not clear the cookie: a Server Component cannot write one
 * during render, and pretending otherwise would throw at exactly the moment an
 * admin is looking at a credential. The page offers a control that clears it,
 * and the two-minute expiry covers the reader who does not use it.
 */
export async function readKeyReveal(): Promise<RevealedKey | null> {
  const raw = (await cookies()).get(KEY_REVEAL_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return null;
  }
  return { keyId: raw.slice(0, dot), plaintext: raw.slice(dot + 1) };
}
