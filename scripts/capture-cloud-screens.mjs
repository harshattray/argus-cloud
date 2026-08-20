#!/usr/bin/env node
//
// Photographs every Cloud page, in both themes, from the seeded tenants.
//
//   npm run seed:demo -- --reset          # both tenants, FIRST
//   npm run dev:web                       # then the server, in one terminal
//   npm run capture:cloud                 # then this, in another
//
//   npm run capture:cloud -- --base=http://localhost:57064   # non-default port
//   npm run capture:cloud -- --scale=2                       # retina, ~4× the bytes
//   npm run capture:cloud -- --only=trend                    # one page kind
//   npm run capture:cloud -- --share='/r/<id>?share=<token>' # add the share view
//
// **Seed before you start the server, and re-seed means restart.** File-backed
// PGlite is one writer: the dev server holds `.pgdata` open, so a seed run
// against it while the server is up leaves the two disagreeing — the script
// reads the new ids straight off disk and the server keeps serving the old ones,
// so every URL 404s. The first version of this wrote sixteen screenshots of
// "Not found" without complaining, which is why the guard below exists.
//
// ── What this is for ─────────────────────────────────────────────────────────
//
// The Cloud pages are `NORMA_DEV_OPEN`-gated and 404 in production until Step 6
// ships a session layer (FUTURENORMA §4). So the only way anyone outside this
// laptop sees them before then is a picture, and the pictures were being taken
// by hand — which means the light and dark pairs were captured weeks apart, at
// different widths, against whatever data happened to be seeded that day.
//
// This makes them reproducible: same width, same scale, same tenants, both
// themes, one command. Re-run it after a visual change and the whole set moves
// together.
//
// ── Where they go, and where they do not ─────────────────────────────────────
//
// `docs/screenshots/cloud/`, **not** `web/public/`. Anything under `public/` is
// served by the deployed site at a guessable URL, and these are pictures of an
// unlaunched product surface behind a dev-only gate. Moving a chosen shot into
// `web/public/screens/` is a deliberate act for a page that is going to display
// it — the marketing site already does exactly that for the CLI report — and
// `npm run optimise-screenshots` is the step that follows.
//
// ── The pages come from the database, not from a list here ───────────────────
//
// Run and repository ids are UUIDs minted by the seed, so a hard-coded list of
// URLs would be stale the first time anyone re-seeded. The script reads the two
// seeded organizations, finds their repositories, runs and frames, and derives
// the URLs. Nothing is written back.

import path from "node:path";
import { mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "screenshots", "cloud");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = (flag("base", process.env.NORMA_CAPTURE_BASE ?? "http://localhost:3000")).replace(/\/$/, "");
const SCALE = Number(flag("scale", "1"));
const WIDTH = Number(flag("width", "1440"));
const ONLY = flag("only", "");

/**
 * How tall a full-page shot may be.
 *
 * A run report of seven full-page captures is 20,000px of image, which is a
 * 12 MB PNG that nobody can look at and no slide can hold. Past this the shot is
 * clipped from the top and the name says `-top`, because a clipped picture that
 * announces itself beats a complete one that cannot be used.
 */
const MAX_HEIGHT = 7000;

// ---------------------------------------------------------------------------
// Which pages exist, read out of the seeded data.
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL?.trim() && !process.env.PGLITE_DATA_DIR?.trim()) {
  // The same trap `seed-demo` documents: PGLITE_DATA_DIR lives in web/.env.local,
  // which Next loads and a repo-root script does not. Without this the script
  // opens an empty in-memory database and reports that nothing is seeded.
  process.env.PGLITE_DATA_DIR = path.join(ROOT, ".pgdata");
}

const { createDb } = await import(path.join(DIST, "db.js"));
const db = await createDb();

/** The seeded tenants, by the prefix each one's name carries. */
const TENANTS = [
  { prefix: "DEMO —", slug: "demo" },
  { prefix: "REAL —", slug: "real" },
];

const shots = [];

for (const tenant of TENANTS) {
  const org = (
    await db.query("SELECT id, name FROM orgs WHERE name LIKE $1 ORDER BY created_at LIMIT 1", [
      `${tenant.prefix}%`,
    ])
  ).rows[0];
  if (!org) {
    console.log(`skipping ${tenant.slug}: no organization whose name starts "${tenant.prefix}"`);
    continue;
  }

  // The repository with the most runs. Alphabetical order picked `bose-landing`,
  // which holds exactly one run — so the repository page had a one-row table and
  // the trend page had nothing to draw, since a sparkline needs two points.
  const repo = (
    await db.query(
      `SELECT p.id, p.name, COUNT(r.id) AS runs
         FROM repos p
         LEFT JOIN runs r ON r.repo_id = p.id AND r.state = 'committed'
        WHERE p.org_id = $1
        GROUP BY p.id, p.name
        ORDER BY runs DESC, p.name
        LIMIT 1`,
      [org.id]
    )
  ).rows[0];
  if (!repo) {
    continue;
  }

  /*
   * Two runs, not one: a flagged one and a clean one.
   *
   * **Complete triptych first.** "Most images" was the first heuristic and it
   * picked the wrong run — case 03 has seven diff overlays and no captures, so
   * it beat a run carrying build, reference *and* diff, and the screenshot
   * showed a lone "Difference" pane where the report's whole argument is the
   * three side by side. Distinct *kinds* decide it; volume only breaks the tie.
   *
   * **Then flagged, and separately not flagged.** With that fixed the winner was
   * `s6-control-no-change` — seven frames, nothing over threshold — which is a
   * correct page and a poor picture of what the product finds. But it is not a
   * picture to discard either: "a clean report is a real result, not an empty
   * one" is in the glossary, and a prospect asking what a good day looks like is
   * asking a fair question. `web/public/screens/` already keeps
   * `report-clean-*` and `report-flagged-*` for the CLI report; this is the same
   * pair for the hosted one.
   */
  const runsByInterest = (
    await db.query(
      `SELECT r.id,
              COUNT(a.id) AS images,
              COUNT(DISTINCT a.kind) FILTER (WHERE a.kind IN ('build','reference','diff')) AS kinds,
              COUNT(DISTINCT s.frame) FILTER (WHERE s.flagged) AS flagged,
              COUNT(DISTINCT s.frame) AS frames
         FROM runs r
         LEFT JOIN run_artifacts a ON a.run_id = r.id AND a.state = 'committed'
         LEFT JOIN frame_stats s ON s.run_id = r.id
        WHERE r.org_id = $1 AND r.state = 'committed'
        GROUP BY r.id, r.created_at
       HAVING COUNT(a.id) > 0
        ORDER BY kinds DESC, images DESC, r.created_at DESC`,
      [org.id]
    )
  ).rows;

  const best = runsByInterest[0];
  // Same completeness as the best run — otherwise "clean" would quietly become
  // "the run with no images", which is a different page.
  const equallyComplete = runsByInterest.filter(
    (r) => r.kinds === best?.kinds && r.images === best?.images
  );
  const run = equallyComplete.slice().sort((a, b) => Number(b.flagged) - Number(a.flagged))[0];
  const calm = equallyComplete.slice().sort((a, b) => Number(a.flagged) - Number(b.flagged))[0];

  /*
   * The frame worth charting: longest history first, then the one that has
   * actually moved.
   *
   * Length alone is not enough. Every demo frame has the same twelve runs, so
   * the tiebreak decided it — and alphabetical order picked `cart.png`, the
   * frame seeded deliberately flat to prove a calm repository looks calm. A
   * dead-level line is the correct rendering of that frame and the worst
   * possible picture of a trend chart.
   */
  const frame = (
    await db.query(
      `SELECT frame, COUNT(*) AS runs, COUNT(*) FILTER (WHERE flagged) AS flagged
         FROM frame_stats
        WHERE org_id = $1 AND repo_id = $2
        GROUP BY frame
        ORDER BY runs DESC, flagged DESC, frame
        LIMIT 1`,
      [org.id, repo.id]
    )
  ).rows[0];

  shots.push({
    kind: "repo",
    slug: `${tenant.slug}-repository`,
    url: `/repos/${repo.id}`,
    caption: `${org.name} — repository view (${repo.name})`,
  });
  if (frame) {
    shots.push({
      kind: "trend",
      slug: `${tenant.slug}-trend`,
      url: `/repos/${repo.id}/trend?frame=${encodeURIComponent(frame.frame)}`,
      caption: `${org.name} — frame trend (${frame.frame}, ${frame.runs} runs)`,
    });
  }
  if (run) {
    /*
     * The name says what the picture contains, not what it was chosen for.
     *
     * The first cut always wrote `-flagged` for the best run. In a tenant whose
     * only image-bearing run happens to flag nothing, that produced
     * `demo-run-report-flagged-light.png` showing a page with zero flagged
     * frames — a file somebody drops into a deck under a label the image
     * contradicts. Same rule as the "Not found" guard below: a screenshot must
     * never be filed as something it is not.
     */
    shots.push({
      kind: "report",
      slug: `${tenant.slug}-run-report-${Number(run.flagged) > 0 ? "flagged" : "clean"}`,
      url: `/r/${run.id}`,
      caption: `${org.name} — run report, owner view · ${run.flagged} of ${run.frames} frames flagged`,
    });
    if (calm && calm.id !== run.id && Number(calm.flagged) === 0) {
      shots.push({
        kind: "report",
        slug: `${tenant.slug}-run-report-clean`,
        url: `/r/${calm.id}`,
        caption: `${org.name} — run report where nothing was flagged (0 of ${calm.frames}). A clean report is a result, not an empty page.`,
      });
    }
    shots.push({
      kind: "explainer",
      slug: `${tenant.slug}-run-report-explainer`,
      url: `/r/${run.id}`,
      // Opens one definition before shooting, so the set contains a picture of
      // the feature rather than only of the "?" that hides it.
      openPopover: "x-run-worst-mismatch",
      viewportOnly: true,
      caption: `${org.name} — a definition open on the run report`,
    });
  }
}

// The share view is its own page: no breadcrumb, no Explain buttons, no share
// panel. It is what a designer receives, and it is the one Cloud surface that
// looks different to its owner — worth a picture of its own.
const shared = (
  await db.query(
    `SELECT run_id FROM share_links WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC LIMIT 1`
  )
).rows[0];

await db.close();

if (shots.length === 0) {
  console.error("Nothing to capture — no seeded organizations found.");
  console.error("  Run: npm run seed:demo -- --reset");
  process.exit(2);
}

/*
 * The share view has to be asked for, because only a share *token* can produce
 * it and only a hash of one is stored — that is the point of the table. The seed
 * prints the token once; paste that path here to add the shot:
 *
 *   npm run capture:cloud -- --share='/r/<id>?share=<token>'
 *
 * Photographing `/r/<id>` through the `NORMA_DEV_OPEN` door instead would render
 * the *owner* view — breadcrumb, Explain buttons, share panel — and filing it
 * under "share view" would misrepresent the one surface whose whole character is
 * what it withholds.
 */
const SHARE = flag("share", "");
if (SHARE) {
  shots.push({
    kind: "share",
    slug: "share-view",
    url: SHARE.startsWith("/") ? SHARE : `/${SHARE}`,
    caption: "Share view — what someone sent a link receives: no breadcrumb, no Explain, no share panel",
  });
} else if (shared) {
  console.log(`note: run ${shared.run_id} has a share link. Pass --share='/r/…?share=…' to photograph it.`);
}

const wanted = ONLY ? shots.filter((s) => s.kind === ONLY || s.slug.includes(ONLY)) : shots;
if (wanted.length === 0) {
  console.error(`--only=${ONLY} matched none of: ${[...new Set(shots.map((s) => s.kind))].join(", ")}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The browser.
// ---------------------------------------------------------------------------
//
// `playwright-core` plus the Chrome already on this machine, the same ladder
// `Argus/src/browser.ts` uses. Deliberately not `playwright`, which downloads
// its own ~150 MB browser build: this script runs on a developer's laptop, next
// to a dev server, and that machine has a browser.

const { chromium } = await import("playwright-core");

const CANDIDATES = [
  ...(process.env.NORMA_BROWSER_PATH
    ? [{ label: `NORMA_BROWSER_PATH`, options: { executablePath: process.env.NORMA_BROWSER_PATH } }]
    : []),
  { label: "Chrome", options: { channel: "chrome" } },
  { label: "Edge", options: { channel: "msedge" } },
];

let browser = null;
let launchedWith = "";
for (const candidate of CANDIDATES) {
  try {
    browser = await chromium.launch(candidate.options);
    launchedWith = candidate.label;
    break;
  } catch {
    // Try the next one. Only the last failure is worth reporting.
  }
}
if (!browser) {
  console.error("No browser to drive. Install Chrome or Edge, or set NORMA_BROWSER_PATH.");
  process.exit(2);
}

// Fail on an unreachable server before opening thirty pages against it.
{
  const probe = await browser.newPage();
  const res = await probe.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }).catch(() => null);
  await probe.close();
  if (!res) {
    console.error(`Nothing answering at ${BASE}.`);
    console.error("  Start the dev server first: npm run dev:web");
    console.error("  If it landed on another port, pass --base=http://localhost:<port>");
    await browser.close();
    process.exit(2);
  }
}

await mkdir(OUT, { recursive: true });

const THEMES = ["light", "dark"];
const written = [];

for (const shot of wanted) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: 900 },
      deviceScaleFactor: SCALE,
      // Belt and braces. The cookie decides the theme, but the *auto* state
      // falls through to the device — and a machine in dark mode would then
      // photograph a "light" page dark if the cookie were ever ignored.
      colorScheme: theme,
    });
    // `readTheme()` reads this before the first byte, so the page arrives in the
    // right theme rather than repainting into it. That is the whole reason the
    // preference is a cookie (`web/lib/theme.ts`) and it is what makes a
    // screenshot of it trustworthy.
    await context.addCookies([
      { name: "norma-theme", value: theme, url: BASE },
    ]);
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });

    /*
     * Never write a screenshot of a page that did not load.
     *
     * The `/r/` and `/repos/` trees answer "not found" for absent, revoked,
     * expired and another org's data alike — deliberately, so a probe learns
     * nothing (`reportData.authorize`). That same silence means a stale id
     * produces a page that renders perfectly and says nothing useful, and the
     * script has no way to tell it from the real thing except by reading it.
     *
     * A file named `real-run-report-light.png` containing the words "Not found"
     * is worse than no file: it is a picture somebody will put in a deck.
     */
    const heading = (await page.locator("h1").first().textContent().catch(() => ""))?.trim() ?? "";
    if (/not found/i.test(heading)) {
      console.error(`\n${BASE}${shot.url} answered "${heading}".`);
      console.error("  The server and the database disagree about what exists.");
      console.error("  Almost always: the tenants were re-seeded while the dev server was running.");
      console.error("  File-backed PGlite is one writer — restart `npm run dev:web` and re-run this.");
      console.error("  (If the pages 404 generally, NORMA_DEV_OPEN=1 is missing from web/.env.local.)");
      await context.close();
      await browser.close();
      process.exit(1);
    }

    if (shot.openPopover) {
      await page.evaluate((id) => {
        document.querySelector(`button[popovertarget="${id}"]`)?.click();
      }, shot.openPopover);
      await page.waitForTimeout(150);
    }

    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const clipped = !shot.viewportOnly && height > MAX_HEIGHT;
    const name = `${shot.slug}${clipped ? "-top" : ""}-${theme}.png`;
    await page.screenshot({
      path: path.join(OUT, name),
      ...(shot.viewportOnly
        ? {}
        : clipped
          ? { clip: { x: 0, y: 0, width: WIDTH, height: MAX_HEIGHT } }
          : { fullPage: true }),
    });
    written.push({ name, theme, ...shot, clipped, height });
    console.log(`  ${name}`);
    await context.close();
  }
}

await browser.close();

// ---------------------------------------------------------------------------
// A manifest, so a picture six weeks from now still says what it is.
// ---------------------------------------------------------------------------

const sizes = new Map();
for (const file of await readdir(OUT)) {
  if (file.endsWith(".png")) {
    sizes.set(file, (await stat(path.join(OUT, file))).size);
  }
}

/** How much of the page a shot contains. Three cases, and they are not the same. */
const extentOf = (w) =>
  w.viewportOnly
    ? `viewport only (${WIDTH}\u00d7900 of ${w.height}px)`
    : w.clipped
      ? `clipped at ${MAX_HEIGHT}px of ${w.height}px`
      : "full page";

const rows = written
  .map(
    (w) =>
      `| \`${w.name}\` | ${w.theme} | ${w.caption} | ${extentOf(w)} | ${((sizes.get(w.name) ?? 0) / 1024).toFixed(0)} KB |`
  )
  .join("\n");

await writeFile(
  path.join(OUT, "README.md"),
  `# Cloud screenshots

Generated by \`npm run capture:cloud\`. Do not edit by hand — re-run it.

Captured ${new Date().toISOString().slice(0, 10)} at ${WIDTH}px, scale ${SCALE}, from \`${BASE}\`.

**These are pictures of seeded tenants, and the two are not the same kind of
thing.** \`demo-*\` shots come from \`DEMO — Northwind Retail (sample data)\`:
every number in them is invented, and the organization name on screen says so.
\`real-*\` shots come from \`REAL — Normascope's own runs (measured)\`: every
number, image and finding in them came out of \`norma-scope\` on a real site and
is recorded in this repository. Do not describe a demo shot as a measurement.

They live here rather than in \`web/public/\` on purpose: the Cloud pages are
behind \`NORMA_DEV_OPEN\` and 404 in production, so nothing should be serving
pictures of them at a guessable URL. Moving one to \`web/public/screens/\` is a
deliberate step for a page that will display it, followed by
\`npm run optimise-screenshots\`.

| File | Theme | What it shows | Extent | Size |
|---|---|---|---|---|
${rows}
`,
  "utf-8"
);

console.log(`\n${written.length} shots → docs/screenshots/cloud/  (browser: ${launchedWith})`);
console.log("  docs/screenshots/cloud/README.md says what each one is.");
