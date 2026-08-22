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
import { existsSync } from "node:fs";
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

// ═══ S6 — the waiting indicator, and the brand rule it had to work around ═══
//
// Harsha asked for the Yutic logo as an animated loading symbol. The brand book
// forbids exactly that, in one sentence:
//
//   yutic-brand/yutic-brand-orange/yutic-brand-rules.txt §01
//   "A fan of five peacock feathers, each with an eye. Never rotated,
//    reordered, stretched, recoloured or given effects."
//
// A spinning mark is a rotation *and* an effect. So the mark holds still and a
// ring turns around it — the identity is the logo, the motion is not applied to
// it. These checks are what stop that quietly eroding: the tempting "fix" for a
// static logo inside a spinner is to spin the logo.
//
// **It is an overridable rule and there is a precedent for how.** §09 read
// "never in product headers or app UI" until 2026-08-20, when Harsha decided
// otherwise and the rules file was edited in the same change. If a turning mark
// is wanted, that is the route — and S6.6 is the check that would need deleting,
// deliberately, at the same time.
{
  const css = decomment(await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8"));
  const component = await readFile(path.join(WEB, "app/_components/cloud/loading.tsx"), "utf-8");
  const mark = css.slice(css.indexOf(".spinMark"), css.indexOf(".spinRing"));
  const ring = css.slice(css.indexOf(".spinRing"));

  check("S6.1", css.includes(".spinRing") && /animation:\s*spin/.test(ring),
    "the ring is what animates");
  check("S6.2", component.includes("/yutic-mark.svg"),
    "and the mark inside it is the brand file, served as-is");

  // The rule, as four separate checks, because they are four separate verbs in
  // the book and a future change is likely to reach for exactly one of them.
  for (const [id, prop, verb] of [
    ["S6.3", "transform", "rotated or stretched"],
    ["S6.4", "filter", "given effects"],
    ["S6.5", "animation", "animated"],
  ]) {
    check(id, !new RegExp(`${prop}\\s*:`).test(mark),
      `the mark itself is never ${verb} — brand rules §01`);
  }
  check("S6.6", !/\.spinMark[^{]*\{[^}]*rotate/.test(css) && !/\.spinMark:.*\{[^}]*animation/.test(css),
    "nothing anywhere rotates it, which is the check to delete if that rule is ever overridden");

  // §01 also sets a floor: "Minimum 28px wide; below that drop the quill and
  // base." There is no reduced asset, so the mark is never rendered under it —
  // the `sm` variant shrinks the ring's padding instead.
  const spinner = css.slice(css.indexOf(".spinner {"), css.indexOf(".spinMark"));
  check("S6.7", /--yutic-mark:\s*28px/.test(spinner),
    "the mark renders at the 28px floor and never below it");
  check("S6.8", /--yutic-clearspace:.*23\s*\/\s*144\.5/.test(spinner),
    "and the ring keeps one eye diameter of clearspace, which §01 defines as 23 of 144.5 units");

  // A spinner that keeps spinning for someone who asked it not to is the one
  // accessibility failure that is also a health issue.
  const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
  check("S6.9", /\.spinRing\s*\{\s*animation:\s*none/.test(reduced),
    "reduced motion stops the rotation and leaves a ring that still reads as waiting");

  check("S6.10", /role="status"/.test(component) && /aria-live/.test(component),
    "the wait is announced, not just drawn");
  check("S6.11", /alt=""/.test(component) && /aria-hidden/.test(component),
    "and the mark is decorative to a screen reader — the label carries the meaning");

  // Every route where a wait is actually visible has one. All three are
  // force-dynamic and every control on them is a navigation.
  for (const [id, rel] of [
    ["S6.12", "app/repos/[repoId]/loading.tsx"],
    ["S6.13", "app/repos/[repoId]/trend/loading.tsx"],
    ["S6.14", "app/r/[runId]/loading.tsx"],
  ]) {
    let present = true;
    try {
      await readFile(path.join(WEB, rel), "utf-8");
    } catch {
      present = false;
    }
    check(id, present, `${rel.replace("app/", "")} has a loading state`);
  }
}

// ═══ S7 — the empty states, and the figures in them ═══
//
// A Cloud page with nothing to draw used to render nothing, and on the frame
// trend that deleted the control the reader had just used. The replacement is a
// panel with a twin in it, which brings two things that can be wrong quietly:
// a pose with no animation, and a drawing that only suits one ground.
{
  const twins = await readFile(path.join(WEB, "app/(site)/_components/twins.tsx"), "utf-8");
  const css = await readFile(path.join(WEB, "app/globals.css"), "utf-8");

  const union = twins.match(/export type TwinPose =([\s\S]*?);/);
  const poses = union === null ? [] : [...union[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);

  // Not vacuous: an empty or truncated list would make every check below pass
  // by having nothing to check.
  const CLOUD_POSES = ["lantern", "hourglass", "parcel", "key", "envelope"];
  check("S7.1", poses.length >= 14 && CLOUD_POSES.every((p) => poses.includes(p)),
    `${poses.length} poses declared, including the five the Cloud surface uses (${poses.join(", ")})`);

  // TypeScript already forces `ARMS` and `MOTION` to hold every pose — they are
  // `Record<TwinPose, …>`. Nothing forces the CSS, and a pose whose class is
  // missing renders a figure that simply never moves, which reads as a design
  // choice rather than as a bug.
  const unanimated = poses.filter(
    (p) => !new RegExp(`@keyframes tw-${p}\\b`).test(css) || !new RegExp(`\\.tw-${p}\\s*\\{`).test(css)
  );
  check("S7.2", unanimated.length === 0,
    `every pose has both its keyframes and its class in globals.css${unanimated.length ? ` — missing: ${unanimated.join(", ")}` : ""}`);

  // The prop is what stops a new pose reading as an existing one: a silhouette
  // is recognised before a limb is, so a pose that only moves an elbow is the
  // same drawing at a glance (`normascopeWeb.md` §5).
  const propless = CLOUD_POSES.filter((p) => !new RegExp(`case "${p}":`).test(twins));
  check("S7.3", propless.length === 0,
    `every Cloud pose carries a drawn prop${propless.length ? ` — missing: ${propless.join(", ")}` : ""}`);

  // Decommented: the doc block above `CloudEmpty` explains at length why it is
  // *not* a `TwinLink`, and a check reading the raw file finds that sentence and
  // reports the opposite of what the code does.
  const empty = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/empty-state.tsx"), "utf-8")
  );

  check("S7.4",
    /tone="ink"/.test(empty) && /tone="cream"/.test(empty) &&
      /surface\.onLight/.test(empty) && /surface\.onDark/.test(empty),
    "the figure is drawn for both grounds and one is hidden by the same cascade the wordmark uses — the auto theme leaves the server unable to know which it will be");

  check("S7.5", !/TwinLink/.test(empty) && !/\bsign\b/.test(empty),
    "and it is a plain Twin: no `get cloud` sticker, because everyone reading this page has already bought it");

  // The two 2026-08-22 placements. Both replaced a page that was mostly empty
  // colour, and both are easy to lose in a refactor without anything failing:
  // the drawing is decoration, so nothing throws when it goes.
  const reposPage = decomment(await readFile(path.join(WEB, "app/repos/page.tsx"), "utf-8"));
  check("S7.6",
    /<CloudTwin pose="parcel"/.test(reposPage) && /norma-scope upload/.test(reposPage),
    "the repository list's blank slate carries the parcel figure and the command that ends it");

  // The other thin state on the same page. It is the one a person lands on when
  // their session resolves and their membership list is empty — legitimate per
  // §10.7 5A.4, and for a while the only state on the surface still rendering as
  // a bare paragraph in a card that stopped a third of the way down the window.
  check("S7.6b",
    /<CloudTwin pose="envelope"/.test(reposPage) && /invitation link/.test(reposPage),
    "and the no-organization state carries the envelope figure and names the invitation that ends it");

  // Both `/repos` states use one block. Two copies of the same layout is how
  // the pair drifts — one gets a height and the other keeps the old collapse.
  const blankSlateUses = (reposPage.match(/styles\.blankSlate/g) ?? []).length;
  check("S7.6c", blankSlateUses === 2,
    `both blank states share .blankSlate rather than each owning a layout (${blankSlateUses} uses)`);

  const login = decomment(await readFile(path.join(WEB, "app/login/page.tsx"), "utf-8"));
  check("S7.7", /<CloudTwin pose="key"/.test(login) && !/TwinLink/.test(login),
    "the sign-in page carries the key figure, and no sticker — the offer there is the footnote, not a drawing holding a sign");
}

// ═══ S8 — the sign-in page is a page, not a card on a colour ═══
//
// It shipped as a single centred card with no header, no footer and no link
// anywhere: somebody who reached `/login` from a stale bookmark or a spent link
// had the browser's Back button and nothing else, and the theme switch — which
// every signed-in page has — first appeared *after* they got in.
{
  const login = decomment(await readFile(path.join(WEB, "app/login/page.tsx"), "utf-8"));
  const css = decomment(await readFile(path.join(WEB, "app/login/login.module.css"), "utf-8"));
  const surface = decomment(await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8"));

  check("S8.1", /className={styles\.home}\s+href="\/"/.test(login),
    "the wordmark is a link to the public site — the way home every header already implies");

  check("S8.2", /<ThemeSwitch/.test(login),
    "and the theme switch is on it, so the colour choice does not first appear after signing in");

  check("S8.3", /<footer/.test(login) && /YuticEndorsement/.test(login) && /href="\/legal"/.test(login),
    "there is a footer, with the endorsement and a way out in words");

  // The theme switch posts a redirect target, and it is built from the value
  // `safeNext` has already vetted rather than from the raw query parameter.
  check("S8.4", /themeNext = next \? `\/login\?next=\$\{encodeURIComponent\(destination\)\}`/.test(login),
    "the theme switch's return path is built from the validated destination, never from the raw `next`");

  // S8.5 / S8.5b — the bug this pair exists for, found in a browser on
  // 2026-08-22 and live on every signed-in page at the time.
  //
  // `.onLight` / `.onDark` are bare single-class selectors. A rule like
  // `.wordmark img { display: block }` is a class *and* a type, so it outranks
  // them and both ground-dependent files render, one stacked under the other.
  // Nothing fails; the mark just grows a faint duplicate along its underside.
  const setsDisplay = (text, selector) => {
    const rule = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(text);
    return rule !== null && /display\s*:/.test(rule[0]);
  };

  check("S8.5", !setsDisplay(surface, ".wordmark img") && !setsDisplay(css, ".home img"),
    "no type-and-class rule sets `display` on a themed wordmark image — that outranks the .onLight/.onDark cascade and renders both files");

  // The counter-test: the same cascade evaluated with the offending rule back
  // in, by specificity, to show the check is asserting something.
  {
    const beats = (a, b) => a[0] * 10 + a[1] > b[0] * 10 + b[1];
    // [classes, types] for `.wordmark img` and for `.onDark`.
    const scoped = [1, 1];
    const themed = [1, 0];
    check("S8.5b", beats(scoped, themed),
      "counter-test: `.wordmark img` (1 class, 1 type) beats `.onDark` (1 class), so a `display` there wins and the hidden copy is shown");
  }
}

// ═══ S9 — the two masthead controls ═══
//
// The theme switch was three tracked uppercase words in equal chips, and the
// account controls were a strip under the footer rule reading
// `name · Sign out · Sign out everywhere` with no bottom padding. Both were
// rebuilt on 2026-08-22.
//
// What can go wrong here is quiet in both directions: an icon-only control that
// drops its text has no accessible name and nothing turns red, and a menu built
// with a positioned `<div>` instead of a popover is clipped by the card it
// lives in — visibly, but only for the person who opens it.
{
  const themeSwitch = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/theme-switch.tsx"), "utf-8")
  );
  const account = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/account-menu.tsx"), "utf-8")
  );
  const shell = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/cloud-shell.tsx"), "utf-8")
  );
  const surface = decomment(
    await readFile(path.join(WEB, "app/_styles/surface.module.css"), "utf-8")
  );

  // Every option keeps its word in the DOM; only the selected one is shown.
  // Dropping the other two is the obvious "simplification" and it leaves two
  // buttons whose accessible name is a `title`, which a lot of assistive
  // technology will not read.
  check("S9.1",
    /styles\.themeLabel : styles\.visuallyHidden/.test(themeSwitch),
    "the unselected theme options keep their labels in the DOM as visuallyHidden, not as title-only icons");

  check("S9.2", /aria-pressed={option\.active}/.test(themeSwitch),
    "and the selected one is announced as pressed, not signalled by the filled chip alone");

  // Still three plain forms. The redesign was chrome; a colour preference that
  // needs hydration would put a script on pages that have none.
  const themeForms = (themeSwitch.match(/method="POST"/g) ?? []).length;
  check("S9.3",
    themeForms === 1 && !/use client/.test(themeSwitch) && !/onClick/.test(themeSwitch),
    "the theme switch is still one form per option and no client JavaScript");

  // The account menu, and the constraint that decided its mechanism.
  check("S9.4",
    /popover="auto"/.test(account) && /popoverTarget/.test(account) &&
      !/use client/.test(account) && !/onClick/.test(account),
    "the account menu is a native popover — no client JavaScript, and the top layer is what keeps it out of the card's overflow");

  check("S9.5", /:popover-open/.test(surface) && /accountMenu/.test(surface),
    "and the stylesheet only reveals it on :popover-open, so it is closed without a script saying so");

  // Both actions survived the move into a menu unchanged: same route, same
  // method, and `scope=all` still distinguishes the two.
  const posts = (account.match(/action="\/api\/auth\/signout"/g) ?? []).length;
  check("S9.6",
    posts === 2 && /name="scope" value="all"/.test(account) && !/<a /.test(account),
    `both sign-outs are still same-origin form posts, not links (${posts} forms)`);

  // The thing the reader complained about: two bare links a foot apart, with no
  // way to tell which one they wanted. The second now explains itself.
  check("S9.7", /accountMenuHint/.test(account) && /every device/.test(account),
    "and \"sign out everywhere\" says what it does, which is the whole reason the two were confusable");

  // The masthead offers the slot; it does not go looking for a session. A share
  // reader has one run and no account.
  check("S9.8", /account\?: ReactNode/.test(shell) && /{account}/.test(shell),
    "the masthead takes the account menu as an optional slot rather than resolving a session itself");

  const share = decomment(await readFile(path.join(WEB, "app/r/[runId]/page.tsx"), "utf-8"));
  check("S9.9", !/AccountMenu/.test(share),
    "and the share-token report passes none — a share link has a reader, not a user");

  // S9.10 / S9.10b — why this is a popover at all.
  const shellCss = surface;
  const cardHidesOverflow = /\.card\s*\{[^}]*overflow:\s*hidden/.test(shellCss);
  check("S9.10", cardHidesOverflow,
    "the sheet still clips its overflow, which is the constraint the popover exists to satisfy");
  check("S9.10b", cardHidesOverflow && /popover="auto"/.test(account),
    "counter-test: the masthead is inside that clip, so a positioned <div> menu would be cut off at the sheet's top edge — only the top layer escapes it");

  // The strip this replaced is gone, not orphaned beside its replacement.
  const stripGone = !existsSync(path.join(WEB, "app/repos/session-controls.tsx"));
  const repos = decomment(await readFile(path.join(WEB, "app/repos/page.tsx"), "utf-8"));
  check("S9.11", stripGone && !/SessionControls/.test(repos),
    "the old sign-out strip under the footer is deleted, not left rendering next to the menu");
}

console.log(failures === 0 ? "\nAll cloud-shell checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
