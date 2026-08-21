/**
 * Outbound transactional mail — one seam, so the abuse ceilings in
 * `authThrottle.ts` cannot be bypassed by a second sender appearing somewhere.
 *
 * The waitlist route talks to Resend directly over `fetch`, and `alertChannel`
 * does the same for operator email. Neither is wrong: they were written before
 * there was anything to share, and both are one call. This module exists
 * because sign-in mail is different in one respect — **an unauthenticated
 * stranger decides when it is sent** — so it needs to be injectable for tests
 * and countable in one place.
 *
 * If a third transactional sender ever appears, it belongs here rather than as
 * another copy (CLAUDE.md rule 1: one source for a fact).
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: OutboundEmail): Promise<void>;
  /** False when nothing is configured — development and preview. */
  configured: boolean;
  describe(): string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export interface MailerOptions {
  resendApiKey?: string;
  from?: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  /** Allows the console fallback where a deployment would refuse it. */
  allowConsoleFallback?: boolean;
  timeoutMs?: number;
}

export function mailerOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): MailerOptions {
  return {
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
    from: env.AUTH_EMAIL_FROM?.trim() || "Normascope <hello@normascope.com>",
    replyTo: env.AUTH_EMAIL_REPLY_TO?.trim() || undefined,
    // A deployment must never fall back to printing sign-in links into a log.
    allowConsoleFallback: !env.VERCEL && env.NODE_ENV !== "production",
  };
}

export function createMailer(options: MailerOptions = mailerOptionsFromEnv()): Mailer {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const log = options.log ?? ((line: string) => console.log(line));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const key = options.resendApiKey;

  return {
    configured: Boolean(key),
    describe() {
      return key ? `resend (from ${options.from})` : options.allowConsoleFallback ? "console (development)" : "none";
    },
    async send(message) {
      if (!key) {
        if (!options.allowConsoleFallback) {
          // Loud, because the alternative is a customer who never receives a
          // link and a service that believes it sent one.
          throw new Error("no mail transport configured: set RESEND_API_KEY");
        }
        // Development only. The whole message goes to the console so a local
        // sign-in works without a provider account.
        log(`[dev-mail] to=${message.to} subject=${message.subject}\n${message.text}`);
        return;
      }
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // The status is worth keeping: 429 from Resend means we passed our own
        // ceiling and hit theirs, which is a different problem from a 401.
        throw new Error(`resend responded ${res.status}`);
      }
    },
  };
}
