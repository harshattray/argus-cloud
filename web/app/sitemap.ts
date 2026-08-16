import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";
import { PUBLIC_ROUTES } from "../lib/pageDates.generated";

/**
 * The public sitemap.
 *
 * **The route list is discovered, not written here.** It used to be built from
 * `NAV_LINKS`, which is the site menu — so a public page without a nav entry
 * never reached this file, and a page dropped from the menu vanished from the
 * sitemap while staying live. `scripts/public-routes.mjs` walks
 * `app/(site)` instead and `embed-page-dates.mjs` bakes the result in at build
 * time; adding a page is now enough to list it.
 *
 * The private trees cannot appear here by construction: `/pitch`, `/admin` and
 * `/r/{runId}` are separate route trees, not entries under `app/(site)`.
 *
 * **`lastModified` comes from git, not from `new Date()`.** It used to be the
 * build time, which meant every deploy claimed all seven pages had changed at
 * once — including pages nobody had touched in weeks. Search engines drop a
 * `lastmod` they can see is untrue, so the inaccuracy cost the signal on the
 * pages where it was real. Where git cannot say, the date is omitted rather
 * than invented.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ route, lastModified }) => {
    // Legal pages are public and worth listing, but they must never outrank a
    // product page for a product query — and they change once a year, not
    // weekly.
    const isLegal = route === "/legal" || route.startsWith("/legal/");
    return {
      url: `${SITE_URL}${route}`,
      ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
      changeFrequency: isLegal ? ("yearly" as const) : ("weekly" as const),
      priority: route === "/" ? 1 : isLegal ? 0.2 : 0.8,
    };
  });
}
