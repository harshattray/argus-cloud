import type { ReactNode } from "react";
import { Poppins, JetBrains_Mono, DM_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "../lib/site";

/**
 * Root layout — deliberately unstyled beyond fonts.
 *
 * This app carries two surfaces with different chrome: the public marketing
 * site under `(marketing)/` and the share-token report page under `r/`. Each
 * owns its own background and colour scheme in its own layout, so neither can
 * impose one on the other. Anything visual here would leak across both.
 */

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
});

/**
 * Yutic's wordmark face, loaded for one purpose and used for one string.
 *
 * The parent brand's rules name DM Mono for the wordmark; Normascope's own type
 * is Poppins. Setting "Yutic" in Poppins would be drawing someone else's
 * wordmark in the wrong face, so this ships the real one at the single weight
 * the lockup uses. It is never applied to Normascope's own text.
 */
const yuticWordmark = DM_Mono({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-yutic",
  display: "swap",
});

// Imported, not re-derived. This line used to repeat the env read and the
// default literal from `lib/site.ts`; two copies of one fact is how a domain
// change lands in the sitemap and the canonical tags but not in the Open Graph
// URLs, with nothing failing.
/**
 * Search-engine ownership proof, supplied by environment variable.
 *
 * Google Search Console and Bing Webmaster Tools each hand you a token and ask
 * you to serve it from the site before they will show you index coverage or
 * accept a sitemap submission. Both accept a `<meta>` tag; this renders one
 * when the token exists and nothing when it does not, so an unconfigured
 * deploy carries no empty tag.
 *
 * **Why env vars rather than the literal strings.** They are per-property, not
 * per-codebase: a preview deploy, a staging domain, or a second property would
 * each need a different one, and a token hard-coded here would be silently
 * wrong on all of them. The values are not secret — they are public in the
 * page source by design — so `NEXT_PUBLIC_` is correct and there is nothing to
 * leak.
 *
 * Verification is one half. The half that actually gets pages indexed is
 * submitting `sitemap.xml` inside each console, which is a person's job once.
 */
const verification = {
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : {}),
  ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
    : {}),
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  ...(Object.keys(verification).length > 0 ? { verification } : {}),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${mono.variable} ${yuticWordmark.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
