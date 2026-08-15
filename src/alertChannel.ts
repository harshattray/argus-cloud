import type { Alert } from "./breaker.js";

/**
 * Where an alert actually goes (PATHWAYS.md Pathway 1 item 10: "working
 * operator alerts").
 *
 * **What was missing.** Every alert in the product ended at
 * `console.error("[breaker-alert] …")` inside a serverless function. The
 * once-per-threshold bookkeeping in `budgetAlerts.ts` was careful and correct,
 * and what it delivered exactly once was a log line in a platform nobody
 * watches at 3am. The claim `alerts reach an operator` was not true.
 *
 * **What is honest about this one.** `Alert` is synchronous — it is called from
 * the request path, and a paid analysis must not wait on a webhook — so a send
 * is started, not awaited, when the alert comes from a route. That has one
 * consequence worth stating plainly rather than hiding:
 *
 * > `delivered_at` in `budget_alerts` and `ops_alerts` means *handed to the
 * > channel without a synchronous error*. It does not mean a human received it.
 *
 * Three things close the gap, and none of them is optional:
 *
 * 1. **`flush()`** awaits every send in flight and reports failures. The
 *    scheduled checks (`scripts/ops-check.mjs`) call it and exit non-zero, so a
 *    broken channel fails a job somebody is watching.
 * 2. **The pull surface.** `/admin/limits` shows undelivered alerts and the
 *    recovery state, so the answer never depends only on push.
 * 3. **The `alert-channel-broken` signal** in `opsAlerts.ts` fires on any alert
 *    claimed but never delivered.
 *
 * **Never throws, never blocks.** A failing alert transport must not turn a
 * customer's analysis into an error — spend is already bounded by the
 * reservation that ran before the alert. Failures are logged, counted, and
 * returned by `flush()`.
 */

export interface AlertSendResult {
  transport: "webhook" | "email";
  ok: boolean;
  error?: string;
}

export interface AlertChannel {
  /** The `Alert` every service takes. Synchronous, never throws. */
  alert: Alert;
  /** Awaits sends started so far. Empty when nothing was sent. */
  flush(): Promise<AlertSendResult[]>;
  /** False when no transport is configured — log-only, which is dev and preview. */
  configured: boolean;
  /** Human-readable list of live transports, for a startup line or an admin page. */
  describe(): string;
}

export interface AlertChannelOptions {
  /** Any endpoint accepting `{"text": "…"}` — Slack-compatible on purpose. */
  webhookUrl?: string;
  /** Comma-separated recipients. Needs `resendApiKey`. */
  email?: string;
  emailFrom?: string;
  resendApiKey?: string;
  /** Injectable for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to `console.error`. */
  log?: (line: string) => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Reads the environment.
 *
 * With nothing configured this is log-only and says so — a preview or a local
 * run must not need secrets, and silently pretending to alert would be worse
 * than the console line it replaces.
 */
export function alertChannelOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AlertChannelOptions {
  return {
    webhookUrl: env.NORMA_ALERT_WEBHOOK_URL?.trim() || undefined,
    email: env.NORMA_ALERT_EMAIL?.trim() || undefined,
    emailFrom: env.NORMA_ALERT_FROM?.trim() || "Normascope <alerts@normascope.com>",
    resendApiKey: env.RESEND_API_KEY?.trim() || undefined,
  };
}

export function createAlertChannel(options: AlertChannelOptions = alertChannelOptionsFromEnv()): AlertChannel {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const log = options.log ?? ((line: string) => console.error(line));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const emailTo = (options.email ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
  const canEmail = emailTo.length > 0 && Boolean(options.resendApiKey);
  const canWebhook = Boolean(options.webhookUrl);

  const inFlight: Promise<AlertSendResult>[] = [];

  const send = async (transport: "webhook" | "email", run: () => Promise<void>): Promise<AlertSendResult> => {
    try {
      await run();
      return { transport, ok: true };
    } catch (err) {
      const error = String((err as Error)?.message ?? err).slice(0, 500);
      // Distinct prefix from the alert itself: a log scraper must be able to
      // tell "we alerted" from "we failed to alert".
      log(`[alert-channel-error] ${transport}: ${error}`);
      return { transport, ok: false, error };
    }
  };

  const alert: Alert = (message: string) => {
    // The log line is unconditional and comes first. It is the one delivery
    // path that cannot fail, and on a log-only deployment it is the whole
    // channel.
    log(`[normascope-alert] ${message}`);

    if (canWebhook) {
      inFlight.push(
        send("webhook", async () => {
          const res = await fetchImpl(options.webhookUrl as string, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) {
            throw new Error(`webhook responded ${res.status}`);
          }
        })
      );
    }

    if (canEmail) {
      inFlight.push(
        send("email", async () => {
          const res = await fetchImpl("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${options.resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: options.emailFrom,
              to: emailTo,
              // The subject carries the whole alert where it fits: an operator
              // reading a phone notification should not have to open it.
              subject: `Normascope alert: ${message.slice(0, 120)}`,
              text: message,
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) {
            throw new Error(`resend responded ${res.status}`);
          }
        })
      );
    }
  };

  return {
    alert,
    configured: canWebhook || canEmail,
    async flush() {
      const results = await Promise.all(inFlight);
      inFlight.length = 0;
      return results;
    },
    describe() {
      const transports = [canWebhook ? "webhook" : null, canEmail ? `email → ${emailTo.join(", ")}` : null].filter(
        Boolean
      );
      return transports.length > 0 ? transports.join(" + ") : "log only (no transport configured)";
    },
  };
}
