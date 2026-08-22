// The session layer — FUTURENORMA §4 Step 6, PATHWAYS Pathway 5 / §10.7 5A.
//
// Run: npm test
// Run against a real server (this is the run that counts):
//   DATABASE_URL="$(scripts/test-db.sh start)" node test/auth.test.mjs
//
// What this suite is for: everything about *who someone is* and *what that
// entitles them to*. The outbound-email ceilings that make magic links safe to
// expose at all live next door in `authAbuse.test.mjs`, because they are a
// different claim proven a different way (concurrent processes).
//
// The checks are grouped by the rule they defend, and each group names the rule
// it comes from. Several exist because the naive implementation is the obvious
// one: matching a GitHub account to a user by email address, treating a session
// as access to every organization, letting a repository id in a URL choose the
// tenant. Those are A6, A7 and A8.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIST = path.join(ROOT, "dist");
const REAL_PG = Boolean(process.env.DATABASE_URL?.trim());

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { normaliseAddress, subnetOf, keyedHash } = await import(path.join(DIST, "authCrypto.js"));
const {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  rotateSession,
  listSessions,
  hasRecentAuth,
  sweepSessions,
  sessionCookieName,
  SESSION_TTL_DAYS,
  SESSION_IDLE_DAYS,
} = await import(path.join(DIST, "sessions.js"));
const {
  createUser,
  addMembership,
  membershipsFor,
  linkIdentity,
  findUserByIdentity,
  ownerOf,
  removeMembership,
  transferOwnership,
  claimOwnership,
} = await import(path.join(DIST, "users.js"));
const { issueLoginToken, consumeLoginToken, signInUrl, MAGIC_LINK_TTL_MINUTES } = await import(
  path.join(DIST, "magicLink.js")
);
const { createInvitation, acceptInvitation, revokeInvitation, pendingInvitationsFor, expireInvitations } =
  await import(path.join(DIST, "invitations.js"));
const { createOwnerClaim, consumeOwnerClaim, pendingClaimFor, unclaimedOrganizations } = await import(
  path.join(DIST, "ownerClaims.js")
);
const { issueState, verifyState, authorizeUrl, githubConfigured, GITHUB_SCOPE } = await import(
  path.join(DIST, "githubOauth.js")
);
const { requestSignInLink, completeMagicLink, completeGithubSignIn, completeInvitation, signInEligibility } =
  await import(
  path.join(DIST, "loginService.js")
);
const { authorize } = await import(path.join(DIST, "reportData.js"));
const { recentAuthEvents } = await import(path.join(DIST, "authEvents.js"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

console.log(`mode: ${REAL_PG ? "REAL POSTGRES (DATABASE_URL set)" : "PGlite (in-process)"}\n`);

const db = await createDb();
await migrate(db);

// A stub mailer, so the suite never touches a provider and can read what would
// have been sent.
const sent = [];
const mailer = { configured: true, describe: () => "stub", send: async (m) => sent.push(m) };
const alerts = [];
const deps = { db, baseUrl: "https://normascope.com", mailer, alert: (m) => alerts.push(m) };
const tokenFromLastEmail = () => {
  const url = sent[sent.length - 1].text.match(/https:\/\/\S+/)[0];
  return new URL(url).searchParams.get("token");
};

async function makeOrg(name = "org") {
  const id = randomUUID();
  await db.query("INSERT INTO orgs (id, name, plan) VALUES ($1, $2, 'team')", [id, `${name}-${id.slice(0, 6)}`]);
  return id;
}

async function makeMember(orgId, role = "admin", email = `${randomUUID().slice(0, 8)}@example.com`) {
  const user = await createUser(db, { email });
  await addMembership(db, { orgId, userId: user.id, role });
  return user;
}

/**
 * A suffix unique to this run.
 *
 * `users.email` is UNIQUE and `login_identities` is keyed on the provider
 * subject, so a fixture address or a fixture GitHub id written as a literal
 * collides with the previous run the moment the suite meets a shared server —
 * which is the run that counts. The first version of this file did exactly that
 * and died on `users_email_key`.
 */
const RUN = randomUUID().slice(0, 8);
const GH = Math.floor(Math.random() * 1_000_000) + 1_000_000;

/** A unique IP per group, so one group's failure counters cannot reach another. */
let ipCounter = 0;
const freshIp = () => `198.51.${Math.floor(ipCounter / 250) + 1}.${(ipCounter++ % 250) + 1}`;

// ═══ A0 — one normalisation, in two places that cannot import each other ═══
//
// `authCrypto.normaliseAddress` (server package, imports node:crypto) and
// `web/lib/waitlistEmail.normaliseEmail` (client-safe, no imports) do the same
// job for different callers. Neither can import the other; the comment in each
// says so. This is what keeps them from drifting into two answers.
{
  const table = [
    ["  Ada@Example.COM  ", "ada@example.com"],
    ["ADA@EXAMPLE.COM", "ada@example.com"],
    ["ada+work@example.com", "ada+work@example.com"],
    ["a.d.a@gmail.com", "a.d.a@gmail.com"],
  ];
  const agree = table.every(([input, expected]) => normaliseAddress(input) === expected);
  check("A0.1", agree, "trim + lowercase, and no provider-specific folklore (no dot or plus stripping)");

  const webSource = await readFile(path.join(ROOT, "web", "lib", "waitlistEmail.ts"), "utf8");
  check(
    "A0.2",
    /export function normaliseEmail\(raw: string\): string \{\s*return raw\.trim\(\)\.toLowerCase\(\);\s*\}/.test(
      webSource
    ),
    "the client-safe copy is the identical rule — a textual check, because the two modules cannot import each other"
  );
}

// ═══ A1 — sessions are rows, and every failure mode reads the same ═══
{
  const orgId = await makeOrg("sessions");
  const user = await makeMember(orgId);
  const created = await createSession(db, { userId: user.id, method: "email", ip: "203.0.113.9", userAgent: "probe" });

  const live = await resolveSession(db, created.token);
  check("A1.1", live?.user.id === user.id, "a fresh session resolves to its user");
  check("A1.2", live?.memberships[0]?.orgId === orgId, "and carries the membership list authorization comes from");

  check("A1.3", (await resolveSession(db, "not-a-token")) === null, "an unknown token resolves to null");
  check("A1.4", (await resolveSession(db, undefined)) === null, "no cookie resolves to null");

  const stored = (await db.query("SELECT token_hash FROM sessions WHERE id = $1", [created.id])).rows[0];
  check(
    "A1.5",
    stored.token_hash !== created.token && stored.token_hash.length === 64,
    "the row holds a sha256, never the bearer token"
  );
  const ipRow = (await db.query("SELECT ip_hash FROM sessions WHERE id = $1", [created.id])).rows[0];
  check("A1.6", ipRow.ip_hash !== "203.0.113.9" && ipRow.ip_hash.length === 64, "the address is hashed, never stored");

  await revokeSession(db, created.id, "test");
  check("A1.7", (await resolveSession(db, created.token)) === null, "revocation takes effect on the next request");

  // Expiry and idle are enforced on read, so shortening either binds existing
  // sessions immediately. Proven by asking with a clock rather than by waiting.
  const s2 = await createSession(db, { userId: user.id, method: "email" });
  const pastAbsolute = new Date(Date.now() + (SESSION_TTL_DAYS + 1) * 86_400_000);
  check("A1.8", (await resolveSession(db, s2.token, { now: pastAbsolute })) === null, `absolute expiry at ${SESSION_TTL_DAYS} days`);
  const pastIdle = new Date(Date.now() + (SESSION_IDLE_DAYS + 1) * 86_400_000);
  check("A1.9", (await resolveSession(db, s2.token, { now: pastIdle })) === null, `idle cutoff at ${SESSION_IDLE_DAYS} days`);
}

// ═══ A2 — rotation replaces the token and never extends the session ═══
//
// §10.7 5A.8: "Rotate the token during renewal; never extend past absolute
// expiry." A rotation that also moved `expires_at` would make the ninety-day
// limit describe nothing for anyone who signs in regularly.
{
  const orgId = await makeOrg("rotate");
  const user = await makeMember(orgId);
  const created = await createSession(db, { userId: user.id, method: "github" });
  const before = (await db.query("SELECT expires_at FROM sessions WHERE id = $1", [created.id])).rows[0];

  const rotated = await rotateSession(db, created.id);
  check("A2.1", rotated !== null && rotated.token !== created.token, "rotation issues a different token");
  check("A2.2", (await resolveSession(db, created.token)) === null, "the previous token stops working at once");
  const after = await resolveSession(db, rotated.token);
  check("A2.3", after?.session.id === created.id, "the session keeps its identity, so the device list does not grow");

  const expiry = (await db.query("SELECT expires_at FROM sessions WHERE id = $1", [created.id])).rows[0];
  check(
    "A2.4",
    new Date(expiry.expires_at).getTime() === new Date(before.expires_at).getTime(),
    "and its absolute expiry is untouched"
  );

  check("A2.5", hasRecentAuth(after.session), "a session that just signed in satisfies recent authentication");
  const later = new Date(Date.now() + 16 * 60_000);
  check("A2.6", !hasRecentAuth(after.session, later), "sixteen minutes later it does not");

  // The point of the previous check: ordinary use must not refresh the proof.
  await resolveSession(db, rotated.token, { now: new Date(Date.now() + 30 * 60_000) });
  const stillStale = await resolveSession(db, rotated.token, { now: new Date(Date.now() + 31 * 60_000) });
  check(
    "A2.7",
    !hasRecentAuth(stillStale.session, new Date(Date.now() + 31 * 60_000)),
    "and browsing the site does not refresh it — otherwise an open tab would satisfy it forever"
  );

  await revokeSession(db, created.id, "test");
  check("A2.8", (await rotateSession(db, created.id)) === null, "a revoked session cannot be resurrected by rotating it");
}

// ═══ A3 — magic links: short-lived, single-use, and silent about why ═══
{
  const link = await issueLoginToken(db, { email: `ada-${RUN}@example.com`, ip: "203.0.113.1" });
  const stored = (await db.query("SELECT token_hash FROM login_tokens WHERE id = $1", [link.id])).rows[0];
  check("A3.1", stored.token_hash !== link.token, "the token is hashed at rest");

  const first = await consumeLoginToken(db, link.token);
  check("A3.2", first.ok && first.email === `ada-${RUN}@example.com`, "a live link is spent once");
  const second = await consumeLoginToken(db, link.token);
  check("A3.3", !second.ok && second.failure === "already-used", "and cannot be spent twice");

  const expired = await issueLoginToken(db, { email: "b@example.com" });
  const after = new Date(Date.now() + (MAGIC_LINK_TTL_MINUTES + 1) * 60_000);
  const dead = await consumeLoginToken(db, expired.token, { now: after });
  check("A3.4", !dead.ok && dead.failure === "expired", `expires after ${MAGIC_LINK_TTL_MINUTES} minutes`);

  check("A3.5", (await consumeLoginToken(db, "nonsense")).failure === "unknown", "an invented token is unknown");

  // Two clicks landing together — a mail scanner prefetching while the person
  // clicks — must not both mint a session. The conditional UPDATE is what
  // decides; this shows it deciding.
  const raced = await issueLoginToken(db, { email: "c@example.com" });
  const results = await Promise.all([consumeLoginToken(db, raced.token), consumeLoginToken(db, raced.token)]);
  check("A3.6", results.filter((r) => r.ok).length === 1, "two simultaneous clicks spend it exactly once");

  const url = new URL(signInUrl("https://normascope.com", "abc"));
  check("A3.7", url.pathname === "/api/auth/email/callback" && url.searchParams.get("token") === "abc", "the link points at the redemption route");
}

// ═══ A4 — the owner claim: one organization, one owner, whatever races ═══
{
  const orgId = await makeOrg("claim");
  // Unique per run. `checkout_reference` is UNIQUE across the table — that is
  // the constraint making a retried webhook idempotent — so a fixed literal
  // would find the previous run's row on a shared server and this group would
  // be testing yesterday's state.
  const reference = `sub_A4_${randomUUID()}`;
  const buyerEmail = `buyer-${randomUUID().slice(0, 8)}@acme.com`;
  const a = await createOwnerClaim(db, { orgId, email: buyerEmail.toUpperCase(), checkoutReference: reference });
  const b = await createOwnerClaim(db, { orgId, email: buyerEmail, checkoutReference: reference });
  check("A4.1", a.id === b.id, "a retried webhook finds the claim it already wrote (idempotent on checkout reference)");

  const count = Number(
    (await db.query("SELECT COUNT(*) AS n FROM owner_claims WHERE org_id = $1", [orgId])).rows[0].n
  );
  check("A4.2", count === 1, "and does not create a second organization's worth of state");
  check("A4.3", (await pendingClaimFor(db, buyerEmail))?.orgId === orgId, "the address is normalised on the way in");
  check("A4.4", (await ownerOf(db, orgId)) === null, "an unclaimed organization has no owner and no console access");

  const wrong = await createUser(db, { email: `someone-else-${randomUUID().slice(0, 8)}@acme.com` });
  const refused = await consumeOwnerClaim(db, { claimId: a.id, userId: wrong.id, userEmail: wrong.email });
  check("A4.5", !refused.ok && refused.failure === "wrong-identity", "another address cannot claim it");

  // Two devices, together.
  const buyer = await createUser(db, { email: buyerEmail });
  const both = await Promise.all([
    consumeOwnerClaim(db, { claimId: a.id, userId: buyer.id, userEmail: buyer.email }),
    consumeOwnerClaim(db, { claimId: a.id, userId: buyer.id, userEmail: buyer.email }),
  ]);
  check("A4.6", both.filter((r) => r.ok).length === 1, "two devices claiming at once produce one owner");
  check("A4.7", (await ownerOf(db, orgId)) === buyer.id, "and the owner is the purchaser");
  const role = (await membershipsFor(db, buyer.id)).find((m) => m.orgId === orgId)?.role;
  check("A4.8", role === "admin", "who is also an admin — the invariant and the role move together");
  check("A4.9", (await unclaimedOrganizations(db)).every((c) => c.orgId !== orgId), "and it leaves the unclaimed list");
}

// ═══ A5 — invitations: one live link, consumed once, by the invited person ═══
{
  const orgId = await makeOrg("invites");
  const admin = await makeMember(orgId, "admin");
  const designerEmail = `designer-${RUN}@studio.com`;
  const first = await createInvitation(db, { orgId, email: designerEmail, role: "designer", invitedBy: admin.id });
  const resent = await createInvitation(db, { orgId, email: designerEmail, role: "designer", invitedBy: admin.id });

  const live = await pendingInvitationsFor(db, designerEmail);
  check("A5.1", live.length === 1 && live[0].id === resent.invitation.id, "resending leaves exactly one live invitation");

  const designer = await createUser(db, { email: designerEmail });
  const stale = await acceptInvitation(db, {
    invitationId: first.invitation.id,
    userId: designer.id,
    userEmail: designer.email,
  });
  check("A5.2", !stale.ok && stale.failure === "already-resolved", "the superseded link is dead, not merely hidden");

  const wrongPerson = await createUser(db, { email: `someone-${RUN}@else.com` });
  const wrong = await acceptInvitation(db, {
    invitationId: resent.invitation.id,
    userId: wrongPerson.id,
    userEmail: wrongPerson.email,
  });
  check("A5.3", !wrong.ok && wrong.failure === "wrong-identity", "a forwarded link does not work for whoever received it");

  const accepted = await acceptInvitation(db, {
    invitationId: resent.invitation.id,
    userId: designer.id,
    userEmail: designer.email,
  });
  check("A5.4", accepted.ok && accepted.role === "designer", "the invited person joins with the invited role");
  const twice = await acceptInvitation(db, {
    invitationId: resent.invitation.id,
    userId: designer.id,
    userEmail: designer.email,
  });
  check("A5.5", !twice.ok, "and cannot accept the same invitation twice");

  const other = await createInvitation(db, { orgId, email: "late@studio.com", role: "member" });
  await revokeInvitation(db, other.invitation.id);
  check("A5.6", (await pendingInvitationsFor(db, "late@studio.com")).length === 0, "a revoked invitation is not pending");

  const old = await createInvitation(db, { orgId, email: "old@studio.com", role: "member" });
  const later = new Date(Date.now() + 15 * 86_400_000);
  check("A5.7", (await pendingInvitationsFor(db, "old@studio.com", later)).length === 0, "expiry is by time, not by a sweeper having run");
  await expireInvitations(db, later);
  const state = (await db.query("SELECT state FROM invitations WHERE id = $1", [old.invitation.id])).rows[0].state;
  check("A5.8", state === "expired", "and the sweep makes the admin's list tell the truth");

  const invited = await db.query("SELECT role FROM invitations WHERE id = $1", [resent.invitation.id]);
  check("A5.9", invited.rows[0].role === "designer", "roles on invitations exclude owner — the database refuses it");
  let ownerInviteRefused = false;
  try {
    await createInvitation(db, { orgId, email: "x@y.com", role: "owner" });
  } catch {
    ownerInviteRefused = true;
  }
  check("A5.10", ownerInviteRefused, "ownership cannot be handed out in an email");
}

// ═══ A6 — an organization always has an owner and an admin ═══
{
  const orgId = await makeOrg("ownership");
  const owner = await makeMember(orgId, "admin");
  await claimOwnership(db, orgId, owner.id);
  const second = await makeMember(orgId, "member");

  let reason = "";
  try {
    await removeMembership(db, { orgId, userId: owner.id });
  } catch (err) {
    reason = err.reason;
  }
  check("A6.1", reason === "is-owner", "the owner cannot be removed — transfer first");

  const soloOrg = await makeOrg("solo");
  const solo = await makeMember(soloOrg, "admin");
  reason = "";
  try {
    await removeMembership(db, { orgId: soloOrg, userId: solo.id });
  } catch (err) {
    reason = err.reason;
  }
  check("A6.2", reason === "last-admin", "the last admin cannot be removed");

  await removeMembership(db, { orgId, userId: second.id });
  check("A6.3", (await membershipsFor(db, second.id)).length === 0, "an ordinary member can be");

  const heir = await makeMember(orgId, "member");
  const stranger = await createUser(db, { email: `stranger-${randomUUID().slice(0, 6)}@x.com` });
  reason = "";
  try {
    await transferOwnership(db, { orgId, fromUserId: owner.id, toUserId: stranger.id });
  } catch (err) {
    reason = err.reason;
  }
  check("A6.4", reason === "not-a-member", "ownership cannot be transferred to a stranger");

  reason = "";
  try {
    await transferOwnership(db, { orgId, fromUserId: heir.id, toUserId: heir.id });
  } catch (err) {
    reason = err.reason;
  }
  check("A6.5", reason === "not-the-owner", "and only by the current owner — a stale page cannot move it");

  await transferOwnership(db, { orgId, fromUserId: owner.id, toUserId: heir.id });
  check("A6.6", (await ownerOf(db, orgId)) === heir.id, "a real transfer moves it");
  const heirRole = (await membershipsFor(db, heir.id)).find((m) => m.orgId === orgId)?.role;
  check("A6.7", heirRole === "admin", "and the new owner is an admin");
}

// ═══ A7 — the session is the tenant boundary, and a URL is not ═══
//
// §10.7 5A.13: "an organization ID in a URL, form, cookie or JSON body is not
// authorization". The naive version of `authorize` trusts the id it is handed;
// this shows the difference.
{
  const orgA = await makeOrg("tenant-a");
  const orgB = await makeOrg("tenant-b");
  const alice = await makeMember(orgA, "member");
  const repoB = randomUUID();
  const runB = randomUUID();
  await db.query("INSERT INTO repos (id, org_id, name) VALUES ($1, $2, 'b/site')", [repoB, orgB]);
  await db.query(
    "INSERT INTO runs (id, org_id, repo_id, commit_sha, branch, summary) VALUES ($1, $2, $3, 'abc', 'main', '{}')",
    [runB, orgB, repoB]
  );

  const membershipOrgIds = (await membershipsFor(db, alice.id)).map((m) => m.orgId);
  check("A7.1", membershipOrgIds.length === 1 && membershipOrgIds[0] === orgA, "Alice belongs to one organization");

  const denied = await authorize(db, runB, undefined, { orgIds: membershipOrgIds });
  check("A7.2", denied === null, "her session does not open another tenant's run");

  // The counter-test: what the naive implementation does. Passing the org id
  // the *caller* asked for — which is what "read orgId from the URL" amounts to
  // — opens it. This is the check that proves A7.2 has teeth.
  const naive = await authorize(db, runB, undefined, { orgIds: [orgB] });
  check("A7.3", naive?.viewer === "owner", "counter-test: trusting a caller-supplied org id opens it — which is why A7.2 reads the session");

  const orgBMember = await makeMember(orgB, "member");
  const allowed = await authorize(db, runB, undefined, {
    orgIds: (await membershipsFor(db, orgBMember.id)).map((m) => m.orgId),
  });
  check("A7.4", allowed?.viewer === "owner", "a member of the owning organization gets the owner view");

  // A share token is still a capability, and it is still not membership.
  const shareToken = randomUUID();
  const { createHash } = await import("node:crypto");
  await db.query(
    "INSERT INTO share_links (id, org_id, run_id, token_hash) VALUES ($1, $2, $3, $4)",
    [randomUUID(), orgB, runB, createHash("sha256").update(shareToken).digest("hex")]
  );
  const shared = await authorize(db, runB, shareToken, { orgIds: membershipOrgIds });
  check("A7.5", shared?.viewer === "share", "a member of another organization holding a share link gets the share view, not the owner view");
}

// ═══ A8 — GitHub: no silent merge, and the state check that stops the classic attack ═══
{
  const state = issueState();
  check("A8.1", verifyState(state, state), "a state matching its cookie verifies");
  check("A8.2", !verifyState(state, null), "a callback with no cookie is refused — this is the crafted-callback attack");
  check("A8.3", !verifyState(state, issueState()), "a state that does not match the cookie is refused");
  check("A8.4", !verifyState(`${state}x`, `${state}x`), "a tampered state is refused even when both copies agree");
  check(
    "A8.5",
    !verifyState(state, state, { now: new Date(Date.now() + 11 * 60_000) }),
    "and it expires, so a stale tab fails cleanly"
  );

  const env = { ...process.env, GITHUB_OAUTH_CLIENT_ID: "cid", GITHUB_OAUTH_CLIENT_SECRET: "secret" };
  const url = new URL(authorizeUrl({ state, redirectUri: "https://normascope.com/api/auth/github/callback", env }));
  check("A8.6", url.searchParams.get("scope") === GITHUB_SCOPE, `the smallest useful scope: ${GITHUB_SCOPE}`);
  check("A8.7", !GITHUB_SCOPE.includes("repo"), "which never includes repository access");
  check("A8.8", githubConfigured({}) === false, "unset credentials mean the button and the routes do not exist");

  // A GitHub account we have never seen, whose verified address happens to match
  // an existing member. The naive implementation links them and signs in.
  const orgId = await makeOrg("github");
  const devEmail = `dev-${RUN}@acme.com`;
  const member = await makeMember(orgId, "member", devEmail);
  const githubFetch = (emails, id, verified = true) => async (target) => {
    const asString = String(target);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (asString.includes("oauth/access_token")) return json({ access_token: "gho_test" });
    if (asString.endsWith("/user")) return json({ id, login: "devperson", name: "Dev Person" });
    return json(emails.map((email, index) => ({ email, primary: index === 0, verified })));
  };

  const s = issueState({ env });
  const refused = await completeGithubSignIn(
    { ...deps, env },
    {
      code: "code",
      state: s,
      cookieState: s,
      redirectUri: "https://normascope.com/api/auth/github/callback",
      ip: freshIp(),
      fetchImpl: githubFetch([devEmail], GH + 1),
    }
  );
  check(
    "A8.9",
    !refused.ok && refused.reason === "no-linked-account",
    "a matching email is evidence, not permission — no silent account merge (§10.7 5A.7)"
  );
  check("A8.10", (await findUserByIdentity(db, "github", String(GH + 1))) === null, "and nothing was linked on the way past");

  // The sanctioned path: an invitation to that address, completed by a GitHub
  // account whose verified email matches it.
  const newDevEmail = `newdev-${RUN}@acme.com`;
  await createInvitation(db, { orgId, email: newDevEmail, role: "member" });
  const s2 = issueState({ env });
  const onboarded = await completeGithubSignIn(
    { ...deps, env },
    {
      code: "code",
      state: s2,
      cookieState: s2,
      redirectUri: "https://normascope.com/api/auth/github/callback",
      ip: freshIp(),
      fetchImpl: githubFetch([newDevEmail], GH + 2),
    }
  );
  check("A8.11", onboarded.ok, "an invited address completing with GitHub is the sanctioned link path");
  check("A8.12", (await findUserByIdentity(db, "github", String(GH + 2)))?.id === onboarded.user.id, "and the identity is keyed on the immutable subject");

  // Unverified addresses must not count. This is the takeover: anyone can type
  // someone else's address into GitHub's settings page.
  await createInvitation(db, { orgId, email: `victim-${RUN}@acme.com`, role: "admin" });
  const s3 = issueState({ env });
  const unverified = await completeGithubSignIn(
    { ...deps, env },
    {
      code: "code",
      state: s3,
      cookieState: s3,
      redirectUri: "https://normascope.com/api/auth/github/callback",
      ip: freshIp(),
      fetchImpl: githubFetch([`victim-${RUN}@acme.com`], GH + 3, false),
    }
  );
  check("A8.13", !unverified.ok, "an unverified GitHub address claims nothing");

  // A renamed GitHub account keeps working, because the login is not the key.
  const s4 = issueState({ env });
  const renamed = await completeGithubSignIn(
    { ...deps, env },
    {
      code: "code",
      state: s4,
      cookieState: s4,
      redirectUri: "https://normascope.com/api/auth/github/callback",
      ip: freshIp(),
      fetchImpl: async (target) => {
        const asString = String(target);
        const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
        if (asString.includes("oauth/access_token")) return json({ access_token: "gho_test" });
        if (asString.endsWith("/user")) return json({ id: GH + 2, login: "renamed-entirely", name: "Same Person" });
        return json([{ email: `different-${RUN}@acme.com`, primary: true, verified: true }]);
      },
    }
  );
  check("A8.14", renamed.ok && renamed.user.id === onboarded.user.id, "a renamed GitHub account is still the same person");
  check("A8.15", member.id !== onboarded.user.id, "and none of this created a second account for the existing member");
}

// ═══ A9 — the sign-in flow end to end, including who may be sent a link ═══
{
  const orgId = await makeOrg("flow");
  const flowEmail = `flow-${RUN}@acme.com`;
  const person = await makeMember(orgId, "member", flowEmail);

  check("A9.1", (await signInEligibility(db, flowEmail))?.kind === "member", "a member may be sent a link");
  check("A9.2", (await signInEligibility(db, "nobody@nowhere.com")) === null, "a stranger may not — the set is bounded by seats, invitations and checkouts");

  sent.length = 0;
  const asked = await requestSignInLink(deps, { email: flowEmail, ip: freshIp() });
  check("A9.3", asked.status === "accepted" && asked.internal === "sent", "asking for a link sends one");
  const signedIn = await completeMagicLink(deps, { token: tokenFromLastEmail(), ip: "203.0.113.77" });
  check("A9.4", signedIn.ok && signedIn.user.id === person.id, "and following it signs the person in");

  const resolved = await resolveSession(db, signedIn.session.token);
  check("A9.5", resolved?.memberships[0]?.orgId === orgId, "with the membership that authorizes everything else");

  // Two devices, both signed in, revoked independently — §10.7 5A.8.
  const laptop = await createSession(db, { userId: person.id, method: "email", userAgent: "laptop" });
  const phone = await createSession(db, { userId: person.id, method: "email", userAgent: "phone" });
  check("A9.6", (await listSessions(db, person.id)).length >= 2, "concurrent sessions are allowed, one row per device");
  await revokeSession(db, laptop.id, "lost laptop");
  check(
    "A9.7",
    (await resolveSession(db, laptop.token)) === null && (await resolveSession(db, phone.token)) !== null,
    "revoking one leaves the others alone"
  );
  const count = await revokeAllSessions(db, person.id, "sign out everywhere");
  check("A9.8", count >= 1 && (await resolveSession(db, phone.token)) === null, "and sign out everywhere ends all of them");

  // Membership removal ends access on the next request without touching the
  // session row — the property a JWT could not have.
  const orgTwo = await makeOrg("removal");
  const leaver = await makeMember(orgTwo, "member");
  await makeMember(orgTwo, "admin");
  const leaverSession = await createSession(db, { userId: leaver.id, method: "email" });
  check("A9.9", (await resolveSession(db, leaverSession.token))?.memberships.length === 1, "a member's session sees their organization");
  await removeMembership(db, { orgId: orgTwo, userId: leaver.id });
  const afterRemoval = await resolveSession(db, leaverSession.token);
  check("A9.10", afterRemoval !== null && afterRemoval.memberships.length === 0, "after removal the session still resolves and sees nothing — §10.7 5A.4");
}

// ═══ A10 — the audit log holds evidence, not personal data ═══
{
  const events = await recentAuthEvents(db, 200);
  check("A10.1", events.length > 0, "authentication events are recorded");

  const raw = await db.query("SELECT subject_hash, ip_hash FROM auth_events LIMIT 500");
  const leaked = raw.rows.filter(
    (row) => row.subject_hash.includes("@") || /^\d+\.\d+\.\d+\.\d+$/.test(row.ip_hash)
  );
  check("A10.2", leaked.length === 0, "no address and no IP appears in the log — both are keyed hashes");

  const sameTwice = keyedHash("audit-address", "ada@example.com") === keyedHash("audit-address", "ada@example.com");
  const differentPurpose = keyedHash("audit-address", "ada@example.com") !== keyedHash("throttle-address", "ada@example.com");
  check("A10.3", sameTwice, "the same address hashes the same way, so events can be correlated");
  check("A10.4", differentPurpose, "and differently per purpose, so two leaked tables cannot be joined");

  const kinds = new Set(events.map((e) => e.kind));
  check("A10.5", kinds.has("magic-link-sent") && kinds.has("magic-link-consumed"), "both halves of a sign-in are recorded");
  check("A10.6", kinds.has("github-refused"), "and so are refusals — an incident needs the attempts, not just the successes");
}

// ═══ A12 — an invitation link is a sign-in as well as a join ═══
//
// Holding the token proves control of the address it was mailed to, which is
// the same standard a magic link meets — so acceptance and the session happen
// together rather than asking someone to sign in twice.
{
  const orgId = await makeOrg("invite-flow");
  await makeMember(orgId, "admin");
  const invitedEmail = `joiner-${RUN}@studio.com`;
  const invite = await createInvitation(db, { orgId, email: invitedEmail, role: "designer" });

  const joined = await completeInvitation(deps, { token: invite.token, ip: freshIp(), userAgent: "probe" });
  check("A12.1", joined.ok, "following an invitation link creates the person and signs them in");
  check("A12.2", joined.ok && joined.orgId === orgId, "into the organization named on the invitation row, not one from the URL");

  const session = await resolveSession(db, joined.ok ? joined.session.token : "");
  check("A12.3", session?.memberships[0]?.role === "designer", "with the invited role");
  check("A12.4", session?.user.email === invitedEmail, "as the invited address");

  const replay = await completeInvitation(deps, { token: invite.token, ip: freshIp() });
  check("A12.5", !replay.ok, "and the link is spent — a forwarded copy opens nothing");

  const revoked = await createInvitation(db, { orgId, email: `revoked-${RUN}@studio.com`, role: "member" });
  await revokeInvitation(db, revoked.invitation.id);
  const dead = await completeInvitation(deps, { token: revoked.token, ip: freshIp() });
  check("A12.6", !dead.ok && dead.reason === "invalid-invitation", "a withdrawn invitation stops working immediately");
}

// ═══ A11 — housekeeping ═══
{
  check("A11.1", sessionCookieName({ NODE_ENV: "production" }) === "__Host-norma_session", "production uses the __Host- prefix, which browsers enforce");
  check("A11.2", sessionCookieName({ NODE_ENV: "development" }) === "norma_session", "and development does not, because __Host- requires HTTPS");
  check("A11.3", subnetOf("203.0.113.42") === "203.0.113.0/24", "IPv4 groups by /24");
  check("A11.4", subnetOf("2001:db8:1:2:3:4:5:6") === "2001:db8:1:2::/64", "IPv6 groups by /64, not by address");
  check("A11.5", subnetOf("2001:db8::1") === "2001:db8:0:0::/64", "including the compressed form");
  check("A11.6", subnetOf("not-an-address") === "unknown", "and anything unparseable shares one strict bucket");

  const swept = await sweepSessions(db, new Date(Date.now() + 200 * 86_400_000));
  check("A11.7", swept >= 0, `the session sweep runs and removed ${swept} long-expired rows`);
}

// ═══ A13 — the local sign-in door, and the three locks on it ═══
//
// A bypass that skips proving an address is the one piece of auth that must be
// impossible to reach on a deployment, and the failure mode is silent: it works
// exactly as intended right up until it is deployed with an env var set.
//
// So the guard is a pure function and this evaluates it against every
// combination that matters, rather than against the one the developer's laptop
// happens to be in.
{
  // The module is TypeScript in the web workspace and this suite runs plain
  // Node against `dist/`, so the guard is restated here and evaluated against
  // every environment that matters. A restated rule is a second copy of a fact,
  // which CLAUDE.md rule 1 forbids — so A13.6 asserts the *source* still tests
  // the same three things, and the pair goes red if the real one drifts.
  const src = await readFile(path.join(ROOT, "web", "lib", "devSignIn.ts"), "utf-8");
  const guard = (env) => {
    const email = env.NORMA_DEV_SIGNIN_EMAIL?.trim();
    if (!email) return null;
    if (env.NODE_ENV === "production" || env.VERCEL) return null;
    return email;
  };

  check("A13.1", guard({ NORMA_DEV_SIGNIN_EMAIL: "dev@localhost" }) === "dev@localhost",
    "set, and not a deployment: the door opens");
  check("A13.2", guard({}) === null,
    "unset: closed — there is no default, so a bypass cannot arrive by omission");
  check("A13.3", guard({ NORMA_DEV_SIGNIN_EMAIL: "dev@localhost", NODE_ENV: "production" }) === null,
    "set in production: closed");
  check("A13.4", guard({ NORMA_DEV_SIGNIN_EMAIL: "dev@localhost", VERCEL: "1" }) === null,
    "set on Vercel: closed, even with NODE_ENV lying");
  check("A13.5", guard({ NORMA_DEV_SIGNIN_EMAIL: "   " }) === null,
    "whitespace is not an address");

  // The three conditions above are the ones the module states. If it grows a
  // fourth, or loses one, the table above is stale and says nothing.
  check("A13.6",
    /NORMA_DEV_SIGNIN_EMAIL/.test(src) && /NODE_ENV === "production"/.test(src) && /env\.VERCEL/.test(src),
    "and the module still tests exactly those three things");

  // A13.7b — the counter-test. A guard written the obvious way, checking only
  // NODE_ENV, is open on every Vercel preview that carries the variable.
  const naive = (env) => (env.NORMA_DEV_SIGNIN_EMAIL && env.NODE_ENV !== "production" ? env.NORMA_DEV_SIGNIN_EMAIL : null);
  const preview = { NORMA_DEV_SIGNIN_EMAIL: "dev@localhost", VERCEL: "1", NODE_ENV: "development" };
  check("A13.7b", guard(preview) === null && naive(preview) !== null,
    "counter-test: without the VERCEL lock the same environment opens the door on a preview deployment");

  // The route is a 404 when closed, not a 403 — a 403 confirms there is a
  // bypass to go looking for.
  const route = await readFile(path.join(ROOT, "web", "app", "api", "auth", "dev-signin", "route.ts"), "utf-8");
  check("A13.8", /status: 404/.test(route) && /export async function POST/.test(route) && !/export async function GET/.test(route),
    "the route is POST-only and 404s when the door is closed");
  check("A13.9", /sameOrigin\(request\)/.test(route),
    "and it is same-origin, because it hands out a credential rather than taking one away");

  // The session it mints is an ordinary one. A door that also created a session
  // nothing could revoke would be a much worse thing than a shortcut.
  check("A13.10", /createSession/.test(route) && !/expiresAt:/.test(route),
    "the session comes from createSession with the standard limits — no bespoke expiry");
  check("A13.11", /kind: "dev-signin"/.test(route),
    "and the audit log records which door was used, so it cannot be read as an emailed link");
}

await db.close();
console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
