import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/**
 * Anything that is not the production deployment is closed to crawlers
 * entirely.
 *
 * **This became load-bearing the moment a preview got a real domain.** Vercel
 * stamps `X-Robots-Tag: noindex` on its own `*.vercel.app` URLs; it does not do
 * that for a custom name like `preview.normascope.com`. A preview that also
 * sets `NEXT_PUBLIC_SITE_URL` to its own host — which it must, or its sign-in
 * links would point at production — would otherwise serve allow-all robots and
 * self-canonical every page, and compete with the real site in results using
 * unreleased copy.
 *
 * `VERCEL_ENV` is `production` only on the production deployment; it is
 * `preview` on every other one and absent on a laptop, where nothing is
 * crawling anyway.
 */
const isProduction = process.env.VERCEL_ENV === "production" || !process.env.VERCEL_ENV;

export default function robots(): MetadataRoute.Robots {
  if (!isProduction) {
    // No sitemap either: advertising one invites the crawl this is refusing.
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/r/` is share-token gated and `/api/` is not a page. `/admin/` is
      // password-gated and holds waitlist addresses — listed here as belt and
      // braces alongside the noindex header the gate sets
      // (docs/normascopeWeb.md §12).
      //
      // **`/normascope-cloud` was removed 2026-08-16.** It never existed on
      // this domain — it is the legacy preview inside the portfolio repo, at
      // `harshaattray.com/normascope-cloud` (FUTURENORMA "Legacy: the
      // portfolio preview"). A Disallow for a path this site does not serve
      // protects nothing, and reading it here suggested the rule was doing a
      // job. If that preview needs excluding, it needs excluding in the
      // portfolio's own robots.txt, which is a different deployment.
      //
      // **`/pitch` is deliberately absent.** It is noindex via metadata on
      // every page in the tree. Disallowing it in robots.txt would stop
      // crawlers fetching those pages *and therefore reading the noindex* —
      // which is how a gated URL ends up listed in results with no snippet.
      // Noindex is the stronger tool here; robots.txt would weaken it.
      disallow: ["/r/", "/api/", "/admin/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
