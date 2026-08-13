import type { Metadata } from "next";
import { waitlistSummary, waitlistRows, MAX_ROWS } from "argus-cloud/waitlist.js";
import { getDb } from "../../../lib/db";

/**
 * Waitlist traction — the "minimum traction mechanism" in docs/PATHWAYS.md.
 *
 * The database is the source of truth for demand; the notification mail is
 * awareness. This page is the measurement: unique signups, rate, and where they
 * came from, plus the rows themselves and a CSV export for follow-up.
 *
 * Access is the `/admin` gate in `middleware.ts` — default-deny, separate
 * password from `/pitch`. There is no public path to any of this. Addresses are
 * rendered as React text (escaped) and never placed in a URL or a log line.
 *
 * Interpretation note, from the same section of PATHWAYS: this measures
 * interest, not willingness to pay. It can justify advancing a Cloud pathway;
 * it cannot on its own validate the price.
 */

export const metadata: Metadata = {
  title: { absolute: "Waitlist — Normascope" },
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-4 py-3.5">
      <p className="eyebrow text-text/45">{label}</p>
      <p className="numeric mt-1 text-[26px] leading-none font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-text/40">{hint}</p>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <section className="rounded-xl border border-black/10 bg-white px-4 py-3.5">
      <h2 className="eyebrow text-text/45 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-text/40">No signups yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const share = total > 0 ? Math.round((row.count / total) * 100) : 0;
            return (
              <li key={row.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[13.5px]" title={row.label}>
                  {row.label}
                </span>
                <span className="h-1.5 flex-1 rounded-full bg-black/6">
                  <span
                    className="block h-full rounded-full bg-clay"
                    style={{ width: `${Math.max(share, row.count > 0 ? 2 : 0)}%` }}
                  />
                </span>
                <span className="numeric w-14 shrink-0 text-right text-[13px] tabular-nums text-text/60">
                  {row.count} · {share}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function WaitlistPage() {
  const db = await getDb();
  const [summary, rows] = await Promise.all([waitlistSummary(db), waitlistRows(db)]);

  const peak = Math.max(1, ...summary.series.map((d) => d.count));
  const dateFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  return (
    <main className="min-h-screen bg-paper text-text px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-clay mb-2">Normascope · operator</p>
            <h1 className="display-sm">Cloud waitlist</h1>
            <p className="mt-1.5 text-[13.5px] text-text/45">
              Unique signups. Interest, not willingness to pay. All times UTC.{" "}
              <a href="/admin/limits" className="underline decoration-black/20 underline-offset-2 hover:text-clay">
                Rate limits
              </a>
            </p>
          </div>
          <a
            href="/admin/waitlist/export"
            className="rounded-lg border border-black/12 bg-white px-3.5 py-2 text-[13.5px] font-medium transition-colors hover:border-clay hover:text-clay"
          >
            Download CSV
          </a>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={summary.total} hint="unique addresses" />
          <Stat label="Today" value={summary.today} hint="since 00:00 UTC" />
          <Stat label="Last 7 days" value={summary.last7Days} hint="including today" />
          <Stat label="This month" value={summary.thisMonth} hint="calendar month" />
        </div>

        <section className="mb-6 rounded-xl border border-black/10 bg-white px-4 py-3.5">
          <h2 className="eyebrow text-text/45 mb-3">Signups over time · last 30 days</h2>
          {/* Days with no signups are drawn as an empty column rather than
              skipped, so a quiet week reads as a quiet week. */}
          <div className="flex h-24 items-end gap-[3px]">
            {summary.series.map((point) => (
              <div
                key={point.day}
                className="group relative flex-1 rounded-t-[2px] bg-clay/85 hover:bg-clay"
                style={{ height: `${point.count === 0 ? 2 : Math.max((point.count / peak) * 100, 6)}%` }}
                title={`${point.day} · ${point.count} signup${point.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-text/35">
            <span>{summary.series[0]?.day}</span>
            <span>peak {peak}/day</span>
            <span>{summary.series[summary.series.length - 1]?.day}</span>
          </div>
        </section>

        <div className="mb-6 grid gap-3 md:grid-cols-2">
          <Breakdown
            title="By surface"
            total={summary.total}
            rows={summary.sources.map((s) => ({ label: s.source, count: s.count }))}
          />
          <Breakdown
            title="By referrer"
            total={summary.total}
            rows={summary.referrers.map((r) => ({ label: r.referrer, count: r.count }))}
          />
        </div>

        <section className="rounded-xl border border-black/10 bg-white">
          <div className="flex items-baseline justify-between px-4 py-3.5">
            <h2 className="eyebrow text-text/45">Signups</h2>
            <p className="text-[12px] text-text/35">
              {rows.length === MAX_ROWS
                ? `newest ${MAX_ROWS} — use the CSV for the full list`
                : `${rows.length} row${rows.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-t border-black/8 text-[13.5px]">
              <thead>
                <tr className="text-left text-text/40">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Surface</th>
                  <th className="px-4 py-2 font-medium">Referrer</th>
                  <th className="px-4 py-2 font-medium">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-text/40">
                      No signups yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.email} className="border-t border-black/6">
                      <td className="px-4 py-2">{row.email}</td>
                      <td className="px-4 py-2 text-text/60">{row.source ?? "unknown"}</td>
                      <td className="px-4 py-2 text-text/60">{row.referrer ?? "direct"}</td>
                      <td className="numeric px-4 py-2 tabular-nums text-text/60">
                        {dateFormat.format(new Date(row.createdAt))}
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
