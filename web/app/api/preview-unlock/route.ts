import type { NextRequest } from "next/server";
import { PREVIEW_GATE, handleUnlock } from "../../../lib/gate";

/**
 * Exchanges `PREVIEW_PASSWORD` for the preview access cookie.
 *
 * Separate from the `/pitch` and `/admin` phrases on purpose, and for the same
 * reason those two are separate from each other: this one is handed to anyone
 * being shown unreleased work, and it must not also open the tree holding other
 * people's email addresses. `lib/gate.ts` owns the shared mechanics, including
 * the attempt limiting and why a refusal never distinguishes a wrong phrase
 * from an unset one.
 */

export const runtime = "edge";

export async function POST(request: NextRequest) {
  return handleUnlock(request, PREVIEW_GATE);
}
