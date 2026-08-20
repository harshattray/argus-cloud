import type { ReactNode } from "react";
import { explainer } from "../../../lib/glossary";
import styles from "../../_styles/surface.module.css";

/**
 * A word on the page that can explain itself.
 *
 * ```tsx
 * <Explainer term="ssim" scope={anchor}>SSIM {value}</Explainer>
 * ```
 *
 * **The term is the control. There is no icon.** The first version appended a
 * small circled "?" to every label, which put 103 question marks on a
 * seven-frame report — Harsha's verdict, and the right one: a page speckled with
 * query glyphs reads as a page that is unsure of itself, and the noise scaled
 * with the number of frames rather than with the number of ideas. Wrapping the
 * word instead adds no glyph at all. The affordance is a dotted underline, which
 * is what a defined term has looked like since print.
 *
 * It also fixed an alignment problem that kept recurring: a separate icon is its
 * own flex item, so in a wrapping row it broke onto the next line away from the
 * thing it explained. A trigger that *is* the text cannot come apart from it.
 *
 * **Three constraints shaped the mechanism, in this order.**
 *
 * 1. **No client JavaScript.** `/repos/` renders entirely on the server and
 *    `FinishedSPEC.md` §3v claims exactly that; a `useState` tooltip would make
 *    that sentence false and put a hydration boundary around a chart that
 *    currently arrives in the first byte. So this is the native HTML popover:
 *    `popovertarget` on a plain `<button>`. The browser supplies the top layer,
 *    light dismiss, Escape and focus handling, and ships nothing to do it.
 *
 * 2. **No inline styles.** `style-src-attr 'unsafe-inline'` is still on for these
 *    trees (PATHWAYS carried-forward item 2) and is not an invitation to add
 *    more. Positioning comes from this module's stylesheet.
 *
 * 3. **`overflow: hidden` must not clip it.** `.card` hides overflow and
 *    `.tableWrap` scrolls; a positioned `<div>` inside either would be cut off
 *    or would drag a scrollbar. A popover renders in the top layer, outside both.
 *
 * **What happens where anchor positioning is missing.** A popover with no
 * positioning rules is centred in the viewport by the UA stylesheet, so the
 * fallback is a centred card rather than a broken one — which is why the
 * anchored rules sit behind `@supports` instead of being the only rules.
 *
 * **The text is never written here.** It comes from `lib/glossary.ts`, which the
 * public `/report` page also prints. A definition kept in two places is a
 * definition that will disagree with itself, and the copy a prospect reads
 * before they sign up is the one that has to match what they read after.
 */

export function Explainer({
  term,
  scope,
  children,
}: {
  /** A key in `GLOSSARY` or `CLOUD_GLOSSARY`. Unknown keys throw at render. */
  term: string;
  /**
   * Disambiguator for pages that render the same term more than once — a frame
   * index, a column name. Element ids must be unique on a page, and a report
   * with twelve frames names "SSIM" twelve times.
   *
   * Must be id-safe. Callers pass indices and fixed slugs, never a frame label:
   * a label is upload-supplied and would put hostile text in an attribute that
   * another attribute has to reference by value.
   */
  scope?: string | number;
  /** The words being defined. This is what the reader clicks. */
  children: ReactNode;
}) {
  const entry = explainer(term);
  const id = `x-${scope === undefined ? "" : `${scope}-`}${term}`;
  return (
    <>
      {/*
        `aria-describedby` earns its place even though the bubble is
        `display: none` until opened: a hidden element referenced this way is
        still announced, so a screen reader gets the definition with the term
        and never has to find the popover at all.
      */}
      <button type="button" className={styles.explainerTerm} popoverTarget={id} aria-describedby={id}>
        {children}
      </button>
      {/*
        `role="note"` rather than `tooltip`: a tooltip is a transient label for
        the control it hangs off, and this is a paragraph the reader dismisses
        when they are done with it. `note` is the one that does not promise it
        will disappear on blur.
      */}
      <span id={id} popover="auto" role="note" className={styles.explainerBubble}>
        <span className={styles.explainerHead}>{entry.term}</span>
        <span className={styles.explainerDef}>{entry.def}</span>
      </span>
    </>
  );
}
