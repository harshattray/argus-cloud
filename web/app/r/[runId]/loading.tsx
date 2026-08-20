import { LoadingPanel } from "../../_components/cloud/loading";
import styles from "./report.module.css";

/**
 * Shown while a run report resolves.
 *
 * The report's own wait is not the database — it is presigning a URL for every
 * artifact on the run, which is per-object work that grows with how many frames
 * were uploaded. A twenty-frame run is sixty signatures before the first byte.
 */
export default function Loading() {
  return (
    <div className={styles.page}>
      <main className={styles.sheet}>
        <LoadingPanel label="Loading report" />
      </main>
    </div>
  );
}
