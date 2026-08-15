import type { Metadata } from "next";
import { rateLimitTotals, rateLimitBySubject, MAX_SUBJECT_ROWS } from "argus-cloud/rateLimit.js";
import { globalDayStatus, thresholdCrossed } from "argus-cloud/providerBudget.js";
import { isTripped, breakerHistory } from "argus-cloud/breaker.js";
import { recentAlerts, providerBalanceStatus, undeliveredAlertCount } from "argus-cloud/budgetAlerts.js";
import { recoveryHealth } from "argus-cloud/backup.js";
import { collectOpsSignals } from "argus-cloud/opsAlerts.js";
import { getDb } from "../../../lib/db";
import { resetBreakerAction } from "./actions";

/**
 * Rate-limit activity — the operator visibility half of PATHWAYS.md §10.3 "1C"
 * item 5: what got turned away, and who is generating unusual volume.
 *
 * Deliberately aggregate. It shows counts per key and per organization, never a
 * request body, a repository name, a frame, or key material — a rejected
 * request is an operational event, not customer content, and the operator tree
 * must not become a casual window onto either (PATHWAYS §"Operator console").
 *
 * Access is the `/admin` gate in `middleware.ts` — default-deny, its own
 * password.
 *
 * Reading it: `rejected` is not by itself a fault. A CI fleet briefly over its
 * ceiling is the limiter working. What deserves attention is a subject
 * rejecting continuously, or an `allowed` volume with no plausible workload
 * behind it.
 */

export const metadata: Metadata = {
  title: { absolute: "Limits and spend — Normascope" },
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 60;

/** Same default the explain routes use, so the page and the cap agree. */
const DAILY_BUDGET_MICRODOLLARS = Number(process.env.EXPLAIN_DAILY_BUDGET_MICRODOLLARS ?? 50_000_000);

/**
 * Money, with the cents demarcated from the dollars.
 *
 * These figures carry four decimal places because provider costs are genuinely
 * fractions of a cent, and a rounded `$0.00` would hide real spend. But at one
 * size and one weight, `$47.0000` reads at a glance as four hundred and seventy
 * thousand — the operator page's whole job is to be read at a glance, so that
 * is a real misreading, not a nitpick.
 *
 * The fraction is smaller and lighter so the magnitude is the part the eye
 * lands on, and the integer part is grouped so a four-figure budget cannot be
 * mistaken for a three-figure one either. Sized in `em` so it scales with
 * whatever it sits inside; `tabular-nums` on both halves so columns still line
 * up.
 *
 * 0.72em rather than something smaller, because this also renders inside 13px
 * body text, where a heavier reduction lands under 9px. Demarcating the
 * fraction must not make it unreadable — the sub-cent digits are the reason
 * four places are shown at all.
 */
const FRACTION = "text-[0.72em] font-normal text-text/45";

function Dollars({ microdollars }: { microdollars: number }) {
  const [whole, fraction] = (microdollars / 1e6).toFixed(4).split(".");
  return (
    <span className="tabular-nums">
      ${Number(whole).toLocaleString("en-US")}
      <span className={FRACTION}>.{fraction}</span>
    </span>
  );
}

/**
 * The percentage beside those figures. Grouped, but **not** demarcated.
 *
 * It was given the same small-and-light fraction for consistency and looked
 * wrong: one decimal place is too short to be mistaken for magnitude, so the
 * treatment bought nothing, and it left the unit stranded — `2,494` full size,
 * `.1` small, `%` full size again. A unit set behind a lighter gap reads as
 * detached from its number, and de-emphasising the `%` instead would be worse
 * on a page where every other figure is dollars.
 *
 * The rule the dollars case actually establishes: demarcate a fraction when it
 * is long enough to be misread as part of the magnitude. Four digits are; one
 * is not.
 */
function Percent({ value }: { value: number | null }) {
  if (value === null) {
    return <span>—</span>;
  }
  return <span className="tabular-nums">{value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-4 py-3.5">
      <p className="eyebrow text-text/45">{label}</p>
      <p className="numeric mt-1 text-[26px] leading-none font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-text/40">{hint}</p>}
    </div>
  );
}

export default async function LimitsPage() {
  const db = await getDb();
  const [totals, subjects, budget, paused, alerts, undelivered, balance, breaker, recovery, opsSignals] =
    await Promise.all([
      rateLimitTotals(db, WINDOW_MINUTES),
      rateLimitBySubject(db, WINDOW_MINUTES),
      globalDayStatus(db, DAILY_BUDGET_MICRODOLLARS),
      isTripped(db),
      recentAlerts(db, 12),
      undeliveredAlertCount(db),
      providerBalanceStatus(db),
      breakerHistory(db, 8),
      recoveryHealth(db),
      // The live list, not the delivered-alert history: the page must answer
      // "what is wrong now?" even when the push channel never worked.
      collectOpsSignals(db),
    ]);
  const crossed = thresholdCrossed(budget.usedPercent);

  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <main className="min-h-screen bg-paper text-text px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8">
          <p className="eyebrow text-clay mb-2">Normascope · operator</p>
          <h1 className="display-sm">Limits and spend</h1>
          <p className="mt-1.5 text-[13.5px] text-text/45">
            Rate limiting over the last {WINDOW_MINUTES} minutes, and today&rsquo;s provider budget. Counts and
            totals only — no request contents. All times UTC.{" "}
            <a href="/admin/waitlist" className="underline decoration-black/20 underline-offset-2 hover:text-clay">
              Waitlist
            </a>{" "}
            <a href="/admin/keys" className="underline decoration-black/20 underline-offset-2 hover:text-clay">
              API keys
            </a>
          </p>
        </header>

        {/* Provider spend first: it is the question with money attached. Money
            already spent and money reserved for calls in flight are shown apart,
            because a reservation is not yet a charge — but it is committed
            capacity and the cap counts it. */}
        <section className="mb-6 rounded-xl border border-black/10 bg-white px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="eyebrow text-text/45">Provider budget · today (UTC)</h2>
            <p className="text-[12px] text-text/35">
              {paused ? "explain PAUSED — manual reset required" : "explain running"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[12px] text-text/40">Spent</p>
              <p className="numeric text-[19px] font-semibold tabular-nums"><Dollars microdollars={budget.committedMicrodollars} /></p>
            </div>
            <div>
              <p className="text-[12px] text-text/40">Reserved, in flight</p>
              <p className="numeric text-[19px] font-semibold tabular-nums"><Dollars microdollars={budget.outstandingMicrodollars} /></p>
            </div>
            <div>
              <p className="text-[12px] text-text/40">Daily cap</p>
              <p className="numeric text-[19px] font-semibold tabular-nums"><Dollars microdollars={DAILY_BUDGET_MICRODOLLARS} /></p>
            </div>
            <div>
              <p className="text-[12px] text-text/40">Used</p>
              <p
                className={`numeric text-[19px] font-semibold tabular-nums ${
                  crossed !== null && crossed >= 90 ? "text-clay" : ""
                }`}
              >
                <Percent value={budget.usedPercent} />
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-black/6">
            <span
              className="block h-full rounded-full bg-clay"
              style={{ width: `${Math.min(100, budget.usedPercent ?? 0)}%` }}
            />
          </div>
          {crossed !== null && (
            <p className="mt-2 text-[12.5px] text-text/50">
              Past the {crossed}% mark. At 100% a call is refused before it is made and explain pauses until
              someone clears it; reports, diffs, uploads, and CI are unaffected.
            </p>
          )}
        </section>

        {/* The funded provider balance. Launch policy is a small preloaded float
            with auto-reload off, so the point of this card is to be read before
            it empties — an unfunded provider account is the one failure the
            daily cap cannot prevent. */}
        <section className="mb-6 rounded-xl border border-black/10 bg-white px-4 py-3.5">
          <h2 className="eyebrow text-text/45 mb-3">Provider account balance</h2>
          {balance === null ? (
            <p className="text-[13.5px] text-text/50">
              No funding recorded. Nothing is estimated here — record what the provider account was funded with
              to get depletion alerts at 50, 75, 90 and 100%.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[12px] text-text/40">Funded</p>
                  <p className="numeric text-[19px] font-semibold tabular-nums"><Dollars microdollars={balance.balanceMicrodollars} /></p>
                </div>
                <div>
                  <p className="text-[12px] text-text/40">Spent since</p>
                  <p className="numeric text-[19px] font-semibold tabular-nums"><Dollars microdollars={balance.usedMicrodollars} /></p>
                </div>
                <div>
                  <p className="text-[12px] text-text/40">Remaining</p>
                  <p
                    className={`numeric text-[19px] font-semibold tabular-nums ${balance.usedPercent >= 90 ? "text-clay" : ""}`}
                  >
                    <Dollars microdollars={balance.remainingMicrodollars} />
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-text/40">Recorded</p>
                  <p className="numeric text-[13.5px] tabular-nums text-text/60">
                    {timeFormat.format(new Date(balance.recordedAt))}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-text/40">
                Our record of spend, not the provider&rsquo;s. A difference between the two is worth looking at.
              </p>
            </>
          )}
        </section>

        {/* Explain paused is the one state that needs a human, so the control
            that clears it lives next to the reason it tripped. */}
        <section className="mb-6 rounded-xl border border-black/10 bg-white px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="eyebrow text-text/45">Circuit breaker</h2>
            <p className="text-[12px] text-text/35">{paused ? "TRIPPED" : "clear"}</p>
          </div>
          {paused && (
            <form action={resetBreakerAction} className="mb-4 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                name="actor"
                required
                placeholder="your name"
                className="rounded-lg border border-black/15 px-3 py-2 text-[13.5px]"
              />
              <input
                name="reason"
                required
                placeholder="why it is safe to spend again"
                className="rounded-lg border border-black/15 px-3 py-2 text-[13.5px]"
              />
              <button
                type="submit"
                className="rounded-lg bg-clay px-4 py-2 text-[13.5px] font-medium text-white hover:opacity-90"
              >
                Reset
              </button>
              <p className="text-[12px] text-text/40 sm:col-span-3">
                Both fields are required and are kept permanently. Resetting resumes provider calls immediately.
              </p>
            </form>
          )}
          {breaker.length === 0 ? (
            <p className="text-[13.5px] text-text/40">Never tripped.</p>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {breaker.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-2 border-t border-black/6 pt-1.5 first:border-0 first:pt-0">
                  <span className={event.action === "tripped" ? "font-semibold text-clay" : "font-semibold text-text/60"}>
                    {event.action}
                  </span>
                  <span className="numeric tabular-nums text-text/45">{timeFormat.format(new Date(event.createdAt))}</span>
                  <span className="text-text/45">{event.actor}</span>
                  <span className="text-text/60">{event.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Budget alerts. An undelivered row means the channel is broken, which
            is a different problem from a quiet one and must not read the same. */}
        <section className="mb-6 rounded-xl border border-black/10 bg-white px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="eyebrow text-text/45">Budget alerts · 50 / 75 / 90 / 100%</h2>
            <p className={`text-[12px] ${undelivered > 0 ? "font-semibold text-clay" : "text-text/35"}`}>
              {undelivered > 0 ? `${undelivered} undelivered — check the alert channel` : "all delivered"}
            </p>
          </div>
          {alerts.length === 0 ? (
            <p className="text-[13.5px] text-text/40">No budget has crossed 50% yet.</p>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {alerts.map((a) => (
                <li
                  key={`${a.scope}:${a.subjectId}:${a.period}:${a.threshold}`}
                  className="flex flex-wrap gap-x-2 border-t border-black/6 pt-1.5 first:border-0 first:pt-0"
                >
                  <span className="font-semibold tabular-nums">{a.threshold}%</span>
                  <span className="text-text/60">{a.scope}</span>
                  <span className="numeric text-[12.5px] text-text/45">{a.period}</span>
                  <span className="numeric tabular-nums text-text/45">
                    <Dollars microdollars={a.usedMicrodollars} /> of <Dollars microdollars={a.limitMicrodollars} />
                  </span>
                  <span className="numeric tabular-nums text-text/45">
                    {timeFormat.format(new Date(a.firstSeenAt))}
                  </span>
                  {a.deliveredAt === null && (
                    <span className="font-semibold text-clay">undelivered{a.lastError ? ` — ${a.lastError}` : ""}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recovery and operations — PATHWAYS Pathway 1 item 10.

            This is the pull half of the alert story. An alert channel can be
            down, and `deliveredAt` only means the message was handed to it, so
            the operator page shows the live state rather than the history of
            what was sent. Everything here reads a table something else writes:
            no derived guesses. */}
        <section className="mb-6 rounded-xl border border-black/10 bg-white px-4 py-3.5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="eyebrow text-text/45">Recovery and operations</h2>
            <p className={`text-[12px] ${opsSignals.length > 0 ? "font-semibold text-clay" : "text-text/35"}`}>
              {opsSignals.length > 0 ? `${opsSignals.length} open` : "nothing wrong"}
            </p>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-black/8 px-3 py-2.5">
              <p className="eyebrow text-text/45">Last good backup</p>
              <p className={`mt-1 text-[13.5px] ${recovery.backupStale ? "font-semibold text-clay" : "text-text/70"}`}>
                {recovery.lastGoodBackup
                  ? `${timeFormat.format(new Date(recovery.lastGoodBackup.finishedAt as string))} · ${(
                      recovery.lastGoodBackup.bytes / 1e6
                    ).toFixed(1)} MB encrypted`
                  : "never — nothing can be restored"}
              </p>
              {recovery.lastGoodBackup && (
                <p className="numeric mt-1 text-[12px] text-text/40">{recovery.lastGoodBackup.id}</p>
              )}
            </div>
            <div className="rounded-lg border border-black/8 px-3 py-2.5">
              <p className="eyebrow text-text/45">Last passed restore rehearsal</p>
              <p className={`mt-1 text-[13.5px] ${recovery.rehearsalStale ? "font-semibold text-clay" : "text-text/70"}`}>
                {recovery.lastPassedRehearsal
                  ? `${timeFormat.format(new Date(recovery.lastPassedRehearsal.finishedAt as string))} · ${
                      recovery.lastPassedRehearsal.tablesChecked
                    } tables, ${recovery.lastPassedRehearsal.rowsChecked.toLocaleString("en-US")} rows`
                  : "never — the backups are unproven"}
              </p>
              {recovery.lastPassedRehearsal && (
                <p className="numeric mt-1 text-[12px] text-text/40">
                  {recovery.lastPassedRehearsal.actor}
                  {recovery.lastPassedRehearsal.restoreSeconds != null
                    ? ` · ${recovery.lastPassedRehearsal.restoreSeconds}s`
                    : ""}
                </p>
              )}
            </div>
          </div>

          {opsSignals.length === 0 ? (
            <p className="text-[13.5px] text-text/40">
              No failed backups, rehearsals, deletions or reservations, and no undelivered alerts.
            </p>
          ) : (
            <ul className="space-y-1.5 text-[13px]">
              {opsSignals.map((s) => (
                <li
                  key={`${s.kind}:${s.subjectId}:${s.period}`}
                  className="flex flex-wrap gap-x-2 border-t border-black/6 pt-1.5 first:border-0 first:pt-0"
                >
                  <span className={s.severity === "critical" ? "font-semibold text-clay" : "font-semibold text-text/60"}>
                    {s.severity}
                  </span>
                  <span className="text-text/60">{s.kind}</span>
                  <span className="text-text/60">{s.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Allowed" value={totals.allowed} hint="requests let through" />
          <Stat label="Rejected" value={totals.rejected} hint="turned away at a ceiling" />
          <Stat label="At the ceiling" value={totals.rejectedSubjects} hint="keys or orgs refused at least once" />
        </div>

        <section className="rounded-xl border border-black/10 bg-white">
          <div className="flex items-baseline justify-between px-4 py-3.5">
            <h2 className="eyebrow text-text/45">By subject · worst first</h2>
            <p className="text-[12px] text-text/35">
              {subjects.length === MAX_SUBJECT_ROWS ? `top ${MAX_SUBJECT_ROWS}` : `${subjects.length} subject${subjects.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-t border-black/8 text-[13.5px]">
              <thead>
                <tr className="text-left text-text/40">
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 font-medium">Organization</th>
                  <th className="px-4 py-2 text-right font-medium">Allowed</th>
                  <th className="px-4 py-2 text-right font-medium">Rejected</th>
                  <th className="px-4 py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {subjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-text/40">
                      No API traffic in the last {WINDOW_MINUTES} minutes.
                    </td>
                  </tr>
                ) : (
                  subjects.map((s) => (
                    <tr key={`${s.scope}:${s.subjectId}`} className="border-t border-black/6">
                      <td className="px-4 py-2 text-text/60">{s.scope === "org" ? "organization" : "key"}</td>
                      <td className="numeric px-4 py-2 text-[12.5px] text-text/60">{s.subjectId}</td>
                      <td className="numeric px-4 py-2 text-[12.5px] text-text/60">{s.orgId}</td>
                      <td className="numeric px-4 py-2 text-right tabular-nums">{s.allowed}</td>
                      <td
                        className={`numeric px-4 py-2 text-right tabular-nums ${s.rejected > 0 ? "font-semibold text-clay" : "text-text/40"}`}
                      >
                        {s.rejected}
                      </td>
                      <td className="numeric px-4 py-2 tabular-nums text-text/60">
                        {timeFormat.format(new Date(s.lastSeen))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
