import type { Metadata } from "next";

/**
 * The preview unlock screen.
 *
 * Deliberately plain and deliberately vague. Someone who lands here should
 * learn that the address is real and nothing else — not what is behind it, not
 * that a product is being built, not whose preview it is. The `/admin` unlock
 * page takes the same line for the same reason.
 *
 * No JavaScript: a plain form post, which `form-action 'self'` already permits
 * and which works before anything hydrates.
 */

export const metadata: Metadata = {
  title: { absolute: "Normascope" },
  robots: { index: false, follow: false },
};

export default async function PreviewUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const action = next ? `/api/preview-unlock?next=${encodeURIComponent(next)}` : "/api/preview-unlock";

  return (
    <main className="min-h-screen bg-paper text-text grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <p className="eyebrow text-clay mb-5">Normascope</p>
        <h1 className="display-sm mb-2">Not public yet</h1>
        <p className="text-[14.5px] leading-relaxed text-text/55 mb-7">
          This is an unreleased build. Enter the phrase you were given to continue.
        </p>

        <form method="post" action={action} className="grid gap-3">
          <label htmlFor="password" className="sr-only">
            Phrase
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="w-full rounded-lg border border-text/15 bg-white px-4 py-3 text-[15px] outline-none focus-visible:border-clay"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#111] px-4 py-3 text-[15px] font-semibold text-white hover:bg-black"
          >
            Continue
          </button>
        </form>

        {/* One sentence for a wrong phrase, an unset phrase and a throttled
            attempt alike — `lib/gate.ts` explains why telling them apart would
            help an attacker more than it helps anyone else. */}
        {error && (
          <p className="mt-4 text-[13.5px] text-clay" role="status">
            That phrase didn&apos;t work.
          </p>
        )}
      </div>
    </main>
  );
}
