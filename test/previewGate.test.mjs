// The whole-deployment preview gate — FUTURENORMA §1 ("the two environments").
//
// Run: npm test
//
// **Why this has its own suite.** `web/lib/previewGate.ts` is fifteen lines of
// branching, and every branch has a security consequence: one publishes
// unreleased work, one locks an operator out of a laptop, one makes the unlock
// screen unreachable so nobody can ever get in. It is exactly the shape of code
// that looks obviously correct and has an off-by-one environment in it.
//
// The module imports nothing, which is why it is a separate file from
// `gate.ts` — that one pulls in `next/server` and cannot be loaded here. This
// compiles the single file and asks it questions.

import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SOURCE = path.join(ROOT, "web", "lib", "previewGate.ts");

const OUT = await mkdtemp(path.join(HERE, ".tmp-previewgate-"));
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
  // cwd outside the repo: naming a file on the command line while a
  // `tsconfig.json` is discoverable from the working directory is TS5112, which
  // TypeScript treats as an error rather than a warning.
  { stdio: "pipe", cwd: tmpdir() }
);

const {
  previewGateState,
  isNonProductionDeployment,
  PREVIEW_UNLOCK_PATH,
  PREVIEW_MAX_AGE_SECONDS,
  PREVIEW_COOKIE,
  PREVIEW_SCOPE,
} = await import(pathToFileURL(path.join(OUT, "previewGate.js")).href);

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const PHRASE = { PREVIEW_PASSWORD: "a-phrase" };

// ═══ G1 — a laptop is never gated ═══
//
// The failure this prevents is small and constant: a developer running
// `npm run dev:web` meeting an unlock screen they have no phrase for, on every
// branch, forever.
{
  check("G1.1", previewGateState("/", {}) === "open", "no VERCEL_ENV at all — local development is open");
  check("G1.2", previewGateState("/repos", { ...PHRASE }) === "open", "and stays open even when a phrase happens to be set");
  check("G1.3", isNonProductionDeployment({}) === false, "an absent VERCEL_ENV is not a deployment");
}

// ═══ G2 — production is never gated ═══
//
// The expensive direction. A gate that caught production would take the live
// site down and present a password box to customers.
{
  const prod = { VERCEL_ENV: "production" };
  check("G2.1", previewGateState("/", prod) === "open", "the production deployment is open");
  check("G2.2", previewGateState("/repos", { ...prod, ...PHRASE }) === "open", "and a phrase set there changes nothing");
  check("G2.3", isNonProductionDeployment(prod) === false, "production is not a non-production deployment");
}

// ═══ G3 — a preview is gated, everywhere ═══
{
  const preview = { VERCEL_ENV: "preview", ...PHRASE };
  const paths = ["/", "/repos", "/r/some-run", "/cloud", "/login", "/pitch", "/admin"];
  const gated = paths.filter((p) => previewGateState(p, preview) === "gated");
  check("G3.1", gated.length === paths.length, `every path is gated on a preview (${gated.length}/${paths.length})`);
  check(
    "G3.2",
    previewGateState(PREVIEW_UNLOCK_PATH, preview) === "open",
    `except ${PREVIEW_UNLOCK_PATH} itself, or there would be no way in`
  );
  check(
    "G3.3",
    previewGateState(`${PREVIEW_UNLOCK_PATH}/nested`, preview) === "gated",
    "and the exemption is that exact path, not a prefix — otherwise anything under it would be a hole"
  );
}

// ═══ G4 — a preview with no phrase refuses, rather than publishing ═══
//
// **This is the branch that matters most.** The other gates in `gate.ts`
// default-deny by 404ing their own tree, because a missing variable there means
// "never meant to be published". A missing variable on a whole deployment means
// somebody forgot — and guessing "open" publishes unreleased work to anyone who
// has the URL.
{
  const forgot = { VERCEL_ENV: "preview" };
  check("G4.1", previewGateState("/", forgot) === "misconfigured", "a preview with no phrase refuses to serve");
  check("G4.2", previewGateState("/repos", forgot) === "misconfigured", "on every path");
  check(
    "G4.3",
    previewGateState(PREVIEW_UNLOCK_PATH, forgot) === "misconfigured",
    "including the unlock screen — there is nothing to unlock it with, and offering a box would be theatre"
  );
  check(
    "G4.4",
    previewGateState("/", { VERCEL_ENV: "preview", PREVIEW_PASSWORD: "" }) === "misconfigured",
    "an empty phrase is a missing phrase, not a phrase that matches an empty box"
  );

  // The counter-test. This is what the naive implementation does — treat an
  // unset password the way `gateFor` does, as "this gate is not configured, so
  // carry on" — and it is the version that publishes the preview.
  const naive = (env) => (env.PREVIEW_PASSWORD ? "gated" : "open");
  check(
    "G4.5",
    naive(forgot) === "open",
    "counter-test: reading an unset phrase as 'no gate configured' serves the preview to anyone — which is why G4.1 exists"
  );
}

// ═══ G5 — any other Vercel environment is treated as a preview ═══
//
// `VERCEL_ENV` is documented as one of three values. If a fourth ever appears,
// the safe reading of an unknown environment is "not production".
{
  check(
    "G5.1",
    previewGateState("/", { VERCEL_ENV: "development", ...PHRASE }) === "gated",
    "the `development` deployment environment is gated too");
  check(
    "G5.2",
    previewGateState("/", { VERCEL_ENV: "something-new", ...PHRASE }) === "gated",
    "and so is an environment nobody has heard of — unknown is not production"
  );
}

// ═══ G6 — the cookie is its own ═══
{
  check("G6.1", PREVIEW_COOKIE !== "np_pitch" && PREVIEW_COOKIE !== "np_admin", `a cookie of its own (${PREVIEW_COOKIE})`);
  check(
    "G6.2",
    PREVIEW_SCOPE !== "pitch" && PREVIEW_SCOPE !== "admin",
    `and its own scope (${PREVIEW_SCOPE}), so one phrase cannot open another gate even if both are set the same`
  );
  check(
    "G6.3",
    PREVIEW_MAX_AGE_SECONDS <= 60 * 60 * 24 * 7,
    `the cookie lives at most a week (${PREVIEW_MAX_AGE_SECONDS}s) — a phrase shown in a meeting leaks eventually`
  );
}

await rm(OUT, { recursive: true, force: true });

console.log(failures === 0 ? "\npreviewGate: all checks passed" : `\npreviewGate: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
