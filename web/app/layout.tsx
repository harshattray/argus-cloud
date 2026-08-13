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
export const metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${mono.variable} ${yuticWordmark.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
