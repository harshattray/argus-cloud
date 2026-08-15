#!/usr/bin/env node
//
// Fill a local database with enough to look at — an organization on each plan,
// an upload key, a repository, and a couple of runs.
//
//   npm run seed:dev                                   # PGlite, the dev default
//   DATABASE_URL="$(scripts/test-db.sh start)" npm run seed:dev
//
// **This refuses to run against a hosted database.** A seed script is a write
// script, and the failure mode of pointing one at production is inventing
// customers in the real ledger. The check is a hostname match rather than a
// prompt, because a prompt is something you click through at speed.
//
// Everything it creates is prefixed `dev-` and printed, so it can be told apart
// from anything real at a glance.

import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const url = process.env.DATABASE_URL?.trim() ?? "";
const HOSTED = /neon\.tech|amazonaws\.com|supabase|render\.com|railway|\.cloud\b/i;
if (HOSTED.test(url)) {
  console.error("seed-dev refuses to run against a hosted database.");
  console.error(`  DATABASE_URL points at: ${url.replace(/:\/\/[^@]*@/, "://<redacted>@")}`);
  console.error("  Unset it for PGlite, or use scripts/test-db.sh for a local server.");
  process.exit(2);
}

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createApiKey } = await import(path.join(DIST, "apiKeys.js"));

const db = await createDb();
await migrate(db);

const plans = ["team", "free", "lapsed"];
const made = [];

for (const plan of plans) {
  const id = randomUUID();
  const name = `dev-${plan}`;
  const existing = await db.query("SELECT id FROM orgs WHERE name = $1", [name]);
  if (existing.rows.length > 0) {
    made.push({ plan, id: existing.rows[0].id, name, note: "already there" });
    continue;
  }
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, $3)", [id, name, plan]);
  made.push({ plan, id, name, note: "created" });
}

console.log("organizations:");
for (const org of made) {
  console.log(`  ${org.name.padEnd(12)} ${org.plan.padEnd(7)} ${org.id}  (${org.note})`);
}

// Only the entitled organization can hold an upload key — createApiKey refuses
// the others, which is itself worth seeing locally.
const team = made.find((o) => o.plan === "team");
const keyCount = await db.query("SELECT count(*)::int AS n FROM api_keys WHERE org_id = $1", [team.id]);
if (keyCount.rows[0].n === 0) {
  const key = await createApiKey(db, team.id, { kind: "upload", label: "dev-upload-key" });
  console.log(`\nupload key for ${team.name} (shown once, as in production):\n  ${key.plaintext}`);
} else {
  console.log(`\n${team.name} already has ${keyCount.rows[0].n} key(s) — /admin/keys lists them.`);
}

for (const plan of ["free", "lapsed"]) {
  const org = made.find((o) => o.plan === plan);
  try {
    await createApiKey(db, org.id, { kind: "upload", label: "should-not-exist" });
    console.log(`  ⚠ ${org.name} was issued an upload key — entitlement is not being enforced`);
  } catch {
    console.log(`  ${org.name}: refused an upload key, as expected`);
  }
}

const repoId = randomUUID();
const repoExists = await db.query("SELECT id FROM repos WHERE org_id = $1 AND name = 'dev-web'", [team.id]);
const repo = repoExists.rows[0]?.id ?? repoId;
if (!repoExists.rows[0]) {
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'dev-web')", [repo, team.id]);
}

const summary = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  threshold: 0.1,
  totals: { compared: 2, flagged: 1, skipped: 0 },
  frames: [
    { label: "Home", screenshot: "home.png", mode: "fidelity", source: "figma", status: "compared", flagged: true, alignedMismatchPercent: 5.63 },
    { label: "Pricing", screenshot: "pricing.png", mode: "fidelity", source: "figma", status: "compared", flagged: false, alignedMismatchPercent: 0.26 },
  ],
};

// One visible run and one still pending, so the difference between them is
// something you can see rather than something you have to trust.
for (const state of ["committed", "pending"]) {
  const runId = randomUUID();
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state) VALUES ($1,$2,$3,$4,'main',$5,$6)",
    [runId, team.id, repo, `dev-${state}`, JSON.stringify(summary), state]
  );
  // The report page renders from frame_stats, not from the summary blob, so a
  // run without these rows shows "no compared frames" and the page cannot be
  // worked on. Both runs get them — including the pending one, which is how you
  // can see that hiding it is the run's state doing the work rather than an
  // absence of data.
  for (const frame of summary.frames) {
    await db.query(
      `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged)
       VALUES ($1,$2,$3,$4,'fidelity','figma',$5,$6,$7)`,
      [team.id, repo, runId, frame.screenshot, frame.alignedMismatchPercent, frame.flagged ? 61.2 : 98.7, frame.flagged]
    );
  }
  console.log(`run (${state}): /r/${runId}`);
}

console.log("\nAdmin: http://localhost:3000/admin/keys (password: ADMIN_PASSWORD from web/.env.local)");
await db.close();
