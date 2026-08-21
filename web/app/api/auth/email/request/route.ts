import { after } from "next/server";
import { requestSignInLink, LINK_SENT_MESSAGE, THROTTLED_MESSAGE } from "argus-cloud/loginService.js";
import { createAlertChannel } from "argus-cloud/alertChannel.js";
import { getDb } from "../../../../../lib/db";
import { sameOrigin } from "../../../../../lib/session";
import { clientIp } from "../../../../../lib/clientRate";
import { siteOrigin } from "../../../../../lib/authRoutes";

/**
 * "Email me a sign-in link."
 *
 * The route is deliberately thin. Every decision — the challenge, the five
 * ceilings, whether the address may be sent anything, what the response says —
 * lives in `argus-cloud/loginService.js`, so there is exactly one order in which
 * those things happen and it can be tested without HTTP.
 *
 * **Three responses and no more.** `accepted` for every outcome that does not
 * depend on the caller's own allowance, `throttled` when it does, and
 * `challenge` when they must do some work first. A registered address, an
 * unknown one, one inside its cooldown and a malformed one are indistinguishable
 * from out here — that is the anti-enumeration property, and it is why the
 * service returns its `internal` reason separately from its `status`.
 *
 * **The provider call happens after the response** (`after()`), which is a
 * timing mitigation rather than a speed one — see `LoginDeps.deferSend`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ ok: false, error: "cross-origin request refused" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { email, challengeToken, challengeSolution } = (body ?? {}) as Record<string, unknown>;

  const db = await getDb();
  const alerts = createAlertChannel();
  const result = await requestSignInLink(
    {
      db,
      baseUrl: siteOrigin(request),
      alert: alerts.alert,
      deferSend: (task) => after(task),
    },
    {
      email: typeof email === "string" ? email : "",
      ip: clientIp(request),
      challengeToken: typeof challengeToken === "string" ? challengeToken : undefined,
      challengeSolution: typeof challengeSolution === "string" ? challengeSolution : undefined,
    }
  );

  if (result.status === "challenge") {
    return Response.json(
      {
        ok: false,
        challenge: { token: result.challenge?.token, difficultyBits: result.challenge?.difficultyBits },
        // Said plainly. A challenge that appears with no explanation reads as a
        // broken page, and the honest sentence costs an attacker nothing they
        // did not already know from being asked.
        error: "Too many attempts from here. Your browser needs to do a little work before we send another link.",
      },
      { status: 429 }
    );
  }

  if (result.status === "throttled") {
    return Response.json(
      { ok: false, error: THROTTLED_MESSAGE, retryAfterSeconds: result.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) } }
    );
  }

  return Response.json({ ok: true, message: LINK_SENT_MESSAGE });
}
