import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
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
