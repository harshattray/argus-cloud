// Put the local sign-in address into every seeded organization.
//
// ── Why the seeds needed this ────────────────────────────────────────────────
//
// `seed-demo` and `seed-real` both predate the session layer, so they create
// organizations, repositories, runs, artifacts and credits — and nobody to sign
// in as. The effect was that you could seed twelve weeks of history and a set
// of real measured runs, sign in, and land on **"No organization yet"**, which
// is a correct page and not the one anybody was trying to look at.
//
// A membership is the missing row. Everything else was already there.
//
// ── The orgs the seed made, named explicitly ─────────────────────────────────
//
// `npm run seed:demo` builds two tenants — the invented `DEMO — …` one and the
// measured `REAL — …` one — and the point of having both is switching between
// them, so granting one membership would have hidden the other.
//
// **But not "every org in the database".** That was the first cut, and against
// a database the suites had also run through it granted membership in 59
// organizations with names like `ret-4641063c`. `membershipsFor` orders by
// name, so the account landed on a retention fixture instead of on the demo
// tenant. The caller passes the ids it created.
//
// ── Reading the address out of `web/.env.local` ──────────────────────────────
//
// The same trap the seeds already document for `PGLITE_DATA_DIR`: that file is
// loaded by `next dev`, and a script run from the repo root never sees it. The
// alternative was a second place to configure the same address, which is the
// shape of thing that ends up disagreeing with itself.
//
// Only this one key is read, and only when the environment does not already
// carry it.

import path from "node:path";
import { readFile } from "node:fs/promises";

/** The address, from the environment or from `web/.env.local`. */
export async function devEmail(root) {
  const fromEnv = process.env.NORMA_DEV_SIGNIN_EMAIL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const file = await readFile(path.join(root, "web", ".env.local"), "utf-8");
    const line = file.split("\n").find((l) => l.trim().startsWith("NORMA_DEV_SIGNIN_EMAIL="));
    const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Owner membership in the named organizations, for the local sign-in address.
 *
 * Idempotent: `addMembership` upserts on `(org_id, user_id)`, and the user is
 * looked up before it is created, so re-running a seed does not pile up rows.
 */
export async function grantDevMembership(db, root, orgIds, log = console.log) {
  const email = await devEmail(root);
  if (!email) {
    log("\nNo NORMA_DEV_SIGNIN_EMAIL set — skipping the local membership grant.");
    log("  Add it to web/.env.local to sign in locally without a link.");
    return null;
  }

  const ids = (orgIds ?? []).filter(Boolean);
  if (ids.length === 0) {
    return null;
  }

  const { createUser, findUserByEmail, addMembership, claimOwnership } = await import(
    path.join(root, "dist", "users.js")
  );

  const user =
    (await findUserByEmail(db, email)) ??
    (await createUser(db, { email, displayName: email.split("@")[0] ?? email }));

  const named = await db.query("SELECT id, name FROM orgs WHERE id = ANY($1) ORDER BY name", [ids]);
  for (const org of named.rows) {
    /*
     * `claimOwnership`, not `addMembership(role: "owner")`.
     *
     * **This wrote `role: "owner"` until 2026-08-22, and `owner` is not a
     * role.** §10.7 5A.5 and migration 021 both say so: ownership is
     * `orgs.owner_user_id`, an invariant with exactly one holder, and the owner
     * is *also* an `admin` membership. The old line set neither — it wrote a
     * value no authorization path recognises, so the local sign-in address was
     * refused every admin-gated area of the console with nothing anywhere
     * saying why. Migration 022 repairs the rows and adds the CHECK the column
     * should always have had.
     *
     * `claimOwnership` sets the invariant and the admin membership in one
     * transaction. It returns false when the organization already has an owner
     * — a re-run without `--reset` — and the fallback keeps the address able to
     * sign in and act.
     */
    const claimed = await claimOwnership(db, org.id, user.id);
    if (!claimed) {
      await addMembership(db, { orgId: org.id, userId: user.id, role: "admin" });
    }
  }

  log(`\nlocal sign-in: ${email}`);
  for (const org of named.rows) {
    log(`  owner of ${org.name}`);
  }
  log("  Open /login and press “Sign in as …” — no link to fetch.");
  return { email, orgs: named.rows.length };
}
