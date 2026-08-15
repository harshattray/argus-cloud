import { after } from "next/server";
import { createAlertChannel } from "argus-cloud/alertChannel.js";

/**
 * The alert sink every route hands to the services — PATHWAYS Pathway 1 item 10
 * ("working operator alerts").
 *
 * **What this replaced.** Both explain routes passed
 * `(message) => console.error("[breaker-alert] " + message)`. The
 * once-per-threshold bookkeeping behind it was careful and the thing it
 * delivered exactly once was a log line in a serverless platform. "Alerts reach
 * an operator" was not true.
 *
 * **Why the send is deferred rather than awaited.** `Alert` is synchronous and
 * is called from the middle of a paid request. Blocking a customer's analysis on
 * a webhook round trip would be the wrong trade — the alert exists to tell us
 * about spend that is *already* bounded by the reservation. `after()` runs the
 * flush once the response has been sent, which is the only place in a serverless
 * function where the work is both off the critical path and still guaranteed to
 * run.
 *
 * Outside a request scope — a script, a build-time render — `after()` throws;
 * there the log line is the delivery, and `scripts/ops-check.mjs` is the path
 * that awaits its sends properly.
 */

const channel = createAlertChannel();

export const alert = (message: string): void => {
  channel.alert(message);
  try {
    after(async () => {
      for (const result of await channel.flush()) {
        if (!result.ok) {
          // Not thrown: the response has already gone. The durable record of a
          // failed send is the undelivered row the next ops check reads.
          console.error(`[alert-channel-error] ${result.transport}: ${result.error}`);
        }
      }
    });
  } catch {
    // No request scope. The log line inside `channel.alert` already went out.
  }
};

/** What the channel is configured to do, for a startup line or an admin page. */
export const alertChannelDescription = (): string => channel.describe();
