import type { ReactNode } from "react";
import { Twin, type TwinPose } from "../../(site)/_components/twins";
import surface from "../../_styles/surface.module.css";
import styles from "./empty-state.module.css";

/**
 * The two things a Cloud page shows when it has nothing to draw: a figure, and
 * a panel built around one.
 *
 * **What this replaces is a section that vanished.** The frame trend's overview
 * was rendered as `{overview && <section>…}`, so a range holding no runs
 * removed the whole block — including the range control that had just been used
 * to choose it. Picking 7d on a repository whose last run was a fortnight ago
 * deleted the buttons that would have taken you back to 30d, and the only way
 * out was the browser's Back. A control that destroys itself is worse than an
 * empty chart, because the reader cannot tell a missing feature from a missing
 * measurement.
 *
 * So an empty section keeps its heading and its controls, and puts this where
 * the chart would have gone.
 *
 * **The figure is a plain `Twin`, never a `TwinLink`.** Everyone who reaches
 * these pages is already signed into Cloud, so a `get cloud` sticker in front
 * of them would be selling something they have bought. The site's 404 declines
 * the sticker for the neighbouring reason.
 *
 * **Both tones are rendered and CSS hides one**, which is the pattern
 * `CloudMasthead` already uses for the wordmark and the endorsement. The theme
 * has three states — light, dark, and "follow the device" — and in the third
 * the server genuinely cannot know which ground the drawing will land on. The
 * rules live in `surface.module.css` beside every other three-state rule, so
 * there is one cascade rather than one per component, and `display: none` keeps
 * the hidden copy out of the accessibility tree.
 *
 * The twins live under `(site)/_components` because that is where they were
 * drawn. A route group is a URL fact, not a module boundary; the root
 * `not-found.tsx` imports across the same line for the same reason.
 */

/** One twin, drawn for whichever ground the viewer turns out to be on. */
export function CloudTwin({ pose, className = "" }: { pose: TwinPose; className?: string }) {
  return (
    <span className={`${styles.figure} ${className}`}>
      <Twin pose={pose} tone="ink" className={`${surface.onLight} ${styles.twin}`} />
      <Twin pose={pose} tone="cream" className={`${surface.onDark} ${styles.twin}`} />
    </span>
  );
}

export function CloudEmpty({
  pose,
  title,
  children,
}: {
  pose: TwinPose;
  /** One line, stated as fact. Not a heading — the section already has one. */
  title: string;
  /** What to do about it, if there is anything to do. */
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.words}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.body}>{children}</p>}
      </div>
      <CloudTwin pose={pose} />
    </div>
  );
}
