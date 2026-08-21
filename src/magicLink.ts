import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import { keyedHash, normaliseAddress, randomToken, tokenHash } from "./authCrypto.js";

/**
 * Magic links: issue one, and spend it exactly once — FUTURENORMA §4 Step 6
 * ("short-lived, single-use tokens").
 *
 * A designer seat must not require a GitHub account, and that is the whole
 * reason this exists (§4 Step 6: "a real differentiator, not a detail"). The
 * cost of the convenience is that a link in an inbox *is* the credential, so the
 * two properties below are not optional:
 *
 * **Short-lived.** Fifteen minutes. Long enough to switch to a phone and find
 * the mail; short enough that a link sitting in an archived inbox, a shared
 * mailbox, or a forwarded thread is dead by the time anyone finds it.
 *
 * **Single-use, decided by the database.** Consumption is one conditional
 * UPDATE against `consumed_at`. A read-then-write would let two simultaneous
 * clicks — a mail client prefetching the link and the human clicking it, which
 * is common — both mint a session. Doing it in the statement means exactly one
 * caller can win.
 *
 * The link-prefetch case is worth naming because it is not hypothetical:
 * corporate mail scanners follow links. A scanner consuming the token means the
 * person clicks and finds it spent, which is a support ticket rather than a
 * breach — the safe end of the trade, and the reason the sign-in page says
 * plainly what to do next.
 */

export const MAGIC_LINK_TTL_MINUTES = 15;

export interface IssuedLink {
  id: string;
  /** Goes in the URL. Only its hash is stored. */
  token: string;
  expiresAt: Date;
}

export async function issueLoginToken(
  db: Db,
  input: { email: string; ip?: string },
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<IssuedLink> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const id = randomUUID();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MINUTES * 60_000);
  await db.query(
    `INSERT INTO login_tokens (id, email, token_hash, created_at, expires_at, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      normaliseAddress(input.email),
      tokenHash(token),
      now.toISOString(),
      expiresAt.toISOString(),
      input.ip ? keyedHash("token-ip", input.ip, env) : "",
    ]
  );
  return { id, token, expiresAt };
}

export type ConsumeFailure = "unknown" | "expired" | "already-used";

export type ConsumeResult = { ok: true; id: string; email: string } | { ok: false; failure: ConsumeFailure };

/**
 * Spends a link.
 *
 * The `WHERE` clause carries all three conditions, so the database decides and
 * this process never holds a window in which the token is valid-but-unspent.
 *
 * When nothing is spent, a second read works out *why* — but only for the audit
 * log. The caller's response is identical for all three failures: telling
 * someone that a token is "expired" rather than "unknown" confirms that the
 * token was once real, which is a small oracle and a free one to close.
 */
export async function consumeLoginToken(
  db: Db,
  token: string,
  options: { now?: Date; sessionId?: string } = {}
): Promise<ConsumeResult> {
  const now = options.now ?? new Date();
  const hash = tokenHash(token);
  const spent = await db.query<{ id: string; email: string }>(
    `UPDATE login_tokens
        SET consumed_at = $2, consumed_by_session = $3
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2
      RETURNING id, email`,
    [hash, now.toISOString(), options.sessionId ?? null]
  );
  if (spent.rows.length > 0) {
    return { ok: true, id: spent.rows[0].id, email: spent.rows[0].email };
  }

  const existing = await db.query<{ consumed_at: string | null; expires_at: string }>(
    "SELECT consumed_at, expires_at FROM login_tokens WHERE token_hash = $1",
    [hash]
  );
  const row = existing.rows[0];
  if (!row) {
    return { ok: false, failure: "unknown" };
  }
  if (row.consumed_at) {
    return { ok: false, failure: "already-used" };
  }
  return { ok: false, failure: "expired" };
}

/**
 * Attaches the session a token opened, once it exists.
 *
 * Consumption happens before the session is created — it has to, or a failure
 * halfway through would leave a spent token and no session — so the link is
 * recorded first and joined up second. A failure here loses an audit link, not
 * a login.
 */
export async function attachSessionToToken(db: Db, tokenId: string, sessionId: string): Promise<void> {
  await db.query("UPDATE login_tokens SET consumed_by_session = $2 WHERE id = $1", [tokenId, sessionId]);
}

/**
 * Deletes spent and expired links.
 *
 * They are useless the moment either is true — the row is a hash, an address
 * and two timestamps — and keeping them would slowly build a record of who
 * signed in and when, in plaintext addresses, for no operational benefit.
 * Seven days, so an incident review still has the shape of last week.
 */
export async function sweepLoginTokens(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const rows = await db.query<{ id: string }>(
    "DELETE FROM login_tokens WHERE created_at < $1 RETURNING id",
    [cutoff]
  );
  return rows.rows.length;
}

// ---------------------------------------------------------------------------
// What the person receives
// ---------------------------------------------------------------------------

export const SIGN_IN_SUBJECT = "Your Normascope sign-in link";

export function signInUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/auth/email/callback", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * The message.
 *
 * Deliberately plain and short. Three things it must do: give the link, say how
 * long it lasts, and say what to do if the request was not theirs — which is
 * the sentence that turns an attempted attack into a report. It carries no
 * tracking pixel, no click wrapper and no marketing.
 *
 * The visual language follows `waitlistConfirmationEmail.ts`: tables and inline
 * styles, because email clients are not browsers.
 */
export function signInEmailHtml(link: string, siteUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${SIGN_IN_SUBJECT}</title>
  </head>
  <body style="margin:0;background:#f3e1da;color:#3a2523;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3e1da">
      <tr>
        <td align="center" style="padding:40px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fcfbf9">
            <tr>
              <td style="padding:36px 36px 28px;border-bottom:1px solid #e4dfd7">
                <a href="${siteUrl}" style="text-decoration:none">
                  <img src="${siteUrl}/normascope-cloud.svg" width="115" height="36" alt="Normascope" style="display:block;border:0;max-width:100%;height:auto">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:42px 36px 12px">
                <h1 style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;line-height:1.25;font-weight:500;letter-spacing:-1px;color:#3a2523">Sign in to Normascope</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 8px;font-size:16px;line-height:1.7;color:#554e45">
                <p style="margin:0 0 22px">This link works once and expires in ${MAGIC_LINK_TTL_MINUTES} minutes.</p>
                <p style="margin:0 0 26px">
                  <a href="${link}" style="display:inline-block;background:#3a2523;color:#fcfbf9;text-decoration:none;padding:14px 22px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px">Sign in</a>
                </p>
                <p style="margin:0 0 18px;font-size:13px;color:#8a8177">If the button does not work, paste this into your browser:<br>
                  <span style="word-break:break-all;color:#a8736e">${link}</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 38px;font-size:13px;line-height:1.6;color:#8a8177">
                If you did not ask to sign in, you can ignore this email — nobody can use the link but you. If it keeps arriving, reply and tell us.
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px;background:#f1f6f4;font-size:11px;line-height:1.5;color:#8a8177">
                Normascope is a product from Yutic.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function signInEmailText(link: string): string {
  return `Sign in to Normascope

This link works once and expires in ${MAGIC_LINK_TTL_MINUTES} minutes.

${link}

If you did not ask to sign in, you can ignore this email — nobody can use the link but you. If it keeps arriving, reply and tell us.

Normascope is a product from Yutic.`;
}
