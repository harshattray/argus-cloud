import { NPM_URL } from "../../../lib/site";
import { Spark, Wordmark, WaitlistBadge } from "./ui";
import { HeroPreview } from "./HeroPreview";
import { CopyLine } from "./CopyLine";
import { Twin } from "./twins";
import { CookingCluster } from "./CloudCorner";

/**
 * The home page's fold.
 *
 * Extracted from `page.tsx` while backdrops were being compared against each
 * other, so the comparison ran against the real hero rather than a copy of it.
 * The comparison is over and the alternatives are gone with it — the fold keeps
 * its own file, because it is a big enough thing to own one.
 */
export function Hero() {
  return (
    <div className="relative isolate w-full overflow-hidden px-4 md:px-8">
      {/* `isolate` keeps the colour wash inside this stacking context; without
          it the wash paints over the page background. */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <div className="h-full w-full bg-gradient-to-br from-[#e8c9bf]/70 via-[#f3e3d8]/50 to-[#d8c3e0]/40" />
        <div className="absolute right-[-80px] top-[-110px] h-[28rem] w-[28rem] rounded-full bg-clay opacity-35 blur-3xl" />
        <div className="absolute bottom-[-90px] left-[-70px] h-96 w-96 rounded-full bg-[#fbc3bd] opacity-40 blur-3xl" />

        {/* One of them in the top-right corner, above the preview card, holding
            a camera — the paragraph two inches to the left says Normascope
            photographs your running app, and this is that sentence with no
            words in it. It is in the backdrop rather than in the layout so it
            costs the fold no height, and it tracks the same `max-w-5xl`
            container as the content, which is what lands it over the card's
            column instead of out in the bleed.

            It shrinks on a phone rather than vanishing. The corner is still
            free there — the eyebrow above the wordmark is four short words —
            so the figure only has to come down to a size that does not crowd
            it. */}
        <div className="absolute inset-0 mx-auto flex max-w-5xl items-start justify-end px-4 md:px-8">
          <Twin pose="camera" className="mt-5 w-12 opacity-80 md:w-16 lg:mt-7 lg:w-[5.5rem]" />
        </div>
      </div>

      <div className="mx-auto max-w-5xl pt-14 pb-12 md:pt-16 md:pb-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-12">
          <div className="min-w-0 flex-1">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Spark className="h-2.5 w-2.5 text-clay" />
              <span className="eyebrow text-clay">Free · local · no account</span>
            </div>

            <h1 className="mb-7">
              <Wordmark size="xl" />
              <span className="sr-only">Normascope</span>
            </h1>

            <p className="max-w-lg text-xl leading-snug text-text/75 md:text-2xl">
              See what changed in your UI — before your users do.
            </p>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-text/55">
              Normascope photographs your running app and tells you exactly what moved, against your
              design or against yesterday&rsquo;s build. It runs on your machine and never blocks a
              commit.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <CopyLine command="npx norma-scope init" />
              <a
                href={NPM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-text/50 transition-colors hover:text-text"
              >
                View on npm
                <span aria-hidden>→</span>
              </a>
            </div>
            <p className="mt-4 text-[13px] text-text/45">
              Node 18+ · no account · nothing to uninstall
            </p>

            {/* Cloud gets one mention this high up, and it is an invitation
                rather than an advert — the free tool has to carry the hero.

                Below `md` it also carries the lockup, because the header's
                Cloud corner is hidden at that width. A phone was getting a
                black `join waitlist` pill that never said what it was joining,
                and the word Cloud only as the sixth grey chip in the nav strip
                — measured, the first readable mention was this badge and the
                next was the Cloud band at 80% down the page. The rule is in
                `CloudCorner.tsx`: the cluster is near the top at every width,
                in the header from `md` up and here below it, never both.

                The rule above it is a divider, not decoration. Without one the
                lockup reads as a third line of the free tool's own pitch, which
                is the one thing this mention must not do. */}
            <div className="mt-7 border-t border-clay/25 pt-6 md:border-0 md:pt-0">
              <CookingCluster className="mb-4 inline-flex md:hidden" />

              <div className="flex flex-wrap items-center gap-3">
                <WaitlistBadge />
                <span className="text-[13px] text-text/45">
                  shared visual memory for your team
                </span>
              </div>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-text/45">
                Use Normascope free on your machine today. When your team needs a shared history,
                stable links and trends, that&rsquo;s Normascope Cloud.
              </p>
            </div>
          </div>

          <div className="w-full shrink-0 lg:w-[400px]">
            <HeroPreview />
          </div>
        </div>
      </div>
    </div>
  );
}
