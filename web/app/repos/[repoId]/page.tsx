import Link from "next/link";
import {
  MAX_FRAMES_LISTED,
  pageNumber,
  repoOrg,
  repoOverview,
  repoViewOpen,
  SPARK_POINTS,
  type FrameSummary,
  type RepoOverview,
  type SparkPoint,
} from "argus-cloud/trendData.js";
import { getDb } from "../../../lib/db";
import { readTheme } from "../../../lib/theme";
import { currentSession, membershipFor } from "../../../lib/session";
import { CloudFooter, CloudMasthead } from "../../_components/cloud/cloud-shell";
import { AccountMenu } from "../../_components/cloud/account-menu";
import { Explainer } from "../../_components/cloud/explainer";
import { Sparkline } from "../sparkline";
import styles from "../trends.module.css";

/**
 * The repository view — `BuildV5.md` Phase I, I1.
 *
 * **This is the first page above `/r/{runId}`.** Until now the only way to find
 * a run was to already hold its URL, which PATHWAYS carried that as an open item
 * against the report page. A repository has runs, a run has frames, and a frame
 * has a trend; this page is the middle of that.
 *
 * **Everything on it is cross-run**, which is the point and also the reason it
 * is gated differently from the report page. `repoViewOpen` explains why a share
 * token cannot open it.
 *
 * Server-rendered throughout, including the sparklines. Frame labels and commit
 * messages arrive from uploads and are rendered as React text nodes, which
 * escape unconditionally; nothing here uses `dangerouslySetInnerHTML`.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Repository — Normascope Cloud",
  robots: { index: false, follow: false },
};

/** The same body a nonexistent repository gets, for the same reason as `/r/`. */
function NotFound({ theme }: { theme?: string }) {
  return (
    <div className={styles.page} data-theme={theme}>
      <main className={styles.notFound}>
        <h1>Not found</h1>
        <p>This repository doesn&apos;t exist or you don&apos;t have access to it.</p>
      </main>
    </div>
  );
}

export default async function RepoPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { repoId } = await params;
  const { page: pageParam } = await searchParams;
  const theme = await readTheme();

  const db = await getDb();
  const owner = await repoOrg(db, repoId);
  if (!owner) {
    return <NotFound theme={theme ?? undefined} />;
  }

  // Membership in the organization that owns this repository, or the local
  // development door. The org id is read from the repository row and compared
  // against what the *session* holds — a repository id in the URL is a request,
  // not a permission (PATHWAYS §10.7 5A).
  //
  // The refusal is the same "not found" a nonexistent repository gets, so
  // probing ids cannot map out another tenant.
  const session = await currentSession();
  const permitted = membershipFor(session, owner.orgId) !== null || repoViewOpen();
  if (!permitted) {
    return <NotFound theme={theme ?? undefined} />;
  }
  const page = pageNumber(pageParam);
  const overview = await repoOverview(db, { orgId: owner.orgId, repo: owner.id, page });
  if (!overview) {
    return <NotFound theme={theme ?? undefined} />;
  }

  const flaggedNow = overview.frames.filter((f) => f.flagged).length;

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.sheet}>
        {/*
          The organization is the top of the trail, and since Step 6 it is a
          link: `/repos` lists what the tenant has, which needed a session to
          know whose organization was asking. It stays unlinked for the
          development door, where there is no session and the list would 404.

          It earns its place twice over: it is the only surface that names the
          tenant, which is what makes `seed-demo`'s "DEMO — … (sample data)"
          organization announce itself on every page of a walkthrough.
        */}
        <CloudMasthead
          title={overview.repo.name}
          crumbs={[
            session ? { label: owner.orgName, href: "/repos" } : { label: owner.orgName },
            { label: overview.repo.name },
          ]}
          theme={theme}
          path={`/repos/${owner.id}${page > 1 ? `?page=${page}` : ""}`}
          account={
            /* Nothing for the development door: it has no session, so there is
               nobody to name and nobody to sign out. */
            session ? <AccountMenu signedInAs={session.user.display_name} /> : undefined
          }
          meta={
            <>
              {overview.totalRuns} committed run{overview.totalRuns === 1 ? "" : "s"} ·{" "}
              {overview.frames.length} frame{overview.frames.length === 1 ? "" : "s"} tracked
            </>
          }
        />

        <div className={styles.stats}>
          <Stat value={String(overview.totalRuns)} label="Runs" explain="run" />
          <Stat value={String(overview.frames.length)} label="Frames" explain="frame" />
          {/*
            Frames whose *own* most recent run flagged them — not the flagged
            count of the newest run, which is a different number whenever a
            frame was skipped. The label says which one it is, and the label is
            also the thing you click for the longer answer — which is the one
            place a reader who doubts the number will look.
          */}
          <Stat
            value={String(flaggedNow)}
            label="Frames flagged now"
            explain="flagged-now"
            tone={flaggedNow > 0 ? styles.danger : styles.success}
          />
        </div>

        {overview.totalRuns === 0 ? <Empty /> : <Runs overview={overview} />}

        {overview.frames.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                <Explainer term="frame" scope="frames">
                  Frames
                </Explainer>
              </h2>
              <p className={styles.sectionNote}>
                <Explainer term="sparkline" scope="frames">
                  Up to the last {SPARK_POINTS} runs of each frame, oldest first.
                </Explainer>{" "}
                Hover a point for its run; open one for its full trend.
              </p>
            </div>
            <div className={styles.frames}>
              {overview.frames.map((frame) => (
                <FrameRow key={frame.frame} repoId={overview.repo.id} frame={frame} />
              ))}
            </div>
            {/*
              The cap is by name, in the database, and this says so. Claiming
              "the 60 worst" would be a promise the query cannot keep: working
              out which frames are worst is exactly what reading all of them is
              for, and reading all of them is what the cap exists to avoid.
            */}
            {overview.framesTruncated && (
              <p className={styles.caveat}>
                Showing the first {MAX_FRAMES_LISTED} frames by name — this repository has more.
                Within them, the worst sort first.
              </p>
            )}
          </section>
        )}

        <CloudFooter>
          Runs, frames and history are held by <b>Normascope Cloud</b>. A local run only knows about
          itself.
        </CloudFooter>
      </main>
    </div>
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
          <Explainer term={explain} scope="repo">
            {label}
          </Explainer>
        ) : (
          label
        )}
      </span>
    </div>
  );
}

/**
 * I1.2 — an honest empty state that names the next action.
 *
 * "No runs yet" on its own is a dead end: the reason a repository row exists
 * with nothing in it is almost always that somebody set up a key and has not
 * uploaded, and the command is the answer to why they are here.
 */
function Empty() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Runs</h2>
      </div>
      <p className={styles.empty}>
        Nothing has been uploaded to this repository yet. Trends need past runs — the first upload
        starts the history, and the second one draws a line.
      </p>
      <code className={styles.emptyCommand}>npx norma-scope upload</code>
    </section>
  );
}

function Runs({ overview }: { overview: RepoOverview }) {
  const pages = Math.max(1, Math.ceil(overview.totalRuns / overview.pageSize));
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>
          <Explainer term="run" scope="runs">
            Runs
          </Explainer>
        </h2>
        <p className={styles.sectionNote}>
          Newest first.{" "}
          <Explainer term="pending-run" scope="runs">
            Pending uploads are not listed.
          </Explainer>
        </p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.runs}>
          <thead>
            <tr>
              <th>
                <Explainer term="commit" scope="runs">
                  Commit
                </Explainer>
              </th>
              <th>Branch</th>
              <th>When</th>
              <th className={styles.num}>
                <Explainer term="frames-compared" scope="runs">
                  Compared
                </Explainer>
              </th>
              <th className={styles.num}>
                <Explainer term="flagged" scope="runs">
                  Flagged
                </Explainer>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {overview.runs.map((run) => (
              <tr key={run.runId}>
                <td>
                  {run.commitSha ? (
                    <code>{run.commitSha.slice(0, 10)}</code>
                  ) : (
                    <span className={styles.muted}>none</span>
                  )}
                </td>
                <td>{run.branch || <span className={styles.muted}>—</span>}</td>
                <td>
                  <time dateTime={run.createdAt}>{run.createdAt.replace("T", " ").slice(0, 16)}</time>
                </td>
                <td className={styles.num}>{run.compared}</td>
                <td className={styles.num}>
                  <span className={run.flagged > 0 ? styles.pillFlagged : styles.pillClean}>
                    {run.flagged}
                  </span>
                </td>
                <td>
                  <Link href={`/r/${run.runId}`}>Report</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/*
        A page past the end is empty on purpose — the offset is clamped rather
        than snapped back to the last real page, because answering `?page=99999`
        with real data is worse than answering it with nothing. An empty table
        and a "Page 3 of 2" pager underneath it reads as a bug, so it says which
        of the two happened.
      */}
      {overview.runs.length === 0 && (
        <p className={styles.empty}>
          No runs on this page. This repository has {overview.totalRuns}, ending on page {pages}.
        </p>
      )}
      {pages > 1 && (
        <nav className={styles.pager} aria-label="Runs pagination">
          {overview.page > 1 ? (
            <Link href={`/repos/${overview.repo.id}?page=${overview.page - 1}`}>← Newer</Link>
          ) : (
            <span className={styles.pagerState}>← Newer</span>
          )}
          <span className={styles.pagerState}>
            {overview.page > pages
              ? `Past the last page · ${pages} pages · ${overview.pageSize} per page`
              : `Page ${overview.page} of ${pages} · ${overview.pageSize} per page`}
          </span>
          {overview.page < pages ? (
            <Link href={`/repos/${overview.repo.id}?page=${overview.page + 1}`}>Older →</Link>
          ) : (
            <span className={styles.pagerState}>Older →</span>
          )}
        </nav>
      )}
    </section>
  );
}

/**
 * What one sparkline dot says when it is hovered.
 *
 * Built here rather than in `Sparkline` because the two charts that use it know
 * different things — the repository view has each run's commit and date, and the
 * report page's history strip has its own set. The component takes the finished
 * line and never has to learn either shape.
 *
 * A run with no `frame_stats` row is `undefined` here rather than an entry with
 * empty fields, and gets no tooltip. A tooltip reading "— · 0.00%" is worse than
 * none: it looks like an answer.
 */
function sparkLabel(at: SparkPoint | undefined, value: number | null): string | undefined {
  if (!at || value === null) {
    return undefined;
  }
  const commit = at.commitSha ? at.commitSha.slice(0, 10) : "no commit";
  const against = at.threshold === null ? "no threshold" : `threshold ${at.threshold}%`;
  return `${commit} · ${at.createdAt.slice(0, 10)} · ${value.toFixed(2)}% · ${against}${at.flagged ? " · flagged" : ""}`;
}

function FrameRow({ repoId, frame }: { repoId: string; frame: FrameSummary }) {
  const measured = frame.points.filter((p): p is number => p !== null);
  return (
    <div className={styles.frameRow}>
      <div>
        <Link
          className={styles.frameName}
          href={`/repos/${repoId}/trend?frame=${encodeURIComponent(frame.frame)}`}
        >
          {frame.frame}
        </Link>
        <p className={styles.frameMeta}>
          {frame.mode}/{frame.source} ·{" "}
          {frame.alignedMismatchPercent === null
            ? "not measured on the latest run"
            : `${frame.alignedMismatchPercent.toFixed(2)}% aligned mismatch`}
          {frame.flagged ? " · flagged" : ""}
        </p>
      </div>
      {measured.length >= 2 ? (
        <Sparkline
          points={frame.points}
          breaks={frame.breaks}
          threshold={frame.threshold}
          frame={frame.frame}
          labels={frame.points.map((value, i) => sparkLabel(frame.runsAt[i], value))}
        />
      ) : (
        <span className={styles.muted}>needs 2 runs</span>
      )}
    </div>
  );
}
