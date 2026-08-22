import { createSession } from "argus-cloud/sessions.js";
import { createUser, findUserByEmail } from "argus-cloud/users.js";
import { recordAuthEvent } from "argus-cloud/authEvents.js";
import { getDb } from "../../../../lib/db";
import { clientIp } from "../../../../lib/clientRate";
import { devSignInEmail } from "../../../../lib/devSignIn";
import { sameOrigin, safeNext, setSessionCookie } from "../../../../lib/session";
import { AFTER_SIGN_IN, siteOrigin } from "../../../../lib/authRoutes";

/**
 * Sign in as the one local address, with no link to fetch.
 *
 * `lib/devSignIn.ts` holds the three locks and why they are what they are. This
 * file's job is to be boring: check them, mint the same session row every other
 * method mints, and get out of the way.
 *
 * **404, not 403, when it is off.** A 403 tells a prober the route exists and
 * that there is a bypass to look for; a 404 is what a deployment should look
 * like, because on a deployment the route may as well not be there.
 *
 * **POST and same-origin**, for the same reason `signout` is: a GET that mints
 * a session would fire from any prefetcher, and this one hands out a credential
 * rather than taking one away.
 *
 * **The session it creates is not special.** Same `createSession`, same ninety
 * day / thirty day limits, same revocation, same cookie. Signing out ends it
 * exactly like any other. The only thing that skipped a step is how the person
 * proved who they were, and `method: "email"` would say the wrong thing about
 * that — so the audit log gets its own `dev-signin` kind and the row is
 * honest about which door was used.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const email = devSignInEmail();
  if (!email) {
    return new Response("Not found", { status: 404 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "cross-origin sign-in refused" }, { status: 403 });
  }

  const db = await getDb();

  // Find or create. Creating means the button works before any seed has run —
  // and what it lands on then is the no-organization state, which is a real
  // page worth being able to reach on purpose.
  const user =
    (await findUserByEmail(db, email)) ??
    (await createUser(db, { email, displayName: email.split("@")[0] ?? email }));

  const session = await createSession(db, {
    userId: user.id,
    method: "email",
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? "",
  });

  await recordAuthEvent(db, {
    kind: "dev-signin",
    outcome: "allowed",
    reason: "local",
    email,
    ip: clientIp(request),
    userId: user.id,
    sessionId: session.id,
  });

  let next = AFTER_SIGN_IN;
  try {
    const form = await request.formData();
    next = safeNext(typeof form.get("next") === "string" ? String(form.get("next")) : null, AFTER_SIGN_IN);
  } catch {
    // No body is fine — the default is the destination every sign-in uses.
  }

  const response = new Response(null, {
    status: 303,
    headers: { location: `${siteOrigin(request)}${next}` },
  });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
