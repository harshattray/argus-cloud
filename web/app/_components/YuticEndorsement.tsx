/**
 * The parent-brand endorsement: "A product from" followed by the Yutic lockup.
 *
 * Not a link — a mention. Nothing here is clickable.
 *
 * ── The asset ───────────────────────────────────────────────────────────────
 *
 * The mark is the five-feather fan (Brand Identity v1.0, §01). It is served as
 * a file rather than rebuilt in HTML: the fan is real artwork, not two glyphs
 * and a gap, so there is nothing to reconstruct. Only the wordmark is set live,
 * in DM Mono — the face the kit specifies for it (§04).
 *
 * Measured off `yutic-mark.svg`, in its own 164 × 177 viewBox units:
 *
 *   visible artwork   x 9.76 … 154.24   y 10 … 167   (144.5 × 157)
 *   the fan alone     y 10 … 114        (104 tall — the quill hangs below)
 *   one eye           23 across         (r=11.5, the clearspace unit)
 *
 * So the file carries ~9.8 units of transparent margin left and right, which is
 * subtracted from the CSS gaps below to leave the *ink* correctly spaced.
 *
 * ── The scale ───────────────────────────────────────────────────────────────
 *
 * §09 governs this use: the lockup matches the product's footer type and is
 * never larger than the product's own wordmark. Footer body copy is 13.5px, so
 * that is the wordmark's size; Normascope's own footer wordmark renders 21.5px
 * tall against this lockup's 12px, so the ceiling holds with room to spare.
 *
 * §02's proportions are taken off the book's own rendered lockups rather than
 * its prose. The prose puts the fan at the wordmark's full height with a gap of
 * one eye-width; every lockup the book actually renders — the §02 primary and
 * the §09 endorsement line, which agree with each other to within a pixel —
 * sets the mark's ink at 1.27 × cap height and the gap at a full cap height.
 * Where a stated number and the artwork disagree, the artwork is what people
 * will compare this against, so:
 *
 *   cap height   13.5 × 0.70 (DM Mono)            =  9.45px
 *   mark ink     1.27 × cap                       = 12.0px
 *   mark box     12.0 × 177/157                   = 13.5px  ← the `<img>`
 *   gap, ink     1.00 × cap                       =  9.45px
 *   gap, CSS     9.45 − 0.74 margin − 0.22 lsb    =  8.5px
 *
 * Clearspace is one eye — 1.75px at this scale — and the 8.5px gaps clear it
 * five times over. Tracking is −0.02em, the kit's value below 20px (§04); the
 * −0.035em on the lockup file is its display-size setting.
 *
 * The 28px minimum in §01 is for the mark standing alone, and the "drop the
 * quill below 24px" rule in §07 is for favicons. The book's own endorsement
 * line runs the complete mark at roughly half that, which is what this is.
 *
 * ── The rest of the rules this obeys ────────────────────────────────────────
 *
 * - Appears once per surface, never in a product header or in app UI (§09) —
 *   the site footer and the pitch footer, nothing on `/r/[runId]`.
 * - The mark is served unmodified: never rotated, stretched, recoloured or
 *   given effects (§01), and at full opacity, since dimming it would shift
 *   #E8641C toward the ground. Dark grounds swap to the approved reversal
 *   file, which is the only sanctioned recolour — it flips the quill and the
 *   centre feather from shaft to #F3EEE7 and inverts that feather's eye ring,
 *   leaving the four orange and peach feathers exactly as they are.
 *
 * ── The badge ───────────────────────────────────────────────────────────────
 *
 * Mark and wordmark are sealed into one raised glass rectangle; "A product
 * from" stays outside it, so the badge contains the lockup and nothing else.
 * 8px corners, and 9 × 5.86px of padding — clearspace is one eye, 1.75px at
 * this scale, so the glass edge stays five times clear of the fan.
 *
 * Nothing in the badge is feather orange, which is what §09 requires: the only
 * orange on the surface is the four feathers of the mark itself. Normascope's
 * clay and peach are precisely the "product's palette already uses a warm hue"
 * case that rule is written for.
 *
 * The frost is behind the lockup and never over it: a translucent film across
 * the mark would pull #E8641C toward the ground, which §01 counts as a
 * recolour. The mark itself carries no shadow, blur or opacity of its own.
 *
 * `backdrop-filter` is declared but both footers are flat fills, so it has
 * nothing to blur and earns nothing today — the raise comes from the gradient,
 * the inset top highlight and the drop shadow. It is kept for the day a
 * gradient or image lands behind either footer.
 */

/** Fill, edge and lift for each ground. Values are per-tone rather than
 *  opacity-swapped, because white at 8% on ink is not the same object as white
 *  at 80% on sand — one is a sheen, the other is glass. */
const GLASS = {
  light: {
    background: "linear-gradient(180deg, rgba(255,255,255,.80), rgba(255,255,255,.44))",
    border: "1px solid rgba(255,255,255,.85)",
    boxShadow:
      "0 1px 1px rgba(17,17,17,.04), 0 6px 16px -4px rgba(17,17,17,.18), inset 0 1px 0 rgba(255,255,255,.95)",
  },
  dark: {
    background: "linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.05))",
    border: "1px solid rgba(255,255,255,.13)",
    boxShadow:
      "0 1px 1px rgba(0,0,0,.3), 0 7px 20px -5px rgba(0,0,0,.68), inset 0 1px 0 rgba(255,255,255,.16)",
  },
} as const;

export const YuticEndorsement = ({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) => (
  <p
    className={`flex items-center gap-[10px] ${
      tone === "dark" ? "text-white/45" : "text-text/45"
    } ${className}`}
  >
    <span className="text-[13.5px] leading-none">A product from</span>

    <span
      className="inline-flex items-center gap-[8.5px] rounded-[8px] px-[9px] py-[5.86px] backdrop-blur-[10px] backdrop-saturate-150"
      style={GLASS[tone]}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tone === "dark" ? "/yutic-mark-reversed.svg" : "/yutic-mark.svg"}
        alt=""
        aria-hidden
        className="h-[13.5px] w-auto"
      />

      <span
        className={`text-[13.5px] leading-none ${
          tone === "dark" ? "text-[#F3EEE7]" : "text-[#16130F]"
        }`}
        style={{ fontFamily: "var(--font-yutic)", fontWeight: 500, letterSpacing: "-0.02em" }}
      >
        Yutic
      </span>
    </span>
  </p>
);
