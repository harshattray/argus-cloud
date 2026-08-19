import { NextResponse, type NextRequest } from "next/server";
import { storageImageOrigin } from "argus-cloud/storage/origin.js";
import { gateFor, gateToken } from "./lib/gate";

/**
 * Every Content-Security-Policy this site serves is issued here, and only here.
 *
 * **Why not `next.config.mjs`.** A static header cannot contain a nonce, and
 * without one `script-src 'self'` blocks the inline scripts the App Router uses
 * to stream a page's content to the browser. The effect was not a degraded
 * page: `/r/{runId}` rendered **completely blank** in production, and had since
 * the policy was added. It was invisible locally because dev mode fails
 * differently, and invisible to the suite because tests do not render.
 *
 * The fix at the time moved the report policy here and left `next.config.mjs`
 * with no CSP at all — which quietly meant *no CSP anywhere except `/r/`*. The
 * public site had none, and neither did `/admin`, the one tree that renders
 * other people's email addresses. This file now issues a policy for every
 * document on the site, and `next.config.mjs` still issues none, so there is
 * one source for the fact and no chance of a page receiving two policies that
 * a browser would intersect into something nobody designed.
 */

/**
 * The two `script-src` sources `next dev` needs and a deployed build must not
 * have. Empty string in production.
 *
 * **`'unsafe-eval'`.** Next's development server hands modules to the browser
 * to be run with `eval()` — that is how hot reloading replaces a module without
 * a page load. A `script-src` without `'unsafe-eval'` refuses it, and the
 * failure is not partial or obvious: React never hydrates, so every button,
 * tab, slider and form on every page is inert while the fully rendered HTML
 * around it looks completely normal. The page looks *finished*. The only clue
 * is an `EvalError` in the console.
 *
 * This is the same hole the original `/r/` policy had. It went unnoticed
 * because `/r/` is rarely opened in development, and it is why that policy was
 * only ever described as verified against a production build.
 *
 * **`https://va.vercel-scripts.com`.** `@vercel/analytics` loads a debug build
 * of its script from there, but *only* in development —
 * `isDevelopment() → 'https://va.vercel-scripts.com/v1/script.debug.js'`, and
 * otherwise the first-party `/_vercel/insights/script.js`. Production therefore
 * needs no external origin at all: the script and the `/_vercel/insights/event`
 * beacon are both same-origin and covered by `'self'`. Blocking the debug
 * script would cost nothing except a red console error on every page load in
 * development, which is exactly the noise that hides the next real one.
 *
 * **Neither can reach production.** `NODE_ENV` is `production` in any deployed
 * build, so this is the empty string there and the policies below are exactly
 * as strict as they read. `test/uploadPipeline.test.mjs` V5 asserts the gate is
 * present rather than trusting this sentence.
 */
const DEV_SCRIPT_SRC =
  process.env.NODE_ENV === "development" ? " 'unsafe-eval' https://va.vercel-scripts.com" : "";

/**
 * The `style-src-elem` source `next dev` needs and a deployed build must not
 * have. Empty string in production.
 *
 * A production build emits CSS modules as `<link rel="stylesheet">` files, which
 * `'self'` covers. The development server instead injects `<style>` elements
 * from JavaScript as it hot-reloads, and blocking those does not fail loudly —
 * the page renders completely unstyled while every script runs and every test
 * passes. Same shape as `DEV_SCRIPT_SRC` above, and here for the same reason.
 */
const DEV_STYLE_SRC = process.env.NODE_ENV === "development" ? " 'unsafe-inline'" : "";

/**
 * The strict policy, for trees that render untrusted content: `/r/` (model
 * findings and upload-supplied frame labels) and `/admin` (personal data).
 *
 * **The strictness is the point.** Relaxing to `'unsafe-inline'` would make
 * these pages render by removing the protection they exist to provide. A nonce
 * lets our own scripts run and still refuses an injected one, because an
 * attacker cannot guess a value generated per request.
 *
 * `'strict-dynamic'` is what makes the nonce hold across the whole bundle:
 * scripts loaded *by* a nonced script inherit trust, so Next's chunk loading
 * works without listing every chunk. Browsers that honour it ignore `'self'`;
 * it is kept for those that do not.
 *
 * `font-src 'self'` is the second half of the original bug — `next/font`
 * self-hosts under `/_next/static/media`, and with `default-src 'none'` and no
 * font rule every face was blocked.
 *
 * **This policy may only be served on a dynamically rendered route.** The nonce
 * is generated per request and Next stamps it onto the script tags as it
 * renders. A prerendered page is rendered once at build time, so its scripts
 * would carry a nonce from a build that no longer matches — every script
 * blocked, and the blank page is back. `needsNonce` below is the list, and the
 * comment there records which routes that constrains.
 */
/**
 * The one host `/r/` may load images from besides itself.
 *
 * Uploaded artifacts are fetched **straight from storage** through short-lived
 * presigned URLs — the application is deliberately not in the byte path — so
 * with `default-src 'none'` and `img-src 'self'` alone, every screenshot on the
 * report page would be blocked. Empty string when storage signs same-origin
 * URLs, which is the filesystem driver's ordinary case.
 *
 * Derived from the same environment the driver is built from rather than
 * configured separately; `storage/origin.ts` explains why, and
 * `test/storage.test.mjs` holds it to a URL a real driver signed.
 */
const STORAGE_IMG_SRC = (() => {
  const origin = storageImageOrigin(process.env);
  return origin ? ` ${origin}` : "";
})();

function strictCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `img-src 'self' data:${STORAGE_IMG_SRC}`,
    "font-src 'self'",
    // Split, rather than one `style-src 'self' 'unsafe-inline'`.
    //
    // **What this buys.** `style-src-elem` governs `<style>` blocks and
    // stylesheet links; `style-src-attr` governs `style="..."` attributes. The
    // page renders model output and upload-supplied labels, so an injected
    // `<style>` element is a real concern — CSS can exfiltrate through attribute
    // selectors and can rearrange a page into something that misleads. Blocking
    // element styles while permitting attribute styles refuses that without
    // refusing our own computed geometry.
    //
    // **What it does not buy, said plainly.** `'unsafe-inline'` on
    // `style-src-attr` still permits a `style` attribute, so this is a
    // tightening and not a closure. It stays because the page's geometry is
    // computed per frame: a meter's fill width from its score, a region overlay's
    // position as a percentage of the capture's natural size, the pane's
    // aspect-ratio from the image the browser measured. Those are values, not
    // styling, and there is no stylesheet that can hold them.
    //
    // PATHWAYS.md carried-forward item 1 asked for `'unsafe-inline'` to go when
    // Phase H rewrote this page. The page's *styling* did move to a stylesheet
    // (`report.module.css`), which is what makes the `-elem` half possible.
    //
    // **`style-src` is kept as the fallback and must stay.** A browser that does
    // not implement the two specific directives ignores them and falls back to
    // `style-src`; with `style-src` deleted it would fall back to
    // `default-src 'none'` instead and block every stylesheet on the page. The
    // page would render as unstyled HTML on exactly the older browsers least
    // likely to be noticed in testing. Supporting browsers override it with the
    // stricter pair below.
    "style-src 'self' 'unsafe-inline'",
    `style-src-elem 'self'${DEV_STYLE_SRC}`,
    "style-src-attr 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${DEV_SCRIPT_SRC}`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * The policy for everything else: the public marketing site and `/pitch`.
 *
 * **Why `'unsafe-inline'` here and not above.** These pages are statically
 * prerendered — that is what lets the marketing site be served from the CDN
 * with a year-long `s-maxage` — and a nonce cannot exist in a page rendered
 * once at build time. The choice is not "nonce or `'unsafe-inline'`", it is
 * "`'unsafe-inline'` or force every marketing page to render per request", and
 * paying for the second on pages that render nothing but our own committed copy
 * would be a poor trade.
 *
 * **It is still worth having.** `'unsafe-inline'` gives up the protection
 * against an injected *inline* script, and keeps the rest: `script-src 'self'`
 * refuses a script loaded from another origin, `connect-src 'self'` refuses an
 * exfiltration fetch to one, `base-uri 'none'` refuses a `<base>` tag
 * redirecting every relative URL on the page, and `form-action 'self'` refuses
 * a form retargeted at somebody else's server. Those are the moves a
 * compromised dependency or an injected tag makes, and this stops them.
 *
 * `media-src 'self'` is listed although nothing on the site plays media today.
 * With `default-src 'none'` an unlisted directive is a silent block, and the
 * first `<video>` anyone adds would fail with no obvious cause — the exact
 * shape of the font bug above. Self-hosted media is already trusted for
 * scripts, so naming it costs nothing.
 */
const SITE_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${DEV_SCRIPT_SRC}`,
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

/**
 * The routes that get the nonce, which is to say the routes that must be
 * dynamically rendered.
 *
 * `/r/*` is dynamic because it reads a share token per request. `/repos/*` is
 * dynamic because it reads a page number and a frame label per request, and it
 * belongs on the strict policy for the same reason `/r/` does: it renders
 * upload-supplied frame labels, commit shas and branch names. Under `/admin`
 * every page that renders anything is dynamic too — `/admin` itself is a bare
 * `redirect()` with no document body for a policy to govern, so it is safe
 * either way.
 *
 * **If a route here ever becomes static, it goes blank.** `npm run build`
 * prints the mode of every route; anything under these prefixes showing `○`
 * with a real page body is the warning.
 */
function needsNonce(pathname: string): boolean {
  return (
    pathname.startsWith("/r/") ||
    pathname.startsWith("/repos/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

/** `NextResponse.next()` carrying whichever policy this path should have. */
function withCsp(request: NextRequest, pathname: string): NextResponse {
  if (!needsNonce(pathname)) {
    const res = NextResponse.next();
    res.headers.set("content-security-policy", SITE_CSP);
    return res;
  }

  // Web Crypto, not node:crypto — this runs on the Edge runtime.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = strictCsp(nonce);
  // Next reads the nonce out of the *request* CSP header and stamps it onto the
  // script tags it emits. Setting only the response header would leave its own
  // scripts unnonced, which is the blank page again.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
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

  const gate = gateFor(pathname);

  if (gate) {
    const password = process.env[gate.envVar];
    if (!password) {
      // Nothing configured — behave as though the route does not exist.
      return new NextResponse(null, { status: 404 });
    }

    // The unlock screen itself must stay reachable, or there is no way in.
    if (pathname !== gate.unlockPath) {
      const presented = request.cookies.get(gate.cookie)?.value;
      const expected = await gateToken(gate.scope, password);

      if (presented !== expected) {
        const url = request.nextUrl.clone();
        url.pathname = gate.unlockPath;
        url.search = "";
        // Preserve where they were heading so the unlock can hand them back.
        if (pathname !== gate.prefix) {
          url.searchParams.set("next", pathname + search);
        }
        return NextResponse.redirect(url);
      }
    }
  }

  const res = withCsp(request, pathname);
  if (gate) {
    // Belt and braces: the pages also carry a noindex robots directive.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: [
    // The gated and nonced trees are named explicitly rather than left to the
    // catch-all below, because the catch-all excludes anything containing a dot
    // and a run id with a dot in it would then be served *without* the nonce —
    // which is the blank report page again, reachable only for some ids. An
    // explicit entry cannot be missed that way.
    "/pitch",
    "/pitch/:path*",
    "/admin",
    "/admin/:path*",
    "/r/:path*",
    "/repos/:path*",
    // Everything else that is a document. Excluded:
    //
    //   - `api/` — a JSON body is not a document, so a policy on it governs
    //     nothing, and this keeps the middleware off the upload and webhook
    //     paths where latency is charged for.
    //   - `_next/static`, `_next/image` — build output and optimiser output.
    //   - anything with a file extension — `robots.txt`, `sitemap.xml`, and
    //     every asset under `public/`. Bytes, not documents.
    "/((?!api/|_next/static|_next/image|.*\\.[^/]*$).*)",
  ],
};
