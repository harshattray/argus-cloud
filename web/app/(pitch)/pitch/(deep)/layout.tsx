import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SITE_URL, TAGLINE } from "../../../../lib/site";
import { SiteNav } from "../_components/SiteNav";
import { SiteFooter } from "../_components/SiteFooter";

/** Public marketing shell. Everything under this group is indexable; the
 *  gated Cloud surface and the share-token report pages are not. */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Normascope — visual verification for teams and AI agents",
    template: "%s — Normascope",
  },
  description: TAGLINE,
  openGraph: { siteName: "Normascope", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-[#111] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
