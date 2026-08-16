import { NPM_URL } from "../../../lib/site";
import { Spark, Wordmark, WaitlistBadge } from "./ui";
import { HeroPreview } from "./HeroPreview";
import { CopyLine } from "./CopyLine";
import { TwinLink } from "./twins";

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
              {/*
                The h1's actual text. The wordmark above it is an image, so
                this line is the whole heading as far as a screen reader or a
                crawler is concerned — and it used to be the single word
                "Normascope", which told both of them nothing.

                A page's h1 is the strongest on-page statement of what the page
                is about. Spending it on the brand name repeats what the title,
                the logo and the domain already say three times over. This says
                what the product does instead, in the same words the rest of
                the site uses.

                "any reference" is deliberate and load-bearing: the engine
                compares against a design, a set of images, another URL, or an
                approved baseline (`migrations/001_foundation.sql`, `source`).
                Naming one of the four here would shrink the product to that
                one in the place search engines weight most.

                Nothing changes visually — `sr-only` keeps it off screen.
              */}
              <span className="sr-only">
                Normascope — compare your running UI to any reference
              </span>
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

                This block used to carry the lockup as well below `md`, because
                the header's Cloud corner is hidden at that width and a phone
                was otherwise getting a black `join waitlist` pill that never
                said what it was joining. The header's navigation row carries
                the lockup now, on every route rather than only this one, so
                the copy here went back to being one invitation instead of two.

                The rule above it is a divider, not decoration. Without one the
                badge reads as a third line of the free tool's own pitch, which
                is the one thing this mention must not do. */}
            <div className="mt-7 border-t border-clay/25 pt-6 md:border-0 md:pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <WaitlistBadge />
                <span className="text-[13px] text-text/45">
                  shared visual memory for your team
                </span>
              </div>

              {/* The badge row above keeps the column's full width on purpose.
                  The figure shared that row for one revision and pushed the row
                  past its wrapping point — "shared visual memory for your team"
                  dropped under the badge on every desktop width. It takes its
                  width from the paragraph instead, which has `max-w-md` to
                  spare. */}
              <div className="flex flex-col items-end sm:flex-row sm:items-end sm:gap-4">
                <p className="mt-3 max-w-md text-[13px] leading-relaxed text-text/45">
                  Use Normascope free on your machine today. When your team needs a shared history,
                  stable links and trends, that&rsquo;s Normascope Cloud.
                </p>

              {/* The figure stands at the end of the Cloud sentence, and that
                  is the whole reason it moved here.

                  It was in the fold's top-right corner while it was decoration.
                  Two things broke when it became a labelled link. It overlapped
                  the preview card, which drew straight over the legs and left a
                  figure sliced off at the knees. And its sticker landed directly
                  under the header's Cloud lockup, so the top-right corner
                  carried two Cloud messages within 60px of each other, each
                  making the other harder to read.

                  Here it has real room, it costs the fold about 60px rather
                  than overlapping anything, and — the part worth keeping — it
                  is beside the one paragraph in the hero that is about Cloud.
                  A "get cloud" sticker next to "that's Normascope Cloud" is the
                  same sentence twice, which is what a mascot is for. */}
                {/* Visible on a phone too, stacked under the paragraph rather
                    than beside it — at 375px a figure sharing the line leaves
                    the paragraph 231px and it wraps to six lines. Hiding it
                    below `sm` was the first instinct and it is the wrong one:
                    the phone is the surface this whole change is for. */}
                <TwinLink pose="camera" className="-mb-2 mt-1 w-20 shrink-0 opacity-90 sm:mt-0 sm:w-24" />
              </div>
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
