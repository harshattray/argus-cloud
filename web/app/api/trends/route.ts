import { frameTrend, resolveRepo, trendLimit } from "argus-cloud/trendData.js";
import { getDb } from "../../../lib/db";
import { requireApiKey, rateLimited, unauthorized } from "../../../lib/auth";

/**
 * `GET /api/trends?repo=&frame=&limit=` — one frame's trend, and nothing else
 * (`BuildV5.md` Phase I, I3).
 *
 * **It answers about a frame, never about the organization.** No repository
 * list, no run totals, no plan or credit state, no other frame's numbers. That
 * is I3's security protocol, and it is also why `frame` is required rather than
 * optional: an omitted frame would have to mean "tell me what you have", which
 * is the inventory response this route is specified not to give. The repository
 * view renders its own frame list server-side from an org-scoped query, so
 * nothing needs this route to enumerate.
 *
 * **`repo` is resolved inside the caller's own organization.** Another tenant's
 * repository id is a miss, and a miss is the same 404 a nonsense id gets
 * (I3.1) — a probe holding a real id from somewhere else learns nothing from
 * the difference, because there is no difference.
 *
 * **`limit` is clamped, not rejected** (I3.2). `limit=100000` is a reasonable
 * thing for a client to ask and an unreasonable thing to serve; the response
 * carries the `limit` actually used so the caller can see what it got.
 */

export const dynamic = "force-dynamic";

/** Same body for an absent repo, another org's repo, and a frame with no history. */
function notFound(): Response {
  return Response.json({ error: "not found" }, { status: 404 });
}

export async function GET(request: Request): Promise<Response> {
  const db = await getDb();
  const key = await requireApiKey(db, request);
  if (!key) {
    return unauthorized();
  }
  const limited = await rateLimited(db, key);
  if (limited) {
    return limited;
  }

  const params = new URL(request.url).searchParams;
  const repoParam = params.get("repo");
  const frame = params.get("frame");
  if (!repoParam) {
    return Response.json({ error: "repo is required" }, { status: 400 });
  }
  if (!frame) {
    return Response.json({ error: "frame is required" }, { status: 400 });
  }

  const repo = await resolveRepo(db, { orgId: key.org_id, repo: repoParam });
  if (!repo) {
    return notFound();
  }

  const trend = await frameTrend(db, {
    orgId: key.org_id,
    repoId: repo.id,
    frame,
    limit: trendLimit(params.get("limit")),
  });
  if (!trend) {
    return notFound();
  }

  return Response.json(trend);
}
