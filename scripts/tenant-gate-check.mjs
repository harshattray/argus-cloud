#!/usr/bin/env node
//
// Tenant isolation and role enforcement on the Cloud surface, over HTTP,
// against a running server.
//
//   scripts/test-db.sh start
//   DATABASE_URL="$(scripts/test-db.sh url)" npm run build:web
//   (cd web && DATABASE_URL="$(../scripts/test-db.sh url)" NORMA_DEV_OPEN=0 \
//      npx next start -p 3200)
//   DATABASE_URL="$(scripts/test-db.sh url)" GATE_BASE=http://127.0.0.1:3200 \
//      node scripts/tenant-gate-check.mjs
//
// **Why this is not in `npm test`.** Every other check in this repo answers
// without a server. These routes cannot: what is being tested is the wiring
// between a session cookie, an id in a URL or a form field, and a database row,
// and a unit test of any one of those three is what let the defect below ship in
// the first place. It needs a build, a server and a real Postgres, so it is a
// script you run rather than a suite that runs on every push.
//
// **What it covers**, in the order it runs: the repository trend view and its
// CSV export (G1–G4), the console's role matrix by direct URL (G5), every
// write the Organization area offers (G6) — invitations, roles, removals and
// keys, refused for no session, for the wrong role, from another origin, and
// from another organization's admin holding a real row id — and the account
// page's session revoke (G7), which is the same question asked about a person
// rather than a tenant: two colleagues in one organization must not be able to
// sign each other out.
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

/**
 * A form POST, the way the console's own controls make one.
 *
 * `sec-fetch-site` is what a browser sends and what `sameOrigin` reads; the
 * cross-origin check below is the same call with that header changed, because
 * the interesting question is not whether the header can be omitted but whether
 * another site's form can drive these routes.
 */
async function post(pathname, token, fields, options = {}) {
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    "sec-fetch-site": options.site ?? "same-origin",
  };
  if (token) {
    headers.cookie = `${COOKIE}=${token}`;
  }
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    redirect: "manual",
    headers,
    body: new URLSearchParams(fields).toString(),
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    setCookie: res.headers.get("set-cookie") ?? "",
    body: await res.text(),
  };
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
/** Users created outside `tenant()`, deleted in the same `finally`. */
const extraUsers = [];

/** Somebody in an organization, with a session, at a role. */
async function person(orgId, role, label) {
  const userId = randomUUID();
  await db.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)", [
    userId,
    `${label}-${userId.slice(0, 8)}@example.com`,
    label,
  ]);
  await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)", [orgId, userId, role]);
  extraUsers.push(userId);
  const session = await createSession(db, { userId, method: "email", userAgent: "tenant-gate-check" });
  return { userId, token: session.token };
}

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
    const session = await person(a.orgId, "designer", "Designer");

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
    const adminSession = await person(a.orgId, "admin", "Area admin");
    const adminBilling = await get("/billing", adminSession.token);
    check("G5.4",
      adminBilling.text.includes("usage ledger") && !adminBilling.text.includes("is for admins"),
      "counter-check: an admin of the same organization gets the area itself, so the refusal is about the role and not about the page being broken");
  }

  // ── G6: the Organization area's writes, over HTTP ────────────────────────
  //
  // Seven routes that invite people, change what they may do, and mint and
  // withdraw credentials. Everything about them is decided on the server, and
  // this is where that claim is tested against a real request rather than
  // against the source.
  //
  // The three questions, in the order an attacker asks them: can somebody with
  // no session do this, can somebody with the wrong role do this, and can an
  // admin of one organization do it to another. Then the counter-check — that a
  // proper admin can, so the refusals are about authorization and not about a
  // broken route.
  {
    // The list the route is typed by and the page builds its forms from. Read
    // from the same module, so an action added tomorrow is probed tomorrow
    // rather than whenever somebody remembers to extend this array.
    const { ORG_ACTIONS, orgActionPath } = await import(path.join(DIST, "consoleIA.js"));
    const { listInvitations } = await import(path.join(DIST, "invitations.js"));
    const { createApiKey, findApiKey } = await import(path.join(DIST, "apiKeys.js"));

    const adminA = await person(a.orgId, "admin", "Admin A");
    const adminB = await person(b.orgId, "admin", "Admin B");
    const designerA = await person(a.orgId, "designer", "Designer A");

    const url = orgActionPath;
    const sample = { email: `probe-${randomUUID().slice(0, 8)}@example.com`, role: "member", id: randomUUID(), userId: randomUUID(), label: "probe", kind: "upload" };

    // No session at all.
    {
      const codes = [];
      for (const action of ORG_ACTIONS) {
        codes.push((await post(url(action), null, sample)).status);
      }
      check("G6.1", codes.every((c) => c === 401),
        `no session → every one of the ${ORG_ACTIONS.length} writes answers 401 (${[...new Set(codes)].join(", ")})`);
    }

    // A session, the wrong role. `a.token` is a member of A; `designerA` is a
    // designer of the same organization. Both are inside the tenant and neither
    // may write to it.
    {
      const memberCodes = [];
      const designerCodes = [];
      for (const action of ORG_ACTIONS) {
        memberCodes.push((await post(url(action), a.token, sample)).status);
        designerCodes.push((await post(url(action), designerA.token, sample)).status);
      }
      check("G6.2", memberCodes.every((c) => c === 403),
        `a member of the organization → 403 on every write (${[...new Set(memberCodes)].join(", ")})`);
      check("G6.3", designerCodes.every((c) => c === 403),
        `a designer of the organization → 403 on every write (${[...new Set(designerCodes)].join(", ")})`);
    }

    // An admin, from somebody else's page. SameSite is one half of the CSRF
    // policy and this is the other (§10.7 5A.8).
    {
      const crossed = await post(url("invite"), adminA.token, sample, { site: "cross-site" });
      check("G6.4", crossed.status === 403,
        `an admin's own session driven from another origin → ${crossed.status}, refused before anything is read`);
    }

    // The counter-check, and the first thing the area is for.
    {
      const invited = `newcomer-${randomUUID().slice(0, 8)}@example.com`;
      const sent = await post(url("invite"), adminA.token, { email: invited, role: "designer" });
      const rows = await listInvitations(db, a.orgId);
      const row = rows.find((i) => i.email === invited);
      check("G6.5",
        sent.status === 303 && row?.state === "pending" && row?.role === "designer",
        `an admin of the organization invites somebody → ${sent.status}, and the invitation exists as ${row?.state ?? "nothing"} at the role asked for`);

      // **What the console says about the email, on a server that cannot send
      // one.** `GATE_MAIL` describes the server under test; it defaults to
      // `none`, which is what the documented local run is — no `RESEND_API_KEY`,
      // and `NODE_ENV=production` forbids the console fallback, so the mailer
      // throws. The row still exists, and the admin has to be told the message
      // did not go out. The first version of this route said "Invitation sent"
      // with no mail behind it at all, which is the failure this pins.
      const notice = new URLSearchParams(sent.location.split("?")[1] ?? "").get("notice");
      const expected = (process.env.GATE_MAIL ?? "none") === "none" ? "invite-unsent" : "invited";
      check("G6.5b", notice === expected,
        `and the notice tells the truth about delivery on a server with mail ${process.env.GATE_MAIL ?? "none"} — "${notice}"`);

      // The other tenant's admin, with the real invitation id. This is the check
      // the org-scoped UPDATE exists for: the id is real, the session is real,
      // and the row must not move.
      const crossed = await post(url("invite-revoke"), adminB.token, { id: row.id });
      const after = (await listInvitations(db, a.orgId)).find((i) => i.id === row.id);
      check("G6.6",
        after?.state === "pending" && crossed.location.includes("invite-gone"),
        `an admin of another organization revoking it changes nothing (still ${after?.state}) and is told the same thing as somebody clicking an already-dead link`);

      const own = await post(url("invite-revoke"), adminA.token, { id: row.id });
      const revoked = (await listInvitations(db, a.orgId)).find((i) => i.id === row.id);
      check("G6.7", own.location.includes("invite-revoked") && revoked?.state === "revoked",
        "and its own organization's admin revokes it");
    }

    // Keys: the same shape, on a credential.
    {
      const key = await createApiKey(db, a.orgId, { kind: "upload", label: "gate-check" });
      const crossed = await post(url("key-revoke"), adminB.token, { id: key.id });
      check("G6.8",
        (await findApiKey(db, key.plaintext)) !== null && crossed.location.includes("key-gone"),
        "an admin of another organization cannot revoke this key — it still authenticates, and the refusal is the already-revoked answer");

      const own = await post(url("key-revoke"), adminA.token, { id: key.id });
      check("G6.9",
        own.location.includes("key-revoked") && (await findApiKey(db, key.plaintext)) === null,
        "its own admin revokes it, and it stops authenticating at once");
    }

    // Minting: the plaintext exists in exactly one place, and the page does not
    // hold it afterwards.
    {
      const created = await post(url("key-create"), adminA.token, { label: "minted by the gate check", kind: "upload" });
      const cookie = created.setCookie;
      const carried = /norma-key-once=([^;]+)/.exec(cookie)?.[1] ?? "";
      const plaintext = carried.slice(carried.indexOf(".") + 1);
      check("G6.10",
        created.status === 303 && /HttpOnly/i.test(cookie) && /Path=\/organization/i.test(cookie) && plaintext.startsWith("nsk_"),
        `creating a key answers ${created.status} and hands the plaintext back in one HttpOnly, path-scoped cookie`);

      // Without the cookie, the page has nothing to show. This is what "shown
      // once" means in practice.
      const later = await get("/organization", adminA.token);
      check("G6.11", plaintext.length > 8 && !later.body.includes(plaintext),
        "a later plain request for the page does not contain the key — nothing stored it");
      check("G6.12", (await findApiKey(db, plaintext)) !== null,
        "counter-check: the key the cookie carried is a real, working credential, so G6.11 is about where it is not, rather than about it never existing");
    }

    // The page itself, at the tenant boundary.
    {
      const mine = await get("/organization", adminA.token);
      check("G6.13",
        mine.text.includes("Admin A") && !mine.text.includes("Admin B") && !mine.body.includes(b.orgId),
        "the Organization page lists this organization's people and names nobody from the other one");
    }

    // Last admin: the refusal that keeps an organization operable, reached the
    // way a customer would reach it.
    {
      const solo = await person(b.orgId, "admin", "Solo B");
      // B's only other admin is `adminB`; remove it so `solo` is the last one.
      await db.query("DELETE FROM memberships WHERE org_id = $1 AND user_id = $2", [b.orgId, adminB.userId]);
      const refused = await post(url("member-role"), solo.token, { userId: solo.userId, role: "member" });
      const stillAdmin = (await db.query("SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2", [b.orgId, solo.userId])).rows[0]?.role;
      check("G6.14",
        refused.location.includes("last-admin") && stillAdmin === "admin",
        `the last admin cannot demote themselves through the console either (${refused.location.split("=").pop()}), and the role is unchanged`);
    }

    // An action nobody wrote.
    {
      const nonsense = await post(url("delete-everything"), adminA.token, {});
      check("G6.15", nonsense.status === 404, `an action that does not exist answers ${nonsense.status} rather than falling through to one that does`);
    }
  }

  // ── G7: the account page, and the session it is allowed to end ───────────
  //
  // The account page is the first surface where somebody acts on a list of
  // **their own credentials**, and the id of a row travels through a browser to
  // get there. So the question is the one G6 asks about organizations, asked
  // about people instead: can a session id belonging to somebody else be ended
  // by whoever holds it.
  //
  // It is not a tenant boundary — two people in the *same* organization must
  // not be able to sign each other out either, which is why the pair below are
  // both inside organization A.
  {
    const { ACCOUNT_PATH, accountActionPath } = await import(path.join(DIST, "consoleIA.js"));
    const { createSession } = await import(path.join(DIST, "sessions.js"));

    const url = accountActionPath("session-revoke");
    const ada = await person(a.orgId, "member", "Ada Account");
    const bob = await person(a.orgId, "admin", "Bob Account");

    // A second browser for each, so there is something to end that is not the
    // session making the request.
    const adaPhone = await createSession(db, { userId: ada.userId, method: "email", userAgent: "gate phone" });
    const bobPhone = await createSession(db, { userId: bob.userId, method: "email", userAgent: "gate phone" });

    const live = async (id) =>
      (await db.query("SELECT revoked_at FROM sessions WHERE id = $1", [id])).rows[0]?.revoked_at === null;

    {
      const anonymous = await post(url, null, { id: adaPhone.id });
      check("G7.1", anonymous.status === 401 && (await live(adaPhone.id)),
        `no session → ${anonymous.status}, and the browser it named is still signed in`);
    }

    {
      const crossed = await post(url, ada.token, { id: adaPhone.id }, { site: "cross-site" });
      check("G7.2", crossed.status === 403 && (await live(adaPhone.id)),
        `a real session driven from another origin → ${crossed.status}, refused before anything is read`);
    }

    // The one that matters. Bob holds a valid session and a real id — Ada's
    // phone — and posts it as if it were his own row.
    {
      const stolen = await post(url, bob.token, { id: adaPhone.id });
      const notice = new URLSearchParams(stolen.location.split("?")[1] ?? "").get("notice");
      check("G7.3", (await live(adaPhone.id)),
        "somebody else's session id, posted with a valid session of your own, ends nothing");
      check("G7.3b", notice === "session-gone",
        `and the answer is the same one an already-revoked id gets (${notice}) — a refusal that says "not yours" is a way to ask whether an id exists`);
    }

    // The counter-check: the same request, from the person it belongs to.
    {
      const own = await post(url, ada.token, { id: adaPhone.id });
      const notice = new URLSearchParams(own.location.split("?")[1] ?? "").get("notice");
      check("G7.4", own.status === 303 && notice === "session-revoked" && !(await live(adaPhone.id)),
        `your own browser, ended from your own account page → ${own.status} ${notice}`);
    }

    // Ending the browser you are holding: allowed, and it must not leave a page
    // whose cookie no longer resolves.
    {
      const self = await post(url, bobPhone.token, { id: bobPhone.id });
      const cleared = /norma_session=;/.test(self.setCookie) || /norma_session=;/.test(self.setCookie.replace("__Host-", ""));
      check("G7.5", self.status === 303 && self.location.includes("/login") && !(await live(bobPhone.id)),
        `the browser reading the page can end itself → ${self.status} to ${self.location.replace(BASE, "")}`);
      check("G7.5b", cleared, "and its cookie is cleared on the way out, so it does not carry a token that no longer resolves");
    }

    // The page itself: one person's browsers, nobody else's.
    {
      const mine = await get(ACCOUNT_PATH, bob.token);
      check("G7.6", mine.status === 200 && mine.text.includes("Bob Account") && !mine.body.includes(ada.userId),
        `the account page names the person reading it and carries no id belonging to anybody else (${mine.status})`);
    }
  }
} finally {
  // Delete what was created, whatever happened. Cascades take the repositories,
  // runs, frame stats, memberships and sessions with the organizations.
  for (const t of [a, b]) {
    if (!t) continue;
    await db.query("DELETE FROM orgs WHERE id = $1", [t.orgId]);
    await db.query("DELETE FROM users WHERE id = $1", [t.userId]);
  }
  // The people G5 and G6 create live in those organizations, so the cascade
  // takes their memberships and sessions — but a `users` row is not owned by an
  // organization and would otherwise be left behind on a shared test database.
  for (const userId of extraUsers) {
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
  }
  await db.close();
}

console.log(failures === 0 ? "\ntenant gate: all checks passed" : `\ntenant gate: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
