import { explainer } from "../../../lib/glossary";
import styles from "../../_styles/surface.module.css";

/**
 * The small "?" beside a number, and the definition it opens.
 *
 * **Why this exists.** Every figure on a Cloud page is the output of a decision
 * somebody made — aligned rather than raw, first drift rather than latest drift,
 * a gap rather than a zero. Those decisions are all documented, in this repo and
 * on `/report`, and none of them were reachable from the page showing the
 * number. A prospect looking at "0.26% · SSIM 98.7 · baseline/baseline" had no
 * way to find out what any of it meant without leaving the report.
 *
 * **Three constraints shaped the implementation, in this order.**
 *
 * 1. **No client JavaScript.** `/repos/` renders entirely on the server and
 *    `FinishedSPEC.md` §3v claims exactly that; a `useState` tooltip would make
 *    that sentence false and put a hydration boundary around a chart that
 *    currently arrives in the first byte. So this is the native HTML popover:
 *    `popovertarget` on a plain `<button>`. The browser supplies the top layer,
 *    light dismiss, Escape, and focus handling, and ships no bytes to do it.
 *
 * 2. **No inline styles.** `style-src-attr 'unsafe-inline'` is still on for these
 *    trees (PATHWAYS carried-forward item 2) and is not an invitation to add
 *    more. Positioning comes from this module's stylesheet, not from a `style`
 *    attribute, so nothing here widens the CSP.
 *
 * 3. **`overflow: hidden` must not clip it.** `.card` hides overflow and
 *    `.tableWrap` scrolls; a positioned `<div>` inside either would be cut off
 *    or would drag a scrollbar. A popover renders in the top layer, outside both.
 *
 * **What happens where anchor positioning is missing.** A popover with no
 * positioning rules is centred in the viewport by the UA stylesheet, so the
 * fallback is a centred card rather than a broken one — which is why the anchored
 * rules sit behind `@supports` instead of being the only rules. Both looks are
 * deliberate; neither is a degraded tooltip stuck in a corner.
 *
 * **The text is never written here.** It comes from `lib/glossary.ts`, which the
 * public `/report` page also prints. A definition kept in two places is a
 * definition that will disagree with itself, and the copy a prospect reads
 * before they sign up is the one that has to match what they read after.
 */

export function Explainer({
  term,
  scope,
  label,
}: {
  /** A key in `GLOSSARY` or `CLOUD_GLOSSARY`. Unknown keys throw at render. */
  term: string;
  /**
   * Disambiguator for pages that render the same term more than once — a frame
   * index, a column name. Element ids must be unique on a page, and a report
   * with twelve frames explains "SSIM" twelve times.
   *
   * Must be id-safe. Callers pass indices and fixed slugs, never a frame label:
   * a label is upload-supplied and would put hostile text in an attribute that
   * another attribute has to reference by value.
   */
  scope?: string | number;
  /** Overrides the accessible name where the term alone would read oddly. */
  label?: string;
}) {
  const entry = explainer(term);
  const id = `x-${scope === undefined ? "" : `${scope}-`}${term}`;
  return (
    <span className={styles.explainer}>
      <button
        type="button"
        className={styles.explainerTrigger}
        popoverTarget={id}
        aria-label={label ?? `What does “${entry.term}” mean?`}
      >
        <span aria-hidden="true">?</span>
      </button>
      {/*
        `role="note"` rather than `tooltip`: a tooltip is a transient label for
        the control it hangs off, and this is a paragraph the reader dismisses
        when they are done with it. Screen readers announce it on open either
        way; `note` is the one that does not promise it will disappear on blur.
      */}
      <span id={id} popover="auto" role="note" className={styles.explainerBubble}>
        <span className={styles.explainerTerm}>{entry.term}</span>
        <span className={styles.explainerDef}>{entry.def}</span>
      </span>
    </span>
  );
}
