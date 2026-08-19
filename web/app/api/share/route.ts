import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../../../lib/db";
import { requireApiKey, rateLimited, unauthorized } from "../../../lib/auth";

/**
 * Share links (Stage 4 item 3; BuildV5 Phase H4): revocable, optionally
 * expiring capability URLs for one hosted report.
 *
 * A share token is a bearer credential for a single run. Three consequences run
 * through every handler here:
 *
 *   - **The plaintext is returned exactly once.** Only a SHA-256 of it is
 *     stored, so `GET` can list a link's age, expiry and state but can never
 *     re-show its URL. Losing it means revoking and issuing another, which is
 *     the correct trade for a credential that needs no session to use.
 *   - **`org_id` is in every WHERE clause**, alongside the run id. A caller with
 *     a valid key for org B must not be able to list, create or revoke a link on
 *     org A's run by knowing its id.
 *   - **Revocation is immediate and permanent.** `revoked_at` is set once and
 *     never cleared; the report page's authorization check reads it on every
 *     request, so a withdrawn link stops working on the next load rather than at
 *     the next expiry.
 */

interface ShareRow {
  id: string;
  created_at: string | Date;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
}

/** Longest life a link may be issued with. A capability URL that never expires is a key left in a door. */
const MAX_EXPIRY_DAYS = 365;

function iso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function POST(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }
  let body: { runId?: string; expiresInDays?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body is not valid JSON" }, { status: 400 });
  }
  if (!body.runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }
  if (
    body.expiresInDays !== undefined &&
    (typeof body.expiresInDays !== "number" ||
      !Number.isFinite(body.expiresInDays) ||
      body.expiresInDays <= 0 ||
      body.expiresInDays > MAX_EXPIRY_DAYS)
  ) {
    return Response.json(
      { error: `expiresInDays must be a number between 1 and ${MAX_EXPIRY_DAYS}` },
      { status: 400 }
    );
  }
  const run = (
    await db.query<{ id: string }>(
      "SELECT id FROM runs WHERE id = $1 AND org_id = $2 AND state = 'committed'",
      [body.runId, key.org_id]
    )
  ).rows[0];
  if (!run) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }
  const token = randomBytes(24).toString("base64url");
  const expiresAt =
    typeof body.expiresInDays === "number"
      ? new Date(Date.now() + body.expiresInDays * 24 * 3600 * 1000).toISOString()
      : null;
  const id = randomUUID();
  await db.query(
    "INSERT INTO share_links (id, org_id, run_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [id, key.org_id, run.id, createHash("sha256").update(token).digest("hex"), expiresAt]
  );
  return Response.json({ id, url: `/r/${run.id}?share=${token}`, expiresAt }, { status: 201 });
}

/**
 * The links on one run — never their tokens, which are not recoverable.
 *
 * Revoked and expired links are listed rather than hidden: "I revoked that one
 * yesterday" is the question this view exists to answer, and a list that shows
 * only live links cannot answer it.
 */
export async function GET(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }
  const rows = (
    await db.query<ShareRow>(
      `SELECT id, created_at, expires_at, revoked_at FROM share_links
       WHERE run_id = $1 AND org_id = $2
       ORDER BY created_at DESC`,
      [runId, key.org_id]
    )
  ).rows;
  return Response.json({
    links: rows.map((row) => ({
      id: row.id,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      revokedAt: iso(row.revoked_at),
    })),
  });
}

/**
 * Revoke one link.
 *
 * Idempotent, and deliberately so: a revoke that has already happened returns
 * the same success rather than a 404. The caller's intent — "this link must not
 * work" — is satisfied either way, and a distinct error would tell them nothing
 * useful while making the obvious retry look like a failure.
 */
export async function DELETE(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  const row = (
    await db.query<{ id: string }>(
      `UPDATE share_links SET revoked_at = COALESCE(revoked_at, now())
       WHERE id = $1 AND org_id = $2
       RETURNING id`,
      [id, key.org_id]
    )
  ).rows[0];
  if (!row) {
    // Absent, or another org's. The same answer for both: a probe holding a
    // guessed id learns nothing about whether it exists.
    return Response.json({ error: "share link not found" }, { status: 404 });
  }
  return Response.json({ id: row.id, revoked: true });
}
