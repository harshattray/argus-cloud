// Site analytics suite — where audience measurement runs, and what the
// published legal documents say about it.
//
// Run: npm test
//
// **Why this exists at all.** `docs/legal/COOKIE-NOTICE.md` made a promise
// before any analytics was switched on: if we add one, the Notice is updated
// *before* the tool is activated. That promise is only worth something if
// something enforces the order. Nothing about mounting an analytics component
// fails a typecheck, a build, or a page render if the legal copy is stale — so
// the drift would be silent, and the first person to notice would be a visitor
// reading a Cookie Notice that describes a site we no longer run.
//
// So this suite reads the *code* to find out what is mounted, then requires
// the published documents to name it. The direction matters: the code is the
// fact, the documents must follow.
//
// It guards three things:
//
//   - analytics runs on the public marketing site and nowhere else — not on
//     `/pitch` (investor material), `/admin` (other people's email addresses)
//     or `/r/{runId}` (a customer's own report);
//   - whatever is mounted is a declared dependency, not a phantom import;
//   - the Cookie Notice and Privacy Policy both name it, and both still
//     describe it as storing nothing on the visitor's device.
//
// An analytics package this file has never heard of fails the run rather than
// passing quietly. That is deliberate: a tool nobody wrote a legal paragraph
// for is exactly the case worth stopping on.
//
// No database, no network — it reads files.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WEB = path.join(ROOT, "web");
const APP = path.join(WEB, "app");
const LEGAL = path.join(ROOT, "docs", "legal");

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/**
 * Analytics packages and the name a visitor would recognise them by.
 *
 * The right-hand side is what has to appear in the legal documents, which is
 * why it is the marketing name and not the npm name — "@vercel/analytics" in a
 * Cookie Notice tells a reader nothing.
 */
const KNOWN_ANALYTICS = new Map([
  ["@vercel/analytics", "Vercel Web Analytics"],
  ["@next/third-parties", "Google Analytics"],
  ["posthog-js", "PostHog"],
  ["plausible-tracker", "Plausible"],
  ["next-plausible", "Plausible"],
  ["@umami/node", "Umami"],
]);

/** The trees analytics must never reach, and why each one is on the list. */
const FORBIDDEN_TREES = [
  ["app/(pitch)", "investor and internal material behind a password"],
  ["app/admin", "waitlist administration — other people's email addresses"],
  ["app/r", "a customer's own report page"],
];

/** Every .ts/.tsx file under web/, ignoring build output and dependencies. */
async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(full)));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      found.push(full);
    }
  }
  return found;
}

const files = await sourceFiles(WEB);

/**
 * Which files import an analytics package, and which package.
 *
 * Matching the import statement rather than the component name is what makes
 * this hold when someone renames `<Analytics />` on the way in — the import
 * specifier is the thing that cannot be disguised without changing what runs.
 */
const mounts = [];
const unknown = [];
for (const file of files) {
  const source = await readFile(file, "utf-8");
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier.startsWith(".") || specifier.startsWith("next/")) continue;
    // "@vercel/analytics/next" and "@vercel/analytics" are the same package.
    const pkg = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    if (KNOWN_ANALYTICS.has(pkg)) {
      mounts.push({ file: path.relative(WEB, file), pkg });
    } else if (/analytic|telemetry|tracking|gtag|posthog|plausible|umami|segment|mixpanel/i.test(pkg)) {
      unknown.push({ file: path.relative(WEB, file), pkg });
    }
  }
}

const packages = [...new Set(mounts.map((m) => m.pkg))];

// --- A0: nothing unrecognised is measuring visitors ----------------------
{
  check(
    "A0.1",
    unknown.length === 0,
    unknown.length === 0
      ? "no unrecognised analytics package is imported"
      : `unrecognised analytics package(s): ${unknown
          .map((u) => `${u.pkg} in ${u.file}`)
          .join(", ")} — add it to KNOWN_ANALYTICS here and write its paragraph in docs/legal/COOKIE-NOTICE.md before shipping`
  );
}

// --- A1: it runs on the public site and nowhere else ---------------------
{
  const SITE_LAYOUT = "app/(site)/layout.tsx";
  const ROOT_LAYOUT = "app/layout.tsx";

  check(
    "A1.1",
    mounts.some((m) => m.file === SITE_LAYOUT),
    `analytics is mounted in the public site layout${
      packages.length ? ` (${packages.join(", ")})` : " — nothing is mounted"
    }`
  );

  // The root layout wraps all four trees. Mounting there measures the private
  // ones too, and does it without anything looking wrong on screen.
  check(
    "A1.2",
    !mounts.some((m) => m.file === ROOT_LAYOUT),
    "analytics is not in the root layout, which wraps the private trees as well"
  );

  for (const [tree, why] of FORBIDDEN_TREES) {
    const leaked = mounts.filter((m) => m.file.startsWith(tree + "/"));
    check(
      `A1.3 ${tree}`,
      leaked.length === 0,
      `no analytics under ${tree} — ${why}${leaked.length ? ` (found in ${leaked.map((l) => l.file).join(", ")})` : ""}`
    );
  }

  const stray = mounts.filter(
    (m) => m.file !== SITE_LAYOUT && !m.file.startsWith("app/(site)/")
  );
  check(
    "A1.4",
    stray.length === 0,
    `analytics is imported only under app/(site)/${stray.length ? ` — also in ${stray.map((s) => s.file).join(", ")}` : ""}`
  );
}

// --- A2: what is mounted is actually installed ---------------------------
{
  const pkgJson = JSON.parse(await readFile(path.join(WEB, "package.json"), "utf-8"));
  const declared = Object.keys(pkgJson.dependencies ?? {});
  const missing = packages.filter((p) => !declared.includes(p));
  check(
    "A2.1",
    missing.length === 0,
    `every mounted analytics package is a declared dependency of web/${missing.length ? ` — ${missing.join(", ")} is not` : ""}`
  );
}

// --- A3: the published documents describe what is running ----------------
// The Cookie Notice's own promise, enforced. If A1.1 passes and these fail,
// the site is measuring visitors while telling them it is not.
{
  const notice = await readFile(path.join(LEGAL, "COOKIE-NOTICE.md"), "utf-8");
  const privacy = await readFile(path.join(LEGAL, "PRIVACY.md"), "utf-8");
  const names = packages.map((p) => KNOWN_ANALYTICS.get(p));

  const unnamedInNotice = names.filter((n) => !notice.includes(n));
  check(
    "A3.1",
    unnamedInNotice.length === 0,
    `the Cookie Notice names every tool that is running${unnamedInNotice.length ? ` — missing ${unnamedInNotice.join(", ")}` : ` (${names.join(", ")})`}`
  );

  const unnamedInPrivacy = names.filter((n) => !privacy.includes(n));
  check(
    "A3.2",
    unnamedInPrivacy.length === 0,
    `the Privacy Policy names every tool that is running${unnamedInPrivacy.length ? ` — missing ${unnamedInPrivacy.join(", ")}` : ` (${names.join(", ")})`}`
  );

  // The whole reason there is no consent banner on this site is that the tool
  // stores nothing on the device. Swap in one that does and this claim becomes
  // false — which is a legal problem, not a copy problem, so it fails here.
  check(
    "A3.3",
    /does not use cookies/i.test(notice) && /store or read anything on your\s+device/i.test(notice),
    "the Cookie Notice still states the tool sets no cookies and stores nothing on the device"
  );

  // Both documents carry a date, and a reader deserves it to have moved when
  // the substance did. `legal.test.mjs` checks the field exists; this checks it
  // is not still the pre-analytics date.
  const stale = [];
  for (const [name, text] of [["COOKIE-NOTICE.md", notice], ["PRIVACY.md", privacy]]) {
    if (/Last updated:\*\*\s*13 August 2026/.test(text)) stale.push(name);
  }
  check(
    "A3.4",
    stale.length === 0,
    `the "Last updated" date moved when analytics was added${stale.length ? ` — still 13 August 2026 in ${stale.join(", ")}` : ""}`
  );
}

console.log(
  failures === 0 ? "\nsiteAnalytics: all checks passed" : `\nsiteAnalytics: ${failures} check(s) failed`
);
process.exit(failures === 0 ? 0 : 1);
