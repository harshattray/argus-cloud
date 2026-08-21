import { CREDITS_PER_ANALYSIS, CREDITS_PER_DEEP } from "argus-cloud/explainService.js";
import { authorize, loadRun, type FrameReport } from "argus-cloud/reportData.js";
import { getDb } from "../../../lib/db";
import { getStorage } from "../../../lib/storage";
import { readTheme } from "../../../lib/theme";
import { currentSession } from "../../../lib/session";
import { CloudFooter, CloudMasthead, type Crumb } from "../../_components/cloud/cloud-shell";
import { Explainer } from "../../_components/cloud/explainer";
import { FrameView } from "./frame-view";
import { HistoryStrip } from "./history-strip";
import { SharePanel } from "./share-panel";
import styles from "./report.module.css";

/**
 * The hosted run report (`BuildV5.md` Phase H).
 *
 * What it shows, and why each part is here:
 *
 *   - **H1** the build/reference/diff triptych, in the CLI report's visual
 *     language, with a lightbox — the page a customer actually looks at, which
 *     until now was 131 lines of numbers and no images.
 *   - **H2** findings with confidence, hypothesis, selector and code pointer,
 *     the "generated — verify" label, and the flagged regions drawn on the diff.
 *   - **H3** the history: first drift, recurrence, and a sparkline across prior
 *     runs. This is the only thing on the page a local run structurally cannot
 *     produce, so it sits above the images rather than in grey text below them.
 *   - **H4** share links, for an API that had no interface.
 *
 * **Everything rendered from the database is upload or model output —
 * untrusted.** React's default escaping is the E3 guarantee; nothing on this
 * page is passed through `dangerouslySetInnerHTML`, and the corpus is re-run
 * against this page rather than inherited from the one it replaces.
 *
 * Access is either a session that belongs to the run's organization or a share
 * token naming this one run; `NORMA_DEV_OPEN=1` opens it for local development.
 * `reportData.authorize` holds all three and says why the org list may only ever
 * come from the session.
 */

export const dynamic = "force-dynamic";

/** Same body for missing, revoked, expired and another org's run: a probe learns nothing. */
function NotFound({ theme }: { theme?: string }) {
  return (
    <div className={styles.page} data-theme={theme}>
      <main className={styles.notFound}>
        <h1>Not found</h1>
        <p>This report doesn&apos;t exist or the link is no longer valid.</p>
      </main>
    </div>
  );
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const { runId } = await params;
  const { share } = await searchParams;
  const theme = await readTheme();

  const db = await getDb();
  // Membership first, share token second — `authorize` takes the org list from
  // the session and never from the request. A member of one organization
  // holding a share link for another's run still gets the share view.
  const session = await currentSession();
  const access = await authorize(db, runId, share, {
    orgIds: session?.memberships.map((m) => m.orgId) ?? [],
  });
  if (!access) {
    return <NotFound theme={theme ?? undefined} />;
  }
  const run = await loadRun(db, await getStorage(), runId, access);
  if (!run) {
    return <NotFound theme={theme ?? undefined} />;
  }

  // The share token rides in the path the theme switch returns to, or changing
  // the theme on a shared report would bounce the viewer to "not found".
  const path = `/r/${runId}${share ? `?share=${encodeURIComponent(share)}` : ""}`;

  // Owner only. A share token names one run; a trail up to the repository would
  // name it and offer a link the holder cannot open.
  const crumbs: Crumb[] =
    access.viewer === "owner"
      ? [
          { label: run.orgName },
          { label: run.repoName, href: `/repos/${run.repoId}` },
          { label: run.commitSha ? run.commitSha.slice(0, 10) : "run" },
        ]
      : [];

  const flagged = run.frames.filter((f) => f.flagged).length;
  const worst = run.frames.reduce<number | null>(
    (max, f) => (f.alignedMismatchPercent === null ? max : Math.max(max ?? 0, f.alignedMismatchPercent)),
    null
  );

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.sheet}>
        <CloudMasthead
          title="Run report"
          crumbs={crumbs}
          theme={theme}
          path={path}
          meta={
            <>
              {run.branch && <>{run.branch} · </>}
              {run.commitSha && (
                <>
                  commit <code>{run.commitSha.slice(0, 10)}</code> ·{" "}
                </>
              )}
              <time dateTime={run.createdAt}>
                {run.createdAt.replace("T", " ").slice(0, 19)} UTC
              </time>
            </>
          }
        />

        {/*
          Every stat carries its own definition. The four numbers on this strip
          are the ones a reader is most likely to misread — "flagged" sounds like
          a failure and is not one, and "worst" is a maximum rather than an
          average — so the explanation belongs beside the number rather than on a
          page somewhere else.
        */}
        <div className={styles.stats}>
          <Stat value={String(run.frames.length)} label="Frames compared" explain="frames-compared" />
          <Stat
            value={String(flagged)}
            label="Flagged"
            explain="flagged"
            tone={flagged > 0 ? styles.danger : styles.success}
          />
          <Stat
            value={worst === null ? "n/a" : `${worst.toFixed(2)}%`}
            label="Worst aligned mismatch"
            explain="worst-mismatch"
          />
          <Stat
            value={run.threshold === null ? "n/a" : `${run.threshold}%`}
            label="Threshold"
            explain="threshold"
          />
        </div>

        {run.frames.length === 0 ? (
          <p className={styles.empty}>
            No compared frames in this run. A run with only skipped frames looks like this — nothing
            was measured, which is not the same as nothing being wrong.
          </p>
        ) : (
          <>
            <FrameNav frames={run.frames} />
            <div className={styles.frames}>
              {run.frames.map((frame, index) => (
                <Frame
                  key={frame.frame}
                  frame={frame}
                  anchor={anchorFor(index)}
                  runId={run.runId}
                  threshold={run.threshold}
                  viewer={access.viewer}
                />
              ))}
            </div>
          </>
        )}

        {access.viewer === "owner" && <SharePanel runId={run.runId} />}

        <CloudFooter>
          Deterministic comparison by <b>Normascope</b>. AI findings are guidance, not a verdict —
          they never change the score or the CI result.
        </CloudFooter>
      </main>
    </div>
  );
}

/**
 * Anchor ids are positional, never derived from the frame label.
 *
 * A label is upload-supplied: it can contain spaces, quotes, a `#`, or the same
 * text as another frame. Slugging it would produce ids that collide silently —
 * two frames, one anchor, and a jump link that goes to the wrong screenshot —
 * and building an id out of hostile text is a fragment-injection argument
 * nobody needs to have. The index is unique by construction.
 */
function anchorFor(index: number): string {
  return `frame-${index}`;
}

/**
 * Jump links to each frame on the page.
 *
 * A run with twenty frames is a very long page, and the thing a reviewer wants
 * is the flagged one — which `loadRun` has already sorted to the top, so this
 * list reads worst-first as well. Plain fragment links: no JavaScript, works
 * with the back button, and every entry says whether the frame passed before
 * the reader scrolls to it.
 */
function FrameNav({ frames }: { frames: FrameReport[] }) {
  if (frames.length < 2) {
    return null;
  }
  return (
    <nav className={styles.frameNav} aria-label="Frames in this run">
      <span className={styles.frameNavLabel}>Jump to</span>
      <ul>
        {frames.map((frame, index) => (
          <li key={frame.frame}>
            <a
              href={`#${anchorFor(index)}`}
              className={frame.flagged ? `${styles.frameNavLink} ${styles.flagged}` : styles.frameNavLink}
            >
              {frame.frame}
              <span className={styles.frameNavState}>{frame.flagged ? "flagged" : "pass"}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Stat({
  value,
  label,
  tone,
  explain,
}: {
  value: string;
  label: string;
  tone?: string;
  /** Glossary key. Named to match `CloudMasthead` and `Fact`, so one rule finds
      every component that forwards a term to an `<Explainer>`. */
  explain?: string;
}) {
  return (
    <div className={tone ? `${styles.stat} ${tone}` : styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>
        {explain ? (
          <Explainer term={explain} scope="run">
            {label}
          </Explainer>
        ) : (
          label
        )}
      </span>
    </div>
  );
}

function Frame({
  frame,
  anchor,
  runId,
  threshold,
  viewer,
}: {
  frame: FrameReport;
  anchor: string;
  runId: string;
  threshold: number | null;
  viewer: "owner" | "share";
}) {
  return (
    <section className={styles.frame} id={anchor}>
      <div className={styles.frameHead}>
        <h2 className={styles.frameName}>{frame.frame}</h2>
        <span className={`${styles.status} ${frame.flagged ? styles.flagged : styles.clean}`}>
          {frame.flagged ? "flagged" : "pass"}
        </span>
      </div>
      {/*
        Three quantities on one line, and a reader has no way to tell which one
        is the headline. Each is its own defined term rather than one definition
        for the line: the question people actually have is "what is SSIM", not
        "what is this row".
      */}
      <p className={styles.frameNumbers}>
        <Explainer term="aligned-diff" scope={anchor}>
          aligned mismatch{" "}
          {frame.alignedMismatchPercent === null ? "n/a" : `${frame.alignedMismatchPercent.toFixed(2)}%`}
        </Explainer>{" "}
        ·{" "}
        <Explainer term="ssim" scope={anchor}>
          SSIM {frame.structuralSimilarity === null ? "n/a" : frame.structuralSimilarity.toFixed(3)}
        </Explainer>{" "}
        ·{" "}
        <Explainer
          term={frame.mode === "fidelity" ? "fidelity-mode" : "baseline-mode"}
          scope={anchor}
        >
          {frame.mode}/{frame.source}
        </Explainer>
      </p>

      {frame.alignedMismatchPercent !== null && threshold !== null && (
        <Meter value={frame.alignedMismatchPercent} threshold={threshold} flagged={frame.flagged} />
      )}

      {frame.history !== null && (
        <HistoryStrip
          history={frame.history}
          threshold={threshold}
          frame={frame.frame}
          anchor={anchor}
        />
      )}

      <FrameView
        runId={runId}
        frame={frame.frame}
        anchor={anchor}
        flagged={frame.flagged}
        images={frame.images}
        regions={frame.regions}
        initialFindings={frame.findings}
        viewer={viewer}
        analysisCredits={CREDITS_PER_ANALYSIS}
        deepCredits={CREDITS_PER_DEEP}
      />
    </section>
  );
}

/**
 * The threshold sits at the halfway mark, so the eye reads "how far past the
 * line" without having to compare two numbers. Copied from the CLI report's
 * meter (`Argus/src/report.ts`) rather than re-derived.
 */
function Meter({ value, threshold, flagged }: { value: number; threshold: number; flagged: boolean }) {
  const pct = threshold > 0 ? Math.min(100, (value / threshold) * 50) : value > 0 ? 100 : 0;
  return (
    <div className={styles.meter}>
      <div
        className={styles.meterTrack}
        role="img"
        aria-label={`${value.toFixed(2)}% against a ${threshold}% threshold`}
      >
        <div
          className={`${styles.meterFill} ${flagged ? styles.over : styles.under}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
        <div className={styles.meterMark} style={{ left: "50%" }} />
      </div>
      {/*
        `role="img"` stayed on the bar rather than the whole meter. Anything
        interactive inside an image role is unreachable — the element is
        announced as one graphic with alt text and its children stop existing —
        so the bar keeps the role and the legend beside it is ordinary text.
      */}
      <span className={styles.meterLegend}>threshold {threshold}%</span>
    </div>
  );
}
