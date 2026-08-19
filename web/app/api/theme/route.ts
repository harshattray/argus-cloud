import { isTheme, THEME_COOKIE, THEME_MAX_AGE } from "../../../lib/theme";

/**
 * Sets or clears the Cloud surface's theme cookie, then sends the viewer back
 * where they were.
 *
 * **POST, not a link.** A `GET /api/theme?set=dark` would be a side effect on a
 * safe method: link prefetchers, crawlers and the browser's own speculative
 * loads all fetch GETs, and any of them would silently flip the viewer's theme.
 * A form POST is also what lets this work with no JavaScript at all, which is
 * the point — the pages it serves render as inert HTML under a strict CSP, and
 * `form-action 'self'` already permits exactly this.
 *
 * **Same-origin only.** Flipping a stranger's colour scheme is close to
 * harmless, but "close to harmless" is not a reason to accept a cross-site
 * POST, and the check is two header reads. `Sec-Fetch-Site` is the modern
 * answer; `Origin` covers browsers that do not send it. Neither present at all
 * means a non-browser client, which has no theme to set.
 *
 * **`next` is validated as a same-site path**, not trusted. An open redirect
 * here would be a genuine one — a link to our own domain that lands somewhere
 * else — so anything that is not a plain absolute path starting with a single
 * `/` is replaced by the root.
 */

export const dynamic = "force-dynamic";

/**
 * A path we are willing to send a browser to.
 *
 * `//evil.example` is a protocol-relative URL and a browser treats it as
 * another origin, so the second-character check is the one doing the work. A
 * backslash is rejected for the same reason: some parsers normalise `/\` to
 * `//`.
 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}

function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin";
  }
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === new URL(request.url).origin;
  }
  return false;
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "cross-origin theme change refused" }, { status: 403 });
  }

  const form = await request.formData();
  const requested = form.get("theme");
  const next = safeNext(typeof form.get("next") === "string" ? (form.get("next") as string) : null);

  // 303, not 302: the browser must follow it with GET. A 302 after a POST is
  // widely but not universally rewritten to GET, and the one browser that
  // re-POSTs would re-submit the form on every back-button press.
  const response = new Response(null, { status: 303, headers: { Location: next } });

  const attributes = `Path=/; SameSite=Lax; HttpOnly${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;

  if (isTheme(requested)) {
    response.headers.append(
      "Set-Cookie",
      `${THEME_COOKIE}=${requested}; ${attributes}; Max-Age=${THEME_MAX_AGE}`
    );
  } else {
    // Anything else — including the literal "system" the switch posts — clears
    // the cookie and hands the decision back to the device.
    response.headers.append("Set-Cookie", `${THEME_COOKIE}=; ${attributes}; Max-Age=0`);
  }
  return response;
}
