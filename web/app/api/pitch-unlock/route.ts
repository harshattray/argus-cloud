import type { NextRequest } from "next/server";
import { PITCH_GATE, handleUnlock } from "../../../lib/gate";

/**
 * Exchanges the shared `/pitch` password for the access cookie.
 *
 * A shared password, not a user credential — see the notes in `lib/gate.ts`,
 * which owns the constant-time comparison, the open-redirect guard and the
 * cookie policy for both gates.
 */

export const runtime = "edge";

export async function POST(request: NextRequest) {
  return handleUnlock(request, PITCH_GATE);
}
