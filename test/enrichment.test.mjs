// Build 4.0 Phase D — history enrichment suite (D6 in BuildV4.md, plus the
// locally-testable enrichment core the checkpoint calls out).
// Run: npm test — runs on PGlite; set DATABASE_URL for a real server.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits } = await import(path.join(DIST, "ledger.js"));
const { hostedExplain } = await import(path.join(DIST, "explainService.js"));
const { buildEnrichment, saveRunFindings, ENRICHMENT_TOKEN_CAP, HISTORY_VERSION, estimateTokens } = await import(
  path.join(DIST, "enrichment.js")
);

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);

async function makeOrg(name) {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, name]);
  await grantCredits(db, { orgId: id, kind: "plan_allotment", credits: 100, expiresAt: farFuture });
  return id;
}

async function makeRepo(orgId, name) {
  const id = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [id, orgId, name]);
  return id;
}

async function makeRun(orgId, repoId, commit, createdAt) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, orgId, repoId, commit, "{}", createdAt.toISOString()]
  );
  return id;
}

async function addStat(orgId, repoId, runId, frame, mismatch, flagged, createdAt) {
  await db.query(
    `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, flagged, created_at)
     VALUES ($1,$2,$3,$4,'fidelity','images',$5,$6,$7)`,
    [orgId, repoId, runId, frame, mismatch, flagged, createdAt.toISOString()]
  );
}

const okFindings = {
  findings: [
    { frame: "hero.png", region: { x: 0, y: 0, width: 10, height: 10 }, category: "spacing",
      observation: "gap is 16px, design implies 32px", cssHypothesis: "", selector: ".grid",
      codePointer: "", suggestedFix: "", confidence: "high" },
  ],
};
const deps = (provider) => ({ provider, dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} });
const t = (daysAgo) => new Date(Date.now() - daysAgo * 24 * 3600 * 1000);

// ═══ D6.1 — recurring drift: hosted finding carries firstDriftCommit + recurrence ═══

{
  const org = await makeOrg("d6-recurring");
  const repo = await makeRepo(org, "web");
  // Three prior runs: clean, then flagged twice. First flagged commit = c2.
  const r1 = await makeRun(org, repo, "c1", t(3));
  const r2 = await makeRun(org, repo, "c2", t(2));
  const r3 = await makeRun(org, repo, "c3", t(1));
  await addStat(org, repo, r1, "hero.png", 0.4, false, t(3));
  await addStat(org, repo, r2, "hero.png", 7.2, true, t(2));
  await addStat(org, repo, r3, "hero.png", 8.1, true, t(1));
  await saveRunFindings(db, {
    orgId: org, repoId: repo, runId: r3, frame: "hero.png", model: "claude-sonnet-5",
    findings: { findings: [{ observation: "grid gap collapsed to 16px", category: "spacing", confidence: "high" }] },
  });
  const rNow = await makeRun(org, repo, "c4", t(0));
  await addStat(org, repo, rNow, "hero.png", 8.3, true, t(0));

  let seenRequest = null;
  const provider = async (request) => {
    seenRequest = request;
    return {
      kind: "ok",
      json: structuredClone(okFindings),
      usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    };
  };
  const out = await hostedExplain(db, deps(provider), {
    orgId: org, runId: rNow, repoId: repo, frame: "hero.png",
    buildHash: "b1", designHash: "d1", model: "claude-sonnet-5", pass: "analysis",
  });
  const f = out.ok ? out.findings.findings[0] : null;
  check("D6.1a", out.ok && f.firstDriftCommit === "c2", `firstDriftCommit is the first flagged commit (got ${f?.firstDriftCommit})`);
  check("D6.1b", out.ok && f.recurrence === 3, `recurrence counts flagged occurrences incl. current (got ${f?.recurrence})`);
  check("D6.1c", out.ok && f.historyVersion === HISTORY_VERSION, "history fields are schema-versioned");
  check("D6.1d", seenRequest?.enrichmentText?.includes("grid gap collapsed to 16px"),
    "provider prompt context includes the prior finding");
  check("D6.1e", seenRequest?.enrichmentText?.includes("c2") && seenRequest?.enrichmentText?.includes("8.10%"),
    "provider prompt context includes the trend line");

  const usageRow = (
    await db.query("SELECT detail FROM usage_events WHERE org_id = $1 AND status = 'charged'", [org])
  ).rows[0];
  const tokens = Number(/enrichment_tokens=(\d+)/.exec(usageRow?.detail ?? "")?.[1] ?? NaN);
  check("D6.1f", Number.isFinite(tokens) && tokens > 0 && tokens <= ENRICHMENT_TOKEN_CAP,
    `enrichment tokens recorded in usage event within the cap (got ${tokens})`);

  // Findings persisted for future recurrence lookups.
  const stored = (
    await db.query("SELECT findings FROM run_findings WHERE org_id = $1 AND run_id = $2", [org, rNow])
  ).rows[0];
  check("D6.1g", stored !== undefined, "hosted findings are attached to the run");

  // ═══ D6.2 — identical request without repoId (BYO-shaped): no history fields ═══
  const outNoRepo = await hostedExplain(db, deps(provider), {
    orgId: org, runId: rNow, frame: "hero.png",
    buildHash: "b2", designHash: "d1", model: "claude-sonnet-5", pass: "analysis",
  });
  const f2 = outNoRepo.ok ? outNoRepo.findings.findings[0] : null;
  check("D6.2a", outNoRepo.ok && !("firstDriftCommit" in f2) && !("recurrence" in f2),
    "analysis without history access carries neither field");
  check("D6.2b", seenRequest?.enrichmentText === null, "provider request carries no enrichment context");
}

// ═══ D6.3 — org with no history: enrichment null, request still succeeds ═══

{
  const org = await makeOrg("d6-fresh");
  const repo = await makeRepo(org, "web");
  const run = await makeRun(org, repo, "c1", t(0));
  const provider = async (request) => ({
    kind: "ok",
    json: structuredClone(okFindings),
    usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  });
  const enrichment = await buildEnrichment(db, { orgId: org, repoId: repo, frame: "hero.png" });
  check("D6.3a", enrichment === null, "no frame history → enrichment is null");
  const out = await hostedExplain(db, deps(provider), {
    orgId: org, runId: run, repoId: repo, frame: "hero.png",
    buildHash: "b1", designHash: "d1", model: "claude-sonnet-5", pass: "analysis",
  });
  check("D6.3b", out.ok && !("firstDriftCommit" in out.findings.findings[0]),
    "first-ever analysis succeeds without history fields");
}

// ═══ D6.4 — token cap: pathological history truncates deterministically ═══

{
  const org = await makeOrg("d6-cap");
  const repo = await makeRepo(org, "web");
  for (let i = 0; i < 30; i++) {
    const run = await makeRun(org, repo, `commit-${String(i).padStart(4, "0")}-${"x".repeat(60)}`, t(30 - i));
    await addStat(org, repo, run, "hero.png", 5 + i * 0.1, true, t(30 - i));
  }
  const lastRun = await makeRun(org, repo, "c-last", t(0.5));
  await saveRunFindings(db, {
    orgId: org, repoId: repo, runId: lastRun, frame: "hero.png", model: "claude-sonnet-5",
    findings: { findings: [{ observation: "y".repeat(20000), category: "spacing", confidence: "high" }] },
  });
  const e1 = await buildEnrichment(db, { orgId: org, repoId: repo, frame: "hero.png" });
  const e2 = await buildEnrichment(db, { orgId: org, repoId: repo, frame: "hero.png" });
  check("D6.4a", e1 !== null && e1.tokenEstimate <= ENRICHMENT_TOKEN_CAP,
    `pathological history capped (got ${e1?.tokenEstimate} tokens)`);
  check("D6.4b", estimateTokens(e1.text) === e1.tokenEstimate, "token estimate matches rendered text");
  check("D6.4c", JSON.stringify(e1) === JSON.stringify(e2), "same database state → byte-identical enrichment");
}

// ═══ D6.5 — recurrence memory: this run's finding feeds the next run's context ═══

{
  const org = await makeOrg("d6-memory");
  const repo = await makeRepo(org, "web");
  const r1 = await makeRun(org, repo, "m1", t(1));
  await addStat(org, repo, r1, "hero.png", 6.0, true, t(1));
  const provider = async () => ({
    kind: "ok",
    json: structuredClone(okFindings),
    usage: { inputTokens: 15000, outputTokens: 1200, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  });
  await hostedExplain(db, deps(provider), {
    orgId: org, runId: r1, repoId: repo, frame: "hero.png",
    buildHash: "b1", designHash: "d1", model: "claude-sonnet-5", pass: "analysis",
  });
  const e = await buildEnrichment(db, { orgId: org, repoId: repo, frame: "hero.png" });
  check("D6.5", e?.recurrence.lastObservation === okFindings.findings[0].observation,
    "a charged analysis becomes the next analysis's prior finding");
}

await db.close();
console.log(failures === 0 ? "\nAll enrichment checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
