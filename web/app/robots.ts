import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The report pages are share-token gated and the Cloud surface is
      // private; neither should ever be crawled (docs/normascopeWeb.md §12).
      // `/admin/` is password-gated and holds waitlist addresses — it is listed
      // here as belt and braces alongside the noindex header the gate sets.
      disallow: ["/r/", "/normascope-cloud", "/api/", "/admin/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
