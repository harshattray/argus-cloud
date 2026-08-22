import { ACCOUNT_PATH } from "argus-cloud/consoleIA.js";
import type { ResolvedSession } from "argus-cloud/sessions.js";
import { currentSession, sameOrigin } from "./session";

/**
 * The gate every write on the account page goes through.
 *
 * **Shorter than `requireOrgAdmin`, and the difference is the whole point.**
 * That gate answers four questions; this one answers two. There is no
 * organization here and no role: the page is scoped to a person, a person is
 * always allowed to manage their own account, and somebody in no organization at
 * all still needs to be able to end a session (§10.7 5A.4 makes that an ordinary
 * state rather than an error).
 *
 * **What remains is the part that is not optional.** The origin check, because
 * `SameSite=Lax` is not the whole CSRF story and 5A.8 says so; and the session,
 * because the id in the form is a request rather than a permission. The scoping
 * that `requireOrgAdmin` does with an organization, the handler here does with
 * `session.user.id` — passed into the `UPDATE` rather than trusted from the
 * form, which is the same rule in the same shape.
 */

export interface Account {
  session: ResolvedSession;
}

export async function requireAccount(request: Request): Promise<Account | Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "cross-origin request refused" }, { status: 403 });
  }
  const session = await currentSession();
  if (!session) {
    return Response.json({ error: "not signed in" }, { status: 401 });
  }
  return { session };
}

/**
 * What the reader is told after a write, as a code rather than as a sentence.
 *
 * Nothing the caller typed is ever echoed back: the code travels in the query
 * string and the page maps a fixed code to a fixed sentence. `orgAdmin.ts`
 * carries the incident this rule comes from.
 */
export type AccountNotice = "session-revoked" | "session-gone";

/** A 303 back to the account page, carrying one notice code. */
export function backToAccount(notice?: AccountNotice): Response {
  const location = notice ? `${ACCOUNT_PATH}?notice=${notice}` : ACCOUNT_PATH;
  return new Response(null, { status: 303, headers: { Location: location } });
}
