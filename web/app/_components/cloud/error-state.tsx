"use client";

import { CloudTwin } from "./empty-state";
import surface from "../../_styles/surface.module.css";
import styles from "./error-state.module.css";

/**
 * What a Cloud page shows when it could not finish.
 *
 * **An error is not an empty result, and the difference is the whole point of
 * this file.** An empty state means the request completed and there is honestly
 * nothing to show — no runs in this range, nothing uploaded yet. This means the
 * page could not complete at all. Told the wrong way round, a customer reads
 * "nothing here" and concludes their data is gone, which is the most expensive
 * wrong impression this product can give. `docs/normascopeWeb.md` §5, "Error
 * states", is the source for the composition and the copy.
 *
 * **The figure does not move**, unlike every other twin on the site. See the
 * `repair` entry in `MOTION` (`twins.tsx`) for the argument: an idling drawing
 * beside "something went wrong" reads as work still in progress.
 *
 * **Nothing from the exception reaches the page.** No message, no stack, no
 * digest, no provider name, no identifier — PATHWAYS §10.7 5A.11 and the
 * `normascopeWeb.md` section above both require it, and Next already redacts
 * server errors in production for the same reason. The digest still exists on
 * the server log, which is where an operator should be looking anyway.
 *
 * **It renders its own `.surface`, and it does not try to draw the masthead.**
 * There is no `layout.tsx` above `/repos` or `/r/` — each page builds its own
 * chrome — so a thrown page takes the masthead down with it and this component
 * is the entire document body. Rebuilding the masthead here is not possible:
 * it needs the theme cookie, and an error boundary is a Client Component that
 * cannot read one. Without `data-theme` the surface follows the device, which
 * is the same three-state cascade every other Cloud page uses and the honest
 * fallback when the server's answer is unavailable.
 */
export function CloudErrorState({ retry }: { retry: () => void }) {
  return (
    <div className={`${surface.surface} ${styles.page}`}>
      <div className={styles.card}>
        <div className={styles.words}>
          <h1 className={styles.title}>The comparison needs another look</h1>
          <p className={styles.body}>
            Something on our side stopped this page from loading. Nothing you have uploaded has
            changed, and no credits were spent. Trying again is usually enough — if it is not, the
            run is still there and we can find it for you.
          </p>
          <div className={styles.actions}>
            {/* A button, not a link: `retry()` re-fetches and re-renders this
                boundary's children in place, so a transient failure recovers
                without a full navigation and without losing the URL. */}
            <button type="button" className={styles.primary} onClick={() => retry()}>
              Try again
            </button>
            {/* A plain anchor rather than `next/link`. `global-error` replaces
                the root layout, so there is no router beneath it to navigate
                with, and a soft navigation from a broken tree is the thing we
                are trying to escape. */}
            <a className={styles.secondary} href="/repos">
              Back to Cloud
            </a>
          </div>
        </div>
        <CloudTwin pose="repair" className={styles.twin} />
      </div>
    </div>
  );
}
