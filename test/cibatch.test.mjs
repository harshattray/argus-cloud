// Build 4.0 Phase D — CI batch suite (D2 in BuildV4.md, fixture-level: the
// provider seam is injected, no live calls; the live Batches API path is
// exercised in Phase E's e2e).
// Run: npm test

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits, balance } = await import(path.join(DIST, "ledger.js"));
const { enqueueCiBatch, collectCiBatch, summarizeForPr, escapeHtml } = await import(path.join(DIST, "ciBatch.js"));
const { AUTO_EXPLAIN_PER_RUN_CAP, CREDITS_PER_ANALYSIS } = await import(path.join(DIST, "explainService.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);

async function makeOrg(name, credits = 100) {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, name]);
  if (credits > 0) await grantCredits(db, { orgId: id, kind: "plan_allotment", credits, expiresAt: farFuture });
  return id;
}
async function makeRepo(orgId) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [id, orgId, `repo-${id.slice(0, 8)}`]);
  return id;
}
async function makeRun(orgId, repoId, commit = "c1") {
  const id = randomUUID();
  await db.query("INSERT INTO runs (id, org_id, repo_id, commit_sha, summary) VALUES ($1,$2,$3,$4,'{}')", [id, orgId, repoId, commit]);
  return id;
}

const okResult = (frame) => ({
  kind: "ok",
  json: { findings: [{ frame, region: { x: 0, y: 0, width: 10, height: 10 }, category: "spacing",
    observation: `drift in ${frame}`, cssHypothesis: "", selector: "", codePointer: "", suggestedFix: "", confidence: "high" }] },
  usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
});
const frames = (n) => Array.from({ length: n }, (_, i) => ({ frame: `f${i}.png`, buildHash: `b${i}`, designHash: "d" }));
const mkDeps = ({ results, submitError = false } = {}) => {
  const submissions = [];
  return {
    submissions,
    deps: {
      submit: async (submission) => {
        if (submitError) throw new Error("provider 500");
        submissions.push(submission);
        return `batch_${randomUUID().slice(0, 8)}`;
      },
      fetch: async () => results ?? null,
      dailyBudgetMicrodollars: 10_000_000_000,
      alert: () => {},
    },
  };
};

// ═══ D2.1 — happy path: enqueue reserves, collect meters at batch rate, findings attach to run ═══

{
  const org = await makeOrg("d2-happy");
  const repo = await makeRepo(org);
  const run = await makeRun(org, repo);
  const results = new Map([["f0.png", okResult("f0.png")], ["f1.png", okResult("f1.png")]]);
  const { deps, submissions } = mkDeps({ results });

  const enq = await enqueueCiBatch(db, deps, { orgId: org, repoId: repo, runId: run, model: "claude-sonnet-5", frames: frames(2) });
  check("D2.1a", enq.batchId !== null && submissions[0].requests.length === 2, "batch submitted with one request per frame");
  check("D2.1b", (await balance(db, org)) === 100 - 2 * CREDITS_PER_ANALYSIS,
    `credits reserved at enqueue (2 × ${CREDITS_PER_ANALYSIS})`);

  const notReady = await collectCiBatch(db, { ...deps, fetch: async () => null }, enq.batchId);
  check("D2.1c", notReady.done === false, "collect before completion reports not-done, changes nothing");

  const out = await collectCiBatch(db, deps, enq.batchId);
  check("D2.1d", out.done && out.findings.length === 2 && out.failures.length === 0, "all findings collected");

  const attached = (await db.query("SELECT frame FROM run_findings WHERE run_id = $1 ORDER BY frame", [run])).rows;
  check("D2.1e", attached.length === 2, "findings attached to the run");

  const events = (await db.query(
    "SELECT interactive, auto, status, cost_microdollars, input_tokens FROM usage_events WHERE org_id = $1 AND status = 'charged'", [org]
  )).rows;
  // 15000 in × $3/MTok = 45000 μ$ interactive → 22500 μ$ at the 50% batch rate, + output 1200 × $15/MTok × 0.5 = 9000 μ$.
  const expected = Math.round((15000 * 3 + 1200 * 15) * 0.5);
  check("D2.1f", events.length === 2 && events.every((e) => e.auto === true && e.interactive === false && Number(e.cost_microdollars) === expected),
    `usage events billed at the batch rate (${expected} μ$ each)`);

  const again = await collectCiBatch(db, deps, enq.batchId);
  check("D2.1g", again.done && again.findings.length === 0 && (await balance(db, org)) === 100 - 2 * CREDITS_PER_ANALYSIS,
    "collect is idempotent — no double charge, no re-processing");
}

// ═══ D2.2 — top-N cap: 6th flagged frame skipped with honest reason ═══

{
  const org = await makeOrg("d2-cap");
  const repo = await makeRepo(org);
  const run = await makeRun(org, repo);
  const { deps } = mkDeps({ results: new Map() });
  const enq = await enqueueCiBatch(db, deps, { orgId: org, repoId: repo, runId: run, model: "claude-sonnet-5", frames: frames(7) });
  check("D2.2a", enq.skipped.length === 2 && enq.skipped.every((s) => s.reason.includes("cap")),
    `frames beyond the ${AUTO_EXPLAIN_PER_RUN_CAP}-frame cap skipped with the manual-trigger hint`);
  check("D2.2b", (await balance(db, org)) === 100 - AUTO_EXPLAIN_PER_RUN_CAP * CREDITS_PER_ANALYSIS,
    "only capped frames reserve credits");
}

// ═══ D2.3 — submission failure refunds everything; CI stays green ═══

{
  const org = await makeOrg("d2-fail");
  const repo = await makeRepo(org);
  const run = await makeRun(org, repo);
  const { deps } = mkDeps({ submitError: true });
  const enq = await enqueueCiBatch(db, deps, { orgId: org, repoId: repo, runId: run, model: "claude-sonnet-5", frames: frames(3) });
  check("D2.3a", enq.batchId === null && (await balance(db, org)) === 100, "failed submission refunds every reservation");
  const logged = (await db.query("SELECT COUNT(*) AS n FROM usage_events WHERE org_id = $1 AND status = 'failed_no_charge'", [org])).rows[0];
  check("D2.3b", Number(logged.n) === 3, "every refund is logged failed_no_charge");
}

// ═══ D2.4 — partial failure at collect: bad frames refund, good frames charge ═══

{
  const org = await makeOrg("d2-partial");
  const repo = await makeRepo(org);
  const run = await makeRun(org, repo);
  const results = new Map([
    ["f0.png", okResult("f0.png")],
    ["f1.png", { kind: "refusal" }],
    ["f2.png", { kind: "ok", json: { nope: true }, usage: okResult("x").usage }],
  ]);
  const { deps } = mkDeps({ results });
  const enq = await enqueueCiBatch(db, deps, { orgId: org, repoId: repo, runId: run, model: "claude-sonnet-5", frames: frames(3) });
  const out = await collectCiBatch(db, deps, enq.batchId);
  check("D2.4a", out.findings.length === 1 && out.failures.length === 2, "refusal + schema failure isolated from the good frame");
  check("D2.4b", (await balance(db, org)) === 100 - CREDITS_PER_ANALYSIS,
    `failed frames refunded, good frame charged ${CREDITS_PER_ANALYSIS}`);
}

// ═══ D2.5 — PR comment line is escaped (E3 surface) ═══

{
  const hostile = [{
    frame: "<img src=x onerror=alert(1)>.png",
    findings: { findings: [{ observation: `<script>alert("pwn")</script> gap & "quote"` }] },
  }];
  const line = summarizeForPr(hostile);
  check("D2.5a", !line.includes("<script>") && !line.includes("<img"), "no raw tags survive in the PR line");
  check("D2.5b", line.includes("&lt;script&gt;") && line.includes("&amp;"), "hostile content is HTML-escaped, not dropped");
  check("D2.5c", line.includes("generated — verify before applying"), "PR line carries the verify label");
  check("D2.5d", summarizeForPr([]) === "", "no findings → no comment line");
  check("D2.5e", escapeHtml(`&<>"'`) === "&amp;&lt;&gt;&quot;&#39;", "escaper covers all five metacharacters");
}

await db.close();
console.log(failures === 0 ? "\nAll CI batch checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
