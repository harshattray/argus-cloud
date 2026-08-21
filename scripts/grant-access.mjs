#!/usr/bin/env node
//
// Hand an organization to a person, before there is a checkout to do it —
// FUTURENORMA §4 Step 6, PATHWAYS §10.7 5A.5.
//
//   node scripts/grant-access.mjs --org <orgId> --claim you@example.com
//   node scripts/grant-access.mjs --org <orgId> --invite them@example.com --role designer
//   node scripts/grant-access.mjs --list
//
// **Why this exists rather than a form.** With no trial and no self-serve
// signup, the *only* automatic way an organization gets its first human is the
// purchase webhook, and that arrives at Step 7. Until then the same two rows
// have to be written by hand — and writing them by hand in a SQL client is how
// an organization ends up with two owners, or with an owner who is not an
// admin. This writes them through the same functions the webhook will call.
//
// **It grants nothing by itself.** A claim is not access: it says "when the
// person who controls this address signs in, they become the owner". They still
// have to sign in, which means they still have to control the address. Nothing
// here mints a session, a cookie, or a password.
//
// DATABASE_URL is required, deliberately. This is not a fixture generator —
// `npm run seed:demo` is — and pointing it at an in-process PGlite that
// evaporates would be a confusing way to spend ten minutes.

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1] ?? null;
};

const orgId = flag("--org");
const claimEmail = flag("--claim");
const inviteEmail = flag("--invite");
const role = flag("--role") ?? "member";
const listing = args.includes("--list");

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required — this writes to a real database, not a fixture");
  process.exit(2);
}
if (!listing && !orgId) {
  console.error("usage: --org <orgId> (--claim <email> | --invite <email> [--role admin|member|designer]), or --list");
  process.exit(2);
}

const { createDb, migrate } = await import(path.join(DIST, "db.js"));
const { createOwnerClaim, unclaimedOrganizations } = await import(path.join(DIST, "ownerClaims.js"));
const { createInvitation, listInvitations } = await import(path.join(DIST, "invitations.js"));
const { ownerOf, membershipsFor } = await import(path.join(DIST, "users.js"));
/** The invitation link, built here because only this script issues one today. */
const inviteUrl = (origin, token) => {
  const url = new URL("/api/auth/invite/accept", origin);
  url.searchParams.set("token", token);
  return url.toString();
};

const db = await createDb();
await migrate(db);
console.log(`database: ${new URL(process.env.DATABASE_URL).host}\n`);

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://normascope.com").replace(/\/+$/, "");

if (listing) {
  const orgs = await db.query(
    "SELECT id, name, plan, owner_user_id FROM orgs ORDER BY created_at DESC LIMIT 50"
  );
  for (const org of orgs.rows) {
    const owner = org.owner_user_id
      ? (await db.query("SELECT email FROM users WHERE id = $1", [org.owner_user_id])).rows[0]?.email
      : null;
    const seats = (
      await db.query("SELECT COUNT(*) AS n FROM memberships WHERE org_id = $1", [org.id])
    ).rows[0].n;
    console.log(
      `${org.id}  ${org.plan.padEnd(6)}  ${String(seats).padStart(2)} seat(s)  ` +
        `${owner ? `owner ${owner}` : "UNCLAIMED"}  ${org.name}`
    );
  }
  const pending = await unclaimedOrganizations(db);
  if (pending.length > 0) {
    console.log(`\n${pending.length} organization(s) paid for and never opened:`);
    for (const claim of pending) {
      console.log(`  ${claim.orgId}  waiting for ${claim.email}  (${claim.checkoutReference})`);
    }
  }
  await db.close();
  process.exit(0);
}

const org = (await db.query("SELECT id, name, plan FROM orgs WHERE id = $1", [orgId])).rows[0];
if (!org) {
  console.error(`no such organization: ${orgId}`);
  await db.close();
  process.exit(1);
}
console.log(`org: ${org.name} (${org.plan})`);

if (claimEmail) {
  const existingOwner = await ownerOf(db, org.id);
  if (existingOwner) {
    const email = (await db.query("SELECT email FROM users WHERE id = $1", [existingOwner])).rows[0]?.email;
    console.error(`refusing: this organization already has an owner (${email}). Transfer ownership instead.`);
    await db.close();
    process.exit(1);
  }
  // The reference stands in for the processor's customer id. Prefixed so it is
  // obvious in the operator console that no money moved through Paddle for it.
  const claim = await createOwnerClaim(db, {
    orgId: org.id,
    email: claimEmail,
    checkoutReference: `manual:${org.id}`,
  });
  console.log(`claim: pending for ${claim.email}`);
  console.log(`\nTell them to sign in at ${site}/login with that address. Signing in claims the organization.`);
}

if (inviteEmail) {
  const invitation = await createInvitation(db, { orgId: org.id, email: inviteEmail, role });
  console.log(`invitation: ${invitation.invitation.email} as ${invitation.invitation.role}`);
  // Printed because there is no invitation *email* yet — sending one belongs
  // with the organization console's invite form rather than with a script, and
  // it will use the same `invite_org_day` and `invite_address_day` ceilings
  // this script deliberately does not consume. Until then this is the link, and
  // it is a credential: shown once, here.
  console.log(`\nlink (shown once, treat as a credential):\n\n  ${inviteUrl(site, invitation.token)}\n`);
  const live = await listInvitations(db, org.id);
  console.log(`${live.filter((i) => i.state === "pending").length} invitation(s) pending in this organization`);
}

const owner = await ownerOf(db, org.id);
if (owner) {
  console.log(`\nowner: ${(await db.query("SELECT email FROM users WHERE id = $1", [owner])).rows[0]?.email}`);
  console.log(`seats: ${(await membershipsFor(db, owner)).length} membership(s) for the owner`);
}

await db.close();
