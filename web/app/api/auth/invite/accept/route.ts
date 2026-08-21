import { completeInvitation } from "argus-cloud/loginService.js";
import { getDb } from "../../../../../lib/db";
import { clientIp } from "../../../../../lib/clientRate";
import { setSessionCookie } from "../../../../../lib/session";
import { AFTER_SIGN_IN, SIGN_IN_PATH, siteOrigin, TOKEN_SURFACE_HEADERS } from "../../../../../lib/authRoutes";

/**
 * The link in an invitation email.
 *
 * Same shape as the sign-in callback and for the same reasons: it redeems
 * server-side, it never renders a page while the token is in the URL, and it
 * redirects to a clean address with `Referrer-Policy: no-referrer`.
 *
 * What differs is what it produces. A sign-in link opens a session for someone
 * who already belongs somewhere; this one *creates the membership* — so the
 * token is a capability over another organization's data and its lifetime is
 * shorter, its issuance is bounded by the invitation ceilings in
 * `authThrottle.ts`, and resending revokes the previous one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const origin = siteOrigin(request);
  const token = new URL(request.url).searchParams.get("token") ?? "";

  const result = await completeInvitation(
    { db: await getDb(), baseUrl: origin },
    { token, ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" }
  );

  if (!result.ok) {
    // One message for revoked, expired, already-accepted and invented alike.
    return Response.redirect(`${origin}${SIGN_IN_PATH}?error=invitation`, 303);
  }

  const response = new Response(null, {
    status: 303,
    headers: { location: `${origin}${AFTER_SIGN_IN}`, ...TOKEN_SURFACE_HEADERS },
  });
  setSessionCookie(response, result.session.token, result.session.expiresAt);
  return response;
}
