"use server";

import { revalidatePath } from "next/cache";
import { resetBreaker } from "argus-cloud/breaker.js";
import { getDb } from "../../../lib/db";

/**
 * The operator's audited manual reset (PATHWAYS §10.3 "1C"; FUTURENORMA §3: a
 * 100% trip "needs a manual reset").
 *
 * It is a server action rather than an API route on purpose: actions POST to
 * the page's own path, so `middleware.ts`'s `/admin` gate covers them. An
 * `/api/*` route would sit outside that matcher and would need its own auth —
 * a second way in to the one control that stops spending, which is exactly the
 * kind of thing that gets forgotten.
 *
 * **The actor is self-declared, and that is a known limit.** Behind the admin
 * password there is currently no session and therefore no identity to read;
 * the operator types their name. That is worth having — it records who says
 * they made the call, and the reason is the part an incident review needs —
 * but it is not authentication. When Step 6 lands the session layer, take the
 * actor from the session and stop trusting the field.
 */
export async function resetBreakerAction(formData: FormData): Promise<void> {
  const actor = String(formData.get("actor") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const db = await getDb();
  // Throws when either is blank — the same rule the database enforces, so this
  // path cannot produce an unattributed reset either.
  await resetBreaker(db, { actor, reason });
  revalidatePath("/admin/limits");
}
