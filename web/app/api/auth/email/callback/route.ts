import { completeMagicLink } from "argus-cloud/loginService.js";
import { getDb } from "../../../../../lib/db";
import { clientIp } from "../../../../../lib/clientRate";
import { setSessionCookie, safeNext } from "../../../../../lib/session";
import { AFTER_SIGN_IN, SIGN_IN_PATH, siteOrigin, TOKEN_SURFACE_HEADERS } from "../../../../../lib/authRoutes";

/**
 * The link in the email.
 *
 * **It redeems and redirects; it never renders.** PATHWAYS §10.7 5A.13 asks
 * that the token be consumed server-side and the browser then sent to a clean
 * URL with no token in it — so the address bar, the history entry, and anything
 * the person later screenshots or pastes carry nothing usable. Because this is a
 * route rather than a page, no analytics, font or image request is made while
 * the token is in the URL either.
 *
 * `Referrer-Policy: no-referrer` covers the remaining leak: without it, the
 * first outbound request from the page we redirect to could carry this URL in a
 * `Referer` header.
 *
 * **A GET with a side effect, deliberately.** Every other state change in this
 * codebase is a POST for good reasons (`api/theme/route.ts` sets them out), and
 * an email client cannot POST. What makes it acceptable is that the side effect
 * is *spending a single-use token that arrived in that email*: a prefetching
 * mail scanner can waste the link, which is a support message and not a breach,
 * and nothing else on the account can be reached with it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = safeNext(url.searchParams.get("next"), AFTER_SIGN_IN);
  const origin = siteOrigin(request);

  const result = await completeMagicLink(
    { db: await getDb(), baseUrl: origin },
    { token, ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" }
  );

  if (!result.ok) {
    // One destination for every failure — spent, expired, unknown, no longer
    // eligible. The sign-in page says what to do next; it does not say which of
    // those happened, because that would confirm a token was once real.
    return Response.redirect(`${origin}${SIGN_IN_PATH}?error=link-expired`, 303);
  }

  const response = new Response(null, {
    status: 303,
    headers: { location: `${origin}${next}`, ...TOKEN_SURFACE_HEADERS },
  });
  setSessionCookie(response, result.session.token, result.session.expiresAt);
  return response;
}
