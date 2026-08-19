import { createHash } from "node:crypto";
import type { Db } from "./db.js";
import { frameHistory, type FrameHistory } from "./enrichment.js";
import { DEFAULT_GET_TTL_SECONDS, type Storage } from "./storage.js";

/**
 * Everything the hosted run report renders, assembled server-side
 * (`BuildV5.md` Phase H).
 *
 * Two rules shape this file.
 *
 * **Every string here is hostile.** Frame labels, commit messages, findings —
 * all of it arrives from an upload or from a model. Nothing is sanitised on
 * the way in, because sanitising is a guess about what the renderer will do
 * with it; the page renders every one of these as a React text node, which
 * escapes unconditionally. This module's job is to bound *shape* — how many
 * regions, how large a sidecar, what a number may be — not to launder content.
 *
 * **A presigned URL is a bearer credential**, so its life is bounded by the
 * life of the thing that revealed it. A share link that expires in an hour must
 * not hand out image URLs that outlive it — hence `ttlFor` below. `storage.ts`
 * makes the same point about presigning generally; this is where it binds.
 *
 * It lives in the server package rather than beside the page, and takes `db`
 * and `storage` as arguments the way `artifactUploads.ts` does, for one reason:
 * the suite runs against `dist/`. Logic inside `web/` is reachable only by
 * rendering a page, so anything put there is proven by looking at it and by
 * nothing else — and this file decides what a share viewer may see and how long
 * an image URL lives.
 */

/** Rendered region boxes per frame. A diff with 400 rectangles is a smear, not a signal. */
const MAX_REGIONS_RENDERED = 24;

/**
 * Largest regions sidecar worth fetching. Checked against the `bytes` column
 * before the object is read, so an oversized one costs a comparison rather
 * than a download.
 */
const MAX_REGIONS_BYTES = 256 * 1024;

/** Floor on a presigned TTL. Below this the page would render already-dead URLs. */
const MIN_GET_TTL_SECONDS = 20;

export type Viewer = "owner" | "share";

export interface Access {
  viewer: Viewer;
  /** When the capability that granted this view dies, or null if it does not. */
  expiresAt: Date | null;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameImages {
  build: string | null;
  reference: string | null;
  diff: string | null;
  /** The downscaled stand-in a clean frame gets instead of three full artifacts. */
  thumbnail: string | null;
}

export interface FrameReport {
  frame: string;
  mode: string;
  source: string;
  alignedMismatchPercent: number | null;
  structuralSimilarity: number | null;
  flagged: boolean;
  images: FrameImages;
  regions: Region[];
  findings: unknown | null;
  /** Prior committed runs of this frame, newest first — excludes this run. */
  history: FrameHistory | null;
}

export interface RunReport {
  runId: string;
  /**
   * The repository this run belongs to, so the page can link up to its trends
   * (Phase I). **Owner views only** — a share token names one run, and putting a
   * link to the repository's other runs on a share page would widen every link
   * ever issued into a tenant-wide read.
   */
  repoId: string;
  /** Owner views only, for the same reason as `repoId` — it names the repository. */
  repoName: string;
  /**
   * Owner views only.
   *
   * It is the top of the breadcrumb, and it is also what makes a demo tenant
   * announce itself: `scripts/seed-demo.mjs` names its organization
   * "DEMO — … (sample data)" precisely so the label rides on every page the
   * person driving a walkthrough is looking at.
   */
  orgName: string;
  commitSha: string;
  branch: string;
  createdAt: string;
  /** From the uploaded summary — the line the meter is drawn against. */
  threshold: number | null;
  frames: FrameReport[];
}

/**
 * Who may see this run.
 *
 * `NORMA_DEV_OPEN` is the local-development door and the only "owner" path that
 * exists until session auth lands at Step 6. A share token is a capability: it
 * names one run, it can be revoked, and it may expire.
 *
 * Returns null for absent, revoked, and expired alike. A probe holding a
 * withdrawn link must not be able to tell it apart from one that never existed.
 */
export async function authorize(
  db: Db,
  runId: string,
  share: string | undefined
): Promise<Access | null> {
  if (process.env.NORMA_DEV_OPEN === "1") {
    return { viewer: "owner", expiresAt: null };
  }
  if (!share) {
    return null;
  }
  const row = (
    await db.query<{ expires_at: string | Date | null }>(
      `SELECT expires_at FROM share_links
       WHERE run_id = $1 AND token_hash = $2 AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [runId, createHash("sha256").update(share).digest("hex")]
    )
  ).rows[0];
  if (!row) {
    return null;
  }
  return {
    viewer: "share",
    expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
  };
}

/**
 * How long an image URL on this page may live.
 *
 * The default TTL, or whatever is left of the viewer's own access — whichever
 * is shorter. Without this, a one-hour share link would emit two-minute URLs
 * that are fine, but a *two-minute* share link would emit URLs outliving it,
 * and the revocation the link promises would be partial.
 */
export function ttlFor(access: Access, now: number = Date.now()): number {
  if (access.expiresAt === null) {
    return DEFAULT_GET_TTL_SECONDS;
  }
  const remaining = Math.floor((access.expiresAt.getTime() - now) / 1000);
  return Math.max(MIN_GET_TTL_SECONDS, Math.min(DEFAULT_GET_TTL_SECONDS, remaining));
}

/** Clamp a client-supplied rectangle to something that cannot escape its box. */
function asRegion(value: unknown): Region | null {
  const r = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  const nums = [r?.x, r?.y, r?.width, r?.height];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) {
    return null;
  }
  const [x, y, width, height] = nums as number[];
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Regions for one frame, from the sidecar the CLI uploaded.
 *
 * **Every failure is an empty list.** A run from before the regions sidecar
 * existed, an object missing from storage, unparseable JSON, a hostile array —
 * each degrades to a diff image with no boxes drawn on it, which is what the
 * page looked like yesterday. None of them is worth failing a page render for.
 */
async function regionsFor(
  storage: Storage,
  storageKey: string | undefined,
  bytes: number
): Promise<Region[]> {
  if (!storageKey || bytes <= 0 || bytes > MAX_REGIONS_BYTES) {
    return [];
  }
  try {
    const raw = await storage.get(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(Buffer.from(raw).toString("utf-8")) as { regions?: unknown };
    if (!Array.isArray(parsed?.regions)) {
      return [];
    }
    return parsed.regions
      .slice(0, MAX_REGIONS_RENDERED)
      .map(asRegion)
      .filter((r): r is Region => r !== null);
  } catch {
    return [];
  }
}

interface ArtifactRow {
  frame: string;
  kind: string;
  storage_key: string;
  bytes: string | number;
}

/**
 * Load one committed run for rendering.
 *
 * `state = 'committed'` is not decoration: migration 017 promises a
 * declared-but-unfinished run is not queryable, and this is one of the two
 * places that promise is kept.
 */
export async function loadRun(
  db: Db,
  storage: Storage,
  runId: string,
  access: Access
): Promise<RunReport | null> {
  const run = (
    await db.query<{
      id: string;
      org_id: string;
      repo_id: string;
      commit_sha: string;
      branch: string;
      created_at: string | Date;
      summary: unknown;
      repo_name: string;
      org_name: string;
    }>(
      `SELECT r.id, r.org_id, r.repo_id, r.commit_sha, r.branch, r.created_at, r.summary,
              repo.name AS repo_name, org.name AS org_name
       FROM runs r
         JOIN repos repo ON repo.id = r.repo_id
         JOIN orgs org ON org.id = r.org_id
       WHERE r.id = $1 AND r.state = 'committed'`,
      [runId]
    )
  ).rows[0];
  if (!run) {
    return null;
  }

  const stats = (
    await db.query<{
      frame: string;
      mode: string;
      source: string;
      aligned_mismatch_percent: number | null;
      structural_similarity: number | null;
      flagged: boolean;
    }>(
      `SELECT frame, mode, source, aligned_mismatch_percent, structural_similarity, flagged
       FROM frame_stats WHERE run_id = $1
       ORDER BY flagged DESC, aligned_mismatch_percent DESC NULLS LAST`,
      [runId]
    )
  ).rows;

  const findings = new Map(
    (
      await db.query<{ frame: string; findings: unknown }>(
        "SELECT frame, findings FROM run_findings WHERE run_id = $1 ORDER BY created_at ASC, id ASC",
        [runId]
      )
    ).rows.map((r) => [r.frame, r.findings])
  );

  // org_id in the WHERE clause as well as run_id. The run already scopes it,
  // but every path that turns an id into bytes carries the tenant boundary
  // explicitly — the probe suite (E4) checks paths, not intentions.
  const artifacts = (
    await db.query<ArtifactRow>(
      `SELECT frame, kind, storage_key, bytes FROM run_artifacts
       WHERE run_id = $1 AND org_id = $2 AND state = 'committed'`,
      [runId, run.org_id]
    )
  ).rows;

  const byFrame = new Map<string, Map<string, ArtifactRow>>();
  for (const a of artifacts) {
    let kinds = byFrame.get(a.frame);
    if (!kinds) {
      kinds = new Map();
      byFrame.set(a.frame, kinds);
    }
    kinds.set(a.kind, a);
  }

  const ttlSeconds = ttlFor(access);
  const sign = async (row: ArtifactRow | undefined): Promise<string | null> => {
    if (!row) {
      return null;
    }
    try {
      return (await storage.presignGet(row.storage_key, { ttlSeconds })).url;
    } catch {
      // A key we cannot sign is an image we cannot show. The alternative — an
      // exception here — is a blank page for one missing object (H1.3).
      return null;
    }
  };

  const frames: FrameReport[] = [];
  for (const s of stats) {
    const kinds = byFrame.get(s.frame) ?? new Map<string, ArtifactRow>();
    const regionRow = kinds.get("regions");
    const [build, reference, diff, thumbnail, regions, history] = await Promise.all([
      sign(kinds.get("build")),
      sign(kinds.get("reference")),
      sign(kinds.get("diff")),
      sign(kinds.get("thumbnail")),
      regionsFor(storage, regionRow?.storage_key, Number(regionRow?.bytes ?? 0)),
      frameHistory(db, { orgId: run.org_id, repoId: run.repo_id, frame: s.frame }),
    ]);
    frames.push({
      frame: s.frame,
      mode: s.mode,
      source: s.source,
      alignedMismatchPercent:
        s.aligned_mismatch_percent === null ? null : Number(s.aligned_mismatch_percent),
      structuralSimilarity:
        s.structural_similarity === null ? null : Number(s.structural_similarity),
      flagged: s.flagged,
      images: { build, reference, diff, thumbnail },
      regions,
      findings: findings.get(s.frame) ?? null,
      history: priorRuns(history, runId),
    });
  }

  const summary = run.summary as { threshold?: unknown } | null;
  return {
    runId: run.id,
    repoId: run.repo_id,
    repoName: run.repo_name,
    orgName: run.org_name,
    commitSha: run.commit_sha,
    branch: run.branch,
    createdAt: run.created_at instanceof Date ? run.created_at.toISOString() : String(run.created_at),
    threshold: typeof summary?.threshold === "number" ? summary.threshold : null,
    frames,
  };
}

/**
 * Strip the run being viewed out of its own history.
 *
 * A frame's first ever run has exactly one trend row — itself — and a page that
 * called that "history" would tell a first-time customer their frame had
 * drifted once and first drifted at the commit they are looking at. H3.2 asks
 * for the section to be absent instead, and absent is what a frame with no past
 * actually has. Returns null when nothing is left.
 */
export function priorRuns(history: FrameHistory | null, runId: string): FrameHistory | null {
  if (!history) {
    return null;
  }
  const trend = history.trend.filter((row) => row.runId !== runId);
  if (trend.length === 0) {
    return null;
  }
  return { ...history, trend };
}
