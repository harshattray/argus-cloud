import { cookies } from "next/headers";
import {
  resolveSession,
  sessionCookieName,
  SESSION_TTL_DAYS,
  type ResolvedSession,
} from "argus-cloud/sessions.js";
import type { Membership, Role } from "argus-cloud/users.js";
import { getDb } from "./db";

/**
 * Reading the session cookie, and turning it into authorization.
 *
 * **The rule this file exists to enforce**, from PATHWAYS §10.7 5A: *a
 * caller-provided org ID is never authorization.* Every page and route asks for
 * an organization by id, and every one of them gets it through
 * {@link requireOrg}, which looks the id up in the membership list the session
 * resolved. A URL segment, a cookie, a form field and a JSON body are all the
 * same thing here — a request, not a permission.
 *
 * The session itself is resolved by `argus-cloud/sessions.js` against the
 * database on every request. There is no cache in front of it, so removing a
 * membership or revoking a session takes effect on the next request rather than
 * whenever a token would have expired.
 */

export const ACTIVE_ORG_COOKIE = "norma-org";

/** The signed-in person, or null. Never throws — callers decide what null means. */
export async function currentSession(): Promise<ResolvedSession | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token) {
    return null;
  }
  return resolveSession(await getDb(), token);
}

/**
 * The organization a request is allowed to act on, or null.
 *
 * **`orgId` is the caller's claim and the membership list is the answer.** The
 * lookup is a filter over what the session actually holds, so a stranger asking
 * for someone else's organization gets null and, above this, a 404 — the same
 * response as an organization that does not exist, because telling the two
 * apart would confirm that it does.
 *
 * With no `orgId`, the active-organization cookie is consulted and then the
 * first membership. Both are *preferences*: §10.7 5A.2 is explicit that the
 * selected organization is UI state, and every request re-resolves it. A cookie
 * naming an organization the person does not belong to is ignored, not obeyed.
 */
export function membershipFor(session: ResolvedSession | null, orgId: string): Membership | null {
  if (!session) {
    return null;
  }
  return session.memberships.find((m) => m.orgId === orgId) ?? null;
}

export function activeMembership(session: ResolvedSession | null, preferred?: string | null): Membership | null {
  if (!session || session.memberships.length === 0) {
    return null;
  }
  if (preferred) {
    const chosen = session.memberships.find((m) => m.orgId === preferred);
    if (chosen) {
      return chosen;
    }
  }
  return session.memberships[0];
}

/** Roles allowed to perform an action, as a set the caller states explicitly. */
export function hasRole(membership: Membership | null, allowed: Role[]): boolean {
  return membership !== null && allowed.includes(membership.role);
}

// ---------------------------------------------------------------------------
// Setting and clearing the cookie
// ---------------------------------------------------------------------------

/**
 * The cookie attributes, in one place.
 *
 * `httpOnly` so no script can read the token — including an injected one, which
 * is the whole reason `/r/` runs under a nonce policy. `sameSite: "lax"` so it
 * does not ride along on a cross-site POST, while an ordinary link from an email
 * still arrives signed in. `secure` everywhere except local HTTP, where the
 * browser would refuse to store it at all.
 *
 * `SameSite` is not the whole CSRF story (§10.7 5A.8 says so) — state-changing
 * routes also check the origin. This is one of the two halves.
 */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: sessionCookieName(),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_TTL_DAYS * 86_400,
  };
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  const options = sessionCookieOptions(expiresAt);
  response.headers.append(
    "set-cookie",
    [
      `${options.name}=${token}`,
      `Path=${options.path}`,
      `Expires=${expiresAt.toUTCString()}`,
      `Max-Age=${options.maxAge}`,
      "HttpOnly",
      "SameSite=Lax",
      options.secure ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
}

export function clearSessionCookie(response: Response): void {
  const secure = process.env.NODE_ENV === "production";
  response.headers.append(
    "set-cookie",
    [`${sessionCookieName()}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", secure ? "Secure" : ""]
      .filter(Boolean)
      .join("; ")
  );
}

// ---------------------------------------------------------------------------
// CSRF and redirects
// ---------------------------------------------------------------------------

/**
 * Same-origin check for state-changing requests.
 *
 * Copied in behaviour from `app/api/theme/route.ts`, which explains the two
 * headers: `Sec-Fetch-Site` is the modern answer and `Origin` covers the rest.
 * Neither present means a non-browser client, which has no cookie to abuse but
 * also no business posting to these routes.
 */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin";
  }
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === new URL(request.url).origin;
  }
  return false;
}

/**
 * A path we are willing to send a browser to after signing in.
 *
 * §10.7 5A.7: "Never accept an arbitrary return URL." `//evil.example` is
 * protocol-relative and a browser treats it as another origin, so the
 * second-character check is the one doing the work; `/\` is rejected because
 * some parsers normalise it to `//`.
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
