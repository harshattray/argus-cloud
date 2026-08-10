// Waitlist traction suite — the "minimum traction mechanism" gate in
// PATHWAYS.md ("Public website demand test").
// Run: npm test — runs on PGlite; set DATABASE_URL for a real server.

import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { waitlistSummary, waitlistRows, waitlistCsv, MAX_ROWS, SERIES_DAYS } = await import(
  path.join(DIST, "waitlist.js")
);

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

// A DATABASE_URL run shares one database across suites and across re-runs, so
// the table is only empty by luck. In-memory PGlite gets that for free; real
// Postgres does not. Clearing here makes the row counts below deterministic in
// both modes.
await db.query("DELETE FROM waitlist");

// A fixed "now" so day/week/month boundaries are assertions, not weather.
const NOW = new Date("2026-08-10T12:00:00.000Z");
const day = (offsetDays, hour = 9) =>
  new Date(NOW.getTime() - offsetDays * 24 * 3600 * 1000).toISOString().slice(0, 11) +
  String(hour).padStart(2, "0") +
  ":00:00.000Z";

async function add(email, source, referrer, at) {
  await db.query(
    "INSERT INTO waitlist (email, source, referrer, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING",
    [email, source, referrer, at]
  );
}

// --- fixture -------------------------------------------------------------
// today: 2 | last 7 days: 4 | this month (Aug 1 onward): 5 | total: 7
await add("today-a@example.com", "home", "https://news.ycombinator.com", day(0, 8));
await add("today-b@example.com", "cloud", null, day(0, 11));
await add("week-a@example.com", "home", "https://news.ycombinator.com", day(3));
await add("week-b@example.com", "footer", "https://github.com", day(6));
await add("month-a@example.com", "nav", null, day(9)); // 2026-08-01
await add("old-a@example.com", "home", "https://github.com", day(20)); // July
await add("old-b@example.com", null, null, day(45)); // outside the 30-day series

const summary = await waitlistSummary(db, NOW);

check("W1", summary.total === 7, `total unique signups = ${summary.total} (expected 7)`);
check("W2", summary.today === 2, `today (UTC) = ${summary.today} (expected 2)`);
check("W3", summary.last7Days === 4, `trailing 7 days = ${summary.last7Days} (expected 4)`);
check("W4", summary.thisMonth === 5, `this month (UTC) = ${summary.thisMonth} (expected 5)`);

// --- series --------------------------------------------------------------
check("W5", summary.series.length === SERIES_DAYS, `series covers ${summary.series.length} days (expected ${SERIES_DAYS})`);
check(
  "W6",
  summary.series[summary.series.length - 1].day === "2026-08-10" &&
    summary.series[summary.series.length - 1].count === 2,
  "series ends on today with today's count"
);
const quiet = summary.series.find((d) => d.day === "2026-08-09");
check("W7", quiet && quiet.count === 0, "a day with no signups is present as zero, not missing");
check(
  "W8",
  summary.series.reduce((sum, d) => sum + d.count, 0) === 6,
  "series excludes the signup older than the window"
);

// --- breakdowns ----------------------------------------------------------
const sources = Object.fromEntries(summary.sources.map((s) => [s.source, s.count]));
check("W9", sources.home === 3, `source home = ${sources.home} (expected 3)`);
check("W10", sources.unknown === 1, "a null source is reported as 'unknown', not dropped");
check(
  "W11",
  summary.sources[0].source === "home",
  `sources are ordered by count desc (first = ${summary.sources[0].source})`
);
const referrers = Object.fromEntries(summary.referrers.map((r) => [r.referrer, r.count]));
check("W12", referrers["https://github.com"] === 2, "referrer origins are counted");
check("W13", referrers.direct === 3, "a null referrer is reported as 'direct'");
check(
  "W14",
  summary.sources.reduce((sum, s) => sum + s.count, 0) === summary.total,
  "source breakdown sums to the total — no signup is unattributed"
);

// --- rows ----------------------------------------------------------------
const rows = await waitlistRows(db);
check("W15", rows.length === 7, `rows returned = ${rows.length} (expected 7)`);
check("W16", rows[0].email === "today-b@example.com", "rows are newest first");
check(
  "W17",
  rows[0].source === "cloud" && rows[0].referrer === null && rows[0].createdAt.endsWith("Z"),
  "each row carries email, source, referrer and an ISO timestamp"
);

const paged = await waitlistRows(db, { limit: 2, offset: 2 });
check("W18", paged.length === 2 && paged[0].email === "week-a@example.com", "limit/offset paginate");

const clamped = await waitlistRows(db, { limit: 1e9 });
check("W19", clamped.length <= MAX_ROWS, `an absurd limit clamps to ${MAX_ROWS}, not the whole table`);
const negative = await waitlistRows(db, { limit: -5, offset: -5 });
check("W20", negative.length === 7, "negative limit/offset do not produce a SQL error or an empty page");

// --- CSV -----------------------------------------------------------------
const csv = waitlistCsv(rows);
check("W21", csv.startsWith("email,source,referrer,created_at\r\n"), "CSV has an RFC 4180 header");
check("W22", csv.split("\r\n").filter(Boolean).length === 8, "CSV has one line per row plus the header");
check("W23", csv.includes('"today-b@example.com","cloud","",'), "a null field becomes an empty quoted cell");

const injected = waitlistCsv([
  { email: '=cmd|"/c calc"!A1', source: "+SUM(1)", referrer: '-2+3"x', createdAt: "2026-08-10T00:00:00.000Z" },
]);
check("W24", injected.includes(`"'=cmd`), "a leading = is neutralised against spreadsheet formula injection");
check("W25", injected.includes(`"'+SUM(1)"`) && injected.includes(`"'-2+3""x"`), "+ and - are neutralised and quotes doubled");
check("W26", !/\r\n[^"]*=cmd/.test(injected), "no unquoted formula survives into a cell");

// --- empty state ---------------------------------------------------------
// Clears the table rather than opening a second handle. `createDb()` only
// yields a *fresh* database on in-memory PGlite; against DATABASE_URL it
// reconnects to the same one, so the old version of this check passed for the
// wrong reason locally and failed against real Postgres.
await db.query("DELETE FROM waitlist");
const emptySummary = await waitlistSummary(db, NOW);
check(
  "W27",
  emptySummary.total === 0 && emptySummary.series.length === SERIES_DAYS && emptySummary.sources.length === 0,
  "an empty waitlist reports zeros and a full zero series, not a crash"
);
check("W28", waitlistCsv([]) === "email,source,referrer,created_at\r\n", "an empty export is a header-only CSV");

await db.close();

console.log(failures === 0 ? "\nwaitlist: all checks passed" : `\nwaitlist: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
