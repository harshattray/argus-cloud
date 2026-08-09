import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate for `/pitch/*` — the long-form investor and internal material.
 *
 * The public site is deliberately lean; everything with real numbers, case
 * studies and internal framing lives under `/pitch` and is not for a casual
 * visitor. This is a shared-password gate, not user auth: there are no accounts,
 * no per-person identity, and nothing behind it is user data. It exists to keep
 * the material off search engines and out of a stranger's hands, not to defend
 * a secret.
 *
 * Default-deny: with `PITCH_PASSWORD` unset the whole tree 404s rather than
 * opening. A missing env var on a fresh deploy must not silently publish this.
 *
 * The cookie holds a token derived from the password, never the password. It is
 * httpOnly and sameSite=lax so page JS cannot read it and it does not ride along
 * on cross-site requests. Verification is a constant-time compare in the auth
 * route; this middleware only checks the already-issued token, which is why it
 * can run on the Edge runtime without the Node crypto module.
 */

export const PITCH_COOKIE = "np_pitch";

/** Web Crypto is available in the Edge runtime; node:crypto is not. */
export async function pitchToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`normascope-pitch:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const password = process.env.PITCH_PASSWORD;
  if (!password) {
    // Nothing configured — behave as though the route does not exist.
    return new NextResponse(null, { status: 404 });
  }

  // The unlock screen itself must stay reachable, or there is no way in.
  if (pathname === "/pitch/unlock") {
    return NextResponse.next();
  }

  const presented = request.cookies.get(PITCH_COOKIE)?.value;
  const expected = await pitchToken(password);

  if (presented === expected) {
    const res = NextResponse.next();
    // Belt and braces: the pages also carry a noindex robots directive.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/pitch/unlock";
  url.search = "";
  // Preserve where they were heading so the unlock can hand them back.
  if (pathname !== "/pitch") {
    url.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/pitch", "/pitch/:path*"],
};
