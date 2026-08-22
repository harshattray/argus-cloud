import { frameRuns, parseSpan, repoOrg, repoViewOpen } from "argus-cloud/trendData.js";
import { getDb } from "../../../../../lib/db";
import { currentSession, membershipFor } from "../../../../../lib/session";

/**
 * `GET /repos/{repoId}/trend/export?frame=&from=&to=` — every exact run of one
 * frame, as CSV.
 *
 * **This is the other half of bounding the table.** The chart draws at most
 * `MAX_INTERACTIVE_POINTS` interactive marks and the table lists twenty-five
 * rows at a time, because neither five thousand DOM nodes nor five thousand
 * `<tr>` is something a browser or a reader can use. Bounding a view is only
 * honest if the whole dataset is still reachable — otherwise it is not a view,
 * it is a limit. So: paginated rows for browsing, this for arithmetic.
 *
 * **No pagination here, deliberately.** A spreadsheet does not need pages, and
 * an export that arrives in pages is an export nobody can sum. It streams
 * whatever the span holds, which retention already bounds at 90 days.
 *
 * **Gated exactly like the page it belongs to**: membership in the organization
 * that owns the repository, with `NORMA_DEV_OPEN` surviving as the local door.
 * Putting it behind the API-key check instead would make it reachable in
 * production while the page it exports 404s — a route serving a tenant's
 * history to any valid key, with no page anywhere that links to it.
 *
 * **Until 2026-08-22 it was gated by `repoViewOpen()` alone**, which the comment
 * above said would become session-gated at Step 6. Step 6 gated
 * `/repos/{repoId}` and left this route and the trend page behind, so both 404ed
 * for every customer while the docs recorded the gate as closed. That is the
 * failure the sentence about "the same change" was written to prevent, and it
 * happened anyway.
 *
 * A CSV for CI — key-authenticated, no session — is a different feature with a
 * different audience, and belongs on `/api/trends` when something needs it.
 */

export const dynamic = "force-dynamic";

/** Same body for a missing repo, another org's repo, and the gate being shut. */
function notFound(): Response {
  return new Response("not found", { status: 404 });
}

/**
 * One CSV field.
 *
 * **Quoted, and a leading formula character defused.** Frame labels and commit
 * messages are upload-supplied, and a field beginning `=`, `+`, `-` or `@` is
 * executed as a formula by Excel and Sheets when the file is opened — the
 * export equivalent of the stored-XSS argument that made `contentType` an
 * allowlist in `artifactUploads.ts`. Prefixing a single quote makes it text.
 */
function field(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ repoId: string }> }
): Promise<Response> {
  const { repoId } = await params;
  const url = new URL(request.url);
  const frame = url.searchParams.get("frame");
  if (!frame) {
    return notFound();
  }

  const db = await getDb();
  const owner = await repoOrg(db, repoId);
  if (!owner) {
    return notFound();
  }

  // The repository id in the URL is a request, not a permission: the owning
  // organization is read off the repository row and checked against what the
  // session holds. Same 404 as a nonexistent repository, so probing ids cannot
  // map out another tenant.
  const session = await currentSession();
  if (!membershipFor(session, owner.orgId) && !repoViewOpen()) {
    return notFound();
  }

  const span = parseSpan(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined
  );

  // One page the size of everything retention can hold: 90 days at the team
  // plan's 200 runs/day is 18,000 rows, and asking for more than exists costs
  // nothing. The bound is real rather than notional — an unbounded query here
  // would be the one read on this page whose cost is a customer's choice.
  const page = await frameRuns(db, {
    orgId: owner.orgId,
    repoId: owner.id,
    frame,
    span,
    page: 1,
    pageSize: 20_000,
  });
  if (page.total === 0) {
    return notFound();
  }

  const header = "run_id,commit_sha,at,aligned_mismatch_percent,threshold,flagged,mode,source";
  const lines = page.rows.map((r) =>
    [
      r.runId,
      r.commitSha,
      r.createdAt,
      r.alignedMismatchPercent === null ? "" : r.alignedMismatchPercent,
      r.threshold === null ? "" : r.threshold,
      r.flagged,
      r.mode,
      r.source,
    ]
      .map(field)
      .join(",")
  );

  // The filename is built from the run count and the span, never from the frame
  // label: a label is upload-supplied and this string lands in a `filename=`
  // parameter and then on a filesystem.
  const stamp = span ? `${span.from.toISOString().slice(0, 10)}_${span.to.toISOString().slice(0, 10)}` : "all";
  return new Response([header, ...lines].join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="normascope-frame-${stamp}-${page.total}runs.csv"`,
      "cache-control": "no-store",
    },
  });
}
