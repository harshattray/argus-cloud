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
  const CLOUD_POSES = ["lantern", "hourglass", "parcel", "key", "envelope", "repair"];
  check("S7.1", poses.length >= 15 && CLOUD_POSES.every((p) => poses.includes(p)),
    `${poses.length} poses declared, including the six the Cloud surface uses (${poses.join(", ")})`);

  // TypeScript already forces `ARMS` and `MOTION` to hold every pose — they are
  // `Record<TwinPose, …>`. Nothing forces the CSS, and a pose whose class is
  // missing renders a figure that simply never moves, which reads as a design
  // choice rather than as a bug.
  //
  // **Unless it is one**, which is what `still: true` is for. This check used to
  // require keyframes for every pose without exception, and `repair` — the error
  // state's wrench, deliberately motionless — turned it red on 2026-08-22. The
  // exemption is read from `MOTION` rather than kept as a list here, so a pose
  // can only escape the rule by saying in the source that it means to.
  const still = new Set(
    [...twins.matchAll(/(\w+):\s*\{[^}]*still:\s*true[^}]*\}/g)].map((m) => m[1])
  );
  check("S7.2a", still.size > 0 && still.has("repair"),
    `the exemption is read from MOTION, not hard-coded here — still poses: ${[...still].join(", ")}`);

  const unanimated = poses.filter(
    (p) =>
      !still.has(p) &&
      (!new RegExp(`@keyframes tw-${p}\\b`).test(css) || !new RegExp(`\\.tw-${p}\\s*\\{`).test(css))
  );
  check("S7.2", unanimated.length === 0,
    `every pose that is not declared still has both its keyframes and its class in globals.css${unanimated.length ? ` — missing: ${unanimated.join(", ")}` : ""}`);

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

  // The other thin state, which is no longer on that page: it is the one a
  // person lands on when their session resolves and their membership list is
  // empty — legitimate per §10.7 5A.4 — and it belongs to *every* area of the
  // console rather than to the repository list. It moved into the shell when
  // there were seven areas that could each have drawn their own.
  const consoleShell = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/console-shell.tsx"), "utf-8")
  );
  check("S7.6b",
    /<CloudTwin pose="envelope"/.test(consoleShell) && /invitation link/.test(consoleShell),
    "and the no-organization state carries the envelope figure and names the invitation that ends it");

  // It is drawn once. Two copies of the same state is how the pair drifts — one
  // gains a figure, the other keeps a bare paragraph — and with seven areas the
  // copies would not stop at two.
  const envelopeDraws = [reposPage, consoleShell].filter((f) => /pose="envelope"/.test(f)).length;
  check("S7.6c", envelopeDraws === 1 && !/pose="envelope"/.test(reposPage),
    `the no-organization state is drawn in one place, and it is not the repository list (${envelopeDraws} drawing)`);

  // Both blank states still share one layout block, which is the point of the
  // class: `/repos` with nothing uploaded, and the shell's no-organization
  // state, each with its own words and the same shape.
  const blankSlateUses =
    (reposPage.match(/styles\.blankSlate/g) ?? []).length +
    (consoleShell.match(/styles\.blankSlate/g) ?? []).length;
  check("S7.6d", blankSlateUses === 2,
    `both blank states compose .blankSlate rather than each owning a layout (${blankSlateUses} uses)`);

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

// ═══ S10 — the error states ═══
//
// An error is not an empty result, and every check here defends that one
// distinction. Told the wrong way round — a shrug, the word "nothing", a page
// that looks like a finished request — a customer concludes their data is gone.
//
// What can go wrong silently, which is what this suite is for:
//
//   - the figure gets an idle animation like every other pose, and the error
//     page reads as work still in progress;
//   - the boundary prints the exception, leaking a provider name or an internal
//     identifier to whoever is looking;
//   - `global-error` ships without its stylesheet and renders unstyled at the
//     worst possible moment — nothing throws, it just looks broken;
//   - the Next 16.3 `retry`/`reset` rename goes unnoticed and the recovery
//     button clears the boundary without re-fetching, so the same failure
//     comes straight back.
{
  const errorState = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/error-state.tsx"), "utf-8")
  );
  const errorCss = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/error-state.module.css"), "utf-8")
  );
  const globalError = decomment(await readFile(path.join(WEB, "app/global-error.tsx"), "utf-8"));
  const twins = decomment(
    await readFile(path.join(WEB, "app/(site)/_components/twins.tsx"), "utf-8")
  );
  const globals = decomment(await readFile(path.join(WEB, "app/globals.css"), "utf-8"));

  // ── The figure does not move ──────────────────────────────────────────────
  //
  // Two halves, and both are needed. The declaration says the pose is still;
  // the absent keyframes are what makes it true. Either one alone rots — a
  // `still: true` the renderer ignores, or missing CSS that looks like an
  // oversight and gets "fixed".
  check("S10.1", /repair:\s*\{[^}]*still:\s*true/.test(twins),
    "`repair` is declared still in MOTION, so a pose that does not animate says so rather than just lacking a rule");

  check("S10.2", !/\.tw-repair\s*\{/.test(globals) && !/@keyframes\s+tw-repair/.test(globals),
    "and there are no `tw-repair` keyframes — an idling figure beside a failure reads as work still in progress");

  check("S10.2b", /const anim = motion\.still \? undefined : `tw-\$\{pose\}`/.test(twins),
    "counter-test: without this branch the class is applied from the pose name alone, so adding keyframes later would animate it with nothing in review to stop that");

  // ── It is not a shrug, and no Cloud pose means two things ─────────────────
  check("S10.3", /pose="repair"/.test(errorState),
    "the error state uses `repair` — a wrench, not the shrug that already means 'nothing is here' on /agents");

  {
    // Every pose named across the Cloud surface, counted. The set's rule is one
    // placement, one pose; a repeat makes one drawing mean two things.
    const cloudFiles = [
      "app/_components/cloud/error-state.tsx",
      "app/repos/page.tsx",
      "app/repos/[repoId]/trend/page.tsx",
      "app/login/page.tsx",
    ];
    const used = [];
    for (const file of cloudFiles) {
      const full = path.join(WEB, file);
      if (!existsSync(full)) continue;
      const text = decomment(await readFile(full, "utf-8"));
      for (const m of text.matchAll(/pose="([a-z]+)"/g)) used.push(m[1]);
    }
    check("S10.4", used.length > 0 && new Set(used).size === used.length,
      `no pose is used twice on the Cloud surface — found ${used.join(", ")}`);
  }

  // ── Nothing from the exception reaches the page ───────────────────────────
  //
  // The boundary receives the whole `Error`. Rendering any of it is how a
  // provider name, a prompt fragment or an internal id ends up on a customer's
  // screen — PATHWAYS §10.7 5A.11.
  const leaks = /\{\s*error\.(message|stack|digest|name)/.test(errorState);
  check("S10.5", !leaks,
    "the error component renders nothing off the error object — no message, stack, digest or name");

  check("S10.5b", /digest/.test(errorState) === false && /error\.message/.test(errorState) === false,
    "counter-test: checking only for `error.message` would pass a page that prints `error.digest`, which is equally an identifier — both are absent");

  // ── The Next 16.3 rename ──────────────────────────────────────────────────
  //
  // `retry()` re-fetches the segment's data; `reset()` only clears the boundary
  // and re-renders from cache. These pages fail on a query, so `reset` puts the
  // same failure straight back and the button looks dead.
  for (const [id, file] of [
    ["S10.6", "app/repos/error.tsx"],
    ["S10.7", "app/r/error.tsx"],
    ["S10.8", "app/global-error.tsx"],
  ]) {
    const text = decomment(await readFile(path.join(WEB, file), "utf-8"));
    check(id, /retry:\s*\(\)\s*=>\s*void/.test(text) && !/\breset\b/.test(text),
      `${file} takes \`retry\`, not the pre-16.3 \`reset\` that re-renders from cache without re-fetching`);
  }

  // ── The document-level fallback stands on its own ────────────────────────
  check("S10.9", /import "\.\/globals\.css"/.test(globalError),
    "global-error imports the stylesheet explicitly — it replaces the root layout, so global styles do not arrive on their own");

  check("S10.10", /<html/.test(globalError) && /<body/.test(globalError),
    "and renders its own html and body, which Next requires of this file");

  // The shortcut that would have been reached for, and why it is blocked.
  {
    const middleware = decomment(await readFile(path.join(WEB, "middleware.ts"), "utf-8"));
    const blocksStyleElements = /style-src-elem 'self'/.test(middleware);
    check("S10.11", blocksStyleElements && !/<style/.test(globalError),
      "counter-test: `style-src-elem 'self'` blocks inline <style> blocks, so the usual self-contained-fallback shortcut would have rendered unstyled — the stylesheet import is the only route");
  }

  // ── The figure survives a phone ───────────────────────────────────────────
  //
  // The opposite rule to `.empty .figure`, which is dropped below 560px. There
  // the drawing is decoration inside a page that still has a heading and
  // controls; here it is the whole page, and two grey paragraphs on a phone is
  // exactly what a failed render looks like.
  {
    const narrow = /@media\s*\(max-width:\s*620px\)\s*\{([\s\S]*)$/.exec(errorCss);
    const hidesTwin = narrow !== null && /\.twin\s*\{[^}]*display:\s*none/.test(narrow[1]);
    check("S10.12", narrow !== null && !hidesTwin,
      "the figure is kept below 620px rather than hidden — it is most of what stops the page reading as a broken render");

    check("S10.13", narrow !== null && /\.actions\s*\{[^}]*flex-direction:\s*column/.test(narrow[1]),
      "and the two actions stack into full-width tap targets rather than splitting one narrow row");
  }

  check("S10.14", /Try again/.test(errorState) && /Back to Cloud/.test(errorState),
    "both recovery actions are present: retry in place, and a way out");
}

// ═══ S11 — the console shell, its navigation, and the role matrix ═══
//
// The shell exists so that seven areas cannot each answer "whose organization
// is this, what plan is it on, and what else is there" differently. What can go
// wrong here is quieter than a broken page:
//
//   - the navigation is hand-listed somewhere and drifts from the matrix, so a
//     role sees a link it cannot open, or an area disappears from the menu
//     while staying reachable by URL;
//   - a page trusts the menu instead of checking, and is open to anyone who
//     types its path — the failure PATHWAYS §5 means by "a route is not a UI
//     boundary";
//   - the ownership map claims a path no page answers on, or a page answers on
//     a path no area claims;
//   - the active-organization cookie stops being a preference and becomes an
//     authorization input.
//
// The matrix and the map are **imported and evaluated**, not matched with a
// regex. A role table that has never been asked a question is a table nobody
// has checked.
{
  const {
    CONSOLE_AREAS,
    areaForPath,
    areaById,
    canReach,
    navFor,
    deploymentEnvironment,
  } = await import(path.join(DIST, "consoleIA.js"));

  const shell = decomment(
    await readFile(path.join(WEB, "app/_components/cloud/console-shell.tsx"), "utf-8")
  );
  const consoleLib = decomment(await readFile(path.join(WEB, "lib/console.ts"), "utf-8"));

  // ── Every area answers ────────────────────────────────────────────────────
  //
  // A navigation item that 404s is worse than no navigation item: it reads as a
  // broken product rather than an unfinished one.
  {
    const missing = [];
    for (const area of CONSOLE_AREAS) {
      const file = path.join(WEB, "app", area.href.replace(/^\//, ""), "page.tsx");
      if (!existsSync(file)) missing.push(area.href);
    }
    check("S11.1", missing.length === 0,
      `every area in the map has a page at its href (${CONSOLE_AREAS.length} areas, missing: ${missing.join(", ") || "none"})`);
  }

  // ── The navigation is the matrix, not a copy of it ────────────────────────
  //
  // **The first version of this check only looked for `href="/billing"`**, and
  // a break that special-cased one area inside the expression —
  // `href={area.id === "billing" ? "/billing" : area.href}` — went straight
  // through it. So it looks for the *path* anywhere in the file, in any
  // syntax: the shell has no business naming an area's route at all, because
  // every route it needs is on the object it is already iterating.
  {
    const named = CONSOLE_AREAS.map((a) => a.href).filter((href) => shell.includes(`"${href}"`));
    check("S11.2", /navFor\(/.test(shell) && named.length === 0,
      `the shell renders navFor(role) and names no area path itself (found: ${named.join(", ") || "none"})`);
  }

  // ── Hiding is not deciding ────────────────────────────────────────────────
  //
  // Each area's page has to make the decision again on the server. The two
  // admin-only areas are the ones with something behind them, so a page of
  // theirs that skipped the check would be open to any member who typed it.
  {
    const unguarded = [];
    for (const area of CONSOLE_AREAS) {
      const file = path.join(WEB, "app", area.href.replace(/^\//, ""), "page.tsx");
      if (!existsSync(file)) continue;
      const text = decomment(await readFile(file, "utf-8"));
      if (!/consoleContext\(/.test(text)) unguarded.push(area.href);
    }
    check("S11.3", unguarded.length === 0,
      `every area page calls consoleContext on the server (unguarded: ${unguarded.join(", ") || "none"})`);
  }

  check("S11.3b", /area\.roles\.includes\(membership\.role\)/.test(consoleLib),
    "and consoleContext decides from the area's own role list rather than from a second copy of the matrix");

  // ── The matrix, evaluated ─────────────────────────────────────────────────
  {
    const grid = {};
    for (const role of ["admin", "member", "designer"]) {
      grid[role] = CONSOLE_AREAS.filter((a) => canReach(a.id, role)).map((a) => a.id).join(",");
    }
    check("S11.4", grid.admin === "overview,runs,trends,explain,organization,billing,data",
      `an admin reaches all seven areas (${grid.admin})`);
    check("S11.5", grid.member === "overview,runs,trends,explain" && grid.member === grid.designer,
      `a member and a designer reach the four read areas and no more (${grid.member})`);

    // The three areas the 5A.9 table gives to admins alone: every write in it —
    // invite, change roles, create keys, change billing, delete — is admin or
    // owner. Naming them here means a later widening has to be deliberate.
    for (const id of ["organization", "billing", "data"]) {
      check(`S11.5.${id}`,
        !canReach(id, "member") && !canReach(id, "designer") && canReach(id, "admin"),
        `${id} is admin-only, matching §10.7 5A.9's table`);
    }

    // Counter-test: a navigation built from the whole list rather than from the
    // role shows a designer the billing area, and the link works right up to the
    // point where the page refuses — which is the version that gets reported as
    // a bug rather than as a leak.
    const naive = CONSOLE_AREAS.map((a) => a.id).join(",");
    check("S11.5b", navFor("designer").map((a) => a.id).join(",") !== naive,
      `counter-test: an unfiltered nav would offer a designer all seven (${naive})`);
  }

  // ── The ownership map answers for every path ──────────────────────────────
  {
    const ownHref = CONSOLE_AREAS.every((a) => areaForPath(a.href)?.id === a.id);
    check("S11.6", ownHref, "every area's own href maps back to that area");

    check("S11.7", areaForPath("/repos/abc123")?.id === "runs",
      "a repository page belongs to Runs and reports");
    check("S11.8", areaForPath("/repos/abc123/trend")?.id === "trends",
      "and its trend view belongs to Trends, which is where the reader thinks they are");

    // Counter-test: the string-prefix version this replaced. `/repos` is a
    // prefix of `/repos/abc123/trend`, so the longest *string* that matches is
    // still `/repos` — the trend page lands in Runs and the wrong navigation
    // item lights up while you read a trend.
    {
      const prefixOwner = (p) => {
        let best = null;
        let len = -1;
        for (const area of CONSOLE_AREAS) {
          for (const own of area.owns) {
            if (own.includes("*")) continue;
            if ((p === own || p.startsWith(`${own}/`)) && own.length > len) {
              best = area.id;
              len = own.length;
            }
          }
        }
        return best;
      };
      check("S11.8b", prefixOwner("/repos/abc123/trend") === "runs" && areaForPath("/repos/abc123/trend")?.id === "trends",
        "counter-test: string-prefix ownership puts the trend page in Runs — segment matching with a wildcard is what fixes it");
    }

    check("S11.9", areaForPath("/database") === null && areaForPath("/legal/privacy") === null,
      "matching is by segment, so /data does not own /database and nothing outside the console is claimed");

    // No two areas claim the same path. Overlap is not caught by the lookup —
    // it just picks one — so it has to be asserted separately.
    {
      const seen = new Map();
      let clash = null;
      for (const area of CONSOLE_AREAS) {
        for (const own of area.owns) {
          if (seen.has(own)) clash = `${own}: ${seen.get(own)} and ${area.id}`;
          seen.set(own, area.id);
        }
      }
      check("S11.10", clash === null, `no path pattern is claimed by two areas (${clash ?? "none"})`);
    }
  }

  // ── No page outside the map ───────────────────────────────────────────────
  //
  // PATHWAYS §5: "do not add a one-off page when an existing area can own the
  // workflow". This is that rule with teeth — a new signed-in page either
  // extends an area's `owns` or fails here.
  {
    const outside = new Set(["(site)", "(pitch)", "admin", "api", "login", "unlock", "r"]);
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(path.join(WEB, "app"), { withFileTypes: true });
    const orphans = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_") || outside.has(entry.name)) continue;
      if (!existsSync(path.join(WEB, "app", entry.name, "page.tsx"))) continue;
      if (areaForPath(`/${entry.name}`) === null) orphans.push(entry.name);
    }
    check("S11.11", orphans.length === 0,
      `every signed-in page belongs to an area (orphans: ${orphans.join(", ") || "none"})`);
  }

  // ── The context row says all four things ──────────────────────────────────
  //
  // Organization, role, subscription state, environment. Each is here because
  // its absence has a cost: whose data, what you may do with it, whether the
  // account is in good standing, and whether this is the real deployment.
  check("S11.12",
    /OrgSwitcher/.test(shell) && /membership\.role/.test(shell) &&
      /SubscriptionChip/.test(shell) && /EnvironmentChip/.test(shell),
    "the context row names the organization, the role, the subscription state and the environment");

  check("S11.13",
    deploymentEnvironment({ VERCEL_ENV: "production" }) === "production" &&
      deploymentEnvironment({ VERCEL_ENV: "preview" }) === "preview" &&
      deploymentEnvironment({}) === "development",
    "and the environment is read from VERCEL_ENV, with a laptop reading as development");

  // ── Switching organizations ───────────────────────────────────────────────
  {
    const route = decomment(await readFile(path.join(WEB, "app/api/org/route.ts"), "utf-8"));
    check("S11.14", /export async function POST/.test(route) && !/export async function GET/.test(route),
      "the organization is switched by POST — a GET that changes what a page shows would be followed by prefetchers");
    check("S11.15", /membershipFor\(session, requested\)/.test(route),
      "and the route checks the membership before it writes the cookie, so a request for somebody else's organization is refused rather than quietly ignored");
    check("S11.16", /sameOrigin\(request\)/.test(route) && /status:\s*303/.test(route),
      "same-origin only, and a 303 so the back button does not re-post it");

    const switcher = decomment(
      await readFile(path.join(WEB, "app/_components/cloud/org-switcher.tsx"), "utf-8")
    );
    check("S11.17", /memberships\.length < 2/.test(switcher),
      "one membership renders as a name rather than a menu with a single item in it");
  }

  // ── The cookie is a preference, evaluated ─────────────────────────────────
  //
  // Compiled and run rather than read. `web/lib/membership.ts` imports only
  // types, which is what makes that possible — see the note in the file.
  {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { execFileSync } = await import("node:child_process");
    const { tmpdir } = await import("node:os");
    const { pathToFileURL } = await import("node:url");

    const out = await mkdtemp(path.join(tmpdir(), "norma-membership-"));
    try {
      execFileSync(
        process.execPath,
        [
          path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
          "--noCheck",
          "--target", "es2022",
          "--module", "es2022",
          "--moduleResolution", "bundler",
          "--outDir", out,
          path.join(WEB, "lib", "membership.ts"),
        ],
        // cwd outside the repo: naming a file on the command line while a
        // `tsconfig.json` is discoverable from the working directory is TS5112,
        // which TypeScript treats as an error rather than a warning.
        { stdio: "pipe", cwd: tmpdir() }
      );
      const { activeMembership, membershipFor, hasRole } = await import(
        pathToFileURL(path.join(out, "membership.js")).href
      );

      const session = {
        memberships: [
          { orgId: "org-held", orgName: "Held", role: "member" },
          { orgId: "org-also", orgName: "Also", role: "admin" },
        ],
      };

      check("S11.18", activeMembership(session, "org-also")?.orgId === "org-also",
        "a cookie naming an organization the session holds selects it");
      check("S11.19", activeMembership(session, "org-somebody-elses")?.orgId === "org-held",
        "a cookie naming one it does not hold is ignored, not obeyed — it falls back to a held membership");
      check("S11.20", activeMembership(null, "org-held") === null && activeMembership({ memberships: [] }) === null,
        "no session and no membership both resolve to nothing");
      check("S11.21", membershipFor(session, "org-somebody-elses") === null,
        "and asking for another tenant's organization by id resolves to nothing, which is a 404 above this");

      // Counter-test: the version that trusts the cookie. It returns a
      // membership for an organization the session does not hold — which is a
      // cross-tenant read, from a value the browser sends.
      const naive = (s, preferred) =>
        preferred ? { orgId: preferred, orgName: preferred, role: "admin" } : s.memberships[0];
      check("S11.22",
        naive(session, "org-somebody-elses").orgId === "org-somebody-elses" &&
          activeMembership(session, "org-somebody-elses")?.orgId !== "org-somebody-elses",
        "counter-test: a cookie taken at face value hands back an organization the session never held");

      check("S11.23", hasRole({ role: "admin" }, ["admin"]) && !hasRole({ role: "designer" }, ["admin"]) && !hasRole(null, ["admin"]),
        "hasRole answers from an explicit allowed set, and null is never allowed");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }

  // ── The trend page's gate ─────────────────────────────────────────────────
  //
  // **This was broken and shipped.** The trend view and its CSV export answered
  // only to `NORMA_DEV_OPEN`, which no deployment sets, so both 404ed for every
  // real customer — while `PATHWAYS.md` §7's table recorded the `/repos/*` gate
  // as closed, because the repository page above them had been fixed. A
  // navigation area cannot point at a page nobody can open.
  for (const [id, file] of [
    ["S11.24", "app/repos/[repoId]/trend/page.tsx"],
    ["S11.25", "app/repos/[repoId]/trend/export/route.ts"],
  ]) {
    const text = decomment(await readFile(path.join(WEB, file), "utf-8"));
    const membershipGate = /membershipFor\(session, owner\.orgId\)/.test(text);
    const devOpenAlone = /if\s*\(!repoViewOpen\(\)\)\s*\{/.test(text);
    check(id, membershipGate && !devOpenAlone,
      `${file} admits a member of the owning organization, with NORMA_DEV_OPEN left as the local door`);
  }

  check("S11.26",
    /!membership && !repoViewOpen\(\)/.test(
      decomment(await readFile(path.join(WEB, "app/repos/[repoId]/trend/page.tsx"), "utf-8"))
    ),
    "counter-test: the refusal needs both to fail — a member with no dev flag is admitted, which is the case that was 404ing");

  // ── Three things a browser found, and a check now holds ───────────────────
  //
  // None of these could have failed a suite as it stood. They are here because
  // each was a real defect on screen.

  // The navigation scrolled sideways, and at 666px the current area — Billing
  // and usage — sat past the right edge: underlined, and not visible. Nothing
  // but a script can scroll a chosen element into view on load, and this
  // surface runs none, so the row wraps instead.
  {
    const css = decomment(
      await readFile(path.join(WEB, "app/_components/cloud/console-shell.module.css"), "utf-8")
    );
    const navBlock = /\.nav\s+ul\s*\{([^}]*)\}/.exec(css);
    check("S11.27",
      navBlock !== null && /flex-wrap:\s*wrap/.test(navBlock[1]) && !/\.nav\s*\{[^}]*overflow-x/.test(css),
      "the area navigation wraps rather than scrolling, so the current area is never outside the visible row");

    // The outline list rendered as four unmarked lines: `globals.css` resets
    // lists for the nav and footers, and this one inherited the reset.
    check("S11.28", /\.outlineList\s*\{[^}]*list-style:\s*disc/.test(css),
      "and the outline list states its markers rather than inheriting the global reset that removes them");
  }

  // "admin or member or designers" — `roles.join(" or ") + "s"`, which no static
  // check would have questioned and a browser showed immediately.
  check("S11.29", !/join\(" or "\)/.test(shell) && /roleList\(/.test(shell),
    "roles are listed by a function that pluralises each one, not by joining and adding an 's' to the last");

  // ── `owner` is not a role ─────────────────────────────────────────────────
  //
  // The seed wrote `role: 'owner'` into `memberships`, so the local sign-in
  // address held a value no authorization path recognises and was refused every
  // admin-gated area with nothing saying why. 001 wrote the domain in a comment
  // and no constraint; 022 adds the constraint.
  {
    const devMembership = decomment(await readFile(path.join(ROOT, "scripts/dev-membership.mjs"), "utf-8"));
    check("S11.30", /claimOwnership\(/.test(devMembership) && !/role:\s*"owner"/.test(devMembership),
      "the seed grants ownership through claimOwnership — which sets the invariant and an admin membership together — rather than inventing an `owner` role");

    const db = await createDb();
    await migrate(db);
    const orgId = `console-role-${randomUUID().slice(0, 8)}`;
    const userId = `u-${randomUUID().slice(0, 8)}`;
    await db.query("INSERT INTO orgs (id, name) VALUES ($1, $2)", [orgId, "role domain"]);
    await db.query("INSERT INTO users (id, email) VALUES ($1, $2)", [userId, `${userId}@example.com`]);

    let refused = false;
    try {
      await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [orgId, userId]);
    } catch {
      refused = true;
    }
    check("S11.31", refused,
      "and the column itself refuses it now — a comment naming the domain is not the domain (CLAUDE.md rule 1)");

    // Not vacuous: the three real roles still go in.
    let accepted = 0;
    for (const role of ["admin", "member", "designer"]) {
      await db.query(
        `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [orgId, userId, role]
      );
      accepted++;
    }
    check("S11.32", accepted === 3, "while admin, member and designer are all still accepted");
  }
}

// ═══ S12 — the Organization area: its forms and the routes behind them ═══
//
// The first area of the console that writes anything, and the first place a
// browser can reach `invitations.ts`, `users.ts` and `apiKeys.ts`. The domain
// rules themselves are `test/organization.test.mjs` and the behaviour over HTTP
// is `scripts/tenant-gate-check.mjs`. What is checkable *here* is the wiring
// between the two, which is where this kind of surface goes wrong:
//
//   - a form posts to an action that does not exist, so the control silently
//     does nothing;
//   - a form carries an `orgId`, and the organization stops coming from the
//     session — the exact failure §10.7 5A opens with;
//   - a page grows a second copy of the role matrix instead of asking the one
//     in `consoleIA.ts`;
//   - a message from the query string is rendered as text, so a link can be
//     made to say anything.
{
  const orgAdmin = decomment(await readFile(path.join(WEB, "lib/orgAdmin.ts"), "utf-8"));
  const route = decomment(await readFile(path.join(WEB, "app/api/organization/[action]/route.ts"), "utf-8"));
  const page = decomment(await readFile(path.join(WEB, "app/organization/page.tsx"), "utf-8"));

  // The list itself, imported and evaluated. It lives in the server package for
  // exactly this reason — so the suite reads the same array the route is typed
  // by and the gate script iterates, rather than a regex's opinion of it.
  const { ORG_ACTIONS, orgActionPath } = await import(path.join(DIST, "consoleIA.js"));
  const actions = [...ORG_ACTIONS];
  check("S12.1", actions.length >= 6, `the action list names ${actions.length} writes (${actions.join(", ")})`);
  check("S12.1b", orgActionPath(actions[0]) === `/api/organization/${actions[0]}`,
    `and every action's path is built from it (${orgActionPath(actions[0])})`);

  // ── Every named action has a handler ──────────────────────────────────────
  {
    const missing = actions.filter((a) => !new RegExp(`(^|\\s)(async )?"?${a}"?\\(`, "m").test(route));
    check("S12.2", missing.length === 0,
      `every action in the list has a handler in the route (missing: ${missing.join(", ") || "none"})`);
    check("S12.2b", /Record<OrgActionName, Action>/.test(route),
      "and the dispatch table is typed by that list, so a missing handler is a build failure rather than a 404 found by a customer");
  }

  // ── Every form posts to one of them ───────────────────────────────────────
  //
  // Through `orgActionPath`, never as a literal path: a typed string is how a
  // form ends up posting into a 404, and the compiler cannot see a typo inside
  // quotes.
  {
    const used = [...page.matchAll(/orgActionPath\("([a-z-]+)"\)/g)].map((m) => m[1]);
    const unknown = used.filter((a) => !actions.includes(a));
    const literal = /action="\/api\//.test(page);
    check("S12.3", used.length > 0 && unknown.length === 0 && !literal,
      `every form on the page posts through orgActionPath to a declared action (${used.length} forms, unknown: ${unknown.join(", ") || "none"}, literal paths: ${literal})`);
  }

  // ── The organization is never a form field ────────────────────────────────
  //
  // §10.7 5A: *a caller-provided org ID is never authorization.* There is
  // deliberately no `orgId` input anywhere on this page, and the route reads it
  // from the membership the session resolved.
  {
    const formField = /name="orgId"/.test(page);
    const fromForm = /form\.get\("orgId"\)/.test(route);
    check("S12.4", !formField && !fromForm,
      `no form carries an organization and no handler reads one (field: ${formField}, read: ${fromForm})`);
    check("S12.4b", /admin\.membership\.orgId/.test(route),
      "every write is scoped to the organization the session resolved");
  }

  // ── One gate, from the one matrix ─────────────────────────────────────────
  {
    check("S12.5", /requireOrgAdmin\(request\)/.test(route) && (route.match(/requireOrgAdmin\(/g) ?? []).length === 1,
      "the gate is called once, before the dispatch, so no handler can be reached without it");
    check("S12.5b", /canReach\("organization"/.test(orgAdmin) && !/=== "admin"/.test(orgAdmin),
      "and it asks CONSOLE_AREAS which roles may reach the area rather than hard-coding admin — one matrix, seven readers");
    // **A structure check, and it says so.** Whether the origin check actually
    // refuses a cross-site POST is `tenant-gate-check.mjs` G6.4, over HTTP, with
    // a real `sec-fetch-site` header — a source check cannot answer that, and
    // one that claimed to would pass a call sitting behind `if (false &&`.
    // What is checkable here is the *order*: it comes before the session is
    // read, so a cross-origin request is refused before anything is looked up.
    const originAt = orgAdmin.indexOf("sameOrigin(request)");
    const sessionAt = orgAdmin.indexOf("await currentSession()");
    check("S12.5c", originAt !== -1 && sessionAt > originAt,
      "the same-origin check comes first, before any lookup (SameSite alone is not the whole CSRF policy — §10.7 5A.8; G6.4 proves it refuses)");
  }

  // ── The reader is told what happened, in our words ────────────────────────
  //
  // The query string picks a sentence from a fixed map; it never supplies one.
  // A page that renders `?notice=` as text is a page a link can put words into,
  // and this surface has already been green for the wrong reason once because
  // it echoed a query parameter back.
  {
    const mapped = /NOTICES\[code as OrgNotice\]/.test(page) && /hasOwnProperty\.call\(NOTICES, code\)/.test(page);
    // Attribute positions stripped first, so `code={notice}` — passing the value
    // *to* the lookup — is not mistaken for rendering it. What is left is JSX
    // text, and `{code}` or `{notice}` there would be the caller's own string on
    // the page. `{notice.text}` is the map's sentence and does not match.
    // A JSX *text* position only — the value written between tags. Attributes
    // are stripped first so `code={notice}`, which passes the value into the
    // lookup, is not mistaken for rendering it, and the leading `>` keeps the
    // component's own `({ code })` parameter out of it. `{notice.text}` is the
    // map's sentence and does not match either.
    const jsxText = page.replace(/\w+=\{[^}]*\}/g, "");
    const echoed = />\s*\{\s*(notice|code)\s*\}/.test(jsxText);
    check("S12.6", mapped && !echoed,
      `the notice is looked up in a fixed map and never rendered as the caller wrote it (mapped: ${mapped}, echoed: ${echoed})`);
  }

  // ── The key is shown once, and never stored ───────────────────────────────
  {
    const reveal = decomment(await readFile(path.join(WEB, "lib/keyReveal.ts"), "utf-8"));
    check("S12.7", /HttpOnly/.test(reveal) && /Path=\/organization/.test(reveal) && /Max-Age=\$\{maxAge\}/.test(reveal),
      "the one-time key cookie is HttpOnly, scoped to this area's path, and expires on its own");
    check("S12.7b", !/INSERT|UPDATE|db\./i.test(reveal),
      "and nothing about the reveal touches the database — the plaintext is never stored, which is the property the whole design exists for");
    check("S12.7c", /createdBy: admin\.session\.user\.id/.test(route),
      "the key records who minted it, from the session rather than from a field somebody types");
  }

  // ── The revoke is attributed to the session ───────────────────────────────
  //
  // Migration 018 shipped with a typed-in actor because there was no session to
  // read, and said in its own comment that Step 6 should fix it. This is that
  // call site.
  {
    check("S12.8", /actor: admin\.session\.user\.display_name/.test(route),
      "a revocation from the console is attributed to the signed-in admin, not to a name they type");
    check("S12.8b", /orgId: admin\.membership\.orgId/.test(route) && !/orgId: null/.test(route),
      "and both revokes are scoped to the session's organization — a row id from a form is a request, not a permission");
  }

  // ── An invitation is a row *and* a message ────────────────────────────────
  //
  // The first version of this route called `createInvitation` directly, and the
  // page said "Invitation sent" while nothing was sent — the link existed only
  // in the database. `sendInvitation` is the one entry point that pays the
  // outbound-email budget, creates the row and hands it to the mailer, in that
  // order, so a route that reaches past it is a route that can invite somebody
  // silently.
  {
    check("S12.10", /sendInvitation\(/.test(route) && !/createInvitation\(/.test(route),
      "the invite handler goes through sendInvitation and never creates an invitation row on its own");
    check("S12.10b", /invite-budget/.test(route) && /invite-unsent/.test(route),
      "and it tells the two failures apart: a spent ceiling, and a row that exists with no mail behind it");
  }

  // ── Every membership change is audited ────────────────────────────────────
  //
  // §10.7 5A.11: destructive auth and organization actions are audited. The
  // event kinds have existed since the session layer and had no caller.
  {
    const audited = ["invitation-revoked", "role-changed", "member-removed"].filter((kind) =>
      new RegExp(`kind: "${kind}"`).test(route)
    );
    check("S12.11", audited.length === 3,
      `every membership change records its own audit event (${audited.join(", ") || "none"})`);
    check("S12.11b", /actorUserId: admin\.session\.user\.id/.test(route),
      "with the admin who did it named as the actor, separately from the person it was done to");
  }

  // ── The page cannot promise what it already holds ─────────────────────────
  {
    const shell = decomment(await readFile(path.join(WEB, "app/_components/cloud/console-shell.tsx"), "utf-8"));
    check("S12.9", /outstanding\(area\)/.test(shell) && !/area\.holds\.map/.test(shell),
      "the area outline renders holds-minus-built rather than the whole list, so a half-built area stops promising its own working controls");
    check("S12.9b", /todo\.length === 0/.test(shell),
      "and an area with nothing outstanding renders no outline at all");
  }
}

console.log(failures === 0 ? "\nAll cloud-shell checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
