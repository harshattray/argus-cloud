#!/usr/bin/env node
//
// Generates a `.webp` beside every screenshot the site displays.
//
// **The problem it solves.** The site's screenshots were served as the raw
// retina PNGs they were captured as. `/how-it-works` alone shipped 2.5 MB of
// them — roughly ninety times the entire JavaScript bundle for that page — so
// the page's weight was almost entirely images and the careful work on the
// bundle was rounding error next to it.
//
// **Resolution is not reduced.** These are screenshots of a product UI with
// small text in them, and downscaling is the one change a reader would notice.
// Measured on `report-fidelity-frame.png`, re-encoding at full size already
// takes 1.33 MB to 111 KB; also halving the width saves a further 47 KB and
// costs legibility on every caption in the shot. The format change is where
// essentially all of the win is, so that is the only change made.
//
// **Two encoders, and the smaller file wins.** A screenshot of flat UI panels
// compresses better losslessly than lossy — `report-explain-findings.png` is
// 105 KB lossless against 184 KB at q82 — while a shot containing photography
// goes the other way by a factor of eight. Encoding both and keeping the
// smaller means every flat screenshot ends up pixel-identical to its PNG *and*
// smaller than the lossy alternative would have been, with no per-file
// judgement to make and no table of exceptions to maintain.
//
// **Why this is not part of `npm run build`.** It shells out to `cwebp`, which
// exists on a developer's machine and not in a Vercel build container. The
// output is committed, the same way the PNGs are, so a deploy needs no encoder.
// `embed-image-sizes.mjs` runs on every build and is what notices the results.
//
//   brew install webp   # or the equivalent; any cwebp ≥ 1.0 will do
//   node scripts/optimise-screenshots.mjs
//
// Re-run it after adding or replacing a screenshot. It is idempotent, and it
// skips any PNG whose `.webp` is already newer than it, so the normal case is
// fast and touches nothing.

import { execFile } from "node:child_process";
import { mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "web", "public");

/**
 * The directories holding screenshots the site renders in an `<img>`.
 *
 * `run/` is deliberately absent: those PNGs are referenced by
 * `public/run/report.html`, a self-contained artifact we serve verbatim rather
 * than a page we generate, so a sibling `.webp` there would never be requested.
 */
const DIRS = ["screens", "cases"];

/** Quality for the lossy candidate. Chosen against the lossless one, below. */
const LOSSY_Q = 82;

async function cwebpAvailable() {
  try {
    await run("cwebp", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Every `.png` under `dir`, recursively. */
async function pngsUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // A directory that does not exist is simply nothing to do.
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await pngsUnder(full)));
    else if (entry.name.toLowerCase().endsWith(".png")) out.push(full);
  }
  return out;
}

const size = async (file) => (await stat(file)).size;

/** True when `webp` exists and is newer than `png`, so there is nothing to do. */
async function upToDate(png, webp) {
  try {
    const [a, b] = await Promise.all([stat(png), stat(webp)]);
    return b.mtimeMs >= a.mtimeMs;
  } catch {
    return false;
  }
}

if (!(await cwebpAvailable())) {
  console.error(
    "optimise-screenshots: `cwebp` not found. Install it (`brew install webp`) and re-run.\n" +
      "Nothing was written. The committed .webp files are unchanged, so the site still builds."
  );
  process.exit(1);
}

const scratch = await mkdtemp(path.join(tmpdir(), "norma-webp-"));
let converted = 0;
let skipped = 0;
let pngBytes = 0;
let webpBytes = 0;

try {
  for (const dir of DIRS) {
    for (const png of await pngsUnder(path.join(PUBLIC, dir))) {
      const webp = png.replace(/\.png$/i, ".webp");
      const rel = path.relative(PUBLIC, png);

      if (await upToDate(png, webp)) {
        skipped++;
        continue;
      }

      const lossy = path.join(scratch, "lossy.webp");
      const lossless = path.join(scratch, "lossless.webp");
      await run("cwebp", ["-quiet", "-q", String(LOSSY_Q), png, "-o", lossy]);
      await run("cwebp", ["-quiet", "-lossless", "-z", "9", png, "-o", lossless]);

      const [lossySize, losslessSize, original] = await Promise.all([
        size(lossy),
        size(lossless),
        size(png),
      ]);

      // Ties go to lossless, so a screenshot that costs nothing extra to keep
      // pixel-perfect is kept pixel-perfect.
      const winner = losslessSize <= lossySize ? lossless : lossy;
      const chosen = Math.min(lossySize, losslessSize);

      if (chosen >= original) {
        // Nothing gained. Leaving the PNG alone is better than shipping a
        // second copy of it under a name that promises it is smaller.
        console.log(`  = ${rel} — PNG already smaller than either encoding, left alone`);
        skipped++;
        continue;
      }

      await rename(winner, webp);
      converted++;
      pngBytes += original;
      webpBytes += chosen;
      const saved = Math.round((1 - chosen / original) * 100);
      console.log(
        `  → ${rel} ${(original / 1024).toFixed(0)}K → ${(chosen / 1024).toFixed(0)}K ` +
          `(-${saved}%, ${winner === lossless ? "lossless" : `q${LOSSY_Q}`})`
      );
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const saved = pngBytes - webpBytes;
console.log(
  `optimise-screenshots: ${converted} converted, ${skipped} already current` +
    (converted > 0
      ? ` — ${(pngBytes / 1024 / 1024).toFixed(2)} MB of PNG becomes ` +
        `${(webpBytes / 1024 / 1024).toFixed(2)} MB of WebP (${(saved / 1024 / 1024).toFixed(2)} MB saved)`
      : "")
);
