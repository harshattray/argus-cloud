/**
 * The brand marks, as SVG.
 *
 * These were CSS lockups until now — stacked `<span>`s with hand-tuned
 * font-size, letter-spacing and margins at four sizes. That worked, but it meant
 * the logo existed only inside React: it could not be exported, could not be a
 * favicon, and every size needed its own row in a scale table.
 *
 * ── Why the geometry is pinned ──────────────────────────────────────────────
 *
 * The wordmark is set in the system grotesque (`--font-wordmark`), which is a
 * *different typeface per platform* — SF on macOS, Arial on Windows, Liberation
 * on most Linux. Left alone, the mark would be a different width on every
 * machine and the Cloud plate would no longer match the width of `norma`.
 *
 * So every word carries `textLength` + `lengthAdjust="spacing"`: the glyphs are
 * whatever the platform has, but the *box each word occupies is fixed*. The
 * lockup's proportions are then identical everywhere, and the only difference
 * between platforms is a hair of tracking inside a word. The numbers below were
 * measured off the live CSS lockup, so this renders as what it replaced.
 *
 * The unit is a pixel of the mark at `norma` = 40px. Everything scales from the
 * viewBox, so a size is now just a width.
 */

const W = 115.4; // measured box width of `norma` at 40px / -1.5 tracking
const SCOPE_W = 61.6; // ink width of the tracked `scope`, trailing space removed

/**
 * `scope`'s tracking, and the advance width that follows from it.
 *
 * ── The bug this fixes ──────────────────────────────────────────────────────
 *
 * `textLength` was set to SCOPE_W. That is the *ink* width — the comment above
 * says so — but SVG pins the **advance** width, which includes the trailing
 * letter-space after the final `e`. So the browser had to remove 6.5 units it
 * was never meant to remove, and with `lengthAdjust="spacing"` it took them out
 * of the four gaps between the letters: 1.63 each.
 *
 * The result was `scope` rendering at 4.87 tracking instead of 6.5 — visibly
 * cramped under `norma`, in the header and in the hero, in both marks, on every
 * platform. Measured live: advance 68.14 against a pinned 61.6.
 *
 * `norma` and `cloud` were always right (115.42 against 115.4, and exactly 96),
 * which is why only the subscript looked wrong.
 *
 * The tracking is a constant now rather than a literal repeated in four places.
 * It has to appear in two forms that must agree — the `letter-spacing`
 * attribute and this width — so it gets one source.
 */
const SCOPE_TRACK = 6.5;
const SCOPE_ADVANCE = SCOPE_W + SCOPE_TRACK;

/**
 * ── The box has to clear the ink, not the baseline ──────────────────────────
 *
 * The wordmark's viewBox started at y=0 and ended at y=36, chosen off the
 * baselines: `norma` sits at 21, `scope` at 33. Both numbers are baselines, and
 * a baseline is not where the ink stops.
 *
 * Two things overrun it, and both were shipping:
 *
 * - **`norma` was clipped at the top.** Round letters overshoot the x-height —
 *   `o`, `m` and `a` are drawn a hair taller than `n` and `r` so they *look*
 *   the same height. That overshoot reaches -0.24 on SF, and an SVG root
 *   clips by default, so the tops of those three letters rendered flat. At the
 *   hero's 277px the shave is about half a pixel; on a 2× or 3× screen it is
 *   one to two device pixels of flattened curve across the biggest word on the
 *   site.
 * - **`scope` nearly ran off the bottom.** Its `p` descends to 35.56 against a
 *   36 edge. It survived on this machine with 0.44 units to spare — and this
 *   mark is deliberately set in whatever grotesque the platform has, so a
 *   font with a deeper descender clips it. That is not a margin worth having.
 *
 * So the box is now derived from the measured ink, with `BLEED` either side to
 * absorb the platform variation the whole `textLength` scheme exists to
 * tolerate. Widths are untouched: only the box grows, so a mark set to a given
 * width draws exactly the same glyphs at exactly the same size, with a little
 * transparent air above and below.
 *
 * If you change a font size or a baseline here, re-measure. The check is
 * `canvas` `measureText().actualBoundingBoxAscent/Descent` at the same size and
 * weight, offset by the baseline — not `getBBox()`, which returns the em box
 * and reports every mark as overflowing whether it does or not.
 */
const BLEED = 2;
const MARK_TOP = -BLEED; // `norma`'s overshoot reaches -0.24
const MARK_BOTTOM = 38; // `scope`'s `p` descends to 35.56

/** `cloud`'s ascenders reach -2.36; the lockup's extra headroom also covers a
 *  fallback mono rendering before the webfont lands. */
const LOCKUP_TOP = -11;
const CLOUD_SIZE = 32; // see CLOUD_W — mono runs wide, so it sets smaller
const CLOUD_W = 96; // measured box width of `cloud` in JetBrains Mono at 32px
const CLOUD_X = W + 16; // `cloud` sits one 16px gutter after `norma`
const LOCKUP_W = CLOUD_X + CLOUD_W;

const FONT = "var(--font-wordmark, -apple-system, 'Helvetica Neue', Arial, sans-serif)";

/**
 * The tier word is the one thing in the marks not set in the grotesque.
 *
 * `cloud` is the only element that had to separate itself from the brand name,
 * and a change of *typeface* does that far harder than any change of size or
 * position: set in the same grotesque, at the same size, on the same baseline,
 * the mark read "norma cloud" with a 13px `scope` hiding underneath it.
 *
 * Mono is the right register rather than an arbitrary contrast — this is the
 * face the site already reserves for machine-recorded fact (commit hashes, run
 * ids, `baseline · main@a9f3e1`, every figure on a report), and Cloud is
 * precisely the tier that records. Measured: `cloud` is 120 units wide in
 * JetBrains Mono at 40px against 95.6 in the grotesque, so it sets at 32 to
 * hold the same box and leave the lockup's overall width unchanged.
 */
const MONO = "var(--font-mono-face, ui-monospace, SFMono-Regular, Menlo, monospace)";

/**
 * The stacked wordmark. Inherits its colour, so `text-clay` on the parent is
 * still how you colour it.
 */
export const WordmarkSVG = ({
  className = "",
  title,
}: {
  className?: string;
  /** Supply on standalone use; omit where a sibling already names the brand. */
  title?: string;
}) => (
  <svg
    viewBox={`0 ${MARK_TOP} ${W} ${MARK_BOTTOM - MARK_TOP}`}
    className={className}
    fill="currentColor"
    role={title ? "img" : "presentation"}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {title && <title>{title}</title>}
    <text
      x="0"
      y="21"
      fontFamily={FONT}
      fontSize="40"
      fontWeight="700"
      letterSpacing="-1.5"
      textLength={W}
      lengthAdjust="spacing"
    >
      norma
    </text>
    <text
      x="0"
      y="33"
      fontFamily={FONT}
      fontSize="13"
      fontWeight="400"
      letterSpacing={SCOPE_TRACK}
      textLength={SCOPE_ADVANCE}
      lengthAdjust="spacing"
    >
      scope
    </text>
  </svg>
);

/**
 * The Cloud lockup — `cloud` joins `norma` on the top line, and the tracked
 * `scope` runs beneath.
 *
 * The wordmark keeps its exact geometry: no separator, no third line, no second
 * shape, and `scope` stays a subscript. Everything that separates the tier word
 * from the brand name is carried by the setting of that one word — see MONO
 * above. That was chosen over seven structural alternatives (dropping `cloud` to
 * the stack's baseline, centring it at 26px, a hairline rule, an ink chip,
 * outlined type, and tracking `scope` out to `norma`'s full width) because the
 * typeface change alone fixes the misread, and it is the only one of the eight
 * that leaves the free wordmark untouched.
 *
 * It is also two lines tall, which is what lets the same drawing serve the nav,
 * a masthead and a social card without a separate compact version.
 */
export const CloudLockupSVG = ({
  dark = false,
  className = "",
  title,
}: {
  /** Lighten the mark and invert the second word, for the ink band. */
  dark?: boolean;
  className?: string;
  title?: string;
}) => {
  const mark = dark ? "#e0aca4" : "#a8736e";
  const word = dark ? "#ffffff" : "#111111";

  return (
    <svg
      /* Taller than the plain wordmark, and above the baseline rather than
         below: `norma` and `scope` are all x-height letters, but `cloud` has an
         `l` and a `d`, whose ascenders reach ~24 units over a baseline sitting
         at 21. A viewBox starting at 0 sheared the tops off both, which read as
         "cıoua". The headroom left over covers the fallback mono on machines
         that render before the webfont lands. */
      viewBox={`0 ${LOCKUP_TOP} ${LOCKUP_W} ${MARK_BOTTOM - LOCKUP_TOP}`}
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <g fill={mark}>
        <text
          x="0"
          y="21"
          fontFamily={FONT}
          fontSize="40"
          fontWeight="700"
          letterSpacing="-1.5"
          textLength={W}
          lengthAdjust="spacing"
        >
          norma
        </text>
        <text
          x="0"
          y="33"
          fontFamily={FONT}
          fontSize="13"
          fontWeight="400"
          letterSpacing={SCOPE_TRACK}
          textLength={SCOPE_ADVANCE}
          lengthAdjust="spacing"
        >
          scope
        </text>
      </g>
      <text
        x={CLOUD_X}
        y="21"
        fill={word}
        fillOpacity={dark ? 0.9 : 0.85}
        fontFamily={MONO}
        fontSize={CLOUD_SIZE}
        fontWeight="400"
        textLength={CLOUD_W}
        lengthAdjust="spacing"
      >
        cloud
      </text>
    </svg>
  );
};

/**
 * The icon — the app tile, used as the favicon and anywhere the lockup is too
 * wide to fit. The measuring line from the original mark is drawn as a plotted
 * score, because history is the thing Cloud has that a local run does not.
 */
export const IconSVG = ({ className = "", title }: { className?: string; title?: string }) => (
  <svg
    viewBox="0 0 48 48"
    className={className}
    role={title ? "img" : "presentation"}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {title && <title>{title}</title>}
    <rect width="48" height="48" rx="12" fill="#a8736e" />
    {/* The brand is a wordmark, so the tile is the wordmark's own first letter
        rather than a symbol. It was a cloud until 2026-08-06, which collided
        head-on with the paid tier being the one called Cloud. `textLength`
        pins the glyph so the tile is identical wherever FONT resolves. */}
    <text
      x="24"
      y="34.5"
      textAnchor="middle"
      fontFamily={FONT}
      fontSize="40"
      fontWeight="700"
      fill="#ffffff"
      textLength="23"
      lengthAdjust="spacingAndGlyphs"
    >
      n
    </text>
  </svg>
);
