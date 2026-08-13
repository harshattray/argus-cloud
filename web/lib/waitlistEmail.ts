/**
 * The one definition of "is this a usable email address" for the waitlist.
 *
 * Imported by both `app/api/waitlist/route.ts` (server, the check that
 * actually protects the table) and the two `WaitlistForm` components (client,
 * the check that saves a pointless round trip). **They must never be two
 * copies.** A regex duplicated into the browser drifts from the one on the
 * server, and the failure is quiet: an address the form accepts and the API
 * rejects shows the visitor a generic error on a form that looked happy.
 *
 * The messages live here for the same reason. If the client says one thing and
 * the server says another about the identical mistake, the wording changes
 * depending on whether JavaScript ran — which reads as a broken site.
 *
 * Deliberately no dependencies and no server-only imports, so it is safe in a
 * client bundle.
 */

/** RFC 5321 caps a path at 256 octets including the angle brackets. */
export const MAX_EMAIL_LENGTH = 254;

// Deliberately conservative: one @, a dot in the domain, no whitespace. Email
// validation beyond this is a fool's errand — the only real check is delivery.
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export type EmailProblem = "empty" | "malformed";

/** What the visitor is told. One sentence, no jargon, no blame. */
export const EMAIL_MESSAGE: Record<EmailProblem, string> = {
  empty: "Enter your email address.",
  malformed: "That doesn't look like an email address.",
};

/**
 * Lowercased and trimmed — the form in which an address is compared and
 * stored, so `Ada@Example.com` and `ada@example.com` are one signup, not two.
 * The UNIQUE constraint in `migrations/006_waitlist.sql` is what enforces that;
 * this is what makes the constraint see them as equal in the first place.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * `null` when the address is usable, otherwise which problem it has.
 *
 * Returning the problem rather than a boolean is what lets the client and the
 * server produce identical wording from {@link EMAIL_MESSAGE}.
 */
export function emailProblem(raw: string): EmailProblem | null {
  const value = normaliseEmail(raw);
  if (value.length === 0) return "empty";
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(value)) return "malformed";
  return null;
}
