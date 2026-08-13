import { NextResponse, type NextRequest } from "next/server";
import { gateFor, gateToken } from "./lib/gate";

/**
 * Gate for the two private trees: `/pitch/*` (investor and internal material)
 * and `/admin/*` (waitlist traction, which is other people's email addresses).
 *
 * The gate definitions, token derivation and password exchange all live in
 * `lib/gate.ts`, including the reasoning about why the two do not share a
 * password. This file only checks an already-issued token, which is why it can
 * run on the Edge runtime without the Node crypto module.
 *
 * Default-deny: with the gate's password unset the whole tree 404s rather than
 * opening. A missing env var on a fresh deploy must not silently publish either
 * surface — and for `/admin` that would mean publishing personal data.
 */

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const gate = gateFor(pathname);
  if (!gate) {
    return NextResponse.next();
  }

  const password = process.env[gate.envVar];
  if (!password) {
    // Nothing configured — behave as though the route does not exist.
    return new NextResponse(null, { status: 404 });
  }

  // The unlock screen itself must stay reachable, or there is no way in.
  if (pathname === gate.unlockPath) {
    return NextResponse.next();
  }

  const presented = request.cookies.get(gate.cookie)?.value;
  const expected = await gateToken(gate.scope, password);

  if (presented === expected) {
    const res = NextResponse.next();
    // Belt and braces: the pages also carry a noindex robots directive.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const url = request.nextUrl.clone();
  url.pathname = gate.unlockPath;
  url.search = "";
  // Preserve where they were heading so the unlock can hand them back.
  if (pathname !== gate.prefix) {
    url.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/pitch", "/pitch/:path*", "/admin", "/admin/:path*"],
};
