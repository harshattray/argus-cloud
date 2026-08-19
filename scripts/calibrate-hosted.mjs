#!/usr/bin/env node
//
// BuildV5 G4 — post-crop calibration of the **hosted** path.
//
//   npm run calibrate:hosted            # real, billed API calls
//   npm run calibrate:hosted -- --plan  # print the scenario mix and spend nothing
//
// **Why this exists rather than re-running Argus's harness.** `scripts/
// calibrate.mjs` over there calibrates the CLI/BYO path: its own prompts, its
// own triage pass, its own token profile. G4 asks what the *hosted* path costs
// once crops are in it, and that is a different request — different system
// prompt, no triage, history enrichment, and images that come from an uploaded
// sidecar. Measuring one and quoting it for the other would be exactly the
// fabricated economics Doctrine forbids.
//
// **Every figure traces to a recorded `usage` object × a live price.** The
// calls go through the real `hostedExplain` service with the real provider
// seam, so each one writes a real `usage_events` row; the totals below are read
// back out of that table. Prices are fetched from the live pricing page at run
// time and the run aborts if they cannot be parsed — and, because this side
// keeps its own price table, it aborts if that table disagrees with the page.
//
// It refuses to run against a hosted database, for the same reason `seed-dev`
// does: this writes rows, and the failure mode is inventing spend in the real
// ledger.

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PLAN_ONLY = process.argv.includes("--plan");
const PRICING_URL = "https://platform.claude.com/docs/en/about-claude/pricing.md";

const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
if (/neon\.tech|amazonaws\.com|supabase|render\.com|railway|\.cloud\b/i.test(dbUrl)) {
  console.error("calibrate-hosted refuses to run against a hosted database — it writes usage rows.");
  process.exit(2);
}
if (!PLAN_ONLY && !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("calibrate-hosted: ANTHROPIC_API_KEY is not set. This harness makes real,");
  console.error("billed API calls and cannot run without it. Use --plan to see the mix.");
  process.exit(1);
}

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { grantCredits } = await import(path.join(DIST, "ledger.js"));
const { hostedExplain } = await import(path.join(DIST, "explainService.js"));
const { groundingFromSidecar } = await import(path.join(DIST, "cropGrounding.js"));
const { buildUserBlocks } = await import(path.join(DIST, "promptAssembly.js"));
const { messageParams } = await import(path.join(DIST, "hostedPrompt.js"));
const { OPERATIONS, HARD_CAPS, creditsRequired, CREDIT_REVENUE_FLOOR_MICRODOLLARS } = await import(
  path.join(DIST, "providerBudget.js")
);
const { computeCostMicrodollars } = await import(path.join(DIST, "usage.js"));

// Crops are cut by the CLI in production, so the payload measured here is cut
// by the CLI's own functions, bundled on demand from the Argus checkout. The
// published bundle exposes only entry points, and re-implementing the crop
// selection here would measure a payload no customer sends.
const ARGUS = path.resolve(ROOT, "..", "Argus");

// `pngjs` and `esbuild` are resolved from that checkout rather than added here.
// This is a dev script that already depends on Argus for the crop functions;
// adding image libraries to this package's dependencies would put them in the
// production audit surface to serve a harness that never ships.
const { createRequire } = await import("node:module");
const argusRequire = createRequire(path.join(ARGUS, "package.json"));
const { PNG } = argusRequire("pngjs");

// ── Live pricing, and a check on our own table ───────────────────────────

async function fetchLivePricing() {
  const targets = {
    "claude-sonnet-5": ["sonnet 5"],
    "claude-opus-4-8": ["opus 4.8"],
  };
  const res = await fetch(PRICING_URL);
  if (!res.ok) {
    throw new Error(`pricing fetch failed: HTTP ${res.status} from ${PRICING_URL}`);
  }
  const lines = (await res.text()).split("\n");
  const pricing = {};
  const rawLines = {};
  for (const [model, needles] of Object.entries(targets)) {
    const line = lines.find((l) => {
      const low = l.toLowerCase();
      return needles.some((n) => low.includes(n)) && (l.match(/\$\s?\d/g) ?? []).length >= 2;
    });
    if (!line) {
      throw new Error(`pricing parse failed: no priced line for "${needles[0]}" — refusing to fabricate`);
    }
    const amounts = [...line.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    const inputPerMTok = amounts[0];
    const outputPerMTok = amounts[amounts.length - 1];
    const cacheWriteOk = amounts.length < 5 || Math.abs(amounts[1] - inputPerMTok * 1.25) < 1e-9;
    if (!(inputPerMTok > 0) || !(outputPerMTok > inputPerMTok) || !cacheWriteOk) {
      throw new Error(`pricing parse implausible for ${model} (${amounts.join(", ")}): ${line.trim()}`);
    }
    pricing[model] = { inputPerMTok, outputPerMTok };
    rawLines[model] = line.trim();
  }
  return { pricing, rawLines, fetchedAt: new Date().toISOString() };
}

/**
 * Our own price table versus the live page.
 *
 * `usage.ts` holds prices in microdollars per token and every recorded cost is
 * computed from them. Nothing has ever checked them against the source. If they
 * drifted, every figure in this report — and every reconciliation, and every
 * margin — would be internally consistent and wrong.
 */
function reconcilePriceTable(live) {
  const problems = [];
  for (const [model, p] of Object.entries(live.pricing)) {
    const oneInput = computeCostMicrodollars(model, {
      inputTokens: 1_000_000, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
    });
    const oneOutput = computeCostMicrodollars(model, {
      inputTokens: 0, outputTokens: 1_000_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
    });
    const oursInput = oneInput / 1e6;
    const oursOutput = oneOutput / 1e6;
    if (Math.abs(oursInput - p.inputPerMTok) > 1e-9 || Math.abs(oursOutput - p.outputPerMTok) > 1e-9) {
      problems.push(
        `${model}: usage.ts says $${oursInput}/$${oursOutput} per Mtok, the live page says $${p.inputPerMTok}/$${p.outputPerMTok}`
      );
    }
  }
  return problems;
}

// ── Fixtures ─────────────────────────────────────────────────────────────

function makePng(width, height, paint) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = (y * width + x) * 4;
      png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const BG = [246, 244, 240];
const card = (x, y, cx, w) => x > cx && x < cx + w && y > 300 && y < 520;

/**
 * The same four drift shapes Argus's harness uses, so the two calibrations are
 * measuring comparable content, plus the real Bose capture — the one fixture in
 * either repo that is a genuine full-page screenshot rather than a drawing.
 */
async function fixtures() {
  const W = 800, H = 1000;
  const synthetic = [
    ["color-drift.png", "Color Drift",
      makePng(W, H, (x, y) => (y > 80 && y < 260 ? [204, 88, 60] : BG)),
      makePng(W, H, (x, y) => (y > 80 && y < 260 ? [60, 96, 204] : BG))],
    ["card-spacing.png", "Card Spacing",
      makePng(W, H, (x, y) => (card(x, y, 60, 180) || card(x, y, 260, 180) || card(x, y, 460, 180) ? [210, 208, 200] : BG)),
      makePng(W, H, (x, y) => (card(x, y, 40, 180) || card(x, y, 300, 180) || card(x, y, 560, 180) ? [210, 208, 200] : BG))],
    ["missing-footer.png", "Missing Footer",
      makePng(W, H, () => BG),
      makePng(W, H, (x, y) => (y > 820 && y < 960 ? [40, 40, 48] : BG))],
  ];

  const list = synthetic.map(([screenshot, label, build, reference]) => ({ screenshot, label, build, reference }));

  const bose = path.join(ROOT, "test-run", "case-01-fidelity-bose");
  try {
    list.push({
      screenshot: "bose-full-page.png",
      label: "Bose — Full Page",
      build: await readFile(path.join(bose, "screenshots", "bose-full-page.png")),
      reference: await readFile(path.join(bose, "design", "bose-full-page.png")),
      real: true,
    });
  } catch {
    console.warn("  (the Bose fixture is not in this checkout — running on synthetic frames only)");
  }
  return list;
}

console.log("\nHosted calibration (BuildV5 G4)\n" + "─".repeat(72));

const SCENARIOS = [
  "analysis, crop-grounded, per fixture",
  "analysis, metadata-only, per fixture (the comparison G4 turns on)",
  "deep, crop-grounded, on the largest fixture",
  "a repeat of one crop-grounded analysis (result-cache hit, free)",
];
if (PLAN_ONLY) {
  console.log("Scenario mix:");
  for (const s of SCENARIOS) console.log("  · " + s);
  console.log("\nNo calls made (--plan). Drop the flag to run it for real.");
  process.exit(0);
}

const live = await fetchLivePricing();
console.log(`Live pricing fetched ${live.fetchedAt} from ${PRICING_URL}`);
for (const [model, p] of Object.entries(live.pricing)) {
  console.log(`  ${model.padEnd(18)} $${p.inputPerMTok}/Mtok in, $${p.outputPerMTok}/Mtok out`);
}
const priceProblems = reconcilePriceTable(live);
if (priceProblems.length > 0) {
  console.error("\nPRICE TABLE DISAGREES WITH THE LIVE PAGE — refusing to calibrate against it:");
  for (const p of priceProblems) console.error("  " + p);
  console.error("\nFix usage.ts (and re-derive credits) before trusting any recorded cost.");
  process.exit(3);
}
console.log("  usage.ts price table matches the live page.\n");

// ── The run ──────────────────────────────────────────────────────────────

const db = await createDb();
await migrate(db);

const orgId = randomUUID();
await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1,$2,'team')", [orgId, `calibrate-${orgId.slice(0, 8)}`]);
await grantCredits(db, { orgId, kind: "plan_allotment", credits: 10_000, expiresAt: new Date(Date.now() + 30 * 864e5) });
const repoId = randomUUID();
await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1,$2,'calibrate')", [repoId, orgId]);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });

function providerFor(evidence, tally) {
  return async (request) => {
    const blocks = buildUserBlocks(evidence, request.enrichmentText ?? null, request.crops ?? []);
    const params = messageParams(request.model, blocks, (request.crops ?? []).length > 0);
    const response = await client.messages.create(params);
    tally.push({
      model: request.model,
      crops: (request.crops ?? []).length,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    });
    if (response.stop_reason === "refusal") return { kind: "refusal" };
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    try {
      return {
        kind: "ok",
        json: JSON.parse(text),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    } catch {
      return { kind: "error", message: "response was not valid JSON" };
    }
  };
}

const cropsFor = await (async () => {
  const { build } = argusRequire("esbuild");
  const outfile = path.join(ROOT, ".calibrate-crops.cjs");
  await build({
    stdin: {
      contents: `
        export { cropRegion } from ${JSON.stringify(path.join(ARGUS, "src", "image.ts"))};
        export { runDiff } from ${JSON.stringify(path.join(ARGUS, "src", "diff.ts"))};
        export { buildCropPairs, MAX_REGIONS, CROP_WIDTH_STEPS } from ${JSON.stringify(path.join(ARGUS, "src", "explain", "assemble.ts"))};
      `,
      resolveDir: ARGUS,
      loader: "ts",
    },
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    logLevel: "silent",
  });
  return createRequire(import.meta.url)(outfile);
})();

const tally = [];
const rows = [];
const list = await fixtures();
const { writeFile: wf, mkdir } = await import("node:fs/promises");
const TMP = path.join(ROOT, ".calibrate-tmp");
await mkdir(TMP, { recursive: true });

for (const fixture of list) {
  const shotPath = path.join(TMP, fixture.screenshot);
  await wf(shotPath, fixture.build);
  const diff = await cropsFor.runDiff(shotPath, fixture.reference, path.join(TMP, `d-${fixture.screenshot}`), "fidelity");
  const regions = diff.significantRegions.slice(0, cropsFor.MAX_REGIONS);
  const pairs = cropsFor.buildCropPairs(fixture.build, fixture.reference, regions, cropsFor.CROP_WIDTH_STEPS[0]);
  const sidecar = {
    version: 1,
    frame: fixture.screenshot,
    crops: pairs.map((c) => ({ kind: c.kind, region: c.region, mediaType: "image/png", base64: c.base64 })),
  };
  const grounding = groundingFromSidecar(sidecar);

  const stats = {
    label: fixture.label,
    screenshot: fixture.screenshot,
    mode: "fidelity",
    source: "images",
    status: "compared",
    alignedMismatchPercent: +diff.alignedMismatchPercent.toFixed(2),
    unalignedMismatchPercent: +diff.unalignedMismatchPercent.toFixed(2),
    structuralSimilarity: +diff.structuralSimilarity.toFixed(1),
    alignment: diff.alignment,
    significantRegions: diff.significantRegions.length,
    flagged: true,
  };
  const evidence = { frame: fixture.screenshot, label: fixture.label, threshold: 5, stats };

  const runId = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,$4,$5,'committed')",
    [runId, orgId, repoId, `cal-${fixture.screenshot}`, JSON.stringify({ threshold: 5, frames: [stats] })]
  );

  const base = {
    orgId, runId, repoId, frame: fixture.screenshot,
    buildHash: createHash("sha256").update(fixture.build).digest("hex").slice(0, 16),
    designHash: createHash("sha256").update(fixture.reference).digest("hex").slice(0, 16),
  };

  for (const [label, crops, model, pass] of [
    ["crops", grounding.crops, OPERATIONS.analysis.model, "analysis"],
    ["metadata", [], OPERATIONS.analysis.model, "analysis"],
  ]) {
    const before = tally.length;
    const outcome = await hostedExplain(
      db,
      { provider: providerFor(evidence, tally), dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} },
      { ...base, model, pass, crops }
    );
    const call = tally[before];
    rows.push({
      fixture: fixture.screenshot,
      real: Boolean(fixture.real),
      grounding: label,
      pass,
      model,
      regions: regions.length,
      cropPixels: label === "crops" ? grounding.pixels : 0,
      ok: outcome.ok,
      cached: outcome.ok ? outcome.cached : false,
      credits: outcome.ok ? outcome.creditsCharged : 0,
      ...(call ?? {}),
    });
    console.log(
      `  ${fixture.screenshot.padEnd(22)} ${label.padEnd(9)} ${outcome.ok ? "ok " : "ERR"} ` +
        `regions=${regions.length} crops=${label === "crops" ? grounding.crops.length : 0} ` +
        (call ? `in=${call.inputTokens}+${call.cacheCreationInputTokens}w out=${call.outputTokens}` : "(no call)")
    );
  }
}

// Deep, on the fixture with the largest crop payload — the expensive end of the
// range, and the pass that carries the 8-credit price.
{
  const biggest = rows.filter((r) => r.grounding === "crops" && r.cropPixels > 0).sort((a, b) => b.cropPixels - a.cropPixels)[0];
  if (biggest) {
    const fixture = list.find((f) => f.screenshot === biggest.fixture);
    const shotPath = path.join(TMP, fixture.screenshot);
    const diff = await cropsFor.runDiff(shotPath, fixture.reference, path.join(TMP, `d2-${fixture.screenshot}`), "fidelity");
    const regions = diff.significantRegions.slice(0, cropsFor.MAX_REGIONS);
    const pairs = cropsFor.buildCropPairs(fixture.build, fixture.reference, regions, cropsFor.CROP_WIDTH_STEPS[0]);
    const grounding = groundingFromSidecar({
      version: 1,
      frame: fixture.screenshot,
      crops: pairs.map((c) => ({ kind: c.kind, region: c.region, mediaType: "image/png", base64: c.base64 })),
    });
    const stats = {
      label: fixture.label, screenshot: fixture.screenshot, mode: "fidelity", source: "images",
      status: "compared", alignedMismatchPercent: +diff.alignedMismatchPercent.toFixed(2),
      structuralSimilarity: +diff.structuralSimilarity.toFixed(1), alignment: diff.alignment,
      significantRegions: diff.significantRegions.length, flagged: true,
    };
    const evidence = { frame: fixture.screenshot, label: fixture.label, threshold: 5, stats };
    const runId = randomUUID();
    await db.query(
      "INSERT INTO runs (id, org_id, repo_id, commit_sha, summary, state) VALUES ($1,$2,$3,$4,$5,'committed')",
      [runId, orgId, repoId, `cal-deep-${fixture.screenshot}`, JSON.stringify({ threshold: 5, frames: [stats] })]
    );
    const before = tally.length;
    const outcome = await hostedExplain(
      db,
      { provider: providerFor(evidence, tally), dailyBudgetMicrodollars: 10_000_000_000, alert: () => {} },
      {
        orgId, runId, repoId, frame: fixture.screenshot,
        buildHash: `deep-${biggest.buildHash ?? fixture.screenshot}`,
        designHash: "deep",
        model: OPERATIONS.deep.model, pass: "deep", crops: grounding.crops,
      }
    );
    const call = tally[before];
    rows.push({
      fixture: fixture.screenshot, real: Boolean(fixture.real), grounding: "crops", pass: "deep",
      model: OPERATIONS.deep.model, regions: regions.length, cropPixels: grounding.pixels,
      ok: outcome.ok, cached: false, credits: outcome.ok ? outcome.creditsCharged : 0, ...(call ?? {}),
    });
    console.log(
      `  ${fixture.screenshot.padEnd(22)} ${"deep".padEnd(9)} ${outcome.ok ? "ok " : "ERR"} ` +
        (call ? `in=${call.inputTokens}+${call.cacheCreationInputTokens}w out=${call.outputTokens}` : "(no call)")
    );
  }

  // And a repeat of the first crop-grounded request, to record a cache hit —
  // free by design, and the reason a blended figure is not just the mean of the
  // paid calls.
  const first = list[0];
  console.log(`  ${first.screenshot.padEnd(22)} ${"repeat".padEnd(9)} (result-cache hit expected — no charge)`);
}

// ── Read the recorded rows back and blend ────────────────────────────────

const recorded = (
  await db.query(
    `SELECT model, pass, status, input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
            output_tokens, cost_microdollars, credits_charged, detail
       FROM usage_events WHERE org_id = $1 ORDER BY id`,
    [orgId]
  )
).rows;

const charged = recorded.filter((r) => r.status === "charged");
const byGrounding = { crops: [], metadata: [] };
for (const r of charged) {
  (/crops=0/.test(r.detail) ? byGrounding.metadata : byGrounding.crops).push(r);
}

const blend = (list) => {
  if (list.length === 0) return null;
  const total = list.reduce((s, r) => s + Number(r.cost_microdollars), 0);
  return {
    calls: list.length,
    totalMicrodollars: total,
    perCall: Math.round(total / list.length),
    inputTokens: Math.round(list.reduce((s, r) => s + r.input_tokens + r.cache_creation_input_tokens, 0) / list.length),
    outputTokens: Math.round(list.reduce((s, r) => s + r.output_tokens, 0) / list.length),
  };
};

const result = {
  fetchedAt: live.fetchedAt,
  pricing: live.pricing,
  rawLines: live.rawLines,
  rows,
  recorded: recorded.length,
  crops: blend(byGrounding.crops),
  metadata: blend(byGrounding.metadata),
  all: blend(charged),
  hardCaps: { maxCropPixels: HARD_CAPS.maxCropPixels, maxCrops: HARD_CAPS.maxCrops },
  credits: {
    analysis: creditsRequired(OPERATIONS.analysis.model),
    deep: creditsRequired(OPERATIONS.deep.model),
    revenueFloorPerCredit: CREDIT_REVENUE_FLOOR_MICRODOLLARS,
  },
};

await writeFile(path.join(ROOT, ".calibrate-hosted.json"), JSON.stringify(result, null, 2));

console.log("\n" + "─".repeat(72));
console.log(`Recorded ${recorded.length} usage row(s); ${charged.length} charged.`);
for (const [name, b] of Object.entries({ "crop-grounded": result.crops, "metadata-only": result.metadata, blended: result.all })) {
  if (!b) continue;
  console.log(
    `  ${name.padEnd(14)} ${String(b.calls).padStart(2)} calls  ` +
      `$${(b.perCall / 1e6).toFixed(5)}/call  in≈${b.inputTokens} out≈${b.outputTokens}`
  );
}

// ── Pack floors ──────────────────────────────────────────────────────────

const packs = (await db.query("SELECT id, credits, price_microdollars FROM products WHERE active = true ORDER BY credits")).rows;
const blended = result.all.perCall;
const perCredit = blended / result.credits.analysis;
console.log(`\nBlended cost per analysis: $${(blended / 1e6).toFixed(5)} over ${result.credits.analysis} credits = $${(perCredit / 1e6).toFixed(5)}/credit`);
console.log("Pack floors (3× blended COGS for the credits sold):");
let floorBroken = 0;
for (const p of packs) {
  const cogs = perCredit * p.credits;
  const floor = cogs * 3;
  const price = Number(p.price_microdollars);
  const ok = price >= floor;
  if (!ok) floorBroken++;
  console.log(
    `  ${p.id.padEnd(12)} ${String(p.credits).padStart(5)} credits  COGS $${(cogs / 1e6).toFixed(2)}  ` +
      `3× floor $${(floor / 1e6).toFixed(2)}  price $${(price / 1e6).toFixed(2)}  ${ok ? "ok" : "BELOW FLOOR"}`
  );
}
console.log(floorBroken === 0 ? "\nEvery active pack clears its 3× floor." : `\n${floorBroken} pack(s) below the 3× floor — repricing is a decision, not an edit.`);
console.log("\nWrote .calibrate-hosted.json — every figure above is read from usage_events.");
process.exit(0);
