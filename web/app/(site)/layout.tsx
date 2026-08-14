import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, TAGLINE, NAV_LINKS, NPM_URL } from "../../lib/site";
import { Wordmark, CloudMark } from "./_components/ui";
import { WaitlistForm } from "./_components/WaitlistForm";
import { HeaderNav } from "./_components/HeaderNav";
import { CloudCorner, CookingCluster } from "./_components/CloudCorner";
import { YuticEndorsement } from "../_components/YuticEndorsement";
import { LEGAL_DOCUMENTS } from "../../lib/legal.generated";

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
        the right.

        One rule still holds it together — the wordmark is always the larger of
        the two marks, because the site's logo cannot be outranked by the paid
        tier's lockup in its own header. `CLOUD_WIDTH.nav` in `ui.tsx` carries
        the arithmetic that keeps it true.

        **The hairline divider is gone.** It existed so the lockup would read as
        a destination rather than as one more nav word, and it did that job
        weakly. The corner now carries its own hierarchy: the lockup has an
        eyebrow above it, which nothing else in the bar has, so it reads as a
        titled block instead of a mark in a row. See `CloudCorner.tsx`, which
        also records what the corner deliberately breaks.

        Below `md` the navigation drops to a second row. Sharing the top row
        with the brand and the action left it roughly 120px wide and clipped
        mid-word; a full-width strip is the whole structure, one swipe away.

        **That second row also carries the Cloud lockup**, pinned to its end
        while the strip fades out under it. The header is sticky, so this is
        what puts Cloud on screen at every scroll position of every route on a
        phone — the hero's copy of the lockup reached the home page and nothing
        else, and a visitor in the middle of `/guide` was 30,000 pixels from
        the nearest mention either way. The strip loses its `Cloud` chip in
        exchange, so the bar holds the same number of things; one of them is
        now the mark rather than a grey word.
      */}
      <header className="sticky top-0 z-50 border-b border-black/8 bg-paper/85 backdrop-blur-md">
        <nav className="mx-auto max-w-5xl px-4 md:px-8" aria-label="Main">
          <div className="flex h-[60px] items-center gap-2.5 md:gap-5">
            <Link href="/" className="shrink-0" aria-label="Normascope — home">
              <Wordmark size="nav" />
            </Link>

            <HeaderNav links={NAV_LINKS} className="hidden md:flex" />

            <CloudCorner />
          </div>

          <div className="-mx-2 flex h-12 items-center gap-1 border-t border-black/[0.06] px-2 md:hidden">
            {/* `flex-1` rather than letting the strip size to its chips: the
                lockup belongs at the row's end at every width, not floating
                wherever the labels happen to stop. `strip-fade` is then the
                cue that the strip continues past that end — without it, a
                label cut off at the lockup reads as a rendering fault rather
                than as something to swipe to. */}
            <HeaderNav links={NAV_LINKS} className="strip-fade h-full flex-1" />
            <CookingCluster className="shrink-0" panClassName="hidden sm:block" />
          </div>
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

        {/* The operator line. PATHWAYS' public-site demand gate requires
            legal-facing copy naming who runs Normascope, and this is the
            surface the public actually sees — the /pitch footer carried it
            while the public site did not. Same wording, deliberately: two
            phrasings of who trades here is one too many. */}
        <div className="mx-auto mt-12 max-w-5xl border-t border-black/8 pt-6">
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_DOCUMENTS.map((doc) => (
              <Link
                key={doc.slug}
                href={`/legal/${doc.slug}`}
                className="text-xs text-text/40 hover:text-text/70"
              >
                {doc.title}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Copyright only. This carried "Screenshots never leave your
                machines" — true of the local CLI, false of Cloud, on a page
                selling Cloud. No product claim belongs in a footer where it
                cannot be qualified. */}
            <p className="text-xs text-text/35">© {new Date().getFullYear()} Normascope.</p>
            <p className="text-xs text-text/35">
              Normascope is operated by Yutic, a sole proprietorship of Harsha Attray.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
