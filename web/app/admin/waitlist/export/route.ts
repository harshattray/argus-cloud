import { waitlistRows, waitlistCsv } from "argus-cloud/waitlist.js";
import { getDb } from "../../../../lib/db";

/**
 * CSV export of the waitlist, for follow-up and analysis.
 *
 * It lives under `/admin/` rather than `/api/` on purpose: the `/admin` gate in
 * `middleware.ts` covers this path, so the export cannot be reached without the
 * operator cookie and there is no second copy of the access rule to keep in
 * sync. There is deliberately no public or token-based route to this data.
 *
 * The cell escaping — including the spreadsheet formula-injection guard — is in
 * `argus-cloud/waitlist.js`, next to its tests.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const rows = await waitlistRows(db);
  const filename = `normascope-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(waitlistCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Addresses must not sit in a shared cache or a browser's back-forward
      // cache after the operator cookie expires.
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
