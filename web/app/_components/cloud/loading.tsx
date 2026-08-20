import styles from "../../_styles/surface.module.css";

/**
 * The waiting indicator: the Yutic mark, still, inside a ring that turns.
 *
 * ── Why the mark does not move ───────────────────────────────────────────────
 *
 * `yutic-brand/yutic-brand-orange/yutic-brand-rules.txt` §01:
 *
 * > A fan of five peacock feathers, each with an eye. **Never rotated,
 * > reordered, stretched, recoloured or given effects.** Clearspace = one eye
 * > diameter. Minimum 28px wide; below that drop the quill and base.
 *
 * A spinning logo breaks that twice over — it is a rotation *and* an effect. So
 * the identity is the mark and the motion is a separate ring drawn around it,
 * which is the common pattern anyway and costs nothing to read.
 *
 * **This is a rule that can be overridden, and there is precedent for how.**
 * §09 read "never in product headers or app UI" until Harsha decided otherwise
 * on 2026-08-20, and the rules file was edited in the same change so the book
 * and the code did not disagree. If a turning mark is wanted, that is the route:
 * decide it, write it down, then swap `.spinRing` for a transform on the image.
 * Not something to do quietly, because a brand book that the product silently
 * ignores stops being a brand book.
 *
 * ── The other rules this honours ─────────────────────────────────────────────
 *
 *   - **Clearspace is one eye diameter.** The eye is 23 of the file's 164 × 177
 *     units, so the ring sits at least `23/144.5` of the artwork's width clear
 *     of it — `--yutic-clearspace` below.
 *   - **Minimum 28px wide**, and the rule says to drop the quill and base below
 *     that. Rather than ship a second asset for a case nobody needs, the mark
 *     here is never rendered under 28px: `sm` is exactly 28.
 *   - **Not recoloured.** The ring takes the product's accent; the file is
 *     served as-is.
 *
 * ── Motion ───────────────────────────────────────────────────────────────────
 *
 * `prefers-reduced-motion` stops the rotation and leaves a static ring. A
 * spinner that keeps spinning for someone who asked it not to is the one
 * accessibility failure that is also a health issue.
 *
 * The label is real text, not `aria-label` on a decorative div, so a screen
 * reader announces what is happening rather than "image".
 */

export function Loading({
  label = "Loading",
  size = "md",
}: {
  /** Said out loud, and shown beside the ring at `md` and above. */
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={size === "sm" ? `${styles.spinner} ${styles.spinnerSm}` : styles.spinner}>
        <span className={styles.spinRing} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.spinMark} src="/yutic-mark.svg" alt="" aria-hidden="true" />
      </span>
      <span className={size === "sm" ? styles.visuallyHidden : styles.loadingLabel}>{label}…</span>
    </div>
  );
}

/**
 * A full-section placeholder, for a route segment that is still resolving.
 *
 * Sized to roughly the height of what it replaces, so the page does not jump
 * when the real content lands.
 */
export function LoadingPanel({ label }: { label?: string }) {
  return (
    <div className={styles.loadingPanel}>
      <Loading label={label} />
    </div>
  );
}
