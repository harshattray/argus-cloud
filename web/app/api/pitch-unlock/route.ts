import { NextResponse, type NextRequest } from "next/server";
import { PITCH_COOKIE, pitchToken } from "../../../middleware";

/**
 * Exchanges the shared `/pitch` password for the access cookie.
 *
 * A shared password, not a user credential — see the note in `middleware.ts`.
 * Two things still matter here:
 *
 *   1. The comparison is constant-time. A length-independent early-exit compare
 *      leaks the password one character at a time to anyone willing to time the
 *      responses, and that costs nothing to avoid.
 *   2. The response never distinguishes "wrong password" from "no password
 *      configured", and never echoes what was submitted.
 *
 * The cookie stores a digest of the password, so the password itself is never
 * written to disk on the visitor's machine.
 */

export const runtime = "edge";

/** Constant-time comparison over the UTF-8 bytes of both strings. */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  // Compare a fixed number of bytes regardless of input length, so the loop
  // count cannot be used to learn the expected length.
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const configured = process.env.PITCH_PASSWORD;

  let submitted = "";
  try {
    const form = await request.formData();
    const value = form.get("password");
    submitted = typeof value === "string" ? value : "";
  } catch {
    submitted = "";
  }

  const nextParam = request.nextUrl.searchParams.get("next");
  // Only ever redirect within this site: an open redirect here would let the
  // unlock page be used to launder a link to somewhere else.
  const destination =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/pitch";

  if (!configured || !timingSafeEqual(submitted, configured)) {
    const url = request.nextUrl.clone();
    url.pathname = "/pitch/unlock";
    url.search = "";
    url.searchParams.set("error", "1");
    if (nextParam) url.searchParams.set("next", destination);
    return NextResponse.redirect(url, { status: 303 });
  }

  const url = request.nextUrl.clone();
  url.pathname = destination.split("?")[0];
  url.search = destination.includes("?") ? destination.slice(destination.indexOf("?")) : "";

  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set({
    name: PITCH_COOKIE,
    value: await pitchToken(configured),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
