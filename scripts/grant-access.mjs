#!/usr/bin/env node
//
// Hand an organization to a person, before there is a checkout to do it —
// FUTURENORMA §4 Step 6, PATHWAYS §10.7 5A.5.
//
//   node scripts/grant-access.mjs --org <orgId> --claim you@example.com
//   node scripts/grant-access.mjs --org <orgId> --claim you@example.com --site https://preview.normascope.com
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
  const value = at === -1 ? null : (args[at + 1] ?? null);
  // `--org --claim x` reads the next flag as the value and then fails looking
  // up an organization called "--claim". Treating a leading dash as a missing
  // value turns that into the usage message it should have been.
  return value === null || value.startsWith("--") ? null : value;
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

/**
 * Where the person should go to sign in — and why this is not guessed.
 *
 * **The first version defaulted to production and was wrong the first time it
 * ran.** A claim written into the staging database was announced with
 * `https://normascope.com/login`, which talks to *production*, where the claim
 * does not exist. Following that instruction produces the generic "no account"
 * response and nothing to debug — the two databases are indistinguishable from
 * the sign-in page, which is the whole point of that response.
 *
 * A script cannot map a connection string to the deployment that uses it, so it
 * does not try. Either `--site` says, or the caution below says it does not
 * know and names the database instead, which is the fact it does have.
 */
const siteFlag = flag("--site");
const site = (siteFlag ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
const dbHost = new URL(process.env.DATABASE_URL).host;
const signInHint = (what) =>
  site
    ? `\nTell them to sign in at ${site}/login with that address. ${what}`
    : `\nThis was written to ${dbHost}. Sign in at whichever deployment uses that database` +
      `\n— pass --site https://… to have that spelled out here. ${what}`;

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
  // Showing what *is* there, because the two ways to get here both have an
  // obvious next step and neither is visible from the id alone: the id was
  // mistyped, or this is not the database the organization was created in.
  console.error(`no such organization: ${JSON.stringify(orgId)}\n`);
  const known = await db.query("SELECT id, name, plan FROM orgs ORDER BY created_at DESC LIMIT 10");
  if (known.rows.length === 0) {
    console.error(
      `${new URL(process.env.DATABASE_URL).host} holds no organizations at all.\n` +
        "Either provision one first (scripts/provision-preview-org.mjs) or this is not the\n" +
        "database you meant — scripts/db-identity.mjs will say which one it is."
    );
  } else {
    console.error(`${known.rows.length} organization(s) in ${new URL(process.env.DATABASE_URL).host}:`);
    for (const row of known.rows) {
      console.error(`  ${row.id}  ${row.name.slice(0, 48)} [${row.plan}]`);
    }
  }
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
  console.log(signInHint("Signing in claims the organization."));
}

if (inviteEmail) {
  const invitation = await createInvitation(db, { orgId: org.id, email: inviteEmail, role });
  console.log(`invitation: ${invitation.invitation.email} as ${invitation.invitation.role}`);
  // Printed because there is no invitation *email* yet — sending one belongs
  // with the organization console's invite form rather than with a script, and
  // it will use the same `invite_org_day` and `invite_address_day` ceilings
  // this script deliberately does not consume. Until then this is the link, and
  // it is a credential: shown once, here.
  // Refused rather than guessed. A claim announced on the wrong host wastes
  // someone's time; an invitation *link* on the wrong host is a credential that
  // silently does not work — the token exists in this database and nowhere
  // else, so the deployment it is pasted into answers "unknown invitation" and
  // the person who received it has no way to tell that from being uninvited.
  if (site) {
    console.log(`\nlink (shown once, treat as a credential):\n\n  ${inviteUrl(site, invitation.token)}\n`);
  } else {
    console.log(
      `\nlink path (shown once, treat as a credential):\n\n  /api/auth/invite/accept?token=${invitation.token}\n\n` +
        `Prefix it with the deployment that uses ${dbHost}. Re-run with --site https://… to have\n` +
        "the whole URL printed — the token is only valid against this database.\n"
    );
  }
  const live = await listInvitations(db, org.id);
  console.log(`${live.filter((i) => i.state === "pending").length} invitation(s) pending in this organization`);
}

const owner = await ownerOf(db, org.id);
if (owner) {
  console.log(`\nowner: ${(await db.query("SELECT email FROM users WHERE id = $1", [owner])).rows[0]?.email}`);
  console.log(`seats: ${(await membershipsFor(db, owner)).length} membership(s) for the owner`);
}

await db.close();
