import { recordAuthEvent } from "argus-cloud/authEvents.js";
import { revokeSession } from "argus-cloud/sessions.js";
import type { AccountActionName } from "argus-cloud/consoleIA.js";
import { getDb } from "../../../../lib/db";
import { clientIp } from "../../../../lib/clientRate";
import { SIGN_IN_PATH, siteOrigin } from "../../../../lib/authRoutes";
import { backToAccount, requireAccount, type Account } from "../../../../lib/account";
import { clearSessionCookie } from "../../../../lib/session";

/**
 * Every write the account page can make — one door, one action so far.
 *
 * **The same shape as `/api/organization/[action]`, on purpose.** A dispatcher
 * typed by the shared name list, a plain form post, a 303 back with a notice
 * code, and a gate that runs before the dispatch rather than inside each
 * handler. It is one action today; the value of the shape is that the second one
 * cannot be written slightly differently, and that the suite and the gate script
 * can iterate `ACCOUNT_ACTIONS` instead of a list somebody keeps in step by
 * hand.
 *
 * **The scope here is the user, not an organization.** Nothing about this page
 * involves a tenant: the session id in the form is checked against
 * `session.user.id` inside the `UPDATE`, so an id copied from somebody else's
 * browser matches no row. That is the same rule the Organization revokes follow
 * with `org_id`, and `revokeSession` makes the scope a required argument for the
 * same reason `revokeApiKey` does.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = (input: { form: FormData; account: Account; request: Request }) => Promise<Response>;

const ACTIONS: Record<AccountActionName, Action> = {
  /**
   * Ends one browser.
   *
   * **Revoking the browser you are holding is allowed and is not an error.**
   * Somebody working through the list, ending each row they do not recognise,
   * will reach their own eventually — and refusing it would be refusing the
   * ordinary meaning of the button under a row marked "this browser". What it
   * cannot do is leave them on a page whose cookie no longer resolves: the
   * cookie is cleared and they land on the sign-in page, which is what happened
   * to that browser.
   */
  async "session-revoke"({ form, account, request }) {
    const id = String(form.get("id") ?? "").trim();
    if (!id) {
      return backToAccount("session-gone");
    }
    const db = await getDb();
    const revoked = await revokeSession(db, id, "revoked from the account page", {
      userId: account.session.user.id,
    });
    if (!revoked) {
      // Already revoked, expired, or belonging to somebody else — one answer for
      // all three. The first two are the same event from the reader's side, and
      // the third must not be distinguishable from them.
      return backToAccount("session-gone");
    }

    await recordAuthEvent(db, {
      kind: "session-revoked",
      outcome: "allowed",
      userId: account.session.user.id,
      // Which browser did the revoking, when it was not the one that died. The
      // account page is the only place this can be answered from.
      sessionId: id,
      ip: clientIp(request),
    });

    if (id === account.session.session.id) {
      const response = new Response(null, {
        status: 303,
        headers: { location: `${siteOrigin(request)}${SIGN_IN_PATH}` },
      });
      clearSessionCookie(response);
      return response;
    }
    return backToAccount("session-revoked");
  },
};

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> }
): Promise<Response> {
  const account = await requireAccount(request);
  if (account instanceof Response) {
    return account;
  }
  const { action } = await context.params;
  const handler = Object.prototype.hasOwnProperty.call(ACTIONS, action)
    ? ACTIONS[action as AccountActionName]
    : undefined;
  if (!handler) {
    return Response.json({ error: "no such action" }, { status: 404 });
  }
  return handler({ form: await request.formData(), account, request });
}
