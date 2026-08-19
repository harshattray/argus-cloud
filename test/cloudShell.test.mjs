// The Cloud surface's chrome — theme, breadcrumbs, logos, and the demo tenant.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/cloudShell.test.mjs
//
// **What this suite can and cannot prove.** These are React server components
// and nothing here renders them, so what is checked is the parts that can be
// wrong without anybody noticing: the theme cookie's three states, the CSS
// cascade that implements them, which surfaces are allowed to name a tenant,
// and the axis-label rule. Layout and the actual light/dark appearance were
// checked in a browser against a production build — `FinishedSPEC.md` §3v.
//
// Two counter-tests, in the sense of CLAUDE.md rule 3:
//
//   S1.4b — the two-state theme cascade, without the `:not([data-theme="light"])`
//           guard. It works in one direction and silently ignores the switch in
//           the other, which reads as "the toggle is broken sometimes".
//   S3.2b — commit labels at a fixed 7 characters. Six distinct commits render
//           as one repeated string, and the chart looks like six readings of the
//           same commit.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const WEB = path.join(ROOT, "web");

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { repoOrg, repoOverview } = await import(path.join(DIST, "trendData.js"));
const { authorize, loadRun } = await import(path.join(DIST, "reportData.js"));
const { createFilesystemStorage } = await import(path.join(DIST, "storage/filesystem.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/** CSS with comments stripped. §3t records why: a regex that matches the prose
 *  above a rule will happily "find" a directive nobody wrote. */
const decomment = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

// ═══ S1 — the theme has three states, and the cascade implements all three ═══
{
  const css = decomment(await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8"));

  check("S1.1", /\.surface\s*\{[^}]*--page-bg:/.test(css),
    "every token has a definition on the bare .surface, so light needs no media query");

  const mediaGuarded = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\.surface:not\(\[data-theme="light"\]\)/.test(css);
  check("S1.2", mediaGuarded,
    "the device-dark rules are guarded by :not([data-theme=\"light\"]) — an explicit light choice wins");

  const explicitDark = /\.surface\[data-theme="dark"\]\s*\{[^}]*--page-bg:/.test(css);
  check("S1.3", explicitDark,
    "an explicit dark choice has its own block, so it wins on a light device");

  // Order matters as much as presence: the explicit-dark block has to come
  // after the media block or it loses to it at equal specificity.
  const mediaAt = css.indexOf("prefers-color-scheme: dark");
  const darkAt = css.indexOf('.surface[data-theme="dark"]');
  check("S1.4", mediaAt !== -1 && darkAt > mediaAt,
    "the explicit-dark block is declared after the media block, so it can win");

  // S1.4b — the two-state cascade, evaluated by hand against the four cases a
  // real viewer can be in. Guard removed, everything else the same.
  {
    const resolve = (device, choice, guarded) => {
      let bg = "light";
      if (device === "dark" && (!guarded || choice !== "light")) bg = "dark";
      if (choice === "dark") bg = "dark";
      return bg;
    };
    const cases = [
      ["dark", "light"],
      ["light", "dark"],
      ["dark", null],
      ["light", null],
    ];
    const good = cases.map(([d, c]) => resolve(d, c, true)).join(",");
    const naive = cases.map(([d, c]) => resolve(d, c, false)).join(",");
    check("S1.4b", good === "light,dark,dark,light" && naive !== good,
      `counter-test: unguarded cascade gives ${naive}; a viewer on a dark device who picks light stays dark`);
  }

  // Both ground-dependent assets are rendered and one is hidden, and the hidden
  // one must be display:none — anything else leaves it in the accessibility
  // tree and a screen reader announces the wordmark twice.
  check("S1.5", /\.onDark\s*\{\s*display:\s*none/.test(css) && /\.onLight\s*\{\s*display:\s*inline-flex/.test(css),
    "the dark-ground asset is display:none by default, not merely invisible");
  check("S1.6", /\.surface\[data-theme="dark"\]\s+\.onLight\s*\{\s*display:\s*none/.test(css),
    "and the swap is wired for the explicit dark choice too");
}

// ═══ S2 — the theme cookie ═══
{
  const route = decomment(await readFile(path.join(WEB, "app/api/theme/route.ts"), "utf-8"));
  check("S2.1", /export async function POST/.test(route) && !/export async function GET/.test(route),
    "the theme is set by POST only — a side-effecting GET would be flipped by any prefetcher");
  check("S2.2", /sec-fetch-site/.test(route) && /origin/.test(route),
    "cross-origin posts are refused on Sec-Fetch-Site, with Origin as the fallback");
  check("S2.3", /startsWith\("\/\/"\)/.test(route),
    "the redirect target rejects protocol-relative URLs — otherwise this is an open redirect");
  check("S2.4", /status:\s*303/.test(route),
    "303, so the browser follows with GET and the back button does not re-post");
  check("S2.5", /HttpOnly/.test(route) && /SameSite=Lax/.test(route),
    "the cookie is HttpOnly and SameSite=Lax");
  check("S2.6", /NODE_ENV === "production"[\s\S]{0,40}Secure/.test(route),
    "and Secure in production");

  const lib = decomment(await readFile(path.join(WEB, "lib/theme.ts"), "utf-8"));
  check("S2.7", /value === "light" \|\| value === "dark"/.test(lib),
    "anything unrecognised in the cookie resolves to null — a stale value falls back to the device");
}

// ═══ S3 — axis labels tell runs apart ═══
{
  // The rule, reimplemented here exactly as `trend-chart.tsx` states it, so the
  // suite is checking the rule rather than importing the answer. The component
  // is a .tsx module the test runner cannot load.
  const commitLabels = (shas) => {
    const distinct = new Set(shas.filter((s) => s !== ""));
    let length = 12;
    for (let n = 7; n <= 12; n++) {
      if (new Set([...distinct].map((s) => s.slice(0, n))).size === distinct.size) {
        length = n;
        break;
      }
    }
    return shas.map((s) => (s ? s.slice(0, length) : "—"));
  };

  const realish = ["a1b2c3d4e5f6", "b2c3d4e5f6a7", "c3d4e5f6a7b8"];
  check("S3.1", commitLabels(realish).every((l) => l.length === 7),
    "distinct real shas keep git's familiar 7-character short form");

  // The case that was actually on screen: six commits sharing a 7-char prefix.
  const colliding = ["mode000001", "mode000002", "mode000003", "mode000004", "mode000005", "mode000006"];
  const labels = commitLabels(colliding);
  check("S3.2", new Set(labels).size === 6,
    `six distinct commits get six distinct labels (${labels[0]}…${labels[5]})`);

  // S3.2b — the fixed slice that shipped first.
  const naive = colliding.map((s) => s.slice(0, 7));
  check("S3.2b", new Set(naive).size === 1,
    `counter-test: a fixed 7-character slice renders all six as "${naive[0]}"`);

  check("S3.3", commitLabels(["abc", ""])[1] === "—",
    "a run with no commit gets an em dash, not an empty label");

  // A re-run of the same commit is genuinely the same commit. Identical labels
  // are the truth here, not a collision to break.
  const rerun = commitLabels(["aaaaaaaaaaaa", "aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
  check("S3.4", rerun[0] === rerun[1] && rerun[0] !== rerun[2],
    "two runs on one commit share a label, because they share a commit");
}

// ═══ S4 — a tenant is named only where a tenant may be named ═══
{
  const db = await createDb();
  await migrate(db);
  const storage = createFilesystemStorage({
    root: await (await import("node:fs/promises")).mkdtemp(path.join((await import("node:os")).tmpdir(), "norma-shell-")),
    publicBaseUrl: "http://localhost:3000/api/blob",
    signingSecret: "test-secret-for-cloud-shell",
  });

  delete process.env.NORMA_DEV_OPEN;

  const orgId = randomUUID();
  const orgName = `DEMO — Shell Test ${randomUUID().slice(0, 8)} (sample data)`;
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1,$2,'team')", [orgId, orgName]);
  const repoId = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1,$2,'shell-repo')", [repoId, orgId]);
  const runId = randomUUID();
  await db.query(
    `INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state)
     VALUES ($1,$2,$3,'abc1234567','main',$4,'committed')`,
    [runId, orgId, repoId, JSON.stringify({ schemaVersion: 2, threshold: 0.1, frames: [] })]
  );
  await db.query(
    `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged)
     VALUES ($1,$2,$3,'home.png','baseline','baseline',0.4,97,true)`,
    [orgId, repoId, runId]
  );

  const owner = await repoOrg(db, repoId);
  check("S4.1", owner.orgName === orgName,
    "the repository view can name its organization, which is the top of the breadcrumb");

  const report = await loadRun(db, storage, runId, { viewer: "owner", expiresAt: null });
  check("S4.2", report.orgName === orgName && report.repoName === "shell-repo",
    "so can the run report");
  check("S4.3", report.repoId === repoId, "and it carries the repository id the breadcrumb links to");

  // The page renders the trail for owners only. That is a decision in the page,
  // not in the data — so this asserts the reason it holds: the fields exist for
  // both viewers, and the *share* branch must not use them.
  const page = decomment(await readFile(path.join(WEB, "app/r/[runId]/page.tsx"), "utf-8"));
  check("S4.4", /access\.viewer === "owner"\s*\?\s*\[/.test(page),
    "the run report builds a breadcrumb only for owner views");
  check("S4.5", /:\s*\[\];/.test(page), "and hands a share viewer an empty one");

  const shell = decomment(await readFile(path.join(WEB, "app/_components/cloud/cloud-shell.tsx"), "utf-8"));
  check("S4.6", /crumbs\.length > 0 &&/.test(shell),
    "and the shell renders no breadcrumb element at all when the list is empty");

  await db.close();
}

// ═══ S5 — the demo tenant announces itself ═══
{
  const seed = await readFile(path.join(ROOT, "scripts/seed-demo.mjs"), "utf-8");

  check("S5.1", /const ORG_NAME = "DEMO — .*\(sample data\)"/.test(seed),
    "the demo organization's name says DEMO and says sample data");
  check("S5.2", /REPOS = \["demo-/.test(seed),
    "its repositories are prefixed demo-");
  check("S5.3", /SAMPLE FINDING \(demo data, not a real analysis\)/.test(seed),
    "its seeded finding says it is not a real analysis");
  check("S5.4", /demo-sample-not-a-real-model-call/.test(seed),
    "and the model column records that no model was called");

  // The refusal that matters most: this writes invented numbers into
  // `usage_events` and `credit_grants`, which are the ledgers every
  // customer-facing figure traces to.
  check("S5.5", /seed-demo refuses to run against a hosted database/.test(seed),
    "it refuses to run against a hosted database");
  // Substring, not a regex: the thing being looked for *is* a regex literal in
  // the source, and matching a pattern against a pattern is how you write a
  // check that passes on the wrong text.
  check("S5.6", seed.includes("const HOSTED = /neon") && seed.includes("amazonaws"),
    "and the refusal matches on hostname rather than asking a question somebody clicks through");

  // The honest limit, kept honest: share views carry no breadcrumb, so a report
  // opened from a share link shows no demo label. The script has to say so.
  check("S5.7", /share link is the exception|A share link\*\* is the exception|share views carry no/i.test(seed),
    "and it states the one surface where the demo label does not appear");
}

console.log(failures === 0 ? "\nAll cloud-shell checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
