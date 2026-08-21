// Waitlist confirmation email suite — the mail a visitor gets after signing up.
//
// Run: npm test
//
// No database, no network. It transpiles `web/lib/waitlistConfirmationEmail.ts`
// and inspects what the template actually produces.
//
// ── Why this file has to compile before it can look ────────────────────────
//
// The root `tsconfig.json` compiles `src/**/*.ts` into `dist`, and every other
// suite imports from there. This module lives in `web/lib`, which the web app
// bundles and the root build never touches, so there is no `dist` copy to
// import. Rather than move a web-only template into `src` to make it testable,
// the suite compiles that one file with the repo's own `tsc`.
//
// It shells out rather than calling the compiler API on purpose: TypeScript 7
// is the native port, and its npm package no longer exports `transpileModule`
// — `require("typescript").transpileModule` is `undefined`. The CLI is the
// supported surface now.
//
// `--noCheck` because this suite is not a type-checker. `npm run typecheck:web`
// already checks this file in its real project, with the web app's `tsconfig`
// and its `@types/node`; re-checking it here in isolation would only invent
// errors about `process` that the real build does not have.
//
// ── What it guards, and why each one is here ────────────────────────────────
//
//   - **The images resolve.** The template links two assets by absolute URL.
//     Nothing in the type system or the build connects those strings to files
//     on disk, so a rename or an uncommitted asset ships a confirmation with
//     broken images to every person who signs up — and it fails in *their*
//     inbox, where nobody will see it. This is the check that matters most.
//   - **No third-party resources.** Mail clients block remote content from
//     unknown hosts, and a tracker in a transactional email is a privacy
//     problem we do not want to introduce by accident.
//   - **The endorsement appears once.** Yutic's brand rules say the endorsement
//     appears once per surface. An email is a surface.
//   - **The text part carries the same facts as the HTML.** Plain-text is what
//     a screen reader or a text-only client gets; it is not decoration.
//   - **`SITE_URL` is honoured.** A preview deploy that mails production links
//     is worse than one that mails nothing.

import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SOURCE = path.join(ROOT, "web", "lib", "waitlistConfirmationEmail.ts");
const PUBLIC_DIR = path.join(ROOT, "web", "public");

/**
 * Compiled **inside the repository**, not in the system temp directory.
 *
 * The template now imports the shared email shell as `argus-cloud/emailLayout.js`
 * — a bare specifier, resolved by walking up from the importing file to a
 * `node_modules` that has it. From `/tmp` that walk finds nothing and the import
 * fails with ERR_MODULE_NOT_FOUND, so the suite could not load the module it
 * exists to check. Compiling under the repo root puts the workspace link back on
 * the path. `test/.tmp-*` is already gitignored, which is why it goes there
 * rather than beside the root.
 */
const OUT = await mkdtemp(path.join(HERE, ".tmp-email-"));
execFileSync(
  process.execPath,
  [
    path.join(ROOT, "node_modules", "typescript", "bin", "tsc"),
    "--noCheck",
    "--module",
    "esnext",
    "--target",
    "es2022",
    "--outDir",
    OUT,
    SOURCE,
  ],
  // Two constraints that pull opposite ways, so they are satisfied separately.
  //
  // The **output** goes inside the repo, or the compiled module cannot resolve
  // `argus-cloud/emailLayout.js` — a bare specifier is found by walking up to a
  // `node_modules`, and from the system temp directory that walk finds nothing.
  //
  // The **working directory** stays outside it, because naming a file on the
  // command line while a `tsconfig.json` is discoverable from the cwd is TS5112,
  // which TypeScript treats as an error rather than a warning.
  { stdio: "pipe", cwd: tmpdir() }
);
const COMPILED = pathToFileURL(path.join(OUT, "waitlistConfirmationEmail.js")).href;

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/**
 * Import the compiled module with `NEXT_PUBLIC_SITE_URL` set as given.
 *
 * The query string is load-bearing: the module reads the env var once, at
 * module scope, so a second plain `import()` would hand back the first
 * evaluation and E5 would pass without proving anything.
 */
let evaluation = 0;
async function load(siteUrl) {
  const before = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;

  const mod = await import(`${COMPILED}?v=${++evaluation}`);

  if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = before;
  return mod;
}

const DEFAULT_SITE = "https://normascope.com";
const mod = await load(undefined);
const html = mod.waitlistConfirmationHtml();
const text = mod.WAITLIST_CONFIRMATION_TEXT;
const subject = mod.WAITLIST_CONFIRMATION_SUBJECT;

// --- the images actually exist -------------------------------------------

const srcUrls = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);

check("E1", srcUrls.length >= 2, `the template links ${srcUrls.length} image(s)`);

check(
  "E2",
  srcUrls.every((u) => u.startsWith(`${DEFAULT_SITE}/`)),
  "every image is an absolute URL on the site's own origin — a relative path renders as a broken image in mail"
);

const missing = srcUrls
  .map((u) => u.slice(DEFAULT_SITE.length))
  .filter((p) => !existsSync(path.join(PUBLIC_DIR, p)));

check(
  "E3",
  missing.length === 0,
  missing.length === 0
    ? "every linked image exists in web/public"
    : `linked but missing from web/public: ${missing.join(", ")}`
);

// --- nothing loads from anywhere else -------------------------------------

const externalHosts = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
  .map((m) => new URL(m[1]).origin)
  .filter((origin) => origin !== DEFAULT_SITE);

check(
  "E4",
  externalHosts.length === 0,
  externalHosts.length === 0
    ? "no resource or link points at a third-party host"
    : `third-party origins present: ${[...new Set(externalHosts)].join(", ")}`
);

// --- the site URL is configuration, not a constant ------------------------

const staged = await load("https://preview.example.dev");
const stagedHtml = staged.waitlistConfirmationHtml();

/**
 * **Changed deliberately, 2026-08-21, and narrowed rather than weakened.**
 *
 * This asserted that `NEXT_PUBLIC_SITE_URL` redirected *every link and image*.
 * The reasoning it carried — "a preview deploy that mails production links is
 * worse than one that mails nothing" — is about **links**, and it still holds
 * exactly as written: a preview mailing a production link sends someone to an
 * app where the thing they were sent does not exist.
 *
 * It does not hold for **images**, and following it broke them. A preview's own
 * assets sit behind Vercel Deployment Protection, so a mail client's image proxy
 * fetches the wordmark and gets an SSO redirect — a broken image in a real
 * person's inbox. The mark is byte-identical on every deployment, so pointing at
 * the sending one buys nothing and costs the logo.
 *
 * So: links follow the deployment, images follow `EMAIL_ASSET_ORIGIN`
 * (`emailLayout.ts`). Both halves are checked, and E5b is the one that would
 * catch a well-meaning revert of this decision.
 */
const stagedLinks = [...stagedHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
const stagedImages = [...stagedHtml.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);

check(
  "E5",
  stagedLinks.length > 0 && stagedLinks.every((u) => u.startsWith("https://preview.example.dev")),
  `every link follows NEXT_PUBLIC_SITE_URL, so a preview never mails production links (${stagedLinks.length} checked)`
);

check(
  "E5b",
  stagedImages.length > 0 && stagedImages.every((u) => u.startsWith(DEFAULT_SITE)),
  `every image comes from the public asset origin instead (${stagedImages.length} checked) — a preview's own ` +
    "assets are behind deployment protection, and a mail client's image proxy gets a login page"
);

check(
  "E6",
  staged.WAITLIST_CONFIRMATION_TEXT.includes("https://preview.example.dev") &&
    !staged.WAITLIST_CONFIRMATION_TEXT.includes(DEFAULT_SITE),
  "the text part follows the same origin as the HTML"
);

// --- the template rendered cleanly ----------------------------------------

check(
  "E7",
  !/undefined|null|NaN|\[object Object\]/.test(html),
  "no interpolation leaked `undefined`, `null`, `NaN` or `[object Object]` into the body"
);

const opens = (tag) => (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
const closes = (tag) => (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;

check(
  "E8",
  opens("table") === closes("table") && opens("tr") === closes("tr") && opens("td") === closes("td"),
  `table markup is balanced (table ${opens("table")}/${closes("table")}, tr ${opens("tr")}/${closes("tr")}, td ${opens("td")}/${closes("td")}) — an unclosed cell collapses the layout in Outlook`
);

check(
  "E9",
  /^<!doctype html>/i.test(html) && html.trimEnd().endsWith("</html>"),
  "the body is a complete HTML document"
);

// --- the parts agree -------------------------------------------------------

check("E10", subject.trim().length > 0 && subject.length <= 78, `subject is set and fits a line (${subject.length} chars)`);

check(
  "E11",
  !/\$\{|@/.test(subject),
  "the subject carries no interpolation and no address — it is identical for every recipient, so it cannot leak who signed up"
);

check(
  "E12",
  text.includes("Team Yutic") && html.includes("Team Yutic"),
  "both parts are signed"
);

check(
  "E13",
  text.trim().length > 0 && !/<[a-z]/i.test(text),
  "the text part is real plain text, not HTML with the tags left in"
);

// --- the parent brand appears once, as the rules require ------------------

const endorsements = (html.match(/product from Yutic/g) ?? []).length;
check(
  "E14",
  endorsements === 1,
  `the Yutic endorsement appears exactly once (found ${endorsements}) — yutic-brand rules, "once per surface"`
);

await rm(OUT, { recursive: true, force: true });

console.log(
  failures === 0
    ? "\nwaitlistConfirmationEmail: all checks passed"
    : `\nwaitlistConfirmationEmail: ${failures} check(s) failed`
);
process.exit(failures === 0 ? 0 : 1);
