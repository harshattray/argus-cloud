import type { MetadataRoute } from "next";
import { SITE_URL, NAV_LINKS } from "../lib/site";

/** Public routes only. The gated Cloud surface and share-token report pages
 *  are noindex and must never appear here (docs/normascopeWeb.md §12). */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", ...NAV_LINKS.map((l) => l.href)];
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: route === "/" ? 1 : 0.8,
  }));
}
