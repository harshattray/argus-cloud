import type { ReactNode } from "react";

/** The four-point star that marks every section label. Carried over from the
 *  portfolio's product page, where it is the one consistent brand glyph. */
export const Spark = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path
      d="M12 2L13.6 9.4L21 12L13.6 14.6L12 22L10.4 14.6L3 12L10.4 9.4L12 2Z"
      fill="currentColor"
    />
  </svg>
);

export const Label = ({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) => (
  <div className="flex items-center gap-2 mb-4">
    <Spark className={`w-2.5 h-2.5 ${dark ? "text-pink-400" : "text-pink-500"}`} />
    <span
      className={`eyebrow ${
        dark ? "text-pink-400" : "text-pink-500"
      }`}
    >
      {children}
    </span>
  </div>
);

/** The stacked `norma` / `s c o p e` wordmark. Set in the system grotesque —
 *  Poppins' geometric round is wrong for it at display size. */
export const Wordmark = ({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) => {
  const scale = {
    sm: { top: "text-sm leading-[0.85]", bot: "text-[5px] leading-none", track: "0.45em", ls: "-0.5px" },
    md: { top: "text-2xl leading-[0.85]", bot: "text-[8px] leading-none", track: "0.45em", ls: "-1px" },
    lg: { top: "text-5xl leading-[0.85]", bot: "text-base leading-none", track: "0.5em", ls: "-1.5px" },
    xl: {
      top: "text-7xl md:text-8xl lg:text-9xl leading-[0.85]",
      bot: "text-2xl md:text-3xl lg:text-4xl leading-none mt-1.5 md:mt-2 ml-0.5",
      track: "0.5em",
      ls: "-2px",
    },
  }[size];

  return (
    <span
      className={`flex flex-col text-clay ${className}`}
      style={{ fontFamily: "var(--font-wordmark)" }}
    >
      <span className={scale.top} style={{ fontWeight: 700, letterSpacing: scale.ls }}>
        norma
      </span>
      <span className={scale.bot} style={{ fontWeight: 400, letterSpacing: scale.track }}>
        scope
      </span>
    </span>
  );
};

/** Verdict pill. The glyph and the word both carry the meaning, so the state
 *  is never encoded in colour alone. */
export const Verdict = ({ flagged, className = "" }: { flagged: boolean; className?: string }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] whitespace-nowrap ${
      flagged
        ? "text-amber-700 bg-amber-100 border-amber-300"
        : "text-emerald-700 bg-emerald-100 border-emerald-300"
    } ${className}`}
  >
    <span aria-hidden>{flagged ? "⚠" : "✓"}</span>
    {flagged ? "Flagged" : "Clean"}
  </span>
);

/** Window chrome for the hand-built browser mockups. */
export const WindowBar = ({ dark = false }: { dark?: boolean }) => (
  <div
    className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b ${
      dark ? "border-white/10 bg-white/5" : "border-black/5 bg-white/60"
    }`}
    aria-hidden
  >
    <span className={`w-2 h-2 rounded-full shrink-0 ${dark ? "bg-white/20" : "bg-text/20"}`} />
    <span className={`h-1 w-7 rounded-full ${dark ? "bg-white/10" : "bg-black/10"}`} />
    <span className={`ml-auto h-1 w-3 rounded-full ${dark ? "bg-white/10" : "bg-black/10"}`} />
    <span className={`h-1 w-3 rounded-full ${dark ? "bg-white/10" : "bg-black/10"}`} />
  </div>
);

/** macOS traffic lights for terminal mockups. */
export const TerminalBar = ({ title }: { title?: string }) => (
  <div className="flex items-center gap-1.5 bg-[#2a2a2a] px-4 py-3">
    <span className="w-3 h-3 rounded-full bg-[#ff5f57]" aria-hidden />
    <span className="w-3 h-3 rounded-full bg-[#febc2e]" aria-hidden />
    <span className="w-3 h-3 rounded-full bg-[#28c840]" aria-hidden />
    {title && (
      <span className="ml-2 text-[11px] font-bold text-white/40 uppercase tracking-widest">
        {title}
      </span>
    )}
  </div>
);

/**
 * Standard section wrapper. `tone` picks the alternating band.
 *
 * The outer frame is the *same width on every section*, deliberately. Varying
 * the container per section and re-centring it makes the left edge jump
 * hundreds of pixels between bands as you scroll, which reads as broken
 * layout on a wide screen. Narrower content is achieved with `measure="prose"`,
 * which caps the line length *inside* the constant frame and stays left-aligned
 * — so the spine of the page never moves.
 */
export const Section = ({
  id,
  tone = "paper",
  measure = "prose",
  flushTop = false,
  className = "",
  children,
}: {
  id?: string;
  tone?: "paper" | "sand" | "ink";
  /** `prose` caps line length; `wide` uses the full frame for multi-column content. */
  measure?: "prose" | "wide";
  /**
   * Drop the top padding so this section reads as a continuation of the one
   * above it. Used where a `Chapter` opener has already supplied the heading
   * and its own spacing — without it the two stack into a visible double gap
   * and the opener stops looking attached to what it opens.
   */
  flushTop?: boolean;
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
      <div
        className={`max-w-6xl mx-auto pb-16 md:pb-24 ${flushTop ? "pt-2 md:pt-4" : "pt-16 md:pt-24"}`}
      >
        <div className={measure === "prose" ? "max-w-3xl" : ""}>{children}</div>
      </div>
    </section>
  );
};
