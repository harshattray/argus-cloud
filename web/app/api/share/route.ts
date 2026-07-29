import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../../../lib/db";
import { requireApiKey, unauthorized } from "../../../lib/auth";

/**
 * Share links (Stage 4 item 3): revocable, optionally expiring, capability
 * URLs for a hosted report. Token stored hashed; plaintext returned exactly
 * once.
 */

export async function POST(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
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
  const run = (
    await db.query<{ id: string }>("SELECT id FROM runs WHERE id = $1 AND org_id = $2", [body.runId, key.org_id])
  ).rows[0];
  if (!run) {
    return Response.json({ error: "run not found" }, { status: 404 });
  }
  const token = randomBytes(24).toString("base64url");
  const expiresAt =
    typeof body.expiresInDays === "number" && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 24 * 3600 * 1000).toISOString()
      : null;
  await db.query(
    "INSERT INTO share_links (id, org_id, run_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [randomUUID(), key.org_id, run.id, createHash("sha256").update(token).digest("hex"), expiresAt]
  );
  return Response.json({ url: `/r/${run.id}?share=${token}`, expiresAt }, { status: 201 });
}
