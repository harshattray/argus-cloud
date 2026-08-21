// The outbound-email abuse ladder — FUTURENORMA §4 Step 6 ("Magic links are an
// outbound-email budget"), PATHWAYS Pathway 5 gate and §10.7 5A.13.
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/authAbuse.test.mjs
//
// **The claim under test is that nobody can make the service send more mail
// than its budget** — not one address, not one IP, not one subnet, not the
// whole internet at once. Four of those are ordinary checks. The fifth is a
// *shared counter* claim, and PGlite cannot prove it: every process gets its
// own database there, so a per-process counter would pass. B9 spawns 20 real
// processes against one Postgres, and B9b runs the naive in-memory version
// through the same harness so B9 is known to have teeth (CLAUDE.md rule 4).
//
// The second thing this suite defends is that **the endpoint says nothing about
// who has an account** — B8 compares the observable responses byte for byte.

import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const {
  emailCeilings,
  reserveRequest,
  reserveSend,
  reserveInvite,
  reserveOauthStart,
  recordAuthFailure,
  challengeRequired,
  emailBudgetStatus,
  alertOnEmailBudget,
  recentThrottleActivity,
  sweepThrottle,
  CHALLENGE_AFTER_IP_FAILURES,
  DEFAULT_CEILINGS,
  EMAIL_BUDGET_THRESHOLDS,
} = await import(path.join(DIST, "authThrottle.js"));
const { issueChallenge, verifyChallenge, solveChallenge } = await import(path.join(DIST, "authChallenge.js"));
const { requestSignInLink } = await import(path.join(DIST, "loginService.js"));
const { createUser, addMembership } = await import(path.join(DIST, "users.js"));
const { createMailer } = await import(path.join(DIST, "mailer.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

/**
 * The global budget is a genuine singleton — one `global` row per UTC day for
 * the whole service — and so is its once-per-threshold alert row. A suite that
 * tests them has to own them, or a second run against a shared server finds
 * yesterday's counter and this morning's already-delivered alert and reports
 * green for the wrong reason.
 *
 * Everything else in this suite is keyed on a fresh address, a fresh IP or a
 * fresh organization, so only these two need clearing. Scoped by kind and by
 * the fixture days below, so no other suite's rows are touched.
 */
await db.query("DELETE FROM auth_throttle WHERE scope = 'global_day' AND subject = 'global'");
await db.query("DELETE FROM ops_alerts WHERE kind = 'email-budget'");

const T0 = new Date("2026-08-21T09:00:00.000Z");
const sent = [];
const alerts = [];
const mailer = { configured: true, describe: () => "stub", send: async (m) => sent.push(m) };
const deps = { db, baseUrl: "https://normascope.com", mailer, alert: (m) => alerts.push(m) };

/** A wide global budget, so a group testing one ceiling is not stopped by another. */
const wide = (overrides = {}) => ({
  AUTH_EMAIL_DAILY_BUDGET: "10000",
  AUTH_EMAIL_SUBNET_HOURLY: "10000",
  AUTH_EMAIL_IP_HOURLY: "10000",
  AUTH_EMAIL_ADDRESS_DAILY: "5",
  AUTH_EMAIL_ADDRESS_PER_WINDOW: "1",
  ...overrides,
});

let ipCounter = 0;
/** A fresh /24 each time, so groups cannot consume each other's allowances. */
const freshIp = () => `203.0.${++ipCounter}.5`;
const address = () => `p-${randomUUID().slice(0, 8)}@example.com`;

async function makeMember(email) {
  const orgId = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, `ab-${orgId.slice(0, 6)}`]);
  const user = await createUser(db, { email });
  await addMembership(db, { orgId, userId: user.id, role: "member" });
  return { orgId, user };
}

// ═══ B0 — the ladder is what the document says it is ═══
//
// The numbers are quoted in FUTURENORMA §4 Step 6 and read by a person deciding
// whether the exposure is acceptable. If the code drifts from the table, the
// decision was made against a document that no longer describes the product.
{
  const byScope = Object.fromEntries(DEFAULT_CEILINGS.map((c) => [c.scope, c]));
  check("B0.1", byScope.address_cooldown.limit === 1 && byScope.address_cooldown.windowSeconds === 600, "one link per address per 10 minutes");
  check("B0.2", byScope.address_day.limit === 5 && byScope.address_day.windowSeconds === 86400, "a small daily cap per address (5)");
  check("B0.3", byScope.ip_hour.windowSeconds === 3600 && byScope.subnet_hour.windowSeconds === 3600, "per-IP and per-subnet caps are hourly");
  check("B0.4", byScope.subnet_hour.limit > byScope.ip_hour.limit, "the subnet ceiling sits above the per-IP one, so one office is not throttled by one colleague");
  check("B0.5", byScope.global_day.limit === 50, "the global daily budget is 50 — half of Resend's free-plan day of 100");
  check("B0.6", emailCeilings({ AUTH_EMAIL_DAILY_BUDGET: "7" }).find((c) => c.scope === "global_day").limit === 7, "and is env-overridable without a deploy");
  check("B0.7", emailCeilings({ AUTH_EMAIL_DAILY_BUDGET: "banana" }).find((c) => c.scope === "global_day").limit === 50, "a malformed override falls back rather than disabling the ceiling");
  check("B0.8", EMAIL_BUDGET_THRESHOLDS.join(",") === "50,75,90,100", "and it alerts at the same marks as the provider budget");
}

// ═══ B1 — one address, one link per ten minutes ═══
{
  const email = address();
  const ip = freshIp();
  const env = wide();
  const first = await reserveSend(db, { email, ip }, { now: T0, env });
  const second = await reserveSend(db, { email, ip }, { now: new Date(T0.getTime() + 60_000), env });
  check("B1.1", first.allowed, "the first link to an address is allowed");
  check("B1.2", !second.allowed && second.refusedBy === "address_cooldown", "a second one a minute later is refused by the cooldown");
  check("B1.3", second.retryAfterSeconds > 0 && second.retryAfterSeconds <= 600, `and says when to come back (${second.retryAfterSeconds}s)`);

  const later = await reserveSend(db, { email, ip }, { now: new Date(T0.getTime() + 11 * 60_000), env });
  check("B1.4", later.allowed, "eleven minutes later it is allowed again");
}

// ═══ B2 — one address, a small number per day ═══
{
  const email = address();
  const env = wide();
  const results = [];
  for (let i = 0; i < 7; i++) {
    // Eleven minutes apart, so the cooldown is never the thing refusing.
    results.push(await reserveSend(db, { email, ip: freshIp() }, { now: new Date(T0.getTime() + i * 11 * 60_000), env }));
  }
  check("B2.1", results.filter((r) => r.allowed).length === 5, "five links a day to one address, then no more");
  check("B2.2", results[5].refusedBy === "address_day", "the sixth is refused by the daily cap, not the cooldown");

  const tomorrow = await reserveSend(db, { email, ip: freshIp() }, { now: new Date(T0.getTime() + 25 * 3_600_000), env });
  check("B2.3", tomorrow.allowed, "and the day rolls over");
}

// ═══ B3 — one IP, and one subnet above it ═══
{
  const env = wide({ AUTH_EMAIL_IP_HOURLY: "3", AUTH_EMAIL_SUBNET_HOURLY: "5" });
  const base = ++ipCounter;
  const ip = `198.18.${base}.10`;
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await reserveRequest(db, { email: address(), ip }, { now: T0, env }));
  }
  check("B3.1", results.filter((r) => r.allowed).length === 3, "three requests an hour from one address");
  check("B3.2", results[3].refusedBy === "ip_hour", "then the per-IP ceiling refuses");

  // Different addresses in the same /24 — the residential-proxy case.
  const neighbours = [];
  for (let i = 0; i < 4; i++) {
    neighbours.push(await reserveRequest(db, { email: address(), ip: `198.18.${base}.${20 + i}` }, { now: T0, env }));
  }
  const allowedNeighbours = neighbours.filter((r) => r.allowed).length;
  check("B3.3", allowedNeighbours === 2, `rotating addresses inside one /24 gets 2 more, not 4 — the subnet ceiling holds (${allowedNeighbours})`);
  check("B3.4", neighbours[2].refusedBy === "subnet_hour", "and names the subnet as the ceiling that refused");
}

// ═══ B4 — the global daily budget, and the alert on the way up ═══
{
  const env = wide({ AUTH_EMAIL_DAILY_BUDGET: "4" });
  alerts.length = 0;
  const day = new Date("2026-09-01T10:00:00.000Z");
  const results = [];
  for (let i = 0; i < 6; i++) {
    const r = await reserveSend(db, { email: address(), ip: freshIp() }, { now: day, env });
    results.push(r);
    await alertOnEmailBudget(db, r, (m) => alerts.push(m), day);
  }
  check("B4.1", results.filter((r) => r.allowed).length === 4, "the budget is the budget: 4 of 6 sent");
  check("B4.2", results[4].refusedBy === "global_day", "the fifth is refused by the global budget");

  const status = await emailBudgetStatus(db, { now: day, env });
  check("B4.3", status.used === 4 && status.limit === 4 && status.usedPercent === 100, "the operator view reads 4 of 4, 100%");

  check("B4.4", alerts.length > 0, `crossing the marks alerted (${alerts.length} message(s))`);
  const hundred = alerts.filter((m) => m.includes("100%"));
  check("B4.5", hundred.length === 1, "100% alerted exactly once, however many requests crossed it");
  check("B4.6", hundred[0].includes("GitHub sign-in"), "and the message says what still works, so the operator knows the blast radius");

  // Zero is the kill switch: an operator can pause sign-in email entirely.
  const paused = await reserveSend(db, { email: address(), ip: freshIp() }, { now: day, env: wide({ AUTH_EMAIL_DAILY_BUDGET: "0" }) });
  check("B4.7", !paused.allowed && paused.refusedBy === "global_day", "a budget of zero pauses sign-in email — the operator kill switch");
}

// ═══ B5 — a refused request spends nothing, and enumeration spends no budget ═══
//
// Two separate failures, both of which turn a limiter into an outage:
//
//   1. A reservation refused by a later ceiling that has already consumed the
//      earlier ones. An attacker guaranteed to be refused could then drain the
//      global budget for everyone else.
//   2. Requests for addresses that have no account consuming the *send* budget.
//      A script naming ten thousand strangers would spend the day's real
//      sign-ins on mail that was never sent.
{
  const env = wide({ AUTH_EMAIL_ADDRESS_DAILY: "1" });
  const day = new Date("2026-09-02T10:00:00.000Z");
  const email = address();
  await reserveSend(db, { email, ip: freshIp() }, { now: day, env });
  const before = (await emailBudgetStatus(db, { now: day, env })).used;
  const refused = await reserveSend(db, { email, ip: freshIp() }, { now: new Date(day.getTime() + 20 * 60_000), env });
  const after = (await emailBudgetStatus(db, { now: day, env })).used;
  check("B5.1", !refused.allowed, "a request refused by a per-address ceiling is refused");
  check("B5.2", before === after, "and the global budget it passed on the way is rolled back, not spent");

  // Enumeration.
  const start = (await emailBudgetStatus(db, { now: day })).used;
  for (let i = 0; i < 5; i++) {
    await requestSignInLink({ ...deps, now: day, env: wide() }, { email: address(), ip: freshIp() });
  }
  const end = (await emailBudgetStatus(db, { now: day })).used;
  check("B5.3", start === end, "five requests for addresses with no account consumed no send budget at all");
}

// ═══ B6 — the challenge, after repeated failures ═══
{
  const ip = freshIp();
  const env = wide();
  check("B6.1", (await challengeRequired(db, ip, { now: T0, env })) === false, "a clean caller is not challenged");
  for (let i = 0; i < CHALLENGE_AFTER_IP_FAILURES; i++) {
    await recordAuthFailure(db, ip, { now: T0, env });
  }
  check("B6.2", (await challengeRequired(db, ip, { now: T0, env })) === true, `after ${CHALLENGE_AFTER_IP_FAILURES} failures from one address, it is`);

  const challenge = issueChallenge(ip, { now: T0, env });
  const solution = solveChallenge(challenge.token);
  check("B6.3", solution !== null, `a challenge is solvable at ${challenge.difficultyBits} bits`);

  const wrongCaller = await verifyChallenge(db, { token: challenge.token, solution, ip: freshIp() }, { now: T0, env });
  check("B6.4", !wrongCaller.ok && wrongCaller.failure === "wrong-caller", "a solved challenge cannot be handed to another caller");

  const unsolved = await verifyChallenge(db, { token: challenge.token, solution: "0", ip }, { now: T0, env });
  check("B6.5", !unsolved.ok && unsolved.failure === "unsolved", "an unsolved one is refused");

  // Flipped to a character it is definitely not. Writing this as
  // `.replace(/.$/, "0")` made the check pass one time in sixteen and fail the
  // rest: when the signature already ended in `0` the "tampered" token was the
  // real one, which verified — and spent the single use, taking B6.7 with it.
  const tampered = await verifyChallenge(
    db,
    { token: challenge.token.slice(0, -1) + (challenge.token.endsWith("0") ? "1" : "0"), solution, ip },
    { now: T0, env }
  );
  check("B6.6", !tampered.ok && tampered.failure === "bad-signature", "and one we did not issue is refused before any work is done");

  const good = await verifyChallenge(db, { token: challenge.token, solution, ip }, { now: T0, env });
  check("B6.7", good.ok, "the real solution passes");
  const replay = await verifyChallenge(db, { token: challenge.token, solution, ip }, { now: T0, env });
  check("B6.8", !replay.ok && replay.failure === "reused", "and is single-use, or the work would be proof of nothing");

  const stale = await verifyChallenge(db, { token: challenge.token, solution, ip }, { now: new Date(T0.getTime() + 11 * 60_000), env });
  check("B6.9", !stale.ok, "an expired challenge is refused");

  // The whole flow: the service asks for a challenge, then accepts the answer.
  const { user } = await makeMember(address());
  const blocked = await requestSignInLink({ ...deps, now: T0, env }, { email: user.email, ip });
  check("B6.10", blocked.status === "challenge" && blocked.challenge, "a caller in challenge state is asked for one instead of being sent mail");
  const answered = await requestSignInLink(
    { ...deps, now: T0, env },
    {
      email: user.email,
      ip,
      challengeToken: blocked.challenge.token,
      challengeSolution: solveChallenge(blocked.challenge.token),
    }
  );
  check("B6.11", answered.status === "accepted" && answered.internal === "sent", "and solving it lets the request through");
}

// ═══ B6b — the browser's solver and the server's verifier are one rule ═══
//
// The solver in `web/app/login/sign-in-form.tsx` cannot import the verifier:
// that module needs `node:crypto` and the form runs in a browser. So this
// re-implements the browser algorithm — Web Crypto, the same digest input — and
// checks the server accepts its answer. If the two ever disagree, nobody past
// the failure threshold can sign in, and nothing else would catch it.
{
  const env = wide();
  const ip = freshIp();
  const challenge = issueChallenge(ip, { now: T0, env });

  const sha256 = async (input) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const hasLeadingZeroBits = (digest, bits) => {
    let remaining = bits;
    let index = 0;
    while (remaining >= 8) {
      if (digest[index] !== 0) return false;
      index += 1;
      remaining -= 8;
    }
    if (remaining === 0) return true;
    return digest[index] >> (8 - remaining) === 0;
  };
  let browserSolution = null;
  for (let attempt = 0; attempt < 5_000_000 && browserSolution === null; attempt++) {
    const candidate = String(attempt);
    if (hasLeadingZeroBits(await sha256(`${challenge.token}:${candidate}`), challenge.difficultyBits)) {
      browserSolution = candidate;
    }
  }
  check("B6b.1", browserSolution !== null, "the browser algorithm finds a solution");
  const accepted = await verifyChallenge(db, { token: challenge.token, solution: browserSolution, ip }, { now: T0, env });
  check("B6b.2", accepted.ok, "and the server accepts it — the two implementations of the rule agree");
}

// ═══ B7 — invitations have their own budget, on top of the global one ═══
{
  const env = wide({ AUTH_INVITE_ORG_DAILY: "3", AUTH_INVITE_ADDRESS_DAILY: "2" });
  const orgId = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, `inv-${orgId.slice(0, 6)}`]);
  const day = new Date("2026-09-03T10:00:00.000Z");

  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await reserveInvite(db, { email: address(), ip: freshIp(), orgId }, { now: day, env }));
  }
  check("B7.1", results.filter((r) => r.allowed).length === 3, "an organization's invitations are capped per day");
  check("B7.2", results[3].refusedBy === "invite_org_day", "a compromised admin session cannot turn the invite form into a mailer");

  const target = address();
  const repeated = [];
  for (let i = 0; i < 4; i++) {
    const otherOrg = randomUUID();
    await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [otherOrg, `inv2-${otherOrg.slice(0, 6)}`]);
    repeated.push(await reserveInvite(db, { email: target, ip: freshIp(), orgId: otherOrg }, { now: day, env }));
  }
  check("B7.3", repeated.filter((r) => r.allowed).length === 2, "and one person cannot be invited repeatedly, whoever is inviting them");

  const used = (await emailBudgetStatus(db, { now: day, env })).used;
  check("B7.4", used === 5, `invitations count against the same global budget as sign-in links (${used} today)`);
}

// ═══ B8 — the endpoint says nothing about who has an account ═══
//
// The check compares what an attacker can actually see: the status and the
// message. `internal` differs — that is the point of having it — and never
// leaves the service.
{
  const env = wide();
  const day = new Date("2026-09-04T10:00:00.000Z");
  const { user } = await makeMember(address());

  const registered = await requestSignInLink({ ...deps, now: day, env }, { email: user.email, ip: freshIp() });
  const unknown = await requestSignInLink({ ...deps, now: day, env }, { email: address(), ip: freshIp() });
  const malformed = await requestSignInLink({ ...deps, now: day, env }, { email: "not-an-address", ip: freshIp() });
  const cooling = await requestSignInLink({ ...deps, now: day, env }, { email: user.email, ip: freshIp() });

  const observable = (r) => JSON.stringify({ status: r.status, retryAfterSeconds: r.retryAfterSeconds ?? null, challenge: Boolean(r.challenge) });
  check("B8.1", observable(registered) === observable(unknown), "a registered address and an unknown one are indistinguishable");
  check("B8.2", observable(registered) === observable(malformed), "and so is a malformed one");
  check(
    "B8.3",
    observable(registered) === observable(cooling),
    "and an address inside its cooldown — which would otherwise confirm that it recently received a link, and therefore has an account"
  );
  check(
    "B8.4",
    registered.internal === "sent" && unknown.internal === "no-account" && cooling.internal === "address-throttled",
    "while the service still knows which was which, for the audit log"
  );
}

// ═══ B9 — 20 real processes, one budget ═══
//
// The serverless case, and the only run that proves the claim: many instances,
// many connections, one shared ceiling.
if (REAL_PG) {
  const tmp = await mkdtemp(path.join(HERE, ".tmp-authabuse-"));
  try {
    const day = new Date("2026-09-05T10:00:00.000Z");
    const limit = 5;

    const worker = path.join(tmp, "worker.mjs");
    await writeFile(
      worker,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const { reserveSend } = await import(${JSON.stringify(path.join(DIST, "authThrottle.js"))});\n` +
        `const db = await createDb();\n` +
        `const env = { ...process.env, AUTH_EMAIL_DAILY_BUDGET: process.env.LIMIT, AUTH_EMAIL_ADDRESS_DAILY: "10000", AUTH_EMAIL_ADDRESS_PER_WINDOW: "10000" };\n` +
        `const r = await reserveSend(db, { email: process.env.WORKER_EMAIL, ip: "203.0.113.99" }, { now: new Date(process.env.NOW), env });\n` +
        `console.log(r.allowed ? "allowed" : "refused");\n` +
        `await db.close();\n`
    );

    const { spawn } = await import("node:child_process");
    const run = (file) =>
      Promise.all(
        Array.from(
          { length: 20 },
          (_, index) =>
            new Promise((resolve) => {
              const child = spawn(process.execPath, [file], {
                env: {
                  ...process.env,
                  LIMIT: String(limit),
                  NOW: day.toISOString(),
                  // A different recipient per process, so the only ceiling
                  // being tested is the global one.
                  WORKER_EMAIL: `worker-${index}-${randomUUID().slice(0, 6)}@example.com`,
                },
              });
              let out = "";
              let err = "";
              child.stdout.on("data", (d) => (out += d));
              child.stderr.on("data", (d) => (err += d));
              child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
            })
        )
      );

    const results = await run(worker);
    const failed = results.filter((r) => r.code !== 0);
    check(
      "B9.1",
      failed.length === 0,
      `20 separate processes reserved against one budget, ${failed.length} failed` +
        (failed.length ? ` — ${failed[0].err.split("\n").filter(Boolean).pop()}` : "")
    );
    const allowed = results.filter((r) => r.out === "allowed").length;
    check("B9.2", allowed === limit, `across 20 processes exactly ${limit} emails were authorised (${allowed})`);

    const status = await emailBudgetStatus(db, { now: day, env: { AUTH_EMAIL_DAILY_BUDGET: String(limit) } });
    check("B9.3", status.used === limit, `and the shared counter agrees (${status.used} of ${status.limit})`);

    // B9b — the counter-test. The same 20 processes against a per-instance
    // counter, which is what "add a daily email cap" usually means. Every one
    // is under its own limit, so all 20 send: the real ceiling is 20× what it
    // says, and a 50-a-day budget quietly becomes 1,000.
    const local = path.join(tmp, "local-worker.mjs");
    await writeFile(
      local,
      `let sentToday = 0;\n` + // module scope: one counter per instance
        `const limit = Number(process.env.LIMIT);\n` +
        `sentToday += 1;\n` +
        `console.log(sentToday <= limit ? "allowed" : "refused");\n`
    );
    const localResults = await run(local);
    const localAllowed = localResults.filter((r) => r.out === "allowed").length;
    check(
      "B9b.1",
      localAllowed === 20,
      `a process-local counter authorises all 20 against a budget of ${limit} (${localAllowed}) — B9.2 has teeth`
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
} else {
  console.log("SKIP  B9   20-process global budget — needs DATABASE_URL (scripts/test-db.sh)");
}

// ═══ B10 — what an operator can see, and what they cannot ═══
{
  const rows = await recentThrottleActivity(db, 24 * 400, 200);
  check("B10.1", rows.length > 0, "the operator view lists recent throttle activity");
  check("B10.2", rows.some((r) => r.rejected > 0), "including what was refused, so pressure is visible before it is an incident");
  const anyAddress = rows.some((r) => r.subject.includes("@"));
  check("B10.3", !anyAddress, "and no row names an address — subjects are keyed hashes, truncated");

  const raw = await db.query("SELECT subject FROM auth_throttle WHERE scope <> 'global_day' LIMIT 500");
  const leaked = raw.rows.filter((r) => r.subject.includes("@") || /^\d+\.\d+\.\d+\.\d+$/.test(r.subject));
  check("B10.4", leaked.length === 0, "nor does the table itself — a counter does not need to know who");

  const swept = await sweepThrottle(db, new Date(T0.getTime() + 400 * 86_400_000));
  check("B10.5", swept > 0, `and old counters are swept (${swept} rows)`);
}

// ═══ B11 — the OAuth start is bounded too ═══
{
  const env = wide({ AUTH_OAUTH_START_IP_HOURLY: "2" });
  const ip = freshIp();
  const results = [];
  for (let i = 0; i < 4; i++) {
    results.push(await reserveOauthStart(db, ip, { now: T0, env }));
  }
  check("B11.1", results.filter((r) => r.allowed).length === 2, "redirects to GitHub are capped per address per hour");
  check("B11.2", results[2].refusedBy === "oauth_start_ip_hour", "so the start route cannot be used as a redirect amplifier");
}

// ═══ B12 — a deployment cannot fall back to printing links into a log ═══
{
  const dev = createMailer({ allowConsoleFallback: true, log: () => {} });
  let devThrew = false;
  try {
    await dev.send({ to: "a@b.com", subject: "s", html: "<p>h</p>", text: "t" });
  } catch {
    devThrew = true;
  }
  check("B12.1", !devThrew, "with no provider configured, local development prints the link and sign-in works");

  const deployed = createMailer({ allowConsoleFallback: false });
  let deployedThrew = false;
  try {
    await deployed.send({ to: "a@b.com", subject: "s", html: "<p>h</p>", text: "t" });
  } catch {
    deployedThrew = true;
  }
  check("B12.2", deployedThrew, "a deployment with no provider refuses loudly instead of logging a credential");

  // A send that fails must not be reported as sent, and must not release its
  // budget slot — `authThrottle.ts` explains why releasing would risk double
  // sending. What it must do is alert.
  const env = wide();
  const day = new Date("2026-09-06T10:00:00.000Z");
  const { user } = await makeMember(address());
  const broken = { configured: true, describe: () => "broken", send: async () => { throw new Error("resend responded 500"); } };
  const localAlerts = [];
  const before = (await emailBudgetStatus(db, { now: day, env })).used;
  const result = await requestSignInLink(
    { db, baseUrl: "https://normascope.com", mailer: broken, alert: (m) => localAlerts.push(m), now: day, env },
    { email: user.email, ip: freshIp() }
  );
  const after = (await emailBudgetStatus(db, { now: day, env })).used;
  check("B12.3", result.internal === "send-failed", "a failed send is recorded as failed");
  check("B12.4", result.status === "accepted", "and still looks identical from outside — a provider outage is not an enumeration signal");
  check("B12.5", after === before + 1, "the slot stays spent, because a provider can accept a message and fail on the response");
  check("B12.6", localAlerts.some((m) => m.includes("failed to send")), "and a human is told, because the day's budget is now shorter");
}

await db.close();
console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
