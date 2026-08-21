import { cookies } from "next/headers";
import { completeGithubSignIn } from "argus-cloud/loginService.js";
import { githubConfigured } from "argus-cloud/githubOauth.js";
import { getDb } from "../../../../../lib/db";
import { clientIp } from "../../../../../lib/clientRate";
import { safeNext, setSessionCookie } from "../../../../../lib/session";
import { AFTER_SIGN_IN, githubRedirectUri, SIGN_IN_PATH, siteOrigin, TOKEN_SURFACE_HEADERS } from "../../../../../lib/authRoutes";
import { NEXT_COOKIE, STATE_COOKIE } from "../start/route";

/**
 * Coming back from GitHub.
 *
 * The code is exchanged **once, server-side**, and never appears in anything
 * the browser can read (§10.7 5A.13). A fresh session is created only after a
 * successful exchange, so a replayed callback — GitHub codes are single-use, and
 * the state cookie is cleared here regardless — produces nothing.
 *
 * Every refusal lands on the same page with a short, non-specific code. Two of
 * them are worth distinguishing to the person, because they are actionable and
 * neither reveals anything about anyone else's account:
 *
 *   `link`     — this GitHub account is not connected to a Normascope account.
 *   `throttled`— too many attempts from here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Expired copies of the two cookies the start route set. */
function clearFlowCookies(response: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  for (const name of [STATE_COOKIE, NEXT_COOKIE]) {
    response.headers.append(
      "set-cookie",
      `${name}=; Path=/api/auth/github; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const origin = siteOrigin(request);
  if (!githubConfigured()) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(request.url);
  const jar = await cookies();
  const cookieState = jar.get(STATE_COOKIE)?.value ?? null;
  const rawNext = jar.get(NEXT_COOKIE)?.value;
  const next = safeNext(rawNext ? decodeURIComponent(rawNext) : null, AFTER_SIGN_IN);

  const failure = (code: string) => {
    const response = new Response(null, {
      status: 303,
      headers: { location: `${origin}${SIGN_IN_PATH}?error=${code}`, ...TOKEN_SURFACE_HEADERS },
    });
    clearFlowCookies(response);
    return response;
  };

  // GitHub sends `error=access_denied` when someone declines the consent
  // screen. That is a decision, not a fault, and it must not look like one.
  if (url.searchParams.get("error")) {
    return failure("cancelled");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return failure("github");
  }

  const result = await completeGithubSignIn(
    { db: await getDb(), baseUrl: origin },
    {
      code,
      state: url.searchParams.get("state"),
      cookieState,
      redirectUri: githubRedirectUri(request),
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
    }
  );

  if (!result.ok) {
    return failure(result.reason === "no-linked-account" ? "link" : "github");
  }

  const response = new Response(null, {
    status: 303,
    headers: { location: `${origin}${next}`, ...TOKEN_SURFACE_HEADERS },
  });
  clearFlowCookies(response);
  setSessionCookie(response, result.session.token, result.session.expiresAt);
  return response;
}
