import type { Db } from "./db.js";

/**
 * Waitlist traction queries (PATHWAYS.md — "Minimum traction mechanism").
 *
 * The waitlist table is the source of truth for demand; the notification mail
 * is awareness, not measurement. This module is the read side: counts, a daily
 * series, source/referrer breakdowns, and the rows behind a CSV export.
 *
 * It lives in the backend package rather than in a route so it can be tested
 * against a real database. Everything here is read-only — nothing in this file
 * writes, and nothing takes a caller-supplied SQL fragment.
 *
 * Privacy: addresses are returned only by `waitlistRows`, which exists to serve
 * the admin table and the CSV. No function here logs, and no caller may put an
 * address in a URL or query string.
 */

/** Rows are capped so a stray `?limit=1e9` cannot pull the whole table. */
export const MAX_ROWS = 500;

/** Days of daily history returned by the summary. */
export const SERIES_DAYS = 30;

export interface WaitlistSummary {
  /** Rows in the table. `email` is UNIQUE, so this is a unique-signup count. */
  total: number;
  /** Current UTC calendar day. */
  today: number;
  /** Trailing 7 UTC days, including today. */
  last7Days: number;
  /** Current UTC calendar month, matching the reconciliation month boundary. */
  thisMonth: number;
  /** One entry per UTC day for the last {@link SERIES_DAYS}, zeros included. */
  series: { day: string; count: number }[];
  /** Signup surface, most-used first. `null` source is reported as "unknown". */
  sources: { source: string; count: number }[];
  /** Referrer origin, most-used first. Absent referrer is reported as "direct". */
  referrers: { referrer: string; count: number }[];
}

export interface WaitlistRow {
  email: string;
  source: string | null;
  referrer: string | null;
  createdAt: string;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function waitlistSummary(db: Db, now: Date = new Date()): Promise<WaitlistSummary> {
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  // Trailing seven days *including* today, so the window is 6 days back from
  // the start of today — not 7, which would silently be an eight-day count.
  const weekStart = new Date(dayStart.getTime() - 6 * 24 * 3600 * 1000);
  const seriesStart = new Date(dayStart.getTime() - (SERIES_DAYS - 1) * 24 * 3600 * 1000);

  const counts = (
    await db.query<{
      total: string | number;
      today: string | number;
      week: string | number;
      month: string | number;
    }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at >= $1) AS today,
              COUNT(*) FILTER (WHERE created_at >= $2) AS week,
              COUNT(*) FILTER (WHERE created_at >= $3) AS month
       FROM waitlist`,
      [dayStart.toISOString(), weekStart.toISOString(), monthStart.toISOString()]
    )
  ).rows[0];

  // Formatted to text in the database on purpose. Returning a `timestamp` here
  // hands the driver a value with no zone, which JS then reads as local time —
  // on any machine east or west of UTC that silently shifts every bucket by a
  // day. `to_char` makes the UTC day key unambiguous before it leaves SQL.
  const seriesRows = (
    await db.query<{ day: string; count: string | number }>(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS count
       FROM waitlist WHERE created_at >= $1
       GROUP BY 1 ORDER BY 1`,
      [seriesStart.toISOString()]
    )
  ).rows;

  // Days with no signups are absent from the GROUP BY, and a chart that skips
  // them reads as a shorter quiet period than actually happened. Zero is the
  // honest value here — unlike frame trends, where a gap means "not measured".
  const byDay = new Map<string, number>();
  for (const row of seriesRows) {
    byDay.set(row.day, Number(row.count));
  }
  const series: { day: string; count: number }[] = [];
  for (let i = 0; i < SERIES_DAYS; i++) {
    const day = utcDayKey(new Date(seriesStart.getTime() + i * 24 * 3600 * 1000));
    series.push({ day, count: byDay.get(day) ?? 0 });
  }

  const sourceRows = (
    await db.query<{ source: string | null; count: string | number }>(
      `SELECT source, COUNT(*) AS count FROM waitlist GROUP BY source ORDER BY count DESC, source ASC`
    )
  ).rows;

  const referrerRows = (
    await db.query<{ referrer: string | null; count: string | number }>(
      `SELECT referrer, COUNT(*) AS count FROM waitlist GROUP BY referrer ORDER BY count DESC, referrer ASC`
    )
  ).rows;

  return {
    total: Number(counts?.total ?? 0),
    today: Number(counts?.today ?? 0),
    last7Days: Number(counts?.week ?? 0),
    thisMonth: Number(counts?.month ?? 0),
    series,
    sources: sourceRows.map((r) => ({ source: r.source ?? "unknown", count: Number(r.count) })),
    referrers: referrerRows.map((r) => ({ referrer: r.referrer ?? "direct", count: Number(r.count) })),
  };
}

/**
 * Newest first. `limit` is clamped rather than rejected: this feeds an admin
 * table and a CSV, and failing a report because someone typed a big number is
 * worse than quietly serving the maximum.
 */
export async function waitlistRows(
  db: Db,
  options: { limit?: number; offset?: number } = {}
): Promise<WaitlistRow[]> {
  // Anything that is not a positive integer is treated as "not asked for" and
  // falls back to the default. Clamping a negative to 1 would technically be
  // safe and would also serve a one-row report to someone who mistyped.
  const requestedLimit = Math.trunc(Number(options.limit));
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_ROWS) : MAX_ROWS;
  const requestedOffset = Math.trunc(Number(options.offset));
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const rows = (
    await db.query<{ email: string; source: string | null; referrer: string | null; created_at: string | Date }>(
      `SELECT email, source, referrer, created_at FROM waitlist
       ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
  ).rows;
  return rows.map((r) => ({
    email: r.email,
    source: r.source,
    referrer: r.referrer,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
  }));
}

/**
 * A leading `=`, `+`, `-`, `@`, tab or CR makes a spreadsheet treat the cell as
 * a formula. The export is opened in Excel or Sheets by definition, so the
 * prefix is neutralised with a single quote — the conventional escape, which
 * those applications strip on display.
 */
function csvCell(value: string | null): string {
  const raw = value ?? "";
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** RFC 4180 CSV. CRLF line endings, every field quoted. */
export function waitlistCsv(rows: WaitlistRow[]): string {
  const lines = ["email,source,referrer,created_at"];
  for (const row of rows) {
    lines.push(
      [csvCell(row.email), csvCell(row.source), csvCell(row.referrer), csvCell(row.createdAt)].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
