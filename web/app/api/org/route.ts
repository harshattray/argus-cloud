import { ACTIVE_ORG_COOKIE, currentSession, membershipFor, safeNext, sameOrigin } from "../../../lib/session";

/**
 * Switches which organization the console is looking at.
 *
 * **The cookie is a preference and this route is where that is enforced.**
 * §10.7 5A.2: *"the selected organization is UI state only"*. `activeMembership`
 * already ignores a cookie naming an organization the person does not belong
 * to, so a forged cookie cannot show anybody anything — but writing one anyway
 * would leave a request that quietly does nothing, and a support conversation
 * that starts "I clicked the org and it didn't switch". So the membership is
 * checked here, before the cookie is set, and a request for an organization the
 * session does not hold is refused outright.
 *
 * That means the check exists in two places on purpose: this route refuses to
 * *write* a lie, and every page refuses to *believe* one. The second is the one
 * that protects data; the first is the one that keeps the UI honest.
 *
 * **A form POST, same-origin, 303** — the theme switch's reasoning applies
 * unchanged (`app/api/theme/route.ts`): a GET that changes what a page shows
 * would be followed by prefetchers, and a 302 after a POST can be re-submitted
 * by the back button.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "cross-origin organization switch refused" }, { status: 403 });
  }

  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }

  const form = await request.formData();
  const requested = form.get("orgId");
  const next = safeNext(typeof form.get("next") === "string" ? (form.get("next") as string) : null, "/overview");

  if (typeof requested !== "string" || !membershipFor(session, requested)) {
    // 403 rather than 404: the reader is signed in and asked for something they
    // do not hold. There is no existence to protect here — they cannot learn
    // whether the organization exists, only that this session cannot have it.
    return Response.json({ error: "no such membership" }, { status: 403 });
  }

  const response = new Response(null, { status: 303, headers: { Location: next } });
  response.headers.append(
    "Set-Cookie",
    [
      `${ACTIVE_ORG_COOKIE}=${requested}`,
      "Path=/",
      "SameSite=Lax",
      "HttpOnly",
      "Max-Age=31536000",
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  return response;
}
