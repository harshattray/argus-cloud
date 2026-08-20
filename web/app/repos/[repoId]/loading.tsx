import { LoadingPanel } from "../../_components/cloud/loading";
import styles from "../trends.module.css";

/** Shown while the repository view resolves — its runs page and every frame's sparkline. */
export default function Loading() {
  return (
    <div className={styles.page}>
      <main className={styles.sheet}>
        <LoadingPanel label="Reading repository" />
      </main>
    </div>
  );
}
