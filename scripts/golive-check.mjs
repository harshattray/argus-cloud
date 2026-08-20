#!/usr/bin/env node
//
// Checks a *deployment* — `BuildV5.md` Phase J, the half that cannot be proven
// from a laptop.
//
//   node scripts/golive-check.mjs https://normascope.com
//   node scripts/golive-check.mjs https://normascope.com --quiet
//
// **Why this is a script and not a checklist.** J3.1–J3.3 and J2.2 are written
// in `BuildV5.md` as things to do once, on the day. Every one of them is a
// property that can break later without anything going red: a header dropped in
// a `next.config.mjs` edit, a route that stops being gated when auth arrives in
// Step 6, a bucket made public to debug something at 1am. Running them by hand
// on go-live day proves the deployment was correct on go-live day.
//
// The suite proves what the code does. This proves what the deployment does,
// and the two are not the same claim: `test/bundleSecrets.test.mjs` reads
// `.next` on this machine, while this reads what the server actually returns
// over the wire, including the headers no build artifact contains.
//
// Needs no credentials. Set the `NORMA_STORAGE_*` variables as well and it also
// checks that the bucket refuses unsigned reads (J2.2).
//
// Exit codes follow `ops-check.mjs`:
//   0  everything checked passed
//   1  something failed
//   2  the check could not run (no URL, host unreachable)

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const base = args.find((a) => !a.startsWith("--"));

if (!base || !/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/golive-check.mjs https://your-deployment [--quiet]");
  process.exit(2);
}
const origin = base.replace(/\/$/, "");

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  if (!ok || !quiet) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  }
  if (!ok) failures++;
}

/**
 * Where the site actually serves from.
 *
 * **Redirects are followed, and this is the reason.** The first run of this
 * script pointed at the apex domain, which 308s to `www`. Every request came
 * back 308, and the gate checks below read that as "not served to an anonymous
 * request" — six passes, none of which had reached the application at all. A
 * check that a redirect satisfies is a check that proves nothing, so the
 * canonical host is resolved once and everything after is measured against a
 * real response.
 */
let canonical = origin;
try {
  const probe = await fetch(`${origin}/`, { redirect: "follow" });
  canonical = new URL(probe.url).origin;
} catch (err) {
  console.error(`could not reach ${origin}: ${String(err.message ?? err)}`);
  process.exit(2);
}
if (canonical !== origin && !quiet) {
  console.log(`note: ${origin} redirects to ${canonical} — checking there\n`);
}

/** Every response is kept, so L5 can scan all of them at the end. */
const seen = [];
async function get(pathname, init) {
  const res = await fetch(`${canonical}${pathname}`, { redirect: "follow", ...init });
  const body = await res.text().catch(() => "");
  const landed = new URL(res.url).pathname;
  const record = { pathname, landed, status: res.status, headers: res.headers, body };
  seen.push(record);
  return record;
}

const home = await get("/");

// ═══ L1 — the deployment answers, and the apex reaches it ═══
check("L1.1", home.status === 200, `${canonical}/ responds ${home.status}`);
check(
  "L1.2",
  canonical.startsWith("https://"),
  `the canonical origin is https (${canonical})`
);

// ═══ L2 — the security headers are on the response, not only in the config ═══
//
// D5's method, re-run against the deployment rather than inherited from it.
// These live in `web/next.config.mjs`; a header that is configured and not
// served is the failure this catches, and it looks identical to success in
// every local check.
const REQUIRED = [
  ["strict-transport-security", /max-age=\d{7,}/],
  ["x-content-type-options", /nosniff/],
  ["x-frame-options", /DENY/i],
  ["referrer-policy", /no-referrer/],
];
const missing = REQUIRED.filter(([name, shape]) => !shape.test(home.headers.get(name) ?? ""));
check(
  "L2",
  missing.length === 0,
  `every security header is served${missing.length ? ` — missing or wrong: ${missing.map(([n]) => n).join(", ")}` : ` (${REQUIRED.length} checked)`}`
);

// ═══ L3 — the CSP, and the nonce on the routes that have one ═══
//
// **Two policies, and asking the wrong one is how this check goes green while
// meaning nothing.** The public site is served `script-src 'self'
// 'unsafe-inline'`; the strict, nonce-based policy is for `/r/` and `/admin`.
// The first version of this check looked for a nonce on `/` and reported the
// deployment broken — the deployment was right and the check was pointed at the
// wrong route.
//
// The nonce matters because `/r/` rendered blank in production once already:
// the policy is real, and a real policy can be wrong in ways no local page load
// reveals. A nonce that repeats across requests is a constant with a long name,
// and an injected script can carry it.
const cspOf = (res) => res.headers.get("content-security-policy") ?? "";
const nonceOf = (policy) => (/'nonce-([A-Za-z0-9+/=_-]+)'/.exec(policy) ?? [])[1] ?? null;

const strictPath = `/r/${"00000000-0000-4000-8000-000000000000"}`;
const strictOne = await get(strictPath);
const strictTwo = await get(strictPath);
const first = nonceOf(cspOf(strictOne));
const second = nonceOf(cspOf(strictTwo));

check("L3.1", /frame-ancestors 'none'/.test(cspOf(home)), "the site's CSP forbids framing");
check("L3.2", /frame-ancestors 'none'/.test(cspOf(strictOne)), "and so does the strict one on /r/");
check("L3.3", first !== null, `the strict policy carries a nonce (${first ? "yes" : "no"})`);
check("L3.4", first !== null && first !== second, "and it differs between two requests — a fixed nonce is not a nonce");
check(
  "L3.5",
  !/script-src[^;]*'unsafe-inline'/.test(cspOf(strictOne)),
  "the strict policy does not also allow inline scripts, which would make the nonce decoration"
);

// ═══ L4 — nothing private answers without a session ═══
//
// The ids are random on purpose. A real one would test authorization for that
// object; a random one tests whether the route is gated at all, which is the
// question before Step 6 exists.
const nowhere = "00000000-0000-4000-8000-000000000000";
const privateRoutes = [
  ["/admin", "waitlist administration"],
  [`/repos/${nowhere}`, "a repository view"],
  [`/repos/${nowhere}/trend?frame=x.png`, "a frame trend"],
  [`/r/${nowhere}`, "a run report"],
  [`/api/trends?repo=${nowhere}&frame=x.png`, "the trends API"],
];
for (const [pathname, label] of privateRoutes) {
  const res = await get(pathname);
  // Three ways a route can be closed, and all three are legitimate: it refuses
  // (401/403/404), it sends you somewhere else (a sign-in page), or it answers
  // in place with a gate rather than with data. Only the fourth case — 200, at
  // the address asked for, with no sign of a gate — is a finding.
  const sentElsewhere = res.landed !== new URL(`${canonical}${pathname}`).pathname;
  const looksGated = /sign in|sign-in|access code|password|not found|unauthori[sz]ed/i.test(res.body);
  const open = res.status === 200 && !sentElsewhere && !looksGated;
  check(
    `L4 ${pathname}`,
    !open,
    `${label} is not served to an anonymous request (${res.status}${sentElsewhere ? ` → ${res.landed}` : ""})`
  );
}

// ═══ L5 — nothing secret came back in any response ═══
//
// The same shapes `test/bundleSecrets.test.mjs` uses, applied to bodies *and*
// headers. A build artifact cannot contain a header.
const SHAPES = [
  ["a Postgres connection string", /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/],
  ["an Anthropic API key", /sk-ant-[A-Za-z0-9_-]{8}/],
  ["a Resend API key", /\bre_[A-Za-z0-9]{16}/],
  ["a Paddle API key", /\bpdl_(?:live|sdbx)_apikey_[A-Za-z0-9]{8}/],
  ["an AWS/R2 secret assignment", /(?:SECRET_ACCESS_KEY|ACCESS_KEY_ID)"?\s*[:=]\s*["'][^"']{8,}/],
  ["a private key block", /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
];
const leaks = [];
for (const res of seen) {
  const headerText = [...res.headers].map(([k, v]) => `${k}: ${v}`).join("\n");
  for (const [label, pattern] of SHAPES) {
    if (pattern.test(res.body)) leaks.push(`${label} in the body of ${res.pathname}`);
    if (pattern.test(headerText)) leaks.push(`${label} in a header of ${res.pathname}`);
  }
}
check("L5", leaks.length === 0, `no credential-shaped value in ${seen.length} responses${leaks.length ? ` — ${leaks.join("; ")}` : ""}`);

// ═══ L6 — the private trees are out of the index ═══
const robots = await get("/robots.txt");
const disallowed = ["/r/", "/api/", "/admin/"].filter((p) => !robots.body.includes(`Disallow: ${p}`));
check("L6", robots.status === 200 && disallowed.length === 0,
  `robots.txt keeps the private trees out${disallowed.length ? ` — missing: ${disallowed.join(", ")}` : ""}`);

// ═══ L7 — the bucket is private (J2.2) ═══
//
// Skipped rather than assumed when the storage environment is absent: this
// check needs to know which host to ask, and guessing it would produce a pass
// that means nothing.
const bucket = process.env.NORMA_STORAGE_BUCKET?.trim();
const endpoint = process.env.NORMA_STORAGE_ENDPOINT?.trim();
if (bucket && endpoint) {
  const pathStyle = process.env.NORMA_STORAGE_FORCE_PATH_STYLE === "1";
  const host = pathStyle
    ? `${endpoint}/${bucket}`
    : `${new URL(endpoint).protocol}//${bucket}.${new URL(endpoint).host}`;
  let listStatus = 0;
  let objectStatus = 0;
  try {
    listStatus = (await fetch(`${host}/`)).status;
    objectStatus = (await fetch(`${host}/org/${nowhere}/blob/probe.png`)).status;
  } catch (err) {
    console.error(`could not reach the bucket host: ${String(err.message ?? err)}`);
  }
  check("L7.1", listStatus !== 200, `listing the bucket without a signature is refused (${listStatus})`);
  check("L7.2", objectStatus !== 200, `reading an object without a signature is refused (${objectStatus})`);
} else if (!quiet) {
  console.log("SKIP  L7  set NORMA_STORAGE_BUCKET and NORMA_STORAGE_ENDPOINT to check the bucket is private");
}

// ═══ L8 — the scanner is not inert ═══
//
// L5 prints the same word for a clean deployment and a dead regex.
const PLANT = [
  "postgres://someone:hunter2@db.example.com:5432/normascope",
  "sk-ant-api03-EXAMPLEEXAMPLE",
  "re_ExampleExampleEx01",
  "pdl_sdbx_apikey_EXAMPLE1",
  'SECRET_ACCESS_KEY="EXAMPLEEXAMPLE"',
  "-----BEGIN PRIVATE KEY-----",
].join("\n");
const dead = SHAPES.filter(([, pattern]) => !pattern.test(PLANT)).map(([label]) => label);
check("L8", dead.length === 0, `all ${SHAPES.length} patterns fire on planted values${dead.length ? ` — dead: ${dead.join(", ")}` : ""}`);

console.log(
  failures === 0
    ? `\ngolive-check: ${origin} passed every check`
    : `\ngolive-check: ${failures} check(s) failed against ${origin}`
);
process.exit(failures === 0 ? 0 : 1);
