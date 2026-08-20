import { LoadingPanel } from "../../../_components/cloud/loading";
import styles from "../../trends.module.css";

/**
 * Shown while the trend page resolves.
 *
 * **This route is where a wait is actually visible.** It is `force-dynamic` and
 * every control on it is a navigation — the range ladder, the detail sizes, the
 * table pager, and the brush, which pushes a new URL on every drag. Reading a
 * 90-day overview plus up to `MAX_TREND_POINTS` exact runs is the heaviest query
 * pair in the product, and without this the page simply sat on the old content
 * with nothing to say it had heard the click.
 *
 * The App Router renders this in place of the segment while it streams, so it
 * costs no client JavaScript of its own.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <main className={styles.sheet}>
        <LoadingPanel label="Reading history" />
      </main>
    </div>
  );
}
