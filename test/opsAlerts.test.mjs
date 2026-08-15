// Operational alert suite — PATHWAYS.md Pathway 1 item 10 ("operational
// alerts"); §3 "Operations and recovery".
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/opsAlerts.test.mjs
//
// Four claims are under test:
//
//   1. Every operational failure the product can already record — a missing or
//      failed backup, a stale or failed rehearsal, a failed deletion job, a
//      breaker left tripped, leaked reservations, a broken budget-alert
//      channel — produces exactly one signal, with the numbers in it.
//   2. That signal reaches a human once per period, however many instances
//      notice it at once. P3r spawns 20 real processes; P3b runs the obvious
//      "check, then send" through the same 20 to prove P3r has teeth.
//   3. A failed send is retried, not swallowed.
//   4. The alert channel actually sends somewhere, and never throws into the
//      request path when it cannot.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { resetBreaker } = await import(path.join(DIST, "breaker.js"));
const { startBackup, completeBackup, failBackup, startRehearsal, completeRehearsal, backupStorageKey } = await import(
  path.join(DIST, "backup.js")
);
const {
  DEFAULT_OPS_THRESHOLDS,
  collectOpsSignals,
  deliverOpsSignal,
  checkOperationalHealth,
  recentOpsAlerts,
  undeliveredOpsAlertCount,
} = await import(path.join(DIST, "opsAlerts.js"));
const { createAlertChannel, alertChannelOptionsFromEnv } = await import(path.join(DIST, "alertChannel.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

const T0 = new Date("2026-08-15T09:00:00.000Z");
const DAY = T0.toISOString().slice(0, 10);
const hoursAgo = (n) => new Date(T0.getTime() - n * 3_600_000);
const daysAgo = (n) => new Date(T0.getTime() - n * 86_400_000);
const sink = [];
const into = (list) => (message) => list.push(message);
const kinds = (signals) => signals.map((s) => s.kind).sort();
const has = (signals, kind) => signals.some((s) => s.kind === kind);
const detailOf = (signals, kind) => signals.find((s) => s.kind === kind)?.detail ?? "";

/**
 * Rehearsals reference backups and deliberately do not cascade from them — the
 * evidence that a restore happened must not vanish with the row it describes
 * (`migrations/014_backups.sql`). So a test clearing both clears them in order.
 */
async function clearRecovery() {
  await db.query("DELETE FROM restore_rehearsals");
  await db.query("DELETE FROM backups");
}

/** A healthy baseline: a fresh backup, a fresh passed rehearsal, nothing broken. */
async function makeHealthy() {
  await db.query("DELETE FROM ops_alerts");
  await clearRecovery();
  await db.query("DELETE FROM deletion_jobs WHERE state = 'failed'");
  await db.query("DELETE FROM budget_alerts WHERE delivered_at IS NULL");
  await db.query("UPDATE breaker_state SET tripped_at = NULL, reason = '' WHERE id = 1");
  await db.query("DELETE FROM provider_reservations WHERE state = 'reserved' AND expires_at <= $1", [
    T0.toISOString(),
  ]);

  const backupId = `bk_${randomUUID().slice(0, 8)}`;
  await startBackup(db, { id: backupId, actor: "test", now: hoursAgo(4) });
  await completeBackup(db, {
    id: backupId,
    storageKey: backupStorageKey(backupId, hoursAgo(4)),
    bytes: 2048,
    sha256: "d".repeat(64),
    encrypted: true,
    manifest: { orgs: 1 },
    now: hoursAgo(4),
  });
  const rehearsalId = `rh_${randomUUID().slice(0, 8)}`;
  await startRehearsal(db, { id: rehearsalId, backupId, actor: "test", now: hoursAgo(4) });
  await completeRehearsal(db, { id: rehearsalId, mismatches: [], tablesChecked: 1, rowsChecked: 1, now: hoursAgo(4) });
  return { backupId, rehearsalId };
}

// ---------------------------------------------------------------------------
// P1 — a healthy system says nothing
// ---------------------------------------------------------------------------
{
  await makeHealthy();
  const signals = await collectOpsSignals(db, T0);
  check("P1.1", signals.length === 0, `a healthy system produces no signals (got ${kinds(signals).join(", ") || "none"})`);

  const result = await checkOperationalHealth(db, into(sink), T0);
  check("P1.2", result.healthy && sink.length === 0, "and pages nobody");
}

// ---------------------------------------------------------------------------
// P2 — each failure the product can record produces its own signal
// ---------------------------------------------------------------------------
{
  // --- no backup at all ---------------------------------------------------
  await makeHealthy();
  await clearRecovery();
  let signals = await collectOpsSignals(db, T0);
  check("P2.1", has(signals, "backup-missing"), "a deployment that has never backed up is told on day one");
  check(
    "P2.2",
    detailOf(signals, "backup-missing").includes("Nothing can be restored") &&
      !detailOf(signals, "backup-missing").includes("ago"),
    "and the message says so rather than quoting an age it does not have"
  );

  // --- a stale backup ------------------------------------------------------
  await makeHealthy();
  const old = `bk_${randomUUID().slice(0, 8)}`;
  await clearRecovery();
  await startBackup(db, { id: old, actor: "test", now: daysAgo(3) });
  await completeBackup(db, {
    id: old,
    storageKey: backupStorageKey(old, daysAgo(3)),
    bytes: 512,
    sha256: "e".repeat(64),
    encrypted: true,
    manifest: {},
    now: daysAgo(3),
  });
  signals = await collectOpsSignals(db, T0);
  check("P2.3", has(signals, "backup-missing"), "a three-day-old backup is stale");
  check("P2.4", detailOf(signals, "backup-missing").includes("days ago"), `age is in the message: "${detailOf(signals, "backup-missing").slice(0, 80)}…"`);

  // --- a failed backup -----------------------------------------------------
  await makeHealthy();
  const broken = `bk_${randomUUID().slice(0, 8)}`;
  await startBackup(db, { id: broken, actor: "test", now: hoursAgo(1) });
  await failBackup(db, broken, new Error("no space left on device"), hoursAgo(1));
  signals = await collectOpsSignals(db, T0);
  check("P2.5", has(signals, "backup-failed"), "a failed dump is its own alert, separate from staleness");
  check(
    "P2.6",
    detailOf(signals, "backup-failed").includes("no space left"),
    "and carries the error, so the first look does not need a database"
  );
  check(
    "P2.7",
    !has(signals, "backup-missing"),
    "the earlier good backup is still fresh, so it does not also cry stale — one problem, one alert"
  );

  // --- a rehearsal that has never happened ---------------------------------
  await makeHealthy();
  await db.query("DELETE FROM restore_rehearsals");
  signals = await collectOpsSignals(db, T0);
  check("P2.8", has(signals, "rehearsal-stale"), "backups running and never restored is a signal in its own right");

  // --- a failed rehearsal --------------------------------------------------
  const { backupId } = await makeHealthy();
  const failedRehearsal = `rh_${randomUUID().slice(0, 8)}`;
  await startRehearsal(db, { id: failedRehearsal, backupId, actor: "test", now: hoursAgo(1) });
  await completeRehearsal(db, {
    id: failedRehearsal,
    mismatches: [{ table: "usage_events", expected: 4210, actual: 0 }],
    tablesChecked: 24,
    rowsChecked: 91,
    now: hoursAgo(1),
  });
  signals = await collectOpsSignals(db, T0);
  check("P2.9", has(signals, "rehearsal-failed"), "a backup that failed to restore is critical");
  check(
    "P2.10",
    detailOf(signals, "rehearsal-failed").includes("usage_events") &&
      detailOf(signals, "rehearsal-failed").includes("4210"),
    "and names the table and both counts"
  );

  // --- a failed deletion job ----------------------------------------------
  await makeHealthy();
  const jobId = `dj_${randomUUID().slice(0, 8)}`;
  await db.query(
    `INSERT INTO deletion_jobs (id, scope, target_id, org_id, state, last_error, created_at)
     VALUES ($1, 'org', 'org-42', 'org-42', 'failed', 'storage deletePrefix threw', $2)`,
    [jobId, hoursAgo(2).toISOString()]
  );
  signals = await collectOpsSignals(db, T0);
  check("P2.11", has(signals, "deletion-failed"), "an erasure that failed halfway is not left to a weekly report");
  check(
    "P2.12",
    detailOf(signals, "deletion-failed").includes("org-42") &&
      detailOf(signals, "deletion-failed").includes("may still exist"),
    "and says what may still be on disk"
  );
  await db.query("DELETE FROM deletion_jobs WHERE id = $1", [jobId]);

  // --- a breaker nobody reset ---------------------------------------------
  await makeHealthy();
  await db.query("UPDATE breaker_state SET tripped_at = $1, reason = 'daily provider budget reached' WHERE id = 1", [
    hoursAgo(DEFAULT_OPS_THRESHOLDS.breakerUnresetHours + 2).toISOString(),
  ]);
  signals = await collectOpsSignals(db, T0);
  check("P2.13", has(signals, "breaker-unreset"), "explain paused overnight is paid-product downtime, and alerts again");

  await db.query("UPDATE breaker_state SET tripped_at = $1 WHERE id = 1", [hoursAgo(1).toISOString()]);
  signals = await collectOpsSignals(db, T0);
  check(
    "P2.14",
    !has(signals, "breaker-unreset"),
    "a trip an hour old does not — the trip itself already alerted, this is for the one nobody came back to"
  );
  await resetBreaker(db, { actor: "test", reason: "suite cleanup" });

  // --- a broken budget-alert channel --------------------------------------
  await makeHealthy();
  await db.query(
    `INSERT INTO budget_alerts (scope, subject_id, period, threshold, used_percent, limit_microdollars,
                                used_microdollars, attempts, claimed_at, delivered_at)
     VALUES ('global-day', 'ops-suite', $1, 90, 91.0, 1000000, 910000, 3, $2, NULL)`,
    [DAY, hoursAgo(1).toISOString()]
  );
  signals = await collectOpsSignals(db, T0);
  check("P2.15", has(signals, "alert-channel-broken"), "spend warnings that never left the building are themselves an alert");
  await db.query("DELETE FROM budget_alerts WHERE subject_id = 'ops-suite'");

  // --- leaked reservations -------------------------------------------------
  await makeHealthy();
  const orgId = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, `ops-${orgId.slice(0, 8)}`]);
  const leak = DEFAULT_OPS_THRESHOLDS.leakedReservations + 3;
  for (let i = 0; i < leak; i++) {
    await db.query(
      `INSERT INTO provider_reservations (id, org_id, model, pass, max_microdollars, state, day, month, created_at, expires_at)
       VALUES ($1, $2, 'claude-sonnet-5', 'analysis', 78400, 'reserved', $3, $4, $5, $6)`,
      [
        `res_${randomUUID()}`,
        orgId,
        DAY,
        DAY.slice(0, 7),
        hoursAgo(3).toISOString(),
        hoursAgo(2).toISOString(),
      ]
    );
  }
  signals = await collectOpsSignals(db, T0);
  check("P2.16", has(signals, "reservation-leak"), `${leak} abandoned reservations quietly shrink everyone's ceiling`);
  check(
    "P2.17",
    detailOf(signals, "reservation-leak").includes(String(leak)),
    "and the message carries the count and the limit"
  );
  await db.query("DELETE FROM provider_reservations WHERE org_id = $1", [orgId]);
  await db.query("DELETE FROM orgs WHERE id = $1", [orgId]);

  // --- severity ordering ---------------------------------------------------
  await makeHealthy();
  await clearRecovery();
  await db.query("DELETE FROM restore_rehearsals");
  signals = await collectOpsSignals(db, T0);
  check(
    "P2.18",
    signals.length === 2 && signals[0].severity === "critical" && signals[1].severity === "warning",
    "criticals sort first, so a long list still reads correctly"
  );
}

// ---------------------------------------------------------------------------
// P3 — one problem, one page
// ---------------------------------------------------------------------------
{
  await makeHealthy();
  await clearRecovery();

  const messages = [];
  const signal = (await collectOpsSignals(db, T0))[0];
  await Promise.all(Array.from({ length: 20 }, () => deliverOpsSignal(db, { ...signal }, into(messages), T0)));
  check("P3.1", messages.length === 1, `20 concurrent evaluations of one problem produced ${messages.length} alert(s)`);
  check("P3.2", messages[0].includes("critical") && messages[0].includes("backup-missing"), "the message names the severity and the kind");

  const again = await deliverOpsSignal(db, { ...signal }, into(messages), T0);
  check("P3.3", again === null && messages.length === 1, "re-running the check the same day does not page again");

  const tomorrow = new Date(T0.getTime() + 86_400_000);
  const nextDay = await deliverOpsSignal(
    db,
    { ...signal, period: tomorrow.toISOString().slice(0, 10) },
    into(messages),
    tomorrow
  );
  check("P3.4", nextDay !== null && messages.length === 2, "a problem still unfixed tomorrow says so again");
}

if (REAL_PG) {
  // The run that counts: 20 separate OS processes, each with its own pool,
  // noticing the same problem at the same moment.
  const { spawn } = await import("node:child_process");
  await makeHealthy();
  await clearRecovery();

  const worker = (legacy, startAt) => `
    import path from "node:path";
    const DIST = ${JSON.stringify(DIST)};
    const { createDb } = await import(path.join(DIST, "db.js"));
    const { deliverOpsSignal } = await import(path.join(DIST, "opsAlerts.js"));
    const db = await createDb();
    await db.query("SELECT 1"); // connect before the barrier, not after it
    await new Promise((r) => setTimeout(r, Math.max(0, ${startAt} - Date.now())));
    const signal = { kind: "backup-missing", subjectId: "database", period: ${JSON.stringify(DAY)},
                     severity: "critical", detail: "no database backup has ever completed." };
    let sent = 0;
    ${
      legacy
        ? // The obvious implementation: look for a row, and send if there isn't
          // one. Every process looks before any of them writes.
          `const seen = (await db.query("SELECT 1 FROM ops_alerts WHERE kind = 'backup-missing'")).rows.length > 0;
           await new Promise((r) => setTimeout(r, 40));
           if (!seen) {
             await db.query("INSERT INTO ops_alerts (kind, subject_id, period, severity, detail, attempts, claimed_at, delivered_at) VALUES ('backup-missing','legacy','${DAY}','critical','x',1,now(),now()) ON CONFLICT DO NOTHING");
             sent = 1;
           }`
        : `const delivery = await deliverOpsSignal(db, signal, () => { sent = 1; }, new Date(${JSON.stringify(T0.toISOString())}));
           if (!delivery) sent = 0;`
    }
    await db.close();
    process.stdout.write(JSON.stringify({ sent }));
  `;

  const run = (legacy) => {
    const startAt = Date.now() + 4000;
    return Promise.all(
      Array.from(
        { length: 20 },
        () =>
          new Promise((resolve) => {
            const child = spawn(process.execPath, ["--input-type=module", "-e", worker(legacy, startAt)], {
              env: process.env,
              stdio: ["ignore", "pipe", "pipe"],
            });
            let out = "";
            let err = "";
            child.stdout.on("data", (d) => (out += d));
            child.stderr.on("data", (d) => (err += d));
            child.on("close", () => resolve({ out, err }));
          })
      )
    );
  };

  const results = await run(false);
  const brokeWorkers = results.filter((r) => !r.out.trim());
  const sent = results.reduce((n, r) => n + (r.out.trim() ? JSON.parse(r.out).sent : 0), 0);
  check(
    "P3r.1",
    brokeWorkers.length === 0,
    `20 separate processes evaluated one problem, ${brokeWorkers.length} failed` +
      (brokeWorkers.length ? ` — ${brokeWorkers[0].err.split("\n").filter(Boolean).pop()}` : "")
  );
  check("P3r.2", sent === 1, `exactly one of 20 processes paged a human (${sent})`);

  await db.query("DELETE FROM ops_alerts");
  const legacyResults = await run(true);
  const legacyBroke = legacyResults.filter((r) => !r.out.trim());
  const legacySent = legacyResults.reduce((n, r) => n + (r.out.trim() ? JSON.parse(r.out).sent : 0), 0);
  check(
    "P3b.0",
    legacyBroke.length === 0,
    `the control workers ran, ${legacyBroke.length} failed` +
      (legacyBroke.length ? ` — ${legacyBroke[0].err.split("\n").filter(Boolean).pop()}` : "")
  );
  check("P3b.1", legacySent > 1, `the check-then-send version pages ${legacySent} times for one problem — P3r has teeth`);
  await db.query("DELETE FROM ops_alerts");
}

// ---------------------------------------------------------------------------
// P4 — a failed send is retried, not swallowed
// ---------------------------------------------------------------------------
{
  await makeHealthy();
  await clearRecovery();
  const signal = (await collectOpsSignals(db, T0))[0];

  const bad = await deliverOpsSignal(
    db,
    { ...signal },
    () => {
      throw new Error("webhook 503");
    },
    T0
  );
  check("P4.1", bad !== null && bad.delivered === false, "a send that throws is reported as undelivered");
  check("P4.2", (await undeliveredOpsAlertCount(db)) === 1, "and the row stays undelivered for the operator page");

  const rows = await recentOpsAlerts(db, 5);
  check("P4.3", rows[0].lastError.includes("webhook 503"), "with the transport's own error kept");

  const retry = [];
  const second = await deliverOpsSignal(db, { ...signal }, into(retry), T0);
  check("P4.4", second?.delivered === true && retry.length === 1, "the next check retries immediately rather than waiting out the window");
  check("P4.5", (await undeliveredOpsAlertCount(db)) === 0, "and the row clears once it lands");
  check("P4.6", (await recentOpsAlerts(db, 5))[0].attempts === 2, "attempts count the tries, which is what tells a flaky channel from a quiet one");
}

// ---------------------------------------------------------------------------
// P5 — the channel sends somewhere, and never breaks the request path
// ---------------------------------------------------------------------------
{
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  };
  const logs = [];

  const webhook = createAlertChannel({
    webhookUrl: "https://hooks.example.com/abc",
    fetchImpl: fakeFetch,
    log: (line) => logs.push(line),
  });
  webhook.alert("Normascope budget alert — today's provider budget is at 90.0%");
  const sends = await webhook.flush();
  check("P5.1", calls.length === 1 && calls[0].body.text.includes("90.0%"), "a configured webhook receives the message");
  check("P5.2", sends.every((s) => s.ok) && webhook.configured, "and the send is reported as having landed");
  check("P5.3", logs.some((l) => l.startsWith("[normascope-alert]")), "the log line goes out regardless — it is the one path that cannot fail");

  const email = createAlertChannel({
    email: "ops@example.com, second@example.com",
    resendApiKey: "re_test",
    fetchImpl: fakeFetch,
    log: () => {},
  });
  email.alert("Normascope operations alert [critical] backup-missing — no database backup has ever completed.");
  await email.flush();
  const mail = calls[calls.length - 1];
  check(
    "P5.4",
    mail.url.includes("resend.com") && mail.body.to.length === 2 && mail.body.subject.includes("backup-missing"),
    "email goes to every configured recipient with the alert in the subject"
  );

  const failLogs = [];
  const failing = createAlertChannel({
    webhookUrl: "https://hooks.example.com/abc",
    fetchImpl: async () => ({ ok: false, status: 500 }),
    log: (line) => failLogs.push(line),
  });
  let threw = false;
  try {
    failing.alert("anything");
  } catch {
    threw = true;
  }
  const failed = await failing.flush();
  check("P5.5", !threw, "a broken channel does not throw into the request path — spend is already bounded, an alert is not");
  check("P5.6", failed.length === 1 && failed[0].ok === false, "flush() is where a scheduled check learns the send failed");
  check("P5.7", failLogs.some((l) => l.startsWith("[alert-channel-error]")), "and the failure logs under its own prefix, so 'we alerted' and 'we could not' are distinguishable");

  const bare = createAlertChannel({ fetchImpl: fakeFetch, log: () => {} });
  const before = calls.length;
  bare.alert("nothing configured");
  check("P5.8", !bare.configured && calls.length === before, "with no transport it is log-only and says so rather than pretending");
  check("P5.9", bare.describe().includes("log only"), `describe() is honest: "${bare.describe()}"`);

  const fromEnv = alertChannelOptionsFromEnv({ NORMA_ALERT_WEBHOOK_URL: " https://x.example/y " });
  check("P5.10", fromEnv.webhookUrl === "https://x.example/y", "environment values are trimmed, so a stray space is not a broken URL");
}

// ---------------------------------------------------------------------------
// P6 — the whole check, end to end
// ---------------------------------------------------------------------------
{
  await makeHealthy();
  await clearRecovery();
  await db.query("DELETE FROM restore_rehearsals");
  const messages = [];
  const first = await checkOperationalHealth(db, into(messages), T0);
  check("P6.1", !first.healthy && first.signals.length === 2 && messages.length === 2, "two problems, two alerts");

  const second = await checkOperationalHealth(db, into(messages), T0);
  check(
    "P6.2",
    !second.healthy && second.deliveries.length === 0 && messages.length === 2,
    "the second run still reports unhealthy and pages nobody — state is the signal, delivery is not"
  );

  await makeHealthy();
  const third = await checkOperationalHealth(db, into(messages), T0);
  check("P6.3", third.healthy && messages.length === 2, "and once it is fixed the check goes quiet");
}

await db.query("DELETE FROM ops_alerts");
await clearRecovery();
await db.close();

console.log(`\n${failures === 0 ? "all operational-alert checks green" : `${failures} FAILING CHECK(S)`}`);
process.exit(failures === 0 ? 0 : 1);
