import type { Metadata } from "next";
import { listApiKeys } from "argus-cloud/apiKeys.js";
import { getDb } from "../../../lib/db";
import { revokeKeyAction } from "./actions";

/**
 * API keys, and the button that withdraws one.
 *
 * **Why this page exists.** `revokeApiKey` was written when the table was
 * created and had no caller for the whole life of the project. The mechanism
 * worked — `findApiKey` checks `revoked_at` on every request with no cache in
 * front of it — but the only way to reach it was a psql prompt against
 * production. A credential you cannot withdraw without database access is a
 * credential you cannot withdraw at speed, and the moment that matters is the
 * moment a key has leaked.
 *
 * **No key material is on this page**, and `listApiKeys` does not select the
 * hash. The plaintext is shown exactly once at creation; the hash is the only
 * stored form of it and must not travel into a rendered page or a React
 * payload. Everything here identifies a key by row id, label and age.
 *
 * Access is the `/admin` gate in `middleware.ts` — default-deny, its own
 * password, separate from `/pitch` because that one is expected to leak.
 */

export const metadata: Metadata = {
  title: { absolute: "API keys — Normascope" },
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function age(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default async function AdminKeysPage() {
  const db = await getDb();
  const keys = await listApiKeys(db, { includeRevoked: true });
  const live = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-medium">API keys</h1>
      <p className="mt-2 max-w-2xl text-[13.5px] text-text/60">
        {live.length} live, {revoked.length} revoked. Revoking takes effect on the very next request — the key is
        re-read from the database every time, with nothing cached in front of it.
      </p>
      <p className="mt-2 max-w-2xl text-[12px] text-text/40">
        Upload URLs already handed to a key stay valid for up to two minutes after revocation; they are signed by
        storage and nothing here can withdraw them. The bytes they write are never published, because committing a run
        needs the key.
      </p>

      {live.length === 0 ? (
        <p className="mt-8 text-[13.5px] text-text/50">No live keys.</p>
      ) : (
        <ul className="mt-8 grid gap-4">
          {live.map((key) => (
            <li key={key.id} className="rounded-xl border border-black/10 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[14px] font-medium">{key.label || "(no label)"}</span>
                <span className="rounded bg-black/5 px-2 py-0.5 text-[11.5px] uppercase tracking-wide text-text/60">
                  {key.kind}
                </span>
                <span className="text-[12.5px] text-text/50">{key.org_name}</span>
                <span className="text-[12.5px] text-text/40">created {age(key.created_at)}</span>
              </div>
              <form action={revokeKeyAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input type="hidden" name="id" value={key.id} />
                <input
                  name="actor"
                  required
                  placeholder="your name"
                  className="rounded-lg border border-black/15 px-3 py-2 text-[13.5px]"
                />
                <input
                  name="reason"
                  required
                  placeholder="why this key is being withdrawn"
                  className="rounded-lg border border-black/15 px-3 py-2 text-[13.5px]"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-clay px-4 py-2 text-[13.5px] font-medium text-white hover:opacity-90"
                >
                  Revoke
                </button>
                <p className="text-[12px] text-text/40 sm:col-span-3">
                  Both fields are required and are kept permanently. This cannot be undone — issue a new key instead.
                </p>
              </form>
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <>
          <h2 className="mt-12 text-[15px] font-medium">Revoked</h2>
          <p className="mt-1 text-[12.5px] text-text/50">
            Kept, not deleted. Who withdrew a key and why is the first thing an incident review asks.
          </p>
          <ul className="mt-4 grid gap-2">
            {revoked.map((key) => (
              <li key={key.id} className="rounded-lg border border-black/10 px-4 py-3 text-[13px] text-text/70">
                <span className="font-medium">{key.label || "(no label)"}</span>
                <span className="text-text/50"> · {key.org_name} · {key.kind}</span>
                <div className="mt-1 text-[12.5px] text-text/50">
                  revoked {age(key.revoked_at as string)} by {key.revoked_by}
                  {key.revoked_reason ? ` — ${key.revoked_reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
