// Outbound secret scan — PATHWAYS Pathway 2 item 8 ("secret-scan DOM and code
// context before provider submission"), BuildV5 G3.4, SECURITY-LLM.md S1–S8.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/secretScan.test.mjs
//
// The claim under test is that a credential in a run's data never reaches the
// provider, on either path, and that being blocked costs the customer nothing.
//
// SS7 is the teeth check (the B4b/P4b pattern): it runs the *pre-item-8*
// assembly — build the string, send it — through the same harness, and asserts
// the secret would have gone out. Without it, SS3–SS6 could be asserting
// nothing.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits, balance } = await import(path.join(DIST, "ledger.js"));
const { scanText, scanFields } = await import(path.join(DIST, "secretScan.js"));
const { buildUserContent, OutboundSecretError } = await import(path.join(DIST, "promptAssembly.js"));
const { hostedExplain, CREDITS_PER_ANALYSIS } = await import(path.join(DIST, "explainService.js"));
const { enqueueCiBatch } = await import(path.join(DIST, "ciBatch.js"));
const { HARD_CAPS } = await import(path.join(DIST, "providerBudget.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const db = await createDb();
await migrate(db);

const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const SONNET = "claude-sonnet-5";

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
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,$4,'{}','committed')",
    [id, orgId, repoId, commit]
  );
  return id;
}
const reservationStates = async (orgId) =>
  (await db.query("SELECT state FROM provider_reservations WHERE org_id = $1", [orgId])).rows.map((r) => r.state);
const usageRows = async (orgId) =>
  (await db.query("SELECT status, detail, credits_charged FROM usage_events WHERE org_id = $1 ORDER BY id", [orgId]))
    .rows;

// A frame the model would happily analyse, used wherever the test needs a
// payload that must NOT be blocked.
const cleanEvidence = (frame = "hero-desktop.png") => ({
  frame,
  label: "Marketing / Hero — Desktop",
  threshold: 0.5,
  stats: {
    label: "Marketing / Hero — Desktop",
    screenshot: frame,
    mode: "fidelity",
    source: "figma",
    status: "compared",
    alignedMismatchPercent: 12.4,
    structuralSimilarity: 91.2,
    flagged: true,
  },
});

// ═══ SS1 — one planted payload per rule, and the rule that must fire ═══
//
// This corpus is the contract between this scanner and the CLI's copy in
// Argus `src/explain/scanner.ts`. The two cannot share an import (see
// `src/secretScan.ts`), so they share observable behaviour instead: if a rule
// changes there, this list is what says so here.
{
  const planted = [
    ["S1", "AKIAIOSFODNN7EXAMPLE", "an AWS access key id"],
    ["S2", "sk-ant-api03-Zx9WqLmT4vNbHy2Rd8Kf", "an Anthropic key"],
    ["S3", "sk-proj-QwErTyUiOpAsDfGhJkLzXcVbNm12", "a generic sk- provider key"],
    ["S4", "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8", "a GitHub personal access token"],
    ["S5", "xoxb-2481-3920-AbCdEfGhIjKlMnOp", "a Slack bot token"],
    ["S6", "-----BEGIN RSA PRIVATE KEY-----", "a private key header"],
    ["S7", 'FIGMA_TOKEN="figd-9182hjkasd"', "a named token assignment"],
    ["S8", "qX7vLp2ZmR9tKw4YbN6cHs1EdU3aJgFo", "a 32-char high-entropy string"],
  ];
  for (const [rule, payload, what] of planted) {
    check(`SS1.${rule}`, scanText(payload) === rule, `${what} is caught by ${rule} (got ${scanText(payload)})`);
  }
  check(
    "SS1.9",
    scanFields([
      { source: "clean field", text: "nothing here" },
      { source: "the second field", text: "AKIAIOSFODNN7EXAMPLE" },
    ])?.source === "the second field",
    "the hit names which field carried it, not just that there was one"
  );
}

// ═══ SS2 — what must NOT be blocked ═══
//
// A false positive refuses a paying customer's analysis, so the clean corpus
// is as load-bearing as the planted one. Every string here occurs in ordinary
// summary.json, enrichment, or frame-naming data.
{
  const clean = [
    ["a commit SHA", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"],
    ["a run UUID", "3f1c9a2e-77b4-4c1a-9d8e-2b6f0a5c4d31"],
    ["a content-addressed blob key", "orgs/acme/blob/9f2c8b1e4a6d3f5079b2c4e6a8d0f2b4c6e8a0d2f4b6c8e0a2d4f6b8c0e2a4d6.png"],
    ["a screenshot path", "artifacts/build/marketing-hero-desktop-1440x900.png"],
    ["a long Figma frame label", "Marketing / Landing Page / Hero Section — Desktop 1440 — Variant B"],
    ["a code reference, not a value", "apiKey: process.env.NORMASCOPE_ORG_KEY"],
    ["a CSS-module class", "Hero_container__2fH9k"],
    ["prose from an enrichment block", "This frame first exceeded its threshold 14 commits ago and has regressed 3 times since."],
  ];
  clean.forEach(([what, text], i) => {
    const hit = scanText(text);
    check(`SS2.${i + 1}`, hit === null, `${what} is not flagged (got ${hit})`);
  });
  const wholeFrame = JSON.stringify(cleanEvidence().stats);
  check("SS2.9", scanText(wholeFrame) === null, "a complete, realistic summary.json frame passes untouched");

  // The cost of SS2.4, pinned rather than left implicit. Excluding `/` from the
  // entropy alphabet is what stops a screenshot path reading as a secret, and it
  // means standard base64 whose slashes break every 32-char run gets past S8.
  // If this check ever flips, the note in `src/secretScan.ts` is out of date.
  check(
    "SS2.10",
    scanText("aB3/xY9+kL2mNp/QrS7tUvW1zXcV4bNm/HgFdEwQ") === null,
    "known gap: standard base64 broken up by slashes is not caught by S8 — S1–S7 are what catch named credentials"
  );
}

// ═══ SS3 — assembly refuses to build a request carrying a secret ═══
{
  let threw = null;
  try {
    buildUserContent({ ...cleanEvidence(), label: "Hero — AKIAIOSFODNN7EXAMPLE" }, null);
  } catch (err) {
    threw = err;
  }
  check("SS3.1", threw instanceof OutboundSecretError, "assembly throws rather than returning a payload with a secret in it");
  check("SS3.2", threw?.rule === "S1" && threw.source.includes("label"), `the error names the rule and the field (${threw?.rule}, "${threw?.source}")`);
  check("SS3.3", /no credits were used/.test(threw?.message ?? ""), "the message tells the customer they were not charged");

  let statsThrew = null;
  try {
    const evidence = cleanEvidence();
    evidence.stats.skipReason = 'GITHUB_TOKEN="ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"';
    buildUserContent(evidence, null);
  } catch (err) {
    statsThrew = err;
  }
  check("SS3.4", statsThrew instanceof OutboundSecretError, "a secret anywhere inside the stats blob blocks it, not only in the fields we read by name");

  let enrichThrew = null;
  try {
    buildUserContent(cleanEvidence(), "History: first drift at sk-ant-api03-Zx9WqLmT4vNbHy2Rd8Kf");
  } catch (err) {
    enrichThrew = err;
  }
  check("SS3.5", enrichThrew instanceof OutboundSecretError && enrichThrew.source.includes("enrichment"), "the enrichment block is scanned too — our own text is not exempt");

  const ok = buildUserContent(cleanEvidence(), "History: this frame regressed 3 times.");
  check("SS3.6", ok.includes("12.4") && ok.includes("regressed 3 times"), "a clean frame still assembles normally");
}

// ═══ SS4 — truncation is not a security control ═══
//
// The stats blob is capped, so a secret far enough in is cut before the request
// goes out. Scanning the *assembled* string would call that safe — right for
// this payload, wrong for the same payload 100KB shorter. The scan reads the
// source fields, so where the cap falls does not change the answer.
{
  const evidence = cleanEvidence();
  evidence.stats.filler = "n".repeat(HARD_CAPS.maxUserContentChars * 2);
  evidence.stats.zTrailing = "AKIAIOSFODNN7EXAMPLE";
  let threw = null;
  try {
    buildUserContent(evidence, null);
  } catch (err) {
    threw = err;
  }
  check("SS4.1", threw instanceof OutboundSecretError, "a secret beyond the prompt cap still blocks the request");

  // And the thing it would have relied on is true: assembled output really does
  // drop it, which is exactly why scanning the output would have looked fine.
  const naive = `Diff metadata: ${JSON.stringify(evidence.stats)}`.slice(0, HARD_CAPS.maxUserContentChars);
  check("SS4.2", !naive.includes("AKIAIOSFODNN7EXAMPLE"), "scanning the capped output instead would have missed it — the cap hides the tail");
}

// ═══ SS5 — interactive explain: no call, no charge, honest outcome ═══
{
  const orgId = await makeOrg("ss5-interactive");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const before = await balance(db, orgId);

  let calls = 0;
  // Mirrors web/lib/provider.ts: the real provider assembles inside the closure,
  // so this is where the block surfaces.
  const provider = async (request) => {
    const content = buildUserContent(
      { ...cleanEvidence(), label: 'AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY"' },
      request.enrichmentText ?? null
    );
    calls++;
    return { kind: "ok", json: { findings: [] }, usage: { inputTokens: content.length, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } };
  };

  const outcome = await hostedExplain(
    db,
    { provider, dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} },
    { orgId, runId, repoId, frame: "hero-desktop.png", buildHash: "b1", designHash: "d1", model: SONNET, pass: "analysis" }
  );

  check("SS5.1", calls === 0, "the provider was never called");
  check("SS5.2", outcome.ok === false && outcome.code === "secret_blocked", `the outcome says why (${outcome.code})`);
  check("SS5.3", outcome.ciStaysGreen === true, "CI stays green — a blocked frame is not a build failure");
  check("SS5.4", !outcome.ok && /credential/.test(outcome.message), "the message is about a credential, not a generic 'analysis failed'");
  check("SS5.5", (await balance(db, orgId)) === before, `no credits were charged (${before} before, ${await balance(db, orgId)} after)`);
  const states = await reservationStates(orgId);
  check("SS5.6", states.length === 1 && states[0] === "released", `the provider-dollar reservation was released, not left held (${states.join(",")})`);
  const events = await usageRows(orgId);
  const blocked = events.find((e) => e.detail.includes("secret scan"));
  check("SS5.7", Boolean(blocked) && Number(blocked.credits_charged) === 0, "the block is on the audit trail as a zero-charge event");
}

// ═══ SS6 — CI batch: the poisoned frame is skipped, the clean ones still run ═══
{
  const orgId = await makeOrg("ss6-batch");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const before = await balance(db, orgId);

  const evidenceByFrame = new Map([
    ["clean-a.png", cleanEvidence("clean-a.png")],
    ["poisoned.png", { ...cleanEvidence("poisoned.png"), label: "Hero ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" }],
    ["clean-b.png", cleanEvidence("clean-b.png")],
  ]);
  // The same shape web/lib/provider.ts `makeScan` produces.
  const scan = (frame) => {
    const e = evidenceByFrame.get(frame);
    return e
      ? scanFields([
          { source: `frame name "${e.frame}"`, text: e.frame },
          { source: `the label of frame "${e.frame}"`, text: e.label },
          { source: `the summary.json stats for frame "${e.frame}"`, text: JSON.stringify(e.stats) },
        ])
      : null;
  };

  const submissions = [];
  const enq = await enqueueCiBatch(
    db,
    {
      submit: async (submission) => {
        // Assembly runs here in production; do the same so a frame that slipped
        // past `scan` would still take the batch down rather than go out.
        for (const r of submission.requests) {
          buildUserContent(evidenceByFrame.get(r.frame), r.enrichmentText);
        }
        submissions.push(submission);
        return `batch_${randomUUID().slice(0, 8)}`;
      },
      fetch: async () => null,
      scan,
      dailyBudgetMicrodollars: 10_000_000_000,
      alert: () => {},
    },
    {
      orgId,
      repoId,
      runId,
      model: SONNET,
      frames: [...evidenceByFrame.keys()].map((frame) => ({ frame, buildHash: `b-${frame}`, designHash: "d" })),
    }
  );

  const sent = submissions[0]?.requests.map((r) => r.frame) ?? [];
  check("SS6.1", enq.batchId !== null && sent.length === 2, `the batch still went, carrying the clean frames only (${sent.join(", ")})`);
  check("SS6.2", !sent.includes("poisoned.png"), "the poisoned frame is not in the submission");
  check("SS6.3", enq.skipped.some((s) => s.frame === "poisoned.png" && /credential/.test(s.reason)), "it is reported as skipped, with the reason");
  check(
    "SS6.4",
    (await balance(db, orgId)) === before - 2 * CREDITS_PER_ANALYSIS,
    `credits were reserved for two frames, not three (${before} → ${await balance(db, orgId)})`
  );
  const states = await reservationStates(orgId);
  check("SS6.5", states.length === 2, `the blocked frame never took a provider-dollar reservation (${states.length} reservations for 3 frames)`);
  const blocked = (await usageRows(orgId)).filter((e) => e.status === "blocked_no_charge");
  check("SS6.6", blocked.length === 1 && blocked[0].detail.includes("S4"), `the skip is metered as blocked_no_charge naming the rule (${blocked[0]?.detail})`);
}

// ═══ SS7 — the teeth check: the naive path, through the same harness ═══
//
// Everything above passes trivially if `hostedExplain` refuses for some
// unrelated reason. This runs the pre-item-8 provider — assemble the string
// with no scan, send it — and asserts the secret reaches the wire. If this
// check ever goes green-by-blocking, SS5 is no longer proving anything.
{
  const orgId = await makeOrg("ss7-naive");
  const repoId = await makeRepo(orgId);
  const runId = await makeRun(orgId, repoId);
  const secret = "AKIAIOSFODNN7EXAMPLE";

  let sentContent = null;
  const naiveProvider = async () => {
    // The old assembly, verbatim in shape: interpolate and go.
    sentContent = `<frame-diff-data>\nFrame: hero-desktop.png (label: Hero — ${secret})\n</frame-diff-data>`;
    return { kind: "ok", json: { findings: [] }, usage: { inputTokens: 100, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } };
  };

  const outcome = await hostedExplain(
    db,
    { provider: naiveProvider, dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} },
    { orgId, runId, repoId, frame: "hero-desktop.png", buildHash: "b1", designHash: "d1", model: SONNET, pass: "analysis" }
  );

  check("SS7.1", outcome.ok === true, "the naive provider completes — nothing outside prompt assembly stops it");
  check("SS7.2", sentContent?.includes(secret) === true, "and it puts the credential on the wire, which is the failure SS3–SS6 exist to catch");
}

console.log(failures === 0 ? "\nsecretScan: all checks green" : `\nsecretScan: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
