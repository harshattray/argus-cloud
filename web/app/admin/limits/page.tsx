import type { Metadata } from "next";
import { rateLimitTotals, rateLimitBySubject, MAX_SUBJECT_ROWS } from "argus-cloud/rateLimit.js";
import { globalDayStatus, thresholdCrossed } from "argus-cloud/providerBudget.js";
import { isTripped } from "argus-cloud/breaker.js";
import { getDb } from "../../../lib/db";

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

const dollars = (microdollars: number) => `$${(microdollars / 1e6).toFixed(4)}`;

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
  const [totals, subjects, budget, paused] = await Promise.all([
    rateLimitTotals(db, WINDOW_MINUTES),
    rateLimitBySubject(db, WINDOW_MINUTES),
    globalDayStatus(db, DAILY_BUDGET_MICRODOLLARS),
    isTripped(db),
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
              <p className="numeric text-[19px] font-semibold tabular-nums">{dollars(budget.committedMicrodollars)}</p>
            </div>
            <div>
              <p className="text-[12px] text-text/40">Reserved, in flight</p>
              <p className="numeric text-[19px] font-semibold tabular-nums">{dollars(budget.outstandingMicrodollars)}</p>
            </div>
            <div>
              <p className="text-[12px] text-text/40">Daily cap</p>
              <p className="numeric text-[19px] font-semibold tabular-nums">{dollars(DAILY_BUDGET_MICRODOLLARS)}</p>
            </div>
            <div>
              <p className="text-[12px] text-text/40">Used</p>
              <p
                className={`numeric text-[19px] font-semibold tabular-nums ${
                  crossed !== null && crossed >= 90 ? "text-clay" : ""
                }`}
              >
                {budget.usedPercent === null ? "—" : `${budget.usedPercent.toFixed(1)}%`}
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
