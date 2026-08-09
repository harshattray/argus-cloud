import type { ReactNode } from "react";
import { WaitlistForm } from "./WaitlistForm";
import { WordmarkSVG, CloudLockupSVG, IconSVG } from "./marks";

/**
 * The lean public site's UI kit.
 *
 * Kept separate from `/pitch`'s components on purpose. The two surfaces have
 * opposite jobs: the pitch tree is long-form and exhaustive for a reader who has
 * already committed; this one has to land in under two minutes with a stranger
 * who is still deciding whether to care. Sharing components between them would
 * pull this one back toward the density that made the long version tiring.
 */

export const Spark = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path
      d="M12 2L13.6 9.4L21 12L13.6 14.6L12 22L10.4 14.6L3 12L10.4 9.4L12 2Z"
      fill="currentColor"
    />
  </svg>
);

export const Eyebrow = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => (
  <div className="flex items-center gap-2 mb-4">
    <Spark className={`w-2.5 h-2.5 ${dark ? "text-pink-400" : "text-clay"}`} />
    <span className={`eyebrow ${dark ? "text-pink-400" : "text-clay"}`}>{children}</span>
  </div>
);

/**
 * The stacked wordmark.
 *
 * A drawing now, not a stack of styled spans — see `marks.tsx` for why. A size
 * is just a width; the height follows the viewBox, and the mark inherits its
 * colour so `text-clay` still governs.
 */
export const Wordmark = ({
  size = "md",
  dark = false,
  className = "",
  title,
}: {
  size?: "sm" | "nav" | "md" | "lg" | "xl";
  /** Lightens the clay so the mark survives on the ink band. */
  dark?: boolean;
  className?: string;
  title?: string;
}) => (
  <WordmarkSVG
    title={title}
    className={`h-auto ${dark ? "text-[#e0aca4]" : "text-clay"} ${WORDMARK_WIDTH[size]} ${className}`}
  />
);

/** Widths, in the proportions the CSS lockup used at each step. */
const WORDMARK_WIDTH = {
  sm: "w-[41px]",
  /** The header. Sized so the wordmark stays larger than the Cloud lockup
   *  sitting opposite it — the free mark is the site's logo, and the paid
   *  tier's lockup is not allowed to outrank it in the same bar. */
  nav: "w-[56px]",
  md: "w-[69px]",
  lg: "w-[115px]",
  xl: "w-[173px] md:w-[208px] lg:w-[277px]",
} as const;

export const Section = ({
  id,
  tone = "paper",
  size = "md",
  className = "",
  children,
}: {
  id?: string;
  tone?: "paper" | "sand" | "ink";
  /** `sm` for the connective sections between the ones that carry weight. */
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) => {
  const bg = {
    paper: "bg-paper text-text",
    sand: "bg-sand text-text",
    ink: "bg-ink text-white",
  }[tone];

  return (
    <section id={id} className={`w-full px-4 md:px-8 scroll-mt-16 ${bg} ${className}`}>
      <div className={`max-w-5xl mx-auto ${size === "sm" ? "py-12 md:py-16" : "py-16 md:py-24"}`}>
        {children}
      </div>
    </section>
  );
};

/** A real screenshot in the site's frame treatment. */
export const Shot = ({
  src,
  alt,
  caption,
  className = "",
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  className?: string;
}) => (
  <figure className={className}>
    <div className="overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_1px_2px_rgba(28,27,26,0.04),0_14px_38px_rgba(28,27,26,0.09)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full" loading="lazy" />
    </div>
    {caption && (
      <figcaption className="mt-3 text-[13px] leading-relaxed text-text/50">{caption}</figcaption>
    )}
  </figure>
);

/** The app tile. Also `/public/normascope-icon.svg` and the favicon. */
export const Icon = ({ className = "", title }: { className?: string; title?: string }) => (
  <IconSVG className={className} title={title} />
);

/**
 * The Cloud lockup — `cloud` set beside `norma`, with the tracked `scope`
 * beneath.
 *
 * **Cloud never redraws the wordmark.** It takes the space to its right and
 * changes nothing else, so the two marks share every measurement they have in
 * common. Widths below keep `norma` at 17.5 / 24 / 40px, matching the plain
 * wordmark at the same step. Where even `sm` is too wide, use `Icon` — never a
 * shrunken lockup.
 */
export const CloudMark = ({
  size = "md",
  dark = false,
  className = "",
  title,
}: {
  size?: "nav" | "sm" | "md" | "lg";
  dark?: boolean;
  className?: string;
  title?: string;
}) => (
  <CloudLockupSVG
    dark={dark}
    title={title}
    className={`h-auto ${CLOUD_WIDTH[size]} ${className}`}
  />
);

const CLOUD_WIDTH = {
  /** The header, opposite a 56px wordmark. Deliberately the smaller of the
   *  two marks in that bar — see WORDMARK_WIDTH.nav. */
  nav: "w-[76px]",
  sm: "w-[100px]",
  md: "w-[137px]",
  lg: "w-[200px] md:w-[240px]",
} as const;

/**
 * The waitlist badge — a pill that reads as an invitation rather than a status.
 *
 * It replaced a "Soon" chip, which told a visitor to come back later and gave
 * them nothing to do. Every instance points at the same anchor, so the form is
 * the one place a signup can happen.
 */
export const WaitlistBadge = ({
  dark = false,
  className = "",
  children = "Join early access",
}: {
  dark?: boolean;
  className?: string;
  children?: ReactNode;
}) => (
  <a
    href="/cloud#waitlist"
    className={`group inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 transition-colors ${
      dark
        ? "border-white/20 bg-white/[0.07] text-white/80 hover:border-white/40 hover:bg-white/[0.12] hover:text-white"
        : "border-clay/35 bg-clay/[0.08] text-clay-deep hover:border-clay/60 hover:bg-clay/[0.14]"
    } ${className}`}
  >
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
          dark ? "bg-pink-300" : "bg-clay"
        }`}
      />
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dark ? "bg-pink-300" : "bg-clay"}`} />
    </span>
    <span className="eyebrow">{children}</span>
    <span aria-hidden className="text-[11px] transition-transform group-hover:translate-x-0.5">
      →
    </span>
  </a>
);

/**
 * The Cloud call-to-action band.
 *
 * Appears on every public page. The public site's job is to make a visitor want
 * this, so unlike the pitch tree's quiet one-line hook, this one is a real
 * destination — but it still leads with the limitation rather than the feature,
 * because "here is what you will run into" converts and "here are our features"
 * does not.
 */
export const CloudBand = ({
  wall,
  answer,
  form = false,
}: {
  wall: ReactNode;
  answer: ReactNode;
  /** Put the signup itself in the band, rather than a link to it. Used on the
   *  home page, where the band is the first time Cloud is mentioned at all. */
  form?: boolean;
}) => (
  <Section tone="ink" size="sm">
    <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-14">
      <div className="lg:col-span-7">
        <CloudMark size="md" dark className="mb-5" title="Normascope Cloud" />
        <p className="display-sm mb-3 text-white">{wall}</p>
        <p className="text-[15px] leading-relaxed text-white/55">{answer}</p>
      </div>
      <div className="lg:col-span-5">
        {form ? (
          <>
            <p className="eyebrow mb-3 text-pink-300">Join early access</p>
            <WaitlistForm source="home" tone="dark" layout="stacked" cta="Join early access" />
            <a
              href="/cloud"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/50 underline decoration-1 underline-offset-4 transition-colors hover:text-white"
            >
              Or see everything it adds
              <span aria-hidden>→</span>
            </a>
          </>
        ) : (
          <div className="lg:text-right">
            <a
              href="/cloud"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              See what it adds
              <span aria-hidden>→</span>
            </a>
          </div>
        )}
      </div>
    </div>
  </Section>
);
