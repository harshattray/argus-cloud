import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, TAGLINE, NAV_LINKS, NPM_URL } from "../../lib/site";
import { Wordmark, CloudMark, WaitlistBadge } from "./_components/ui";
import { WaitlistForm } from "./_components/WaitlistForm";
import { HeaderNav, CloudLink } from "./_components/HeaderNav";
import { YuticEndorsement } from "../_components/YuticEndorsement";

/** The public site. Four routes, one conversion. Everything long-form lives
 *  behind the password gate at /pitch. */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Normascope — see what changed before your users do",
    template: "%s — Normascope",
  },
  description: TAGLINE,
  openGraph: { siteName: "Normascope", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-[#111] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      {/*
        The bar is split: brand and navigation on the left, the Cloud corner on
        the right behind a hairline.

        Two rules hold it together. The wordmark is always the larger of the two
        marks, because the site's logo cannot be outranked by the paid tier's
        lockup in its own header. And the divider exists so the lockup reads as
        a destination rather than as one more nav word — without it, four grey
        links running straight into a two-line brand drawing had no hierarchy at
        all.

        The waitlist action is the shared `WaitlistBadge`, not a bespoke button:
        it is the same action as the other three placements (§11), so it is the
        same object. It is also visible at every width — the old black button
        was hidden below `md`, which left phones with no call to action.

        Below `md` the navigation drops to a second row. Sharing the top row
        with the brand and the badge left it roughly 120px wide and clipped
        mid-word; a full-width strip is the whole structure, one swipe away.
      */}
      <header className="sticky top-0 z-50 border-b border-black/8 bg-paper/85 backdrop-blur-md">
        <nav className="mx-auto max-w-5xl px-4 md:px-8" aria-label="Main">
          <div className="flex h-[60px] items-center gap-2.5 md:gap-5">
            <Link href="/" className="shrink-0" aria-label="Normascope — home">
              <Wordmark size="nav" />
            </Link>

            <HeaderNav links={NAV_LINKS} className="hidden md:flex" />

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <span aria-hidden className="hidden h-6 w-px bg-black/10 md:block" />

              {/* The lockup badges itself, so it needs no pill around it — a
                  border here would be a box inside a box. */}
              <CloudLink className="hidden md:inline-flex">
                <CloudMark size="nav" title="Normascope Cloud" />
              </CloudLink>

              <WaitlistBadge className="shrink-0">Early access</WaitlistBadge>
            </div>
          </div>

          <HeaderNav
            links={NAV_LINKS}
            className="-mx-2 h-11 border-t border-black/[0.06] px-2 md:hidden"
          />
        </nav>
      </header>

      <main id="main">{children}</main>

      <footer className="border-t border-black/8 bg-sand px-4 py-12 md:px-8">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Wordmark size="md" />
            <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-text/50">
              {TAGLINE}
            </p>
            {/* The parent brand's one endorsement on this surface. It sits
                below the tagline, not beside the wordmark: Yutic's rules make
                it a footer signature, never part of a product header. */}
            <YuticEndorsement className="mt-6" />
          </div>

          <div className="flex gap-10 lg:col-span-4">
            <div className="flex flex-col gap-2">
              <p className="eyebrow text-text/35">Product</p>
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-[13.5px] text-text/60 hover:text-text">
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="eyebrow text-text/35">Install</p>
              <a
                href={NPM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13.5px] text-text/60 hover:text-text"
              >
                npm
              </a>
              <span className="font-mono text-[12.5px] text-text/40">npx norma-scope</span>
            </div>
          </div>

          {/* The fourth waitlist placement (§11). A visitor who read to the
              bottom is the most qualified one on the page. */}
          <div className="lg:col-span-4">
            <CloudMark size="sm" className="mb-4" title="Normascope Cloud" />
            <p className="mb-3 max-w-xs text-[13.5px] leading-relaxed text-text/50">
              Shared links, per-page history and trends. Join early access and we&rsquo;ll write once,
              when Cloud opens.
            </p>
            <WaitlistForm source="footer" layout="stacked" />
          </div>
        </div>
      </footer>
    </div>
  );
}
