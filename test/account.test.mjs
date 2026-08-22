// The account surface — the session list, the scoped revoke, and the audit
// extract a customer is allowed to read.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/account.test.mjs
//
// **What this suite is for.** The masthead menu could end sessions from
// 2026-08-22 and deliberately could not show them, so the account page is the
// first surface where a person acts on a *list of their own credentials*. Three
// things change when that list exists:
//
//   1. a session id now arrives from a form in a browser, so the revoke has to
//      stop trusting it — the same defect the two Organization revokes had, and
//      the reason `revokeSession` gained a required scope;
//   2. the list has to agree with `resolveSession` about what is alive, or it
//      tells somebody a browser is signed in when its next request would be
//      refused;
//   3. a user-agent string is attacker-controlled input that would otherwise be
//      rendered into a page, so the label is one of our phrases rather than a
//      substring of theirs.
//
// Counter-tests, in the sense of CLAUDE.md rule 3 — the naive version run
// through the same harness and watched doing the wrong thing:
//
//   C2b  the unscoped `UPDATE ... WHERE id = $1`: one person ending another
//        person's session with an id and nothing else.
//   C3b  a list that filters on `revoked_at` and `expires_at` only, showing an
//        idle-dead session as live.
//   C4b  a label that echoes the user agent, carrying markup onto the page.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createUser, addMembership, claimOwnership } = await import(path.join(DIST, "users.js"));
const {
  createSession,
  deviceLabel,
  listSessions,
  resolveSession,
  revokeSession,
  SESSION_IDLE_DAYS,
} = await import(path.join(DIST, "sessions.js"));
const { accountEvents, recordAuthEvent } = await import(path.join(DIST, "authEvents.js"));
const {
  ACCOUNT_ACTIONS,
  ACCOUNT_PATH,
  ACCOUNT_SURFACE,
  accountActionPath,
  areaForPath,
  isAccountPath,
  outstanding,
  unknownBuiltEntries,
} = await import(path.join(DIST, "consoleIA.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

async function threw(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const db = await createDb();
await migrate(db);
console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const RUN = randomUUID().slice(0, 8);

async function person(label) {
  return createUser(db, { email: `${label}-${RUN}@example.com`, displayName: label });
}

// ═══ C1 — the list says what the reader needs to identify a row ═══
//
// §10.7 5A.8 names five things: device label, method, last seen, created,
// current marker. A list missing any of them is a list somebody has to guess
// from, and the guess ends the wrong browser.
{
  const ada = await person("ada");
  const laptop = await createSession(db, {
    userId: ada.id,
    method: "github",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  });
  const phone = await createSession(db, {
    userId: ada.id,
    method: "email",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ip: "203.0.113.4",
  });

  const rows = await listSessions(db, ada.id, phone.id);
  check("C1.1", rows.length === 2, `both browsers are listed (${rows.length})`);

  const byId = new Map(rows.map((r) => [r.id, r]));
  check("C1.2", byId.get(laptop.id).label === "Chrome on macOS", `the laptop is named (${byId.get(laptop.id).label})`);
  check("C1.3", byId.get(phone.id).label === "Safari on iPhone", `and the phone (${byId.get(phone.id).label})`);
  check("C1.4", byId.get(laptop.id).method === "github" && byId.get(phone.id).method === "email",
    "each row says how that browser signed in, which is how a link nobody clicked is spotted");
  check("C1.5", byId.get(phone.id).current === true && byId.get(laptop.id).current === false,
    "exactly the browser reading the page is marked current");
  check("C1.6", rows.every((r) => r.createdAt && r.lastSeenAt && r.expiresAt),
    "every row carries when it started, when it was last used and when it ends");

  // The two things the row must not carry. The address is forbidden by 5A.8;
  // the user agent is left out because the only thing the page needs from it is
  // the label, and it is a string the client chose.
  const fields = Object.keys(rows[0]).join(",");
  check("C1.7", !/ip|address|agent|token/i.test(fields), `and nothing else — ${fields}`);
}

// ═══ C2 — a session id from a form is a request, not a permission ═══
{
  const ada = await person("c2-ada");
  const bob = await person("c2-bob");
  const adaPhone = await createSession(db, { userId: ada.id, method: "email", userAgent: "phone" });
  const bobLaptop = await createSession(db, { userId: bob.id, method: "email", userAgent: "laptop" });

  const mine = await revokeSession(db, adaPhone.id, "revoked from the account page", { userId: ada.id });
  check("C2.1", mine === true && (await resolveSession(db, adaPhone.token)) === null,
    "your own session id, scoped to you, ends that browser on its next request");

  const theirs = await revokeSession(db, bobLaptop.id, "revoked from the account page", { userId: ada.id });
  check("C2.2", theirs === false, "somebody else's session id, scoped to you, revokes nothing");
  check("C2.3", (await resolveSession(db, bobLaptop.token)) !== null,
    "and that browser is still signed in — the scope is in the UPDATE, not in a check above it");

  const again = await revokeSession(db, adaPhone.id, "again", { userId: ada.id });
  check("C2.4", again === false, "revoking an already-revoked session reports nothing done rather than pretending");

  const missing = await threw(() => revokeSession(db, bobLaptop.id, "no scope"));
  check("C2.5", missing !== null && /userId/.test(missing),
    `an omitted scope is an error with a name, not a silent unscoped revoke (${missing})`);

  // ── C2b: the counter-test ────────────────────────────────────────────────
  //
  // The version without the scope — which is what this function was until the
  // account page gave it a caller holding an id out of a form.
  {
    const target = await createSession(db, { userId: bob.id, method: "email", userAgent: "target" });
    const naive = await db.query(
      "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id",
      [target.id]
    );
    check("C2b.1", naive.rows.length === 1 && (await resolveSession(db, target.token)) === null,
      "counter-test: an unscoped UPDATE ends a stranger's session from the id alone — C2.2 is what refuses it");
  }
}

// ═══ C3 — the list and the session layer agree about what is alive ═══
//
// Three ways a row dies. A list that knows two of them tells somebody a browser
// is signed in when its next request would be refused, and the reader stops
// trusting the page at exactly the moment they need it.
{
  const ada = await person("c3");
  const live = await createSession(db, { userId: ada.id, method: "email", userAgent: "live" });
  const revoked = await createSession(db, { userId: ada.id, method: "email", userAgent: "revoked" });
  const expired = await createSession(db, { userId: ada.id, method: "email", userAgent: "expired" });
  const idle = await createSession(db, { userId: ada.id, method: "email", userAgent: "idle" });

  await revokeSession(db, revoked.id, "test", { userId: ada.id });
  await db.query("UPDATE sessions SET expires_at = now() - interval '1 day' WHERE id = $1", [expired.id]);
  await db.query(
    `UPDATE sessions SET last_seen_at = now() - ($2 || ' days')::interval WHERE id = $1`,
    [idle.id, String(SESSION_IDLE_DAYS + 1)]
  );

  const listed = (await listSessions(db, ada.id)).map((r) => r.id);
  check("C3.1", listed.includes(live.id), "a live browser is listed");
  check("C3.2", !listed.includes(revoked.id), "a revoked one is not");
  check("C3.3", !listed.includes(expired.id), "nor one past its absolute expiry");
  check("C3.4", !listed.includes(idle.id) && (await resolveSession(db, idle.token)) === null,
    "nor one idle past the cutoff — which is the one the session layer also refuses");

  // ── C3b: the counter-test ────────────────────────────────────────────────
  {
    const naive = await db.query(
      "SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [ada.id]
    );
    check("C3b.1", naive.rows.some((r) => r.id === idle.id),
      "counter-test: a list filtering on revoked and expired only shows the idle-dead browser as signed in");
  }
}

// ═══ C4 — the device label is one of our phrases, never theirs ═══
{
  const cases = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", "Chrome on Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0", "Edge on Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/127.0", "Firefox on macOS"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", "Safari on macOS"],
    ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36", "Chrome on Android"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", "Chrome on Linux"],
    ["", "Unknown browser"],
    ["curl/8.4.0", "Unknown browser"],
  ];
  const wrong = cases.filter(([ua, want]) => deviceLabel(ua) !== want).map(([ua]) => ua.slice(0, 30));
  check("C4.1", wrong.length === 0, `every user agent maps to the phrase a person would recognise (${wrong.join(" | ") || "all correct"})`);

  // Edge before Chrome, Chrome before Safari, iPhone before macOS. Each of
  // these strings claims to be the thing checked after it.
  check("C4.2", deviceLabel("Chrome/1 Edg/1 Safari/1 Windows") === "Edge on Windows",
    "an impostor is matched before the browser it impersonates");
  check("C4.3", deviceLabel("iPhone; CPU iPhone OS 17 like Mac OS X Safari") === "Safari on iPhone",
    "and an iPhone is not a Mac, though its user agent says Mac OS X");

  // ── C4b: the counter-test ────────────────────────────────────────────────
  //
  // The label is rendered into a table cell. React escapes it, so this is about
  // what reaches the page at all rather than about a live injection — a page
  // whose content is chosen by whoever set a header is a page we do not control,
  // and the fix is that no input ever becomes output here.
  {
    const hostile = '<img src=x onerror=alert(1)> Chrome Windows';
    check("C4b.1", deviceLabel(hostile) === "Chrome on Windows" && !deviceLabel(hostile).includes("<"),
      "counter-test: a user agent with markup in it produces our phrase — echoing the header would have put it on the page");
  }
}

// ═══ C5 — what a customer is allowed to read of the audit log ═══
{
  const ada = await person("c5");
  const bob = await person("c5-bob");
  await recordAuthEvent(db, { kind: "magic-link-consumed", outcome: "allowed", userId: ada.id, email: "ada@example.com", ip: "203.0.113.9" });
  await recordAuthEvent(db, { kind: "signed-out", outcome: "allowed", userId: ada.id });
  await recordAuthEvent(db, { kind: "magic-link-consumed", outcome: "allowed", userId: bob.id });

  const mine = await accountEvents(db, ada.id);
  check("C5.1", mine.length === 2, `only this person's events (${mine.length} of 2)`);
  check("C5.2", mine[0].kind === "signed-out", "newest first, so the last thing that happened is the first thing read");

  const fields = Object.keys(mine[0]).join(",");
  check("C5.3", !/hash|reason|ip|subject/i.test(fields),
    `and no hashes and no operator reason strings — ${fields}`);

  // The row exists with its hashes; what changes is what this reader is handed.
  const raw = await db.query("SELECT subject_hash, ip_hash FROM auth_events WHERE user_id = $1 AND ip_hash <> ''", [ada.id]);
  check("C5.4", raw.rows.length === 1 && raw.rows[0].ip_hash.length === 64,
    "counter-check: the audit row still holds the hashed address, so C5.3 is about what is shown rather than what is kept");
}

// ═══ C6 — the surface is declared, not exempted ═══
//
// `cloudShell` S11.11 fails a signed-in page that no surface claims. The account
// page is not one of the seven areas, so it has to be claimed somewhere — and
// "somewhere" must not be an exception list inside the test.
{
  check("C6.1", areaForPath(ACCOUNT_PATH) === null,
    "no console area owns /account — it is scoped to a person, not to an organization");
  check("C6.2", isAccountPath(ACCOUNT_PATH) && isAccountPath("/account/anything"),
    "the account surface claims it, and anything nested under it");
  check("C6.3", !isAccountPath("/accounts") && !isAccountPath("/"),
    "by segment, so a similarly-spelled path is not swept in");

  check("C6.4", unknownBuiltEntries().length === 0,
    `every 'built' entry on every surface, including this one, is a verbatim 'holds' entry (${JSON.stringify(unknownBuiltEntries())})`);

  const todo = outstanding(ACCOUNT_SURFACE);
  check("C6.5", ACCOUNT_SURFACE.built.length > 0 && todo.length > 0,
    `a half-built surface outlines the difference and nothing else (${todo.length} outstanding)`);
  check("C6.6", !todo.some((item) => ACCOUNT_SURFACE.built.includes(item)),
    "and never lists something that is already on the page");

  check("C6.7", ACCOUNT_ACTIONS.every((action) => accountActionPath(action) === `/api/account/${action}`),
    `every declared write has one route, built from the name (${ACCOUNT_ACTIONS.join(", ")})`);
}

await db.close();
console.log(failures === 0 ? "\nAccount suite: all checks passed" : `\nAccount suite: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
