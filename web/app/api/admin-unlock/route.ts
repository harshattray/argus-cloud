import type { NextRequest } from "next/server";
import { ADMIN_GATE, handleUnlock } from "../../../lib/gate";

/**
 * Exchanges the `ADMIN_PASSWORD` for the `/admin` access cookie.
 *
 * Separate from `/pitch` on purpose: the admin tree exposes waitlist email
 * addresses, so it must not be openable by anyone who was shown the pitch
 * phrase. `lib/gate.ts` explains the split and owns the shared mechanics.
 */

export const runtime = "edge";

export async function POST(request: NextRequest) {
  return handleUnlock(request, ADMIN_GATE);
}
