import { createHash } from "node:crypto";
import { getDb } from "../../../lib/db";
import { ExplainPanel } from "./explain-panel";

/**
 * Hosted report page (Stage 4 item 3 + Build 4.0 D1). Access is share-token
 * gated (revocable, expiring) until session auth (GitHub OAuth / magic
 * links) lands; NORMA_DEV_OPEN=1 opens it for local dev only.
 *
 * Everything rendered from the database is model output or user upload —
 * untrusted. React's default escaping is the E3 guarantee here; nothing is
 * ever passed through dangerouslySetInnerHTML.
 */

interface FrameStat {
  frame: string;
  mode: string;
  source: string;
  aligned_mismatch_percent: number | null;
  structural_similarity: number | null;
  flagged: boolean;
}

interface StoredFinding {
  frame: string;
  findings: unknown;
}

async function authorized(runId: string, share: string | undefined): Promise<boolean> {
  if (process.env.NORMA_DEV_OPEN === "1") {
    return true;
  }
  if (!share) {
    return false;
  }
  const db = await getDb();
  const hash = createHash("sha256").update(share).digest("hex");
  const row = (
    await db.query<{ id: string }>(
      `SELECT id FROM share_links
       WHERE run_id = $1 AND token_hash = $2 AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [runId, hash]
    )
  ).rows[0];
  return row !== undefined;
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

  if (!(await authorized(runId, share))) {
    // Same body for missing and revoked/expired: a probe learns nothing.
    return (
      <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
        <h1>Not found</h1>
        <p style={{ opacity: 0.7 }}>This report doesn&apos;t exist or the link is no longer valid.</p>
      </main>
    );
  }

  const db = await getDb();
  const run = (
    await db.query<{ id: string; commit_sha: string; branch: string; created_at: string }>(
      // state: a declared-but-uncommitted run is not published. Migration 017
      // promises "not queryable until it commits"; this is where that is kept.
      "SELECT id, commit_sha, branch, created_at FROM runs WHERE id = $1 AND state = 'committed'",
      [runId]
    )
  ).rows[0];
  if (!run) {
    return (
      <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
        <h1>Not found</h1>
      </main>
    );
  }
  const stats = (
    await db.query<FrameStat>(
      `SELECT frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged
       FROM frame_stats WHERE run_id = $1 ORDER BY flagged DESC, aligned_mismatch_percent DESC NULLS LAST`,
      [runId]
    )
  ).rows;
  const stored = (
    await db.query<StoredFinding>("SELECT frame, findings FROM run_findings WHERE run_id = $1", [runId])
  ).rows;
  const findingsByFrame = new Map(stored.map((s) => [s.frame, s.findings]));

  return (
    <main style={{ maxWidth: 860, margin: "48px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 24 }}>Run report</h1>
      <p style={{ opacity: 0.7, fontSize: 14 }}>
        {run.branch ? `${run.branch} · ` : ""}
        {run.commit_sha ? `commit ${run.commit_sha.slice(0, 10)} · ` : ""}
        {new Date(run.created_at).toISOString()}
      </p>
      {stats.length === 0 && <p style={{ opacity: 0.7 }}>No compared frames in this run.</p>}
      {stats.map((s) => (
        <section
          key={s.frame}
          style={{
            border: "1px solid #2a2a32",
            borderLeft: s.flagged ? "4px solid #e0563c" : "4px solid #3c9d6e",
            borderRadius: 8,
            padding: "16px 20px",
            margin: "16px 0",
          }}
        >
          <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{s.frame}</h2>
          <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 8px" }}>
            {s.flagged ? "flagged" : "pass"} · aligned mismatch{" "}
            {s.aligned_mismatch_percent === null ? "n/a" : `${Number(s.aligned_mismatch_percent).toFixed(2)}%`} · SSIM{" "}
            {s.structural_similarity === null ? "n/a" : Number(s.structural_similarity).toFixed(3)} · {s.mode}/{s.source}
          </p>
          <ExplainPanel
            runId={run.id}
            frame={s.frame}
            flagged={s.flagged}
            initialFindings={findingsByFrame.get(s.frame) ?? null}
          />
        </section>
      ))}
    </main>
  );
}
