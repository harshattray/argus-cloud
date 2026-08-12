#!/usr/bin/env node
//
// Runs every suite in test/.
//
// **Why this replaced a chain of `&&` in package.json.** The chain named each
// suite by hand, which made adding one a two-step job: write the file, then
// remember to register it. A suite nobody registered is a suite nobody runs,
// and this repo's Doctrine 3 is that an unrun suite is an open risk, not a
// pass — the same argument that put CI in place. Discovery removes the step
// that can be forgotten.
//
// Two smaller things the chain got wrong:
//
//   - `&&` stops at the first failure, so a change that breaks three suites
//     shows you one, and you find the next only after fixing it.
//   - The total check count is quoted all over `FUTURENORMA.md` and
//     `FinishedSPEC.md` and had to be recovered with `grep -c PASS`. It is
//     printed here.
//
// **Order is alphabetical, and deliberately arbitrary.** The suites share one
// database when DATABASE_URL is set, so a suite that only passes in a
// particular position is not passing — it is borrowing state from whatever ran
// before it. That is not hypothetical: `budgetAlerts` B2 reset the day's spend
// but not the outstanding reservations, and read $0.08 that `providerBudget`
// had left behind. Fixing the order would have hidden it. A stable arbitrary
// order means nobody can quietly come to depend on one.
//
// Sequential, never parallel, for the same reason: one shared database.
//
//   node scripts/run-tests.mjs           # all suites, report every failure
//   node scripts/run-tests.mjs --bail    # stop at the first failing suite
//   node scripts/run-tests.mjs rate prov # only suites whose name matches

import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIR = path.join(ROOT, "test");

const args = process.argv.slice(2);
const bail = args.includes("--bail");
const filters = args.filter((a) => !a.startsWith("--"));

const suites = (await readdir(TEST_DIR))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()
  .filter((f) => filters.length === 0 || filters.some((needle) => f.includes(needle)));

if (suites.length === 0) {
  console.error(filters.length ? `no suite matches ${filters.join(", ")}` : "no suites found in test/");
  process.exit(1);
}

const realPg = Boolean(process.env.DATABASE_URL?.trim());
console.log(`Running ${suites.length} suite(s) against ${realPg ? "a real Postgres server" : "PGlite"}\n`);

/**
 * Runs one suite, streaming its output through unchanged while counting the
 * check lines it prints. Streaming matters: a 20-process concurrency test can
 * take a while, and swallowing its output until it finishes makes a slow suite
 * indistinguishable from a hung one.
 */
function runSuite(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(TEST_DIR, file)], {
      cwd: ROOT,
      env: process.env,
      stdio: ["inherit", "pipe", "inherit"],
    });
    let passed = 0;
    let failed = 0;
    let tail = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      const text = tail + chunk.toString();
      const lines = text.split("\n");
      // The last element may be a partial line; hold it for the next chunk so
      // a count is never missed or doubled at a buffer boundary.
      tail = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("PASS")) passed++;
        else if (line.startsWith("FAIL")) failed++;
      }
    });
    child.on("close", (code) => {
      if (tail.startsWith("PASS")) passed++;
      else if (tail.startsWith("FAIL")) failed++;
      resolve({ file, code: code ?? 1, passed, failed, ms: Date.now() - started });
    });
  });
}

const results = [];
for (const file of suites) {
  const result = await runSuite(file);
  results.push(result);
  if (result.code !== 0 && bail) {
    console.log(`\n--bail: stopping after ${file}`);
    break;
  }
}

const name = (f) => f.replace(/\.test\.mjs$/, "");
const width = Math.max(...results.map((r) => name(r.file).length));
const broken = results.filter((r) => r.code !== 0);
const totalPassed = results.reduce((s, r) => s + r.passed, 0);
const totalFailed = results.reduce((s, r) => s + r.failed, 0);

console.log("\n" + "─".repeat(width + 30));
for (const r of results) {
  const status = r.code === 0 ? "ok  " : "FAIL";
  // A suite can exit non-zero without a FAIL line — a thrown error, a bad
  // import. Reporting only the check counts would call that a pass.
  const counts = r.failed > 0 ? `${r.passed} passed, ${r.failed} failed` : `${r.passed} passed`;
  console.log(`${status}  ${name(r.file).padEnd(width)}  ${counts.padEnd(22)} ${(r.ms / 1000).toFixed(1)}s`);
}
console.log("─".repeat(width + 30));

const skipped = suites.length - results.length;
if (broken.length === 0) {
  console.log(`${totalPassed} checks green across ${results.length} suites (${realPg ? "real Postgres" : "PGlite"})`);
  process.exit(0);
}
// Counting only failing check lines would undercount a suite that died before
// printing one — a thrown error or a bad import fails no check and breaks
// everything. Suites are the headline; checks are the detail.
const died = broken.filter((r) => r.failed === 0).map((r) => name(r.file));
console.log(
  `${broken.length} suite(s) failed: ${broken.map((r) => name(r.file)).join(", ")}` +
    (totalFailed > 0 ? ` — ${totalFailed} failing check(s)` : "") +
    (died.length > 0 ? ` — ${died.join(", ")} exited without reporting a check, so look at the error above` : "") +
    (skipped > 0 ? ` — ${skipped} suite(s) not run (--bail)` : "")
);
process.exit(1);
