import { authorizeUrl, githubConfigured, issueState, STATE_TTL_SECONDS } from "argus-cloud/githubOauth.js";
import { reserveOauthStart } from "argus-cloud/authThrottle.js";
import { recordAuthEvent } from "argus-cloud/authEvents.js";
import { getDb } from "../../../../../lib/db";
import { clientIp } from "../../../../../lib/clientRate";
import { safeNext } from "../../../../../lib/session";
import { AFTER_SIGN_IN, githubRedirectUri, SIGN_IN_PATH, siteOrigin, TOKEN_SURFACE_HEADERS } from "../../../../../lib/authRoutes";

/**
 * Sends someone to GitHub.
 *
 * **404 when GitHub sign-in is not configured**, matching the password gates in
 * `lib/gate.ts`: a half-configured provider must not present a button that
 * fails after the person has already left the site.
 *
 * Two cookies go out with the redirect, both short-lived and `HttpOnly`:
 *
 * - the **state**, which the callback must find identical in the query and in
 *   the cookie. This is the CSRF defence, and `githubOauth.ts` explains the
 *   attack it prevents — a crafted callback that signs a victim into the
 *   attacker's account.
 * - where they were **heading**, so the destination never travels through
 *   GitHub as a parameter. §10.7 5A.13: "reject arbitrary `next` URLs". It is
 *   validated on the way in as well as on the way out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const STATE_COOKIE = "norma_oauth_state";
export const NEXT_COOKIE = "norma_oauth_next";

function cookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/api/auth/github; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export async function GET(request: Request): Promise<Response> {
  const origin = siteOrigin(request);
  if (!githubConfigured()) {
    return new Response(null, { status: 404 });
  }

  const ip = clientIp(request);
  const db = await getDb();

  const slot = await reserveOauthStart(db, ip);
  if (!slot.allowed) {
    await recordAuthEvent(db, { kind: "github-refused", outcome: "refused", reason: slot.refusedBy, ip });
    return Response.redirect(`${origin}${SIGN_IN_PATH}?error=throttled`, 303);
  }

  const state = issueState();
  const next = safeNext(new URL(request.url).searchParams.get("next"), AFTER_SIGN_IN);
  const target = authorizeUrl({ state, redirectUri: githubRedirectUri(request) });
  if (!target) {
    return new Response(null, { status: 404 });
  }

  await recordAuthEvent(db, { kind: "github-started", outcome: "allowed", ip });

  const response = new Response(null, {
    status: 303,
    headers: { location: target, ...TOKEN_SURFACE_HEADERS },
  });
  response.headers.append("set-cookie", cookie(STATE_COOKIE, state, STATE_TTL_SECONDS));
  response.headers.append("set-cookie", cookie(NEXT_COOKIE, encodeURIComponent(next), STATE_TTL_SECONDS));
  return response;
}
