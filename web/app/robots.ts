import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The report pages are share-token gated and the Cloud surface is
      // private; neither should ever be crawled (docs/normascopeWeb.md §12).
      disallow: ["/r/", "/normascope-cloud", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
