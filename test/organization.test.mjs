// The Organization area's domain layer — members, roles, invitations and keys.
//
// Run: npm test
// Run against a real server:
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/organization.test.mjs
//
// **What this suite is for.** `invitations.ts`, `users.ts` and `apiKeys.ts` were
// written long before anything could reach them, and the console gave them their
// first caller that is a person in a browser. Three kinds of thing needed
// checking before that was true:
//
//   1. the two writes that did not exist yet — listing members, and changing a
//      role with the refusals that keep an organization operable;
//   2. the two revokes that now take a row id **from a form**, which is to say
//      from whoever is holding the browser, and therefore had to stop trusting
//      that id on its own;
//   3. the invitation state machine under a real race, because "consumed once"
//      is the whole security property and a second membership is what failure
//      looks like;
//   4. the message itself, because until the console had this an "invitation"
//      was a row and a hashed token with nobody told — the page said *sent* and
//      nothing was sent.
//
// Counter-tests, in the sense of CLAUDE.md rule 3 — each is the naive version
// run through the same harness, watched doing the wrong thing:
//
//   O2b  `addMembership`, the obvious way to change a role, demoting the last
//        admin and stranding the organization.
//   O3b  an unscoped `UPDATE ... WHERE id = $1` on invitations: one tenant
//        revoking another tenant's invitation.
//   O4b  the same for API keys.
//   O6b  accepting an invitation without the conditional update: two
//        acceptances, two memberships, on the same link.
//
// O8 has no counter-test of that shape and does not need one: "the email was
// not sent" is not a subtler version of a working path, it is the state the code
// was in, and O8.1 is the check that would have caught it.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const {
  addMembership,
  changeMembershipRole,
  claimOwnership,
  createUser,
  membersOf,
  removeMembership,
  roleIn,
} = await import(path.join(DIST, "users.js"));
const { acceptInvitation, createInvitation, listInvitations, revokeInvitation } = await import(
  path.join(DIST, "invitations.js")
);
const { createApiKey, findApiKey, listApiKeys, revokeApiKey } = await import(path.join(DIST, "apiKeys.js"));
const { sendInvitation } = await import(path.join(DIST, "loginService.js"));
const { CONSOLE_AREAS, outstanding, unknownBuiltEntries } = await import(path.join(DIST, "consoleIA.js"));

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

/** An organization with an owner, on a plan that may hold upload keys. */
async function makeOrg(label) {
  const orgId = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, `Org ${label} ${RUN}`]);
  const owner = await createUser(db, { email: `owner-${label}-${RUN}@example.com`, displayName: `Owner ${label}` });
  await claimOwnership(db, orgId, owner.id);
  return { orgId, owner };
}

async function join(orgId, label, role) {
  const user = await createUser(db, { email: `${label}-${RUN}@example.com`, displayName: label });
  await addMembership(db, { orgId, userId: user.id, role });
  return user;
}

// ═══ O1 — the member list an admin decides from ═══
{
  const { orgId, owner } = await makeOrg("o1");
  const designer = await join(orgId, "zoe-designer", "designer");
  const member = await join(orgId, "adam-member", "member");

  const members = await membersOf(db, orgId);
  check("O1.1", members.length === 3, `every member is listed (${members.length} of 3)`);

  const ownerRow = members.find((m) => m.userId === owner.id);
  check(
    "O1.2",
    ownerRow?.isOwner === true && ownerRow?.role === "admin",
    "the owner is flagged as owner and holds an admin membership — the two facts 5A.5 keeps together"
  );
  check(
    "O1.3",
    members.filter((m) => m.isOwner).length === 1,
    "and exactly one person carries the flag, which is what an ownership invariant means"
  );

  // Admins act on people by address. A list of display names is how "remove the
  // wrong Sam" happens.
  check(
    "O1.4",
    members.every((m) => m.email.includes("@")) && ownerRow.email === owner.email,
    "each row carries the address, so an admin is deciding about a person rather than a label"
  );

  check(
    "O1.5",
    members[0].role === "admin" && members.map((m) => m.role).join(",") === "admin,member,designer",
    `admins first, then members, then designers (${members.map((m) => m.role).join(", ")})`
  );

  check(
    "O1.6",
    members.find((m) => m.userId === designer.id)?.lastLoginAt === null,
    "somebody who has never signed in reads as never, not as a missing field"
  );

  // Isolation at the source. The page scopes by the session's organization, and
  // so does the query underneath it.
  const other = await makeOrg("o1b");
  await join(other.orgId, "stranger", "admin");
  const mine = await membersOf(db, orgId);
  check(
    "O1.7",
    mine.every((m) => m.userId !== other.owner.id) && mine.length === 3,
    "another organization's people are not in this list"
  );
  check("O1.8", member.id !== designer.id, "fixture sanity: the two joiners are distinct people");
}

// ═══ O2 — changing a role, and the two refusals ═══
{
  const { orgId, owner } = await makeOrg("o2");
  const second = await join(orgId, "second-admin", "admin");
  const plain = await join(orgId, "plain-member", "member");

  check("O2.1", (await changeMembershipRole(db, { orgId, userId: plain.id, role: "designer" })) === true, "a member can be made a designer");
  check("O2.2", (await roleIn(db, orgId, plain.id)) === "designer", "and the change is what the next authorization check reads");

  const notThere = await changeMembershipRole(db, { orgId, userId: randomUUID(), role: "admin" });
  check("O2.3", notThere === false, "changing the role of somebody who is not a member reports it rather than inventing a membership");

  // The owner is always an admin. Demoting them would break the invariant, so
  // the refusal is here rather than in the page that hides the control.
  const ownerDemote = await threw(() => changeMembershipRole(db, { orgId, userId: owner.id, role: "member" }));
  check("O2.4", ownerDemote !== null && /owner/.test(ownerDemote), `the owner cannot be demoted — "${ownerDemote}"`);
  check("O2.5", (await roleIn(db, orgId, owner.id)) === "admin", "and the refusal left them an admin");

  // Two admins: demoting one is fine, because the owner is still one.
  check("O2.6", (await changeMembershipRole(db, { orgId, userId: second.id, role: "member" })) === true, "one of two admins can step down while the owner is the other");

  const admins = await db.query("SELECT COUNT(*) AS t FROM memberships WHERE org_id = $1 AND role = 'admin'", [orgId]);
  check("O2.7", Number(admins.rows[0].t) === 1, "the organization still has an admin, which is the point of the owner rule above");

  const badRole = await threw(() => changeMembershipRole(db, { orgId, userId: plain.id, role: "owner" }));
  check("O2.8", badRole !== null && /not a role/.test(badRole), `'owner' is refused as a role here too, not only by the column — "${badRole}"`);

  // Removal makes the same two refusals; this suite only re-checks that the
  // pair stayed together, since the console offers both controls in one row.
  const removeOwner = await threw(() => removeMembership(db, { orgId, userId: owner.id }));
  check("O2.9", removeOwner !== null && /owner/.test(removeOwner), "and the owner cannot be removed either");
}

// ═══ O2c — the last-admin refusal, on the state where it is the only one ═══
//
// While an organization has an owner, the owner *is* an admin and the owner rule
// fires first — so the last-admin branch is only reachable on an organization
// whose ownership is not yet claimed. That is a real state, not a contrivance:
// the payment webhook provisions the organization and the owner claim happens
// later (§10.7 5A.5), and migration 022 had to repair rows in exactly this
// shape. Without this check the branch would never have been watched running.
{
  const orgId = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [orgId, `Unclaimed ${RUN}`]);
  const onlyAdmin = await join(orgId, "unclaimed-admin", "admin");
  await join(orgId, "unclaimed-member", "member");

  const lastAdmin = await threw(() => changeMembershipRole(db, { orgId, userId: onlyAdmin.id, role: "member" }));
  check("O2c.1", lastAdmin !== null && /at least one admin/.test(lastAdmin), `the last admin of an unclaimed organization cannot step down — "${lastAdmin}"`);
  check("O2c.2", (await roleIn(db, orgId, onlyAdmin.id)) === "admin", "and the refusal left the role alone");

  const owner = (await db.query("SELECT owner_user_id FROM orgs WHERE id = $1", [orgId])).rows[0].owner_user_id;
  check("O2c.3", owner === null, "fixture sanity: this organization genuinely has no owner, so it is the last-admin rule doing the work and not the owner rule");
}

// ═══ O2b — the counter-test: the obvious way to change a role ═══
//
// `addMembership` upserts, which is exactly what a role change looks like if
// you write it without reading 5A.5. It has no idea an organization needs an
// admin, and nothing stops it.
{
  const { orgId, owner } = await makeOrg("o2b");
  await addMembership(db, { orgId, userId: owner.id, role: "designer" });
  const left = await db.query("SELECT COUNT(*) AS t FROM memberships WHERE org_id = $1 AND role = 'admin'", [orgId]);
  check(
    "O2b.1",
    Number(left.rows[0].t) === 0,
    "the naive role change leaves an organization with no admin at all — nobody can invite, revoke a key, or fix it"
  );
  const ownerRow = (await membersOf(db, orgId)).find((m) => m.userId === owner.id);
  check(
    "O2b.2",
    ownerRow.isOwner === true && ownerRow.role === "designer",
    "and it breaks 5A.5's other half in the same write: the owner is no longer an admin. O2 has teeth"
  );
}

// ═══ O3 — an invitation id from a form is not permission ═══
{
  const a = await makeOrg("o3a");
  const b = await makeOrg("o3b");
  const invite = await createInvitation(db, { orgId: a.orgId, email: `invitee-${RUN}@example.com`, role: "member" });

  const crossed = await revokeInvitation(db, invite.invitation.id, { orgId: b.orgId });
  check("O3.1", crossed === false, "an admin of another organization cannot revoke this invitation");
  const stillPending = (await listInvitations(db, a.orgId)).find((i) => i.id === invite.invitation.id);
  check("O3.2", stillPending?.state === "pending", "and the attempt changed nothing — the invitation is still live");

  const proper = await revokeInvitation(db, invite.invitation.id, { orgId: a.orgId });
  check("O3.3", proper === true, "its own organization revokes it");
  const after = (await listInvitations(db, a.orgId)).find((i) => i.id === invite.invitation.id);
  check("O3.4", after?.state === "revoked", "and the state machine records it");

  const again = await revokeInvitation(db, invite.invitation.id, { orgId: a.orgId });
  check(
    "O3.5",
    again === false && crossed === false,
    "revoking twice and revoking somebody else's give the identical answer — a refusal that could be told apart is a way to ask which ids exist"
  );

  const missing = await threw(() => revokeInvitation(db, randomUUID(), undefined));
  check("O3.6", missing !== null && /orgId/.test(missing), `omitting the scope entirely is refused by name — "${missing}"`);
}

// ═══ O3b — the counter-test: the same revoke without the scope ═══
{
  const a = await makeOrg("o3ba");
  const invite = await createInvitation(db, { orgId: a.orgId, email: `victim-${RUN}@example.com`, role: "member" });
  await db.query("UPDATE invitations SET state = 'revoked', resolved_at = now() WHERE id = $1 AND state = 'pending'", [
    invite.invitation.id,
  ]);
  const state = (await db.query("SELECT state FROM invitations WHERE id = $1", [invite.invitation.id])).rows[0].state;
  check(
    "O3b.1",
    state === "revoked",
    "the unscoped UPDATE — the shape this function had until the console gave it a caller — revokes on the id alone, whoever is asking. O3 has teeth"
  );
}

// ═══ O4 — the same rule for keys ═══
{
  const a = await makeOrg("o4a");
  const b = await makeOrg("o4b");
  const key = await createApiKey(db, a.orgId, { kind: "upload", label: "CI", createdBy: a.owner.id });

  const crossed = await threw(() => revokeApiKey(db, key.id, { actor: "B's admin", orgId: b.orgId }));
  check("O4.1", crossed !== null && /no such API key/.test(crossed), "another organization's admin cannot revoke this key");
  check("O4.2", (await findApiKey(db, key.plaintext)) !== null, "and the key still authenticates — nothing was written");

  const invented = await threw(() => revokeApiKey(db, randomUUID(), { actor: "B's admin", orgId: b.orgId }));
  // Compared with the id masked out: the id is the one thing the two answers
  // legitimately differ on, because it is the caller's own input coming back.
  const shape = (message) => message?.replace(/[0-9a-f-]{36}/gi, "<id>");
  check(
    "O4.3",
    shape(invented) === shape(crossed) && shape(crossed) === "no such API key: <id>",
    `a key belonging to somebody else and a key that does not exist produce the same sentence — "${shape(crossed)}" — so an id tells a prober nothing`
  );

  const proper = await revokeApiKey(db, key.id, { actor: a.owner.display_name, reason: "rotated", orgId: a.orgId });
  check("O4.4", proper.revoked === true && (await findApiKey(db, key.plaintext)) === null, "its own organization revokes it, and it stops authenticating at once");

  const stored = (await db.query("SELECT revoked_by FROM api_keys WHERE id = $1", [key.id])).rows[0];
  check("O4.5", stored.revoked_by === a.owner.display_name, `the revocation is attributed to the session, not to a typed-in name ("${stored.revoked_by}")`);

  const listed = (await listApiKeys(db, { orgId: a.orgId, includeRevoked: true })).find((k) => k.id === key.id);
  check("O4.6", listed?.created_by_name === a.owner.display_name, `the list says who minted it ("${listed?.created_by_name}")`);
  check("O4.7", !("key_hash" in (listed ?? {})), "and still never carries key material");

  const noScope = await threw(() => revokeApiKey(db, key.id, { actor: "someone" }));
  check("O4.8", noScope !== null && /orgId/.test(noScope), `omitting the scope is refused by name rather than failing as a missing row — "${noScope}"`);

  const operator = await createApiKey(db, b.orgId, { kind: "upload", label: "operator reach" });
  const wide = await revokeApiKey(db, operator.id, { actor: "operator", orgId: null });
  check("O4.9", wide.revoked === true, "and an explicit null still revokes across tenants, which is what /admin needs");
}

// ═══ O4b — the counter-test: the revoke without the scope ═══
{
  const a = await makeOrg("o4ba");
  const key = await createApiKey(db, a.orgId, { kind: "upload", label: "victim" });
  await db.query("UPDATE api_keys SET revoked_at = now(), revoked_by = 'anyone' WHERE id = $1 AND revoked_at IS NULL", [
    key.id,
  ]);
  check(
    "O4b.1",
    (await findApiKey(db, key.plaintext)) === null,
    "the unscoped UPDATE kills a key on its id alone, from any tenant. O4 has teeth"
  );
}

// ═══ O5 — the admin's list tells the truth about time ═══
{
  const { orgId } = await makeOrg("o5");
  const invite = await createInvitation(db, { orgId, email: `slow-${RUN}@example.com`, role: "designer" });

  const now = (await listInvitations(db, orgId)).find((i) => i.id === invite.invitation.id);
  check("O5.1", now?.state === "pending", "a fresh invitation is pending");

  const later = new Date(Date.now() + 15 * 86_400_000);
  const then = (await listInvitations(db, orgId, later)).find((i) => i.id === invite.invitation.id);
  check(
    "O5.2",
    then?.state === "expired",
    "past its expiry it reads as expired even though no sweep has run — the page cannot call a dead link pending"
  );

  const stored = (await db.query("SELECT state FROM invitations WHERE id = $1", [invite.invitation.id])).rows[0].state;
  check("O5.3", stored === "pending", "and the row itself is untouched: this is a display rule, not a write on a read path");
}

// ═══ O6 — an invitation is consumed once ═══
//
// In-process first. Both acceptances run against one database inside one
// transaction each, which is the ordinary two-tabs case.
{
  const { orgId } = await makeOrg("o6");
  const email = `race-${RUN}@example.com`;
  const invite = await createInvitation(db, { orgId, email, role: "member" });
  const user = await createUser(db, { email, displayName: "Racer" });

  const both = await Promise.all([
    acceptInvitation(db, { invitationId: invite.invitation.id, userId: user.id, userEmail: email }),
    acceptInvitation(db, { invitationId: invite.invitation.id, userId: user.id, userEmail: email }),
  ]);
  const accepted = both.filter((r) => r.ok).length;
  check("O6.1", accepted === 1, `two acceptances of one link produced exactly ${accepted} membership-granting success`);

  const memberships = await db.query("SELECT COUNT(*) AS t FROM memberships WHERE org_id = $1 AND user_id = $2", [
    orgId,
    user.id,
  ]);
  check("O6.2", Number(memberships.rows[0].t) === 1, "and one membership row, not two");
  check("O6.3", (await roleIn(db, orgId, user.id)) === "member", "with the role the invitation named");

  // A different person holding a forwarded link is a different failure, and it
  // is refused on identity rather than on the state machine.
  const other = await createUser(db, { email: `forwarded-${RUN}@example.com`, displayName: "Forwarded" });
  const forwarded = await acceptInvitation(db, {
    invitationId: invite.invitation.id,
    userId: other.id,
    userEmail: other.email,
  });
  check("O6.4", !forwarded.ok, `a forwarded link is refused (${forwarded.failure ?? "?"})`);
}

// ═══ O6r/O6b (real Postgres): the race across separate processes ═══
//
// PGlite gives every process its own database, so the cross-process form of
// this is inert there and skips itself — CLAUDE.md rule 4.
if (REAL_PG) {
  const tmp = await mkdtemp(path.join(HERE, ".tmp-org-"));
  try {
    const { orgId } = await makeOrg("o6r");
    const email = `procrace-${RUN}@example.com`;
    const invite = await createInvitation(db, { orgId, email, role: "member" });
    const user = await createUser(db, { email, displayName: "Process racer" });

    const worker = path.join(tmp, "worker.mjs");
    await writeFile(
      worker,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const { acceptInvitation } = await import(${JSON.stringify(path.join(DIST, "invitations.js"))});\n` +
        `const db = await createDb();\n` +
        `const r = await acceptInvitation(db, { invitationId: process.env.INVITE, userId: process.env.USER_ID, userEmail: process.env.EMAIL });\n` +
        `console.log(r.ok ? "accepted" : "refused");\n` +
        `await db.close();\n`
    );

    // The pre-5A.6 shape: read the row, decide, then write. Nothing conditional,
    // so every process that read `pending` proceeds to grant a membership.
    const naive = path.join(tmp, "naive.mjs");
    await writeFile(
      naive,
      `const { createDb } = await import(${JSON.stringify(path.join(DIST, "db.js"))});\n` +
        `const db = await createDb();\n` +
        `const row = (await db.query("SELECT org_id, role, state FROM invitations WHERE id = $1", [process.env.INVITE])).rows[0];\n` +
        `if (!row || row.state !== "pending") { console.log("refused"); } else {\n` +
        `  await new Promise((r) => setTimeout(r, 60));\n` +
        `  await db.query("UPDATE invitations SET state = 'accepted', resolved_at = now() WHERE id = $1", [process.env.INVITE]);\n` +
        `  await db.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO NOTHING", [row.org_id, process.env.USER_ID, row.role]);\n` +
        `  console.log("accepted");\n` +
        `}\n` +
        `await db.close();\n`
    );

    const { spawn } = await import("node:child_process");
    const run = (file, env) =>
      Promise.all(
        Array.from(
          { length: 10 },
          () =>
            new Promise((resolve) => {
              const child = spawn(process.execPath, [file], { env: { ...process.env, ...env } });
              let out = "";
              let err = "";
              child.stdout.on("data", (d) => (out += d));
              child.stderr.on("data", (d) => (err += d));
              child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
            })
        )
      );

    const results = await run(worker, { INVITE: invite.invitation.id, USER_ID: user.id, EMAIL: email });
    const crashed = results.filter((r) => r.code !== 0);
    check(
      "O6r.1",
      crashed.length === 0,
      `10 separate processes raced one invitation link, ${crashed.length} failed` +
        (crashed.length ? ` — ${crashed[0].err.split("\n").filter(Boolean).pop()}` : "")
    );
    const won = results.filter((r) => r.out === "accepted").length;
    check("O6r.2", won === 1, `exactly one of the ten consumed it (${won})`);

    // The naive version, against its own invitation and its own person, so the
    // two runs cannot interfere.
    const email2 = `naive-${RUN}@example.com`;
    const invite2 = await createInvitation(db, { orgId, email: email2, role: "designer" });
    const user2 = await createUser(db, { email: email2, displayName: "Naive racer" });
    const naiveResults = await run(naive, { INVITE: invite2.invitation.id, USER_ID: user2.id, EMAIL: email2 });
    const naiveWon = naiveResults.filter((r) => r.out === "accepted").length;
    check(
      "O6b.1",
      naiveWon > 1,
      `the read-then-write version lets ${naiveWon} of 10 processes consume one single-use link — O6r has teeth`
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// ═══ O8 — an invitation that is actually sent ═══
//
// Until the console had this, `createInvitation` was the whole of "invite
// somebody": a row, a hashed token, and nobody told. The page said *"Invitation
// sent"* and no message existed. What is checked here is the join between the
// two — that the budget is paid before the row exists, that the message says the
// four things §10.7 5A.6 requires, and that it says nothing else about the
// organization.
{
  const { orgId, owner } = await makeOrg("o8");
  const sent = [];
  const mailer = { send: async (message) => { sent.push(message); } };
  const deps = { db, baseUrl: "https://cloud.example", mailer };

  const invitee = `invited-${RUN}@example.com`;
  const outcome = await sendInvitation(deps, {
    orgId,
    orgName: `Org o8 ${RUN}`,
    email: invitee,
    role: "designer",
    invitedBy: owner,
    ip: "203.0.113.9",
  });
  check("O8.1", outcome.ok === true && sent.length === 1, `inviting somebody sends exactly one message (${sent.length})`);

  const message = sent[0];
  const body = `${message?.html ?? ""} ${message?.text ?? ""}`;
  check("O8.2", message?.to === invitee, "addressed to the person invited");
  check(
    "O8.3",
    body.includes(`Org o8 ${RUN}`) && body.includes(owner.display_name) && body.includes("designer"),
    "and it names the organization, who invited them, and the role — the three things that decide whether to click"
  );
  check("O8.4", /expires in 14 days/.test(body), "with how long the link lasts");

  const link = /https:\/\/cloud\.example\/api\/auth\/invite\/accept\?token=([A-Za-z0-9_-]+)/.exec(message?.text ?? "");
  check("O8.5", link !== null, "the link redeems server-side at the accept route rather than opening a page holding the token");

  // The token in the email is the one that works, and only its hash is stored.
  const invitation = (await listInvitations(db, orgId))[0];
  check("O8.6", invitation?.email === invitee && invitation?.state === "pending", "and the invitation row exists, pending");
  const stored = (await db.query("SELECT token_hash FROM invitations WHERE id = $1", [invitation.id])).rows[0];
  check(
    "O8.7",
    link !== null && !stored.token_hash.includes(link[1]) && stored.token_hash !== link[1],
    "the row holds a hash, not the token that was emailed"
  );

  // §10.7 5A.6: the invitation surface names the organization and the inviter,
  // and nothing about the other members. Someone who never accepts should learn
  // nothing from having been asked.
  const other = await join(orgId, "unrelated-colleague", "member");
  const second = [];
  await sendInvitation(
    { db, baseUrl: "https://cloud.example", mailer: { send: async (m) => { second.push(m); } } },
    { orgId, orgName: `Org o8 ${RUN}`, email: `second-${RUN}@example.com`, role: "member", invitedBy: owner, ip: "203.0.113.9" }
  );
  const secondBody = `${second[0]?.html ?? ""} ${second[0]?.text ?? ""}`;
  check(
    "O8.8",
    !secondBody.includes(other.email) && !secondBody.includes("unrelated-colleague"),
    "and it says nothing about anybody else in the organization"
  );

  // A refused budget must leave nothing behind. A live link that nobody was told
  // about is worse than no invitation at all.
  const before = (await listInvitations(db, orgId)).length;
  const refusedMail = [];
  const refused = await sendInvitation(
    {
      db,
      baseUrl: "https://cloud.example",
      mailer: { send: async (m) => { refusedMail.push(m); } },
      env: { ...process.env, AUTH_INVITE_ORG_DAILY: "0" },
    },
    { orgId, orgName: `Org o8 ${RUN}`, email: `refused-${RUN}@example.com`, role: "member", invitedBy: owner, ip: "203.0.113.9" }
  );
  check("O8.9", refused.ok === false && refused.reason === "budget", `a spent invitation budget refuses (${refused.ok ? "sent" : refused.reason})`);
  check(
    "O8.10",
    (await listInvitations(db, orgId)).length === before && refusedMail.length === 0,
    "and creates no row and sends no mail — reserve first, then create, then send"
  );

  // A provider that refuses after the row exists is reported, not rolled back:
  // it may have accepted the message and failed on the response.
  const failing = { send: async () => { throw new Error("provider down"); } };
  const alerts = [];
  const unsent = await sendInvitation(
    { db, baseUrl: "https://cloud.example", mailer: failing, alert: (m) => alerts.push(m) },
    { orgId, orgName: `Org o8 ${RUN}`, email: `unsent-${RUN}@example.com`, role: "member", invitedBy: owner, ip: "203.0.113.9" }
  );
  check("O8.11", unsent.ok === false && unsent.reason === "send-failed", `a refused provider reports it (${unsent.ok ? "sent" : unsent.reason})`);
  check(
    "O8.12",
    (await listInvitations(db, orgId)).some((i) => i.email === `unsent-${RUN}@example.com` && i.state === "pending"),
    "the row stays — deleting it could revoke a link that is already in an inbox"
  );
  check("O8.13", alerts.length === 1 && /invitation email failed/i.test(alerts[0]), "and a human is told, because the budget slot is spent either way");

  // The audit log knows who did it, and does not hold the address in the clear.
  const events = await db.query(
    "SELECT kind, outcome, actor_user_id FROM auth_events WHERE org_id = $1 ORDER BY at DESC",
    [orgId]
  );
  const kinds = events.rows.map((r) => `${r.kind}:${r.outcome}`);
  check(
    "O8.14",
    kinds.includes("invitation-created:allowed") && kinds.includes("invitation-created:refused") && kinds.includes("invitation-created:failed"),
    `each outcome is recorded distinctly (${[...new Set(kinds)].join(", ")})`
  );
  check(
    "O8.15",
    events.rows.every((r) => r.actor_user_id === owner.id),
    "attributed to the admin who sent it, rather than to the person invited"
  );
}

// ═══ O7 — the console map cannot promise what it already holds ═══
{
  const bad = unknownBuiltEntries();
  check(
    "O7.1",
    bad.length === 0,
    `every 'built' entry is a verbatim 'holds' entry${bad.length ? ` — ${bad.map((b) => `${b.area}: "${b.entry}"`).join("; ")}` : ""}`
  );

  const org = CONSOLE_AREAS.find((a) => a.id === "organization");
  check(
    "O7.2",
    org.built.includes("members, roles and removal") && org.built.includes("invitations and their state"),
    "Organization claims the workflows this change built"
  );
  check(
    "O7.3",
    outstanding(org).length > 0 && !outstanding(org).some((item) => org.built.includes(item)),
    `and what is outstanding is the difference, not a second list (${outstanding(org).join("; ")})`
  );

  const billing = CONSOLE_AREAS.find((a) => a.id === "billing");
  check(
    "O7.4",
    billing.built.length === 0 && outstanding(billing).length === billing.holds.length,
    "an area with nothing built still outlines everything it will hold"
  );

  const runs = CONSOLE_AREAS.find((a) => a.id === "runs");
  check(
    "O7.5",
    outstanding(runs).length === 0,
    "and an area that is finished outlines nothing, so no page promises a feature it already has"
  );
}

await db.close();
console.log(failures === 0 ? "\nOrganization suite: all checks passed" : `\nOrganization suite: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
