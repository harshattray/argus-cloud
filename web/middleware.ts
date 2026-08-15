import { NextResponse, type NextRequest } from "next/server";
import { gateFor, gateToken } from "./lib/gate";

/**
 * The report tree's Content-Security-Policy, issued per request with a nonce.
 *
 * **Why it moved here from `next.config.mjs`.** A static policy cannot contain
 * a nonce, and without one `script-src 'self'` blocks the inline scripts the
 * App Router uses to stream a page's content to the browser. The effect was not
 * a degraded page: `/r/{runId}` rendered **completely blank** in production,
 * and had since the policy was added. It was invisible locally because dev mode
 * fails differently, and invisible to the suite because tests do not render.
 *
 * **The strictness is the point, so it is kept.** These pages display findings
 * written by a model and frame labels supplied by an upload — the whole reason
 * they are sandboxed harder than the rest of the site. Relaxing to
 * `'unsafe-inline'` would have made the page render by removing the protection
 * it exists to provide. A nonce lets our own scripts run and still refuses an
 * injected one, because an attacker cannot guess a value generated per request.
 *
 * `'strict-dynamic'` is what makes the nonce hold across the whole bundle:
 * scripts loaded *by* a nonced script inherit trust, so Next's chunk loading
 * works without listing every chunk. Browsers that honour it ignore `'self'`;
 * it is kept for those that do not.
 *
 * `font-src 'self'` is the second half of the same bug — `next/font` self-hosts
 * under `/_next/static/media`, and with `default-src 'none'` and no font rule
 * every face was blocked.
 */
function reportCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

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

  if (pathname.startsWith("/r/")) {
    // Web Crypto, not node:crypto — this runs on the Edge runtime.
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = reportCsp(nonce);
    // Next reads the nonce out of the *request* CSP header and stamps it onto
    // the script tags it emits. Setting only the response header would leave
    // its own scripts unnonced, which is the blank page again.
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
    return res;
  }

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
  matcher: ["/pitch", "/pitch/:path*", "/admin", "/admin/:path*", "/r/:path*"],
};
