import { cookies } from "next/headers";
import { resolveSession, revokeAllSessions, revokeSession, sessionCookieName } from "argus-cloud/sessions.js";
import { recordAuthEvent } from "argus-cloud/authEvents.js";
import { getDb } from "../../../../lib/db";
import { clientIp } from "../../../../lib/clientRate";
import { clearSessionCookie, sameOrigin, safeNext } from "../../../../lib/session";
import { SIGN_IN_PATH, siteOrigin } from "../../../../lib/authRoutes";

/**
 * Sign out, and sign out everywhere.
 *
 * **POST and same-origin**, because a `GET /signout` would be triggered by any
 * page that could get a browser to load a URL — annoying rather than dangerous,
 * and free to prevent.
 *
 * **The row is revoked, not just the cookie cleared.** Clearing the cookie alone
 * would leave a live credential in anything that had copied it; revocation is
 * checked on the next request by `resolveSession`, so it takes effect for every
 * holder at once.
 *
 * `scope=all` is §10.7 5A.8's "sign out everywhere" — the control someone
 * reaches for after losing a laptop, so it must not depend on that laptop
 * checking in.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "cross-origin sign-out refused" }, { status: 403 });
  }

  const origin = siteOrigin(request);
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  const db = await getDb();
  const session = await resolveSession(db, token);

  let scope = "one";
  let next = SIGN_IN_PATH;
  try {
    const form = await request.formData();
    scope = form.get("scope") === "all" ? "all" : "one";
    next = safeNext(typeof form.get("next") === "string" ? String(form.get("next")) : null, SIGN_IN_PATH);
  } catch {
    // A JSON or empty body is fine; the defaults above are the safe ones.
  }

  if (session) {
    if (scope === "all") {
      const count = await revokeAllSessions(db, session.user.id, "signed out everywhere");
      await recordAuthEvent(db, {
        kind: "signed-out",
        outcome: "allowed",
        reason: `all:${count}`,
        ip: clientIp(request),
        userId: session.user.id,
      });
    } else {
      await revokeSession(db, session.session.id, "signed out");
      await recordAuthEvent(db, {
        kind: "signed-out",
        outcome: "allowed",
        ip: clientIp(request),
        userId: session.user.id,
        sessionId: session.session.id,
      });
    }
  }

  // Redirect either way. Someone whose session had already expired should see
  // the sign-in page, not an error about a session they no longer have.
  const response = new Response(null, { status: 303, headers: { location: `${origin}${next}` } });
  clearSessionCookie(response);
  return response;
}
