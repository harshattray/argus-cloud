#!/usr/bin/env node
//
// Sweep declared uploads that never transferred — PATHWAYS Pathway 2 item 4;
// `BuildV5.md` G2b ("a sweeper deletes pending artifacts older than 15 minutes
// and releases their reservation").
//
//   DATABASE_URL=… node scripts/sweep-uploads.mjs
//   node scripts/sweep-uploads.mjs --older-than 60 --limit 500
//   node scripts/sweep-uploads.mjs --quiet          # print only when it did something
//
// **This must be scheduled before uploads are enabled for customers.** An
// abandoned declaration holds a byte reservation that nothing else releases, so
// without this running the quota only ever tightens: an organization whose CI
// job is killed mid-upload loses that capacity permanently, and a hostile one
// can declare its whole allowance, transfer nothing, and repeat.
//
// It is also the second half of a refused commit. When a plan lapses between
// declare and commit the upload path refuses and deliberately deletes nothing —
// a billing state must not look like data loss — which leaves the rows for this
// sweep to clear on its own schedule.
//
// Exit codes, the same shape as ops-check:
//
//   0  swept cleanly (including "nothing to do")
//   2  the sweep could not run

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const { createDb } = await import(path.join(DIST, "db.js"));
const { createStorage } = await import(path.join(DIST, "storage.js"));
const { sweepAbandonedUploads, ABANDONED_AFTER_MINUTES } = await import(path.join(DIST, "artifactUploads.js"));

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const quiet = args.includes("--quiet");

const olderThanMinutes = Number(value("--older-than") ?? ABANDONED_AFTER_MINUTES);
const limit = Number(value("--limit") ?? 100);

if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < 0) {
  console.error("--older-than must be a non-negative number of minutes");
  process.exit(2);
}

let db;
try {
  db = await createDb();
} catch (err) {
  console.error(`sweep-uploads could not connect: ${String(err.message ?? err)}`);
  process.exit(2);
}

const storage = await createStorage();

try {
  const result = await sweepAbandonedUploads(db, storage, { olderThanMinutes, limit });
  if (!quiet || result.runsSwept > 0) {
    console.log(
      `swept ${result.runsSwept} abandoned run(s), ${result.artifactsDeleted} artifact(s), ` +
        `${result.bytesReleased} byte(s) released (older than ${olderThanMinutes}m, storage: ${storage.driver})`
    );
  }
  // A full batch means there is more waiting. Say so rather than letting a
  // schedule quietly fall behind a backlog it never catches up with.
  if (result.runsSwept === limit) {
    console.log(`  the batch was full (${limit}) — run again, or raise --limit`);
  }
} catch (err) {
  console.error(`sweep-uploads failed: ${String(err.message ?? err)}`);
  await db.close();
  process.exit(2);
}

await db.close();
