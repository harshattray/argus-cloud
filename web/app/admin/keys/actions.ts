"use server";

import { revalidatePath } from "next/cache";
import { revokeApiKey } from "argus-cloud/apiKeys.js";
import { getDb } from "../../../lib/db";

/**
 * Withdraw an API key — the operator surface that `revokeApiKey` never had.
 *
 * A server action rather than an API route, for the reason the breaker reset
 * gives: actions POST to the page's own path, so `middleware.ts`'s `/admin`
 * gate covers them. An `/api/*` route would sit outside that matcher and need
 * its own auth — a second door to a control whose whole job is closing one.
 *
 * **The actor is self-declared**, the same known limit as the breaker reset:
 * behind the admin password there is no session and so no identity to read. It
 * records who says they pulled the key, which is what an incident review needs
 * first, and it is not authentication. Step 6's session layer should take the
 * actor from the session and stop trusting the field.
 */
export async function revokeKeyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const actor = String(formData.get("actor") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) {
    throw new Error("no key selected");
  }
  const db = await getDb();
  // Throws on a blank actor — the same rule the database enforces, so this path
  // cannot produce an unattributed revocation either.
  await revokeApiKey(db, id, { actor, reason });
  revalidatePath("/admin/keys");
}
