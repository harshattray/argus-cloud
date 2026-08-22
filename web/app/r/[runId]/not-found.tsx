import { readTheme } from "../../../lib/theme";
import styles from "./report.module.css";

/**
 * The refusal for a run that is not here, or not yours.
 *
 * **Same words as before, different status code.** Until 2026-08-23 the page
 * itself rendered this body and answered **HTTP 200** — nothing leaked, because
 * the body is identical whether the run exists or not, but everything that reads
 * status codes counted a refusal as a success: uptime monitoring, analytics, a
 * CDN, any future error budget. FUTURENORMA §4 Open decision 5, decided
 * 2026-08-23. The page calls `notFound()` now and this file is what renders.
 *
 * **The identical-body property is no longer a discipline.** It used to be a
 * promise that every call site passed the same props to one local component;
 * one call site passing something extra would have broken it quietly. A
 * `not-found` boundary **takes no props at all** (Next 16 says so explicitly),
 * so there is nothing a caller could vary. The thing that could differ per
 * tenant no longer exists.
 *
 * The theme is read here rather than handed down for the same reason: it comes
 * from the reader's own cookie and knows nothing about the run that was asked
 * for.
 *
 * **No way back, deliberately.** Every other dead end on this surface offers
 * one; this page is reached by share link as often as by a member, and the
 * holder of a dead share link has no repository list to be sent to.
 *
 * ── What the status cost, measured rather than assumed ──────────────────────
 *
 * **This body is rendered by the client, not by the server.** A `notFound()`
 * response in Next 16.3 is an error document: a real 404 with `noindex`, an
 * empty `<body>`, and this component in the flight payload for the browser to
 * render. Verified on a production build, and it is **not new** — `/legal/*`
 * has called `notFound()` since it shipped and answers exactly the same way.
 * It is not caused by the boundary being `async` or by reading the theme
 * either; both were tested with a static component and a plain build.
 *
 * So the trade the status change actually made: monitoring, analytics, a CDN
 * and any crawler now see a refusal for what it is, and a reader **with
 * JavaScript disabled** sees a blank page where they used to see this sentence
 * at HTTP 200. Both are dead ends; one of them is now counted correctly. Worth
 * revisiting if Next gains a way to server-render a not-found body.
 */
export default async function ReportNotFound() {
  const theme = await readTheme();
  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.notFound}>
        <h1>Not found</h1>
        <p>This report doesn&apos;t exist or the link is no longer valid.</p>
      </main>
    </div>
  );
}
