#!/usr/bin/env node
//
// Tenant isolation on the repository views, over HTTP, against a running server.
//
//   scripts/test-db.sh start
//   DATABASE_URL="$(scripts/test-db.sh url)" npm run build:web
//   (cd web && DATABASE_URL="$(../scripts/test-db.sh url)" NORMA_DEV_OPEN=0 \
//      npx next start -p 3200)
//   DATABASE_URL="$(scripts/test-db.sh url)" GATE_BASE=http://127.0.0.1:3200 \
//      node scripts/tenant-gate-check.mjs
//
// **Why this is not in `npm test`.** Every other check in this repo answers
// without a server. These four routes cannot: what is being tested is the
// wiring between a session cookie, a repository id in a URL, and a database
// row, and a unit test of any one of those three is what let the defect below
// ship in the first place. It needs a build, a server and a real Postgres, so
// it is a script you run rather than a suite that runs on every push.
//
// **The defect it exists for.** Until 2026-08-22 `/repos/{id}/trend` and its CSV
// export were gated by `NORMA_DEV_OPEN` alone — a variable no deployment sets —
// so every customer who clicked a sparkline got "Not found", while the docs
// recorded the gate as closed. `cloudShell` S11.24–S11.26 hold the shape of the
// fix in the source. This proves the behaviour.
//
// **`NORMA_DEV_OPEN` must not be `1`.** The script cannot read the server's
// environment, so it does not claim to: G1.1 is the proof. With the door open
// that request renders the whole trend to a stranger, and the check fails.
//
// Two tenants are created and deleted again. Nothing else in the database is
// touched.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const BASE = process.env.GATE_BASE ?? "http://127.0.0.1:3200";
// `__Host-` in production, plain in development — `sessionCookieName()` decides,
// and the server was built one way or the other. Overridable for a dev server.
const COOKIE = process.env.GATE_COOKIE_NAME ?? "__Host-norma_session";

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createSession } = await import(path.join(DIST, "sessions.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

/**
 * The body as a reader sees it: tags and React's text-node comment markers
 * gone.
 *
 * **Needed, and the first version of G5 was wrong without it.** React splits
 * `{label} is for {roles}` into separate text nodes and writes `<!-- -->`
 * between them, so the raw HTML says `is for <!-- -->admins` and a plain
 * substring search for "is for admins" finds nothing. The check reported that a
 * designer had reached the billing area when the page was refusing them
 * correctly on screen.
 */
function readable(html) {
  return html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

async function get(pathname, token) {
  const res = await fetch(`${BASE}${pathname}`, {
    redirect: "manual",
    headers: token ? { cookie: `${COOKIE}=${token}` } : {},
  });
  const body = await res.text();
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    body,
    text: readable(body),
  };
}

const db = await createDb();
await migrate(db);

/**
 * One tenant: an organization, a repository, a member with a session, and four
 * runs of one frame so the trend page has something to draw and the export has
 * rows to write.
 *
 * The commit shas are the marker the checks look for. **Not the frame label** —
 * that comes out of the requester's own query string and is echoed back in the
 * refusal, so "the body contains hero.png" says nothing about whether anything
 * was read. The first version of this script used the label and passed a
 * refusal that had leaked nothing, which is the wrong reason to be green.
 */
async function tenant(label) {
  const orgId = randomUUID();
  const repoId = randomUUID();
  const userId = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, `Gate ${label}`]);
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, $3)", [repoId, orgId, `gate-${label}`]);
  await db.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)", [
    userId,
    `gate-${label}-${userId.slice(0, 8)}@example.com`,
    `Gate ${label}`,
  ]);
  await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'member')", [orgId, userId]);

  const base = Date.now() - 20 * 86_400_000;
  for (let i = 0; i < 4; i++) {
    const runId = randomUUID();
    const when = new Date(base + i * 86_400_000).toISOString();
    await db.query(
      `INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary, state, created_at)
       VALUES ($1,$2,$3,$4,'main',$5,'committed',$6)`,
      [runId, orgId, repoId, `${label}commit${i}`.padEnd(10, "0"), JSON.stringify({ schemaVersion: 2, threshold: 0.1 }), when]
    );
    await db.query(
      `INSERT INTO frame_stats (org_id, repo_id, run_id, frame, mode, source, aligned_mismatch_percent,
                                structural_similarity, flagged, created_at)
       VALUES ($1,$2,$3,'hero.png','baseline','baseline',$4,98,$5,$6)`,
      [orgId, repoId, runId, 0.2 + i * 0.1, i === 3, when]
    );
  }

  const session = await createSession(db, { userId, method: "email", userAgent: "tenant-gate-check" });
  return { label, orgId, repoId, userId, token: session.token };
}

const REFUSAL = "This frame has no history here";
let a;
let b;

try {
  a = await tenant("a");
  b = await tenant("b");

  console.log(`base:   ${BASE}`);
  console.log(`cookie: ${COOKIE}`);
  console.log(`tenant A repo ${a.repoId}\ntenant B repo ${b.repoId}\n`);

  const trendA = `/repos/${a.repoId}/trend?frame=hero.png`;
  const exportA = `/repos/${a.repoId}/trend/export?frame=hero.png`;

  // ── G1: the trend page ───────────────────────────────────────────────────
  //
  // Pages refuse with a "Not found" *body* at HTTP 200 rather than a 404
  // status. That is how every Cloud page has behaved since Phase H — `/r/`,
  // `/repos/{id}` and this one all render a `NotFound` component — and it
  // predates the gate fix. So the body is what is asserted; G1.6 reports the
  // status rather than blessing it.
  {
    const anon = await get(trendA, null);
    check("G1.1", anon.body.includes(REFUSAL) && !anon.body.includes("acommit"),
      `no session → the refusal page, and no commit from the repository (status ${anon.status}). This is the proof the development door is shut: with NORMA_DEV_OPEN=1 it renders the whole trend to anybody`);

    const owner = await get(trendA, a.token);
    check("G1.2", owner.status === 200 && owner.body.includes("acommit"),
      `a member of the owning organization → ${owner.status}, real commits rendered — the case that was refusing every customer`);

    const stranger = await get(trendA, b.token);
    check("G1.3", stranger.body.includes(REFUSAL) && !stranger.body.includes("acommit"),
      `a member of another organization → the refusal page, no commit (status ${stranger.status})`);

    // Same page for "not yours" and "not real", or the difference tells a
    // prober which ids exist. Not byte-identical: each body echoes the
    // repository id out of its own URL.
    const missing = await get("/repos/00000000-0000-4000-8000-000000000000/trend?frame=hero.png", b.token);
    const drift = Math.abs(missing.body.length - stranger.body.length);
    check("G1.4",
      missing.status === stranger.status && missing.body.includes(REFUSAL) && drift < 8,
      `a repository that does not exist gets the same page, within ${drift} bytes — nothing separates "not yours" from "not real"`);

    check("G1.5",
      !stranger.body.includes(`gate-${a.label}`) && !stranger.body.includes(`Gate ${a.label}`) &&
        !stranger.body.includes("acommit") && !stranger.body.includes(a.orgId),
      "and the refusal names nothing belonging to the tenant that was probed — no repository name, commit or organization id");

    check("G1.6", anon.status === 200 && stranger.status === 200,
      `NOTE — pages refuse at HTTP ${anon.status}, not 404. Standing behaviour of the whole Cloud surface, unchanged by the gate fix; the route handler below does answer 404`);
  }

  // ── G2: the CSV export ───────────────────────────────────────────────────
  {
    const anon = await get(exportA, null);
    check("G2.1", anon.status === 404 && !anon.type.includes("csv"), `no session → ${anon.status}, no CSV`);

    const owner = await get(exportA, a.token);
    const rows = owner.body.trim().split("\n");
    check("G2.2",
      owner.status === 200 && owner.type.includes("text/csv") && rows.length === 5 &&
        rows[0].startsWith("run_id,commit_sha"),
      `a member of the owning organization → ${owner.status}, ${rows.length - 1} data rows of CSV`);

    const stranger = await get(exportA, b.token);
    check("G2.3", stranger.status === 404 && !stranger.type.includes("csv"),
      `a member of another organization → ${stranger.status}, no CSV`);

    check("G2.4", !stranger.body.includes("commit") && !stranger.body.includes(a.repoId),
      "and the refused body carries no header row, no commit and no repository id");
  }

  // ── G3: the repository page above them ───────────────────────────────────
  {
    const owner = await get(`/repos/${a.repoId}`, a.token);
    const stranger = await get(`/repos/${a.repoId}`, b.token);
    check("G3.1",
      owner.body.includes(`gate-${a.label}`) && !stranger.body.includes(`gate-${a.label}`),
      "the repository page names the repository for its member and not for the other tenant");
  }

  // ── G4: both directions ──────────────────────────────────────────────────
  //
  // Isolation proven one way is isolation proven for one fixture. If A were
  // privileged by accident — the first membership, the first row, the first
  // anything — only this catches it.
  {
    const proper = await get(`/repos/${b.repoId}/trend?frame=hero.png`, b.token);
    const crossed = await get(`/repos/${b.repoId}/trend?frame=hero.png`, a.token);
    check("G4.1",
      proper.body.includes("bcommit") && crossed.body.includes(REFUSAL) && !crossed.body.includes("bcommit"),
      "B's trend answers B and refuses A");

    const properExport = await get(`/repos/${b.repoId}/trend/export?frame=hero.png`, b.token);
    const crossedExport = await get(`/repos/${b.repoId}/trend/export?frame=hero.png`, a.token);
    check("G4.2", properExport.status === 200 && crossedExport.status === 404,
      `and B's export answers B (${properExport.status}) and refuses A (${crossedExport.status})`);
  }
  // ── G5: the console's role matrix, over HTTP ─────────────────────────────
  //
  // **Hiding a link is not refusing a request**, and this is the check that
  // says so. `CONSOLE_AREAS` gives Organization, Billing and Privacy to admins
  // alone — Harsha's launch decision, 2026-08-22: members and designers get
  // product and report access, and no financial or usage data until there is a
  // read-only usage view designed for it. The navigation omits those three for
  // a designer. Typing the URL has to reach the same answer.
  {
    const { CONSOLE_AREAS } = await import(path.join(DIST, "consoleIA.js"));
    const designer = randomUUID();
    await db.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Designer')", [
      designer,
      `designer-${designer.slice(0, 8)}@example.com`,
    ]);
    await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'designer')", [
      a.orgId,
      designer,
    ]);
    const session = await createSession(db, { userId: designer, method: "email", userAgent: "tenant-gate-check" });

    const denied = [];
    const allowed = [];
    for (const area of CONSOLE_AREAS) {
      const res = await get(area.href, session.token);
      const refused = res.text.includes("is for admins");
      (refused ? denied : allowed).push(area.id);
    }
    check("G5.1",
      denied.join(",") === "organization,billing,data",
      `a designer is refused exactly the three admin areas by direct URL (${denied.join(", ") || "none"})`);
    check("G5.2",
      allowed.join(",") === "overview,runs,trends,explain",
      `and reaches the four product areas (${allowed.join(", ")})`);

    // The refusal is a refusal, not a redirect to a page that quietly works.
    const billing = await get("/billing", session.token);
    check("G5.3", billing.status === 200 && !billing.text.includes("usage ledger"),
      "the billing refusal carries none of the area's own content — no ledger, no allowance, no invoices");

    // Not vacuous: an admin of the same organization gets the real page.
    const asAdmin = randomUUID();
    await db.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Admin')", [
      asAdmin,
      `admin-${asAdmin.slice(0, 8)}@example.com`,
    ]);
    await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'admin')", [a.orgId, asAdmin]);
    const adminSession = await createSession(db, { userId: asAdmin, method: "email", userAgent: "tenant-gate-check" });
    const adminBilling = await get("/billing", adminSession.token);
    check("G5.4",
      adminBilling.text.includes("usage ledger") && !adminBilling.text.includes("is for admins"),
      "counter-check: an admin of the same organization gets the area itself, so the refusal is about the role and not about the page being broken");
  }
} finally {
  // Delete what was created, whatever happened. Cascades take the repositories,
  // runs, frame stats, memberships and sessions with the organizations.
  for (const t of [a, b]) {
    if (!t) continue;
    await db.query("DELETE FROM orgs WHERE id = $1", [t.orgId]);
    await db.query("DELETE FROM users WHERE id = $1", [t.userId]);
  }
  await db.close();
}

console.log(failures === 0 ? "\ntenant gate: all checks passed" : `\ntenant gate: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
