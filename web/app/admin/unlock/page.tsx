import type { Metadata } from "next";

/**
 * The `/admin` unlock screen.
 *
 * Deliberately plain and deliberately vague: a stranger who lands here should
 * not learn that there is a waitlist behind it, let alone whose addresses.
 */

export const metadata: Metadata = {
  title: { absolute: "Normascope" },
  robots: { index: false, follow: false },
};

export default async function AdminUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const action = next ? `/api/admin-unlock?next=${encodeURIComponent(next)}` : "/api/admin-unlock";

  return (
    <main className="min-h-screen bg-paper text-text grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <p className="eyebrow text-clay mb-5">Normascope</p>
        <h1 className="display-sm mb-2">Restricted</h1>
        <p className="text-[14.5px] leading-relaxed text-text/55 mb-7">
          Enter the operator phrase to continue. The public site is{" "}
          <a href="/" className="text-clay underline underline-offset-4">
            over here
          </a>
          .
        </p>

        <form action={action} method="post" className="flex flex-col gap-3">
          <label htmlFor="password" className="sr-only">
            Operator phrase
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "unlock-error" : undefined}
            className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-clay ${
              error ? "border-[#b6611f]" : "border-black/12"
            }`}
          />
          <button
            type="submit"
            className="rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            Continue
          </button>
        </form>

        {error && (
          <p id="unlock-error" role="alert" className="mt-3 text-[13.5px] text-[#b6611f]">
            That phrase didn&rsquo;t work.
          </p>
        )}
      </div>
    </main>
  );
}
