#!/usr/bin/env node
//
// Dependency audit with a decision log — PATHWAYS §"Security release gate"
// ("dependency and secret scanning in CI").
//
// Plain `npm audit --audit-level=high` is red today and would stay red until
// someone takes the next 15 → 16 decision. A check that is permanently red is a
// check nobody reads, and the honest fix is not to lower the threshold — it is
// to separate **known and decided** from **new and unexamined**.
//
// This fails on:
//
//   1. any high/critical advisory not in security/audit-allowlist.json;
//   2. any allowlist entry that no longer appears — so the file cannot rot into
//      a list of things that stopped being true;
//   3. any allowlist entry past its reviewBy date — so an accepted risk cannot
//      quietly become a permanent one.
//
// Accepted entries are printed on every run. The point is that they stay
// visible, not that they go away.
//
//   node scripts/audit-check.mjs

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST = path.join(ROOT, "security", "audit-allowlist.json");
const FAIL_AT = new Set(["high", "critical"]);

/** `npm audit` exits non-zero when it finds anything, so the code is ignored. */
function npmAuditJson() {
  return new Promise((resolve, reject) => {
    execFile(
      "npm",
      ["audit", "--omit=dev", "--json"],
      { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (!stdout) {
          reject(err ?? new Error("npm audit produced no output"));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}

const today = new Date().toISOString().slice(0, 10);
const allowlist = JSON.parse(await readFile(ALLOWLIST, "utf-8"));
const accepted = new Map(allowlist.accepted.map((entry) => [entry.package, entry]));

const report = await npmAuditJson();
const found = Object.values(report.vulnerabilities ?? {}).filter((v) => FAIL_AT.has(v.severity));

const problems = [];
const seen = new Set();

for (const vuln of found) {
  seen.add(vuln.name);
  const entry = accepted.get(vuln.name);
  if (!entry) {
    problems.push(
      `NEW  ${vuln.name} (${vuln.severity}) — not in the allowlist. Fix it, or add an entry with a reason, an owner and a reviewBy date.`
    );
    continue;
  }
  if (entry.severity !== vuln.severity) {
    problems.push(
      `CHANGED  ${vuln.name} was accepted at ${entry.severity} and is now ${vuln.severity}. Re-decide before accepting it again.`
    );
    continue;
  }
  if (!entry.reviewBy || entry.reviewBy < today) {
    problems.push(
      `EXPIRED  ${vuln.name} was accepted on ${entry.acceptedOn} for review by ${entry.reviewBy ?? "never"}. That date has passed — take the decision again.`
    );
    continue;
  }
  // `acceptedBy: null` means the reasoning was written but nobody has signed
  // it off. It still passes — blocking every build on a pending signature is
  // how a check gets bypassed — but it says so every single run, because an
  // unconfirmed decision quietly reading as a settled one is the failure mode
  // this whole file exists to avoid.
  const state = entry.acceptedBy ? `accepted by ${entry.acceptedBy}` : "UNCONFIRMED — proposed, not signed off";
  console.log(`${entry.acceptedBy ? "accepted " : "UNCONFIRMED"}  ${vuln.name} (${vuln.severity}, ${state}, review by ${entry.reviewBy}) — ${entry.reason}`);
}

for (const entry of allowlist.accepted) {
  if (!seen.has(entry.package)) {
    problems.push(
      `STALE  ${entry.package} is in the allowlist but no longer reported. Remove the entry — a list of things that stopped being true is how a real one gets ignored.`
    );
  }
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `\naudit: ${found.length} high/critical in production dependencies ` +
    `(${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low)`
);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  console.error(`\nAllowlist: ${path.relative(ROOT, ALLOWLIST)}`);
  process.exit(1);
}

console.log(`${found.length === 0 ? "clean" : "all known and within their review dates"}`);
