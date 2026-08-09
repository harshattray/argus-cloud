// Reproduces the baseline-mode sensitivity finding.
//
//   node threshold-sweep.mjs
//
// before.png / after.png are two captures of the same page section
// (#pull-requests on the portfolio /@norma route), browser-vs-browser,
// identical dimensions. Between them, one commit changed:
//   - bg-[#ece6e0] -> bg-[#e3d9d1]   (whole-section background)
//   - font-black   -> font-bold      (49 occurrences, 176 elements)
//
// Both changes were confirmed live in the browser before capture:
//   getComputedStyle(#pull-requests).backgroundColor === "rgb(227, 217, 209)"
//   document.querySelectorAll(".font-black").length === 0
//
// PIXELMATCH_OPTIONS in src/diff.ts ships threshold: 0.15.

import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/Users/harsha/Documents/Tal/Argus/");
const pixelmatchMod = require("pixelmatch");
const pixelmatch = pixelmatchMod.default ?? pixelmatchMod;
const { PNG } = require("pngjs");

const a = PNG.sync.read(fs.readFileSync(new URL("./before.png", import.meta.url)));
const b = PNG.sync.read(fs.readFileSync(new URL("./after.png", import.meta.url)));

if (a.width !== b.width || a.height !== b.height) {
  throw new Error("dimension mismatch — the sweep assumes an aligned pair");
}

const total = a.width * a.height;
console.log(`${a.width}x${a.height} (${total} px)\n`);
console.log("threshold  mismatched px      %");

for (const threshold of [0.15, 0.1, 0.05, 0.04, 0.03, 0.02, 0.01, 0]) {
  const n = pixelmatch(a.data, b.data, undefined, a.width, a.height, {
    threshold,
    includeAA: false,
    alpha: 0.1,
  });
  const marker = threshold === 0.15 ? "   <- shipped default" : "";
  console.log(
    `${String(threshold).padEnd(10)} ${String(n).padStart(9)}  ${((n / total) * 100).toFixed(2).padStart(6)}%${marker}`,
  );
}
