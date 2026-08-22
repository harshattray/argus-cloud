// API-key revocation — migration 018; the operator surface `revokeApiKey`
// never had.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/apiKeyRevocation.test.mjs
//
// Checks are K1-K9. The thing being protected is the moment a key has leaked,
// so the questions are: does withdrawing it work *now* rather than eventually,
// is there a name against the decision, and can the page that lists keys leak
// the material it is listing.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createApiKey, findApiKey, revokeApiKey, listApiKeys } = await import(path.join(DIST, "apiKeys.js"));

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
  } catch (err) {
    return String(err?.message ?? err);
  }
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

const orgId = randomUUID();
await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, "keys-" + orgId.slice(0, 8)]);

// ---------------------------------------------------------------------------
// K1 — a live key authenticates
// ---------------------------------------------------------------------------
const key = await createApiKey(db, orgId, { kind: "upload", label: "CI" });
check("K1", (await findApiKey(db, key.plaintext)) !== null, "a freshly issued key authenticates");

// ---------------------------------------------------------------------------
// K2 — revoking works on the next request, not eventually
// ---------------------------------------------------------------------------
//
// The whole value of the control. `findApiKey` re-reads the row every call with
// no cache in front of it, so there is no window in which a withdrawn key still
// works — and if a cache is ever added in front of it, this check is what fails.
const outcome = await revokeApiKey(db, key.id, { actor: "harsha", reason: "leaked in a build log", orgId: null });
check(
  "K2",
  outcome.revoked === true && (await findApiKey(db, key.plaintext)) === null,
  "the key stops authenticating on the very next lookup"
);

// ---------------------------------------------------------------------------
// K3 — the decision has a name and a reason against it
// ---------------------------------------------------------------------------
const stored = (
  await db.query("SELECT revoked_by, revoked_reason, revoked_at FROM api_keys WHERE id = $1", [key.id])
).rows[0];
check(
  "K3",
  stored.revoked_by === "harsha" && /leaked/.test(stored.revoked_reason) && stored.revoked_at !== null,
  `who withdrew it and why are kept ("${stored.revoked_by}" — "${stored.revoked_reason}")`
);

// ---------------------------------------------------------------------------
// K4 — an unattributed revocation is refused, in code and in the database
// ---------------------------------------------------------------------------
const second = await createApiKey(db, orgId, { kind: "upload", label: "K4" });
const k4 = await threw(() => revokeApiKey(db, second.id, { actor: "   ", orgId: null }));
check("K4", k4 !== null && /actor/.test(k4), `a blank actor is refused with a sentence — "${k4}"`);

// K4b — and the database refuses it too, so no other code path can write an
// unattributed revocation either.
const k4b = await threw(() =>
  db.query("UPDATE api_keys SET revoked_at = now(), revoked_by = '' WHERE id = $1", [second.id])
);
check("K4b", k4b !== null, "the constraint refuses an unattributed revocation written directly");

// K4c — and the refused attempt left the key working.
check("K4c", (await findApiKey(db, second.plaintext)) !== null, "the key that failed to revoke still authenticates");

// ---------------------------------------------------------------------------
// K5 — revoking twice keeps the first answer
// ---------------------------------------------------------------------------
//
// A second click during an incident must not overwrite who pulled it and when.
// The first answer is the true one.
const again = await revokeApiKey(db, key.id, { actor: "someone else", reason: "clicked twice", orgId: null });
const afterSecond = (
  await db.query("SELECT revoked_by, revoked_reason FROM api_keys WHERE id = $1", [key.id])
).rows[0];
check(
  "K5",
  again.alreadyRevoked === true && afterSecond.revoked_by === "harsha" && /leaked/.test(afterSecond.revoked_reason),
  "a repeat revocation reports it was already revoked and keeps the original attribution"
);

// ---------------------------------------------------------------------------
// K6 — revoking a key that does not exist is an error, not a silent success
// ---------------------------------------------------------------------------
const k6 = await threw(() => revokeApiKey(db, randomUUID(), { actor: "harsha", orgId: null }));
check("K6", k6 !== null && /no such API key/.test(k6), "revoking an unknown id says so rather than reporting success");

// ---------------------------------------------------------------------------
// K7 — the operator list never carries key material
// ---------------------------------------------------------------------------
//
// The hash is the only stored form of the credential. A list that carries it
// puts it into a rendered page, a React payload, and any log that captures
// either — so the query must not select it at all.
const listed = await listApiKeys(db, { orgId, includeRevoked: true });
const serialised = JSON.stringify(listed);
const hash = (await db.query("SELECT key_hash FROM api_keys WHERE id = $1", [key.id])).rows[0].key_hash;
check(
  "K7",
  !serialised.includes(hash) && !("key_hash" in (listed[0] ?? {})),
  "no hash and no plaintext reaches the operator list"
);

// K7b — but it carries what an operator needs to tell one key from another.
const row = listed.find((k) => k.id === key.id);
check(
  "K7b",
  row?.label === "CI" && row?.kind === "upload" && typeof row?.org_name === "string" && row?.revoked_by === "harsha",
  "the list identifies a key by label, kind, organization and who revoked it"
);

// ---------------------------------------------------------------------------
// K8 — the default list is the live ones
// ---------------------------------------------------------------------------
const liveOnly = await listApiKeys(db, { orgId });
check(
  "K8",
  liveOnly.every((k) => k.revoked_at === null) && liveOnly.length < listed.length,
  `by default the list shows only live keys (${liveOnly.length} of ${listed.length})`
);

// ---------------------------------------------------------------------------
// K9 — one organization's list never shows another's keys
// ---------------------------------------------------------------------------
const otherOrg = randomUUID();
await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [otherOrg, "other-" + otherOrg.slice(0, 8)]);
await createApiKey(db, otherOrg, { kind: "upload", label: "theirs" });
const mine = await listApiKeys(db, { orgId, includeRevoked: true });
check(
  "K9",
  mine.every((k) => k.org_id === orgId),
  "scoping by organization excludes every other organization's keys"
);

await db.query("DELETE FROM orgs WHERE id = ANY($1)", [[orgId, otherOrg]]);
await db.close();

console.log(failures === 0 ? "\napiKeyRevocation: all checks passed" : `\napiKeyRevocation: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
