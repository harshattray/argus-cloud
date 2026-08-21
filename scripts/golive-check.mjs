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
/**
 * Vercel's Deployment Protection bypass, when checking a protected preview.
 *
 * **Without it every check here is a lie in the optimistic direction.** A
 * protected deployment answers every path with a 302 to `vercel.com/sso-api`,
 * so nothing 404s, nothing errors, and a reader skimming the output sees a
 * deployment that responds to everything. The header is Vercel's documented
 * "Protection Bypass for Automation" secret, from the project's Deployment
 * Protection settings.
 */
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

async function get(pathname, init) {
  const headers = { ...(init?.headers ?? {}), ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) };
  const res = await fetch(`${canonical}${pathname}`, { redirect: "follow", ...init, headers });
  const body = await res.text().catch(() => "");
  const landed = new URL(res.url).pathname;
  const record = { pathname, landed, status: res.status, headers: res.headers, body };
  seen.push(record);
  return record;
}

const home = await get("/");

/**
 * Stop rather than report, when the canonical probe left the domain entirely.
 *
 * **This check exists because the first version of it did not work, and the
 * failure was the worst kind.** Pointed at a Vercel-protected preview, the
 * probe above followed the SSO redirect all the way to `vercel.com` and set
 * `canonical` to it — so every check afterwards ran against Vercel's own login
 * page and reported, among other things, `L9.1 PASS /login responds 200`. It
 * did. Vercel has a `/login`.
 *
 * The first attempt looked for `sso-api` in the body, which is in the *redirect
 * URL* and not in the page it lands on, so it never fired. The reliable signal
 * is not what the page says — it is that we asked one registrable domain and a
 * different one answered. A redirect within the domain is ordinary and expected
 * (an apex to `www`); a redirect off it means something is standing in front of
 * the deployment, and nothing below would be measuring the deployment.
 *
 * The two-label registrable-domain rule is wrong for `example.co.uk` and
 * deliberately so: it errs towards refusing to report, which is the safe
 * direction for a check whose whole job is to be trustworthy.
 */
const registrable = (host) => host.split(".").slice(-2).join(".");
const asked = new URL(origin).host;
const answered = new URL(canonical).host;
if (registrable(asked) !== registrable(answered)) {
  console.error(
    `asked ${asked} and ${answered} answered — something is standing in front of this deployment.\n\n` +
      (/vercel\.com$/.test(registrable(answered))
        ? "That is Vercel Deployment Protection. Every path returns its SSO page, so nothing below\n" +
          "would be checking your deployment. Either turn Vercel Authentication off for it, or set\n" +
          "VERCEL_AUTOMATION_BYPASS_SECRET (Settings → Deployment Protection → Protection Bypass for\n" +
          "Automation) and run this again.\n"
        : "Refusing to report: the results would describe whatever answered, not what was asked for.\n")
  );
  process.exit(2);
}

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

// ═══ L9 — the session layer, as deployed (Step 6) ═══
//
// **Every one of these is a property a deployment can lose without anything
// going red locally.** An environment variable unset in Vercel turns the GitHub
// button off; a header dropped from `middleware.ts` puts a sign-in page into a
// shared cache; a redirect misconfigured at the domain level breaks an OAuth
// callback that a passing suite still calls green. The suite proves the code.
// This proves the deployment, and they are not the same claim.
const login = await get("/login");
check("L9.1", login.status === 200, `/login responds ${login.status}`);
// Guarded on L9.1, and the guard is not defensive tidiness: run unguarded
// against a deployment that has no sign-in page, L9.2 reads the *404 page's*
// headers and passes. A check that goes green because the thing it checks does
// not exist is worse than no check — it is a claim.
if (login.status === 200) {
  check(
    "L9.2",
    (login.headers.get("referrer-policy") ?? "") === "no-referrer",
    `the sign-in page sends Referrer-Policy: no-referrer (${login.headers.get("referrer-policy") ?? "absent"})`
  );
  check(
    "L9.3",
    /no-store/.test(login.headers.get("cache-control") ?? ""),
    `and no-store, so it is never served from a shared cache (${login.headers.get("cache-control") ?? "absent"})`
  );
  check("L9.4", /nonce-/.test(cspOf(login)), "and runs under the strict nonce policy, not the site one");
} else if (!quiet) {
  console.log("SKIP  L9.2-4  no sign-in page on this deployment — its headers would be the 404's");
}

// The repository list is the first page behind the session. Signed out it must
// send you to sign in — never render, never 500.
const repos = await get("/repos", { redirect: "manual" });
const reposTarget = repos.headers.get("location") ?? "";
check(
  "L9.5",
  [302, 303, 307, 308].includes(repos.status) && /\/login/.test(reposTarget),
  `/repos signed out redirects to sign-in (${repos.status} → ${reposTarget || "nowhere"})`
);

// The link-request endpoint refuses a caller that presents no origin at all.
// A browser always sends one of these two headers; a script does not.
const noOrigin = await get("/api/auth/email/request", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "probe@example.com" }),
  redirect: "manual",
});
check("L9.6", noOrigin.status === 403, `the sign-in endpoint refuses a request with no origin (${noOrigin.status})`);

// A cross-site origin must be refused too — this is the CSRF half that
// SameSite alone does not cover.
const crossOrigin = await get("/api/auth/email/request", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ email: "probe@example.com" }),
  redirect: "manual",
});
check("L9.7", crossOrigin.status === 403, `and one from another origin (${crossOrigin.status})`);

// A spent or invented sign-in token must land on the sign-in page, not on a
// session and not on an error page that says which of the two it was.
const deadLink = await get("/api/auth/email/callback?token=definitely-not-a-real-token", { redirect: "manual" });
const deadTarget = deadLink.headers.get("location") ?? "";
check(
  "L9.8",
  [302, 303, 307, 308].includes(deadLink.status) && /\/login\?error=/.test(deadTarget),
  `an invalid sign-in link is refused without a session (${deadLink.status} → ${deadTarget || "nowhere"})`
);
if (deadLink.status !== 404) {
  check(
    "L9.9",
    !/set-cookie/i.test([...deadLink.headers.keys()].join(" ")),
    "and sets no cookie on the way out"
  );
}

// GitHub sign-in: configured or not, the answer must be one of exactly two
// shapes. A 500 here means the credentials are half-present.
const ghStart = await get("/api/auth/github/start", { redirect: "manual" });
const ghConfigured = [302, 303, 307, 308].includes(ghStart.status);
const ghTarget = ghStart.headers.get("location") ?? "";
check(
  "L9.10",
  ghConfigured || (ghStart.status === 404 && login.status === 200),
  `GitHub sign-in is either configured or deliberately absent, never broken (${ghStart.status})`
);
if (ghConfigured) {
  const url = (() => {
    try {
      return new URL(ghTarget);
    } catch {
      return null;
    }
  })();
  check("L9.11", url?.host === "github.com", `it redirects to github.com (${url?.host ?? "unparseable"})`);
  check("L9.12", Boolean(url?.searchParams.get("state")), "carrying a state parameter");
  check(
    "L9.13",
    /norma_oauth_state=/.test(ghStart.headers.get("set-cookie") ?? ""),
    "and the matching cookie, without which the callback cannot verify it"
  );
  // The redirect_uri must be one this deployment can actually serve, and it
  // must equal what the OAuth app has registered. Checked as a live request
  // rather than a string comparison: the failure this catches is a domain-level
  // redirect that drops the query string, which would strip the code and the
  // state on the way back from GitHub and break sign-in with nothing in a log.
  const redirectUri = url?.searchParams.get("redirect_uri") ?? "";
  check("L9.14", redirectUri.startsWith("https://"), `redirect_uri is https (${redirectUri || "absent"})`);
  if (redirectUri) {
    const probe = await fetch(`${redirectUri}?code=probe&state=probe`, { redirect: "manual" }).catch(() => null);
    const hop = probe?.headers.get("location") ?? "";
    const survives =
      probe !== null &&
      (probe.status < 300 ||
        probe.status >= 400 ||
        (/code=probe/.test(hop) && /state=probe/.test(hop)));
    check(
      "L9.15",
      survives,
      `the registered callback keeps its query string${hop ? ` (${probe.status} → ${hop})` : ` (${probe?.status ?? "unreachable"})`}`
    );
  }
} else if (!quiet) {
  console.log("SKIP  L9.11-15  GitHub sign-in is not configured on this deployment");
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
