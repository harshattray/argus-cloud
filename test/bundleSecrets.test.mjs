// What the browser is allowed to receive — `BuildV5.md` J3.3, and D5's method
// re-run against the build rather than against a deployment.
//
// Run: npm test   (needs `web/.next`; `npm run verify` builds it first)
//
// **Why this is a suite and not a shell command on go-live day.** J3.3 is a
// one-off in the plan: grep the client bundles for `DATABASE_URL`, the R2 keys
// and `ANTHROPIC_API_KEY` before the deployment goes public. But the thing it
// checks is not a property of that day — it is a property of every commit that
// touches a component. A secret reaches the browser the moment someone reads
// one in a file that is not `"use server"`, and the way that gets caught is a
// check that runs on every push, not a memory of having grepped once.
//
// Two kinds of check, because each catches what the other misses:
//
//   B2 looks for the *shape of a value* — `postgres://…`, `sk-ant-…`, an R2
//      endpoint. This is the one that catches a secret pasted into a component
//      as a literal, which no amount of `process.env` discipline prevents.
//   B4 looks at the *names*. Next inlines `NEXT_PUBLIC_*` and only those, so
//      the set of public names in a bundle is the set someone decided to
//      publish. An allowlist turns adding one into a deliberate act.
//
// B6 is the counter-test in the sense of CLAUDE.md rule 3: the same scanner is
// run over a string that does contain a connection string, and has to report
// it. Without that, a regex that never matches anything looks exactly like a
// bundle that is clean.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const NEXT = path.join(ROOT, "web", ".next");
const CLIENT = path.join(NEXT, "static");

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(CLIENT))) {
  // Deliberately not a failure: `npm test` runs on its own, and on a clean
  // checkout there is nothing built to read. `verify` and CI both build the web
  // app before the suite so this path is not the one that runs there.
  console.log("\nSKIP  B  web/.next/static absent — run `npm run verify`, or `npm run build --workspace web` first\n");
  console.log("bundleSecrets: skipped (nothing built to read)");
  process.exit(0);
}

/** Every file the browser can fetch from the build, read once. */
async function clientFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await clientFiles(full)));
    } else if (/\.(js|mjs|css|json|map)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = await clientFiles(CLIENT);
const bundles = await Promise.all(
  files.map(async (f) => ({ name: path.relative(NEXT, f), text: await readFile(f, "utf-8") }))
);

// ═══ B1 — the scan is looking at something ═══
//
// Every check below reports "clean" over an empty list just as happily as over
// a real build, so the count is the check that the rest mean anything.
check("B1", bundles.length >= 10, `${bundles.length} client files read from web/.next/static`);

// ═══ B2 — no value shaped like a credential ═══
//
// Prefixes and hostnames rather than entropy: a 40-character base64 run matches
// half of a minified bundle, and a check that cries wolf is one that gets
// commented out.
const SHAPES = [
  ["a Postgres connection string", /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/],
  ["an Anthropic API key", /sk-ant-[A-Za-z0-9_-]{8}/],
  ["an R2/S3 endpoint", /[a-f0-9]{20,}\.r2\.cloudflarestorage\.com/],
  ["a Resend API key", /\bre_[A-Za-z0-9]{16}/],
  ["a Paddle API key", /\bpdl_(?:live|sdbx)_apikey_[A-Za-z0-9]{8}/],
  ["a private key block", /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
];

const shapeHits = [];
for (const { name, text } of bundles) {
  for (const [label, pattern] of SHAPES) {
    if (pattern.test(text)) {
      shapeHits.push(`${label} in ${name}`);
    }
  }
}
check("B2", shapeHits.length === 0, `no credential-shaped value in any client file${shapeHits.length ? ` — ${shapeHits.join("; ")}` : ""}`);

// ═══ B3 — no server-only variable read or assigned in a client file ═══
//
// Weaker than B2 and kept anyway. Next replaces a non-public `process.env.X`
// with `undefined`, so the name usually vanishes and this check stays quiet —
// but it does not vanish from a template string, an error message, or a
// comment that quotes the value beside it.
//
// **The name alone is not the finding**, which the first run of this check
// proved: `ANTHROPIC_API_KEY` is in a client chunk because `/commands` explains
// that the CLI's explain mode needs one. That is documentation of a variable
// the *reader* sets on their own machine, and flagging it would have taught
// everyone to ignore B3. So the pattern needs a value beside the name, or a
// `process.env` read that should not have survived into client code.
const SERVER_ONLY = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "NORMA_STORAGE_SECRET_ACCESS_KEY",
  "NORMA_STORAGE_ACCESS_KEY_ID",
  "NORMA_STORAGE_SIGNING_SECRET",
  "JWT_SECRET",
  "NORMASCOPE_CLOUD_PASSWORD",
  "ADMIN_PASSWORD",
  "PITCH_PASSWORD",
  "RESEND_API_KEY",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "BACKUP_ENCRYPTION_KEY",
];
/** Server-only variables that are assigned a value here, or read at all. */
function serverOnlyIn(text) {
  return SERVER_ONLY.filter((varName) => {
    // Assigned a value: `X="…"`, `X: '…'`, `"X":"…"`. Eight characters of it,
    // so an empty string or a placeholder is not a finding.
    const assigned = new RegExp(`${varName}"?\\s*[:=]\\s*["'\`][^"'\`]{8,}`);
    // Or read at all — nothing on the client has any business reading one.
    const read = new RegExp(`process\\.env(?:\\.${varName}\\b|\\["${varName}"\\])`);
    return assigned.test(text) || read.test(text);
  });
}

const nameHits = [];
for (const { name, text } of bundles) {
  for (const varName of serverOnlyIn(text)) {
    nameHits.push(`${varName} in ${name}`);
  }
}
check("B3", nameHits.length === 0, `no server-only variable is read or assigned in a client file${nameHits.length ? ` — ${nameHits.join("; ")}` : ""}`);

// ═══ B4 — the published names are the ones we chose to publish ═══
//
// `NEXT_PUBLIC_*` is the only prefix Next inlines into client code, which makes
// it the only door. Three are through it today and each is a value that is
// already public by definition: the site's own URL and two search-engine
// verification strings that live in a `<meta>` tag.
const ALLOWED_PUBLIC = new Set([
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
  "NEXT_PUBLIC_BING_SITE_VERIFICATION",
  // Injected by the platform, not by us: Next's own client runtime reads these
  // two for Vercel's observability, guarded by `void 0 !== process.env`, and no
  // value is inlined beside either. They are listed rather than pattern-matched
  // away so that a *third* Vercel name arriving in a future release is a
  // decision someone makes here, not something that slips in unread.
  "NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH",
  "NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG",
]);
const publicNames = new Set();
for (const { text } of bundles) {
  for (const m of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    publicNames.add(m[0]);
  }
}
const unexpected = [...publicNames].filter((n) => !ALLOWED_PUBLIC.has(n));
check(
  "B4",
  unexpected.length === 0,
  `every NEXT_PUBLIC_ name in the bundles is one we chose${unexpected.length ? ` — unexpected: ${unexpected.join(", ")}` : ` (${publicNames.size} found)`}`
);

// ═══ B5 — no env file inside the build output ═══
//
// `.next` is what gets uploaded. An `.env` copied in by a Dockerfile or a stray
// `cp -r` ships the whole set at once, and `.gitignore` says nothing about it
// because the file never goes near git.
const stray = [];
for (const entry of await readdir(NEXT, { withFileTypes: true, recursive: true })) {
  if (/^\.env/.test(entry.name)) {
    stray.push(entry.name);
  }
}
check("B5", stray.length === 0, `no .env file inside web/.next${stray.length ? ` — ${stray.join(", ")}` : ""}`);

// ═══ B6 — the scanner is not inert ═══
//
// A clean bundle and a broken regex print the same word. This runs the B2
// patterns over text that genuinely holds one of each, and every pattern has to
// fire — including the ones a real build has never exercised.
const PLANT = [
  "postgres://someone:hunter2@db.example.com:5432/normascope",
  "sk-ant-api03-EXAMPLEEXAMPLE",
  "https://0123456789abcdef0123.r2.cloudflarestorage.com",
  "re_ExampleExampleEx01",
  "pdl_sdbx_apikey_EXAMPLE1",
  "-----BEGIN PRIVATE KEY-----",
].join("\n");
const caught = SHAPES.filter(([, pattern]) => pattern.test(PLANT));
check(
  "B6",
  caught.length === SHAPES.length,
  `all ${SHAPES.length} patterns fire on planted values — B2's silence is a clean build, not a dead regex (missed: ${
    SHAPES.filter(([, p]) => !p.test(PLANT))
      .map(([l]) => l)
      .join(", ") || "none"
  })`
);

// ═══ B7 — B3 still catches what it was loosened past ═══
//
// B3 began life as a plain `includes(name)` and failed on a page that *explains*
// what `ANTHROPIC_API_KEY` is for. Loosening a check to stop a false positive is
// exactly where a check quietly stops working, so both halves are exercised:
// the prose that should not fire, and the two shapes that must.
const PROSE = 'detail:["Needs the optional SDK installed, and your own ANTHROPIC_API_KEY."]';
const ASSIGNED = 'DATABASE_URL:"postgresql://app:swordfish@db.internal:5432/normascope"';
const READ = "const k=process.env.ANTHROPIC_API_KEY;";

const b7 = [
  ["documentation prose is not a finding", serverOnlyIn(PROSE).length === 0],
  ["a value assigned beside the name is", serverOnlyIn(ASSIGNED).includes("DATABASE_URL")],
  ["so is a client-side read of one", serverOnlyIn(READ).includes("ANTHROPIC_API_KEY")],
];
check("B7", b7.every(([, ok]) => ok), b7.map(([label, ok]) => `${ok ? "✓" : "✗"} ${label}`).join("; "));

console.log(failures === 0 ? "\nbundleSecrets: all checks passed" : `\nbundleSecrets: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
