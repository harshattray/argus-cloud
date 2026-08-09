import type { ReactNode } from "react";

/**
 * Editorial layout primitives.
 *
 * The site's problem before these existed: every page after the homepage was
 * built from the same recipe — eyebrow, heading, two paragraphs, then a grid of
 * identically-styled bordered cards each carrying an 01/02/03 counter. Six
 * pages of it reads as one page repeated, and the reader stops looking.
 *
 * These give each page a different *structural* signature while keeping one
 * visual language. A page should pick one or two of these as its spine, not
 * all of them.
 */

/* ─────────────────────────── section openers ─────────────────────────── */

/**
 * Full-bleed chapter opener with an oversized ghost numeral.
 *
 * For pages that are genuinely sequential (the three modes, the five cases).
 * The numeral is decorative and aria-hidden — the heading carries the order for
 * anyone not seeing it.
 */
export const Chapter = ({
  n,
  kicker,
  title,
  lede,
  tone = "paper",
  id,
}: {
  n: string;
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  tone?: "paper" | "sand" | "ink";
  id?: string;
}) => {
  const dark = tone === "ink";
  const bg = { paper: "bg-paper", sand: "bg-sand", ink: "bg-ink" }[tone];

  return (
    <section
      id={id}
      className={`relative isolate w-full overflow-hidden px-4 md:px-8 scroll-mt-16 ${bg} ${
        dark ? "text-white" : "text-text"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-8 right-2 md:right-8 select-none font-bold numeric leading-none text-[9rem] md:text-[15rem] ${
          dark ? "text-white/5" : "text-black/[0.045]"
        }`}
        style={{ letterSpacing: "-0.06em" }}
      >
        {n}
      </span>

      <div className="max-w-6xl mx-auto pt-14 pb-8 md:pt-20 md:pb-10 relative">
        <p className={`eyebrow mb-4 ${dark ? "text-pink-400" : "text-clay"}`}>{kicker}</p>
        <h2 className="display-lg max-w-3xl">{title}</h2>
        {lede && (
          <p
            className={`mt-5 max-w-2xl text-lg leading-relaxed ${
              dark ? "text-white/60" : "text-text/60"
            }`}
          >
            {lede}
          </p>
        )}
      </div>
    </section>
  );
};

/* ──────────────────────────── numbered spine ─────────────────────────── */

export interface StepItem {
  head: string;
  body: ReactNode;
  aside?: ReactNode;
}

/**
 * Vertical numbered spine with a connecting rule.
 *
 * Replaces the card grid wherever the items are a *sequence* rather than a set
 * of peers — the four stages of the diff, the steps of an agent loop. Reading
 * order is unambiguous and the rule does the work the card borders were doing.
 */
export const Steps = ({ items, dark = false }: { items: StepItem[]; dark?: boolean }) => (
  <ol className="relative">
    <span
      aria-hidden
      className={`absolute left-[15px] top-3 bottom-3 w-px ${dark ? "bg-white/12" : "bg-black/10"}`}
    />
    {items.map((item, i) => (
      <li key={item.head} className="relative pl-12 pb-9 last:pb-0">
        <span
          aria-hidden
          className={`absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full border font-mono text-[11px] font-bold numeric ${
            dark
              ? "border-white/15 bg-ink text-white/50"
              : "border-black/10 bg-paper text-text/45"
          }`}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
        <h3 className={`title-sm mb-1.5 ${dark ? "text-white" : "text-text"}`}>{item.head}</h3>
        <div className={`text-[15px] leading-relaxed ${dark ? "text-white/55" : "text-text/60"}`}>
          {item.body}
        </div>
        {item.aside && (
          <p
            className={`mt-2.5 font-mono text-[11.5px] leading-relaxed ${
              dark ? "text-pink-300/70" : "text-clay"
            }`}
          >
            {item.aside}
          </p>
        )}
      </li>
    ))}
  </ol>
);

/* ───────────────────────────── split feature ─────────────────────────── */

/**
 * Asymmetric text/visual split that alternates sides.
 *
 * The card grid's real failing is that everything is the same width; this puts
 * a big visual against a narrow column and lets the eye travel.
 */
export const Split = ({
  flip = false,
  visual,
  children,
  align = "center",
}: {
  flip?: boolean;
  visual: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
}) => (
  <div
    className={`grid gap-8 md:gap-12 lg:grid-cols-12 ${
      align === "center" ? "items-center" : "items-start"
    }`}
  >
    <div className={`lg:col-span-5 min-w-0 ${flip ? "lg:order-2" : ""}`}>{children}</div>
    <div className={`lg:col-span-7 min-w-0 ${flip ? "lg:order-1" : ""}`}>{visual}</div>
  </div>
);

/* ─────────────────────────────── figure ──────────────────────────────── */

/**
 * A real screenshot in the site's frame treatment, with a caption that is part
 * of the argument rather than a label.
 */
export const Figure = ({
  src,
  alt,
  caption,
  tall = false,
  dark = false,
  className = "",
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  /** Clip very tall images to a readable band instead of shrinking them. */
  tall?: boolean;
  dark?: boolean;
  className?: string;
}) => (
  <figure className={className}>
    <div
      className={`overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(28,27,26,0.04),0_14px_38px_rgba(28,27,26,0.09)] ${
        dark ? "border-white/10 bg-ink" : "border-black/8 bg-white"
      } ${tall ? "max-h-[26rem]" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`w-full ${tall ? "object-cover object-top h-[26rem]" : ""}`}
        loading="lazy"
      />
    </div>
    {caption && (
      <figcaption
        className={`mt-3 text-[13px] leading-relaxed ${dark ? "text-white/45" : "text-text/50"}`}
      >
        {caption}
      </figcaption>
    )}
  </figure>
);

/* ──────────────────────── annotated screenshot ───────────────────────── */

export interface Pin {
  /** Percent of the image's width/height, so pins scale with the image. */
  x: number;
  y: number;
  label: string;
  body: ReactNode;
}

/**
 * A screenshot with numbered callout pins keyed to a list beneath it.
 *
 * The pins are decorative-only: every pin's content is repeated in the ordered
 * list below, which is the accessible source of truth and the sole mobile
 * presentation. Nothing is conveyed by pin position alone.
 */
export const Annotated = ({
  src,
  alt,
  pins,
  dark = false,
}: {
  src: string;
  alt: string;
  pins: Pin[];
  dark?: boolean;
}) => (
  <div className="grid gap-7 lg:grid-cols-12 lg:gap-9 items-start">
    <div className="lg:col-span-7 min-w-0">
      <div
        className={`relative overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(28,27,26,0.04),0_14px_38px_rgba(28,27,26,0.09)] ${
          dark ? "border-white/10 bg-ink" : "border-black/8 bg-white"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full" loading="lazy" />
        {pins.map((pin, i) => (
          <span
            key={pin.label}
            aria-hidden
            className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-clay text-[11px] font-bold text-white shadow-[0_0_0_3px_rgba(255,255,255,0.85)] numeric"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </div>

    <ol className="lg:col-span-5 min-w-0 space-y-4">
      {pins.map((pin, i) => (
        <li key={pin.label} className="flex gap-3">
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold numeric ${
              dark ? "bg-white/10 text-white/70" : "bg-clay/15 text-clay-deep"
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className={`title-sm ${dark ? "text-white" : "text-text"}`}>{pin.label}</p>
            <div
              className={`mt-0.5 text-[14px] leading-relaxed ${
                dark ? "text-white/55" : "text-text/60"
              }`}
            >
              {pin.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

/* ──────────────────────────── metric display ─────────────────────────── */

/** One big number with its plain-language meaning. */
export const Metric = ({
  value,
  unit,
  label,
  tone = "neutral",
}: {
  value: string;
  unit?: string;
  label: ReactNode;
  tone?: "neutral" | "flagged" | "clean";
}) => {
  const colour = {
    neutral: "text-text",
    flagged: "text-[#b6611f]",
    clean: "text-[#3e7d52]",
  }[tone];

  return (
    <div>
      <p className={`numeric font-bold leading-none text-4xl md:text-5xl ${colour}`}>
        {value}
        {unit && <span className="text-[0.5em] font-semibold ml-0.5 align-baseline">{unit}</span>}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-text/50">{label}</p>
    </div>
  );
};

/* ────────────────────────────── data table ───────────────────────────── */

/**
 * The evidence table. Real measured numbers, presented as data rather than as
 * marketing — the single most persuasive artefact we own is a 7×6 grid of
 * percentages, and it should look like a spreadsheet, not a feature list.
 */
export const DataTable = ({
  head,
  rows,
  caption,
  dark = false,
}: {
  head: string[];
  /** `null` renders an em dash; a bolded cell marks a flagged measurement. */
  rows: { cells: (ReactNode | null)[]; emphasis?: boolean[] }[];
  caption?: ReactNode;
  dark?: boolean;
}) => (
  <figure className="min-w-0">
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`border-b py-2.5 pr-4 eyebrow whitespace-nowrap ${
                  i === 0 ? "" : "text-right"
                } ${dark ? "border-white/12 text-white/40" : "border-black/10 text-text/40"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.cells.map((cell, c) => (
                <td
                  key={c}
                  className={`border-b py-2.5 pr-4 text-[13.5px] ${
                    c === 0 ? "font-medium whitespace-nowrap" : "text-right font-mono numeric"
                  } ${
                    row.emphasis?.[c]
                      ? "font-bold text-[#b6611f]"
                      : dark
                        ? "text-white/55"
                        : "text-text/60"
                  } ${dark ? "border-white/8" : "border-black/6"}`}
                >
                  {cell ?? <span className={dark ? "text-white/20" : "text-text/25"}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {caption && (
      <figcaption
        className={`mt-3 text-[13px] leading-relaxed ${dark ? "text-white/45" : "text-text/50"}`}
      >
        {caption}
      </figcaption>
    )}
  </figure>
);

/* ──────────────────────────── pull quote / note ──────────────────────── */

/**
 * A bordered aside for the things we say *against* ourselves — limits, noise
 * floors, wrong findings. Visually distinct from a feature card on purpose:
 * these are the most credible content on the site and should not look like a
 * marketing box.
 */
export const Note = ({
  kind = "limit",
  title,
  children,
}: {
  kind?: "limit" | "proof";
  title: string;
  children: ReactNode;
}) => (
  <aside
    className={`rounded-xl border-l-2 py-4 pl-5 pr-5 ${
      kind === "limit"
        ? "border-l-[#b6611f]/45 bg-[#b6611f]/[0.045]"
        : "border-l-[#3e7d52]/45 bg-[#3e7d52]/[0.05]"
    }`}
  >
    <p
      className={`eyebrow mb-2 ${kind === "limit" ? "text-[#b6611f]" : "text-[#3e7d52]"}`}
    >
      {title}
    </p>
    <div className="text-[14.5px] leading-relaxed text-text/70 space-y-2.5">{children}</div>
  </aside>
);

/* ──────────────────────────── the cloud hook ─────────────────────────── */

/**
 * The single Cloud prompt a page is allowed.
 *
 * Deliberately not a banner and not a card: it states the local limitation as a
 * fact, names the thing that would fix it, and links once. Anything louder
 * would undercut a site whose whole argument is that the free tool is complete.
 */
export const CloudHook = ({
  limitation,
  answer,
  dark = false,
}: {
  limitation: ReactNode;
  answer: ReactNode;
  dark?: boolean;
}) => (
  <div
    className={`flex flex-col gap-3 border-t pt-6 md:flex-row md:items-baseline md:gap-8 ${
      dark ? "border-white/12" : "border-black/10"
    }`}
  >
    <p className={`max-w-2xl text-[15px] leading-relaxed ${dark ? "text-white/55" : "text-text/60"}`}>
      <span className={dark ? "text-white/85" : "text-text/85"}>{limitation}</span> {answer}
    </p>
    <a
      href="/pitch/cloud"
      className={`shrink-0 text-[13px] font-semibold whitespace-nowrap underline decoration-1 underline-offset-4 transition-colors ${
        dark ? "text-pink-300 hover:text-pink-200" : "text-clay hover:text-clay-deep"
      }`}
    >
      Normascope Cloud →
    </a>
  </div>
);
