import type { Metadata } from "next";
import { Label, Section, Spark } from "../../_components/primitives";
import { WaitlistForm } from "../../_components/WaitlistForm";

/**
 * The Cloud tease. Governed by docs/normascopeWeb.md §10, which is an explicit
 * allow/deny list — read it before editing a word of this page.
 *
 * Everything here is written in the future or preview tense on purpose. The
 * hosted engine is real and tested; the surface largely is not. Nothing on this
 * page may imply you can sign up, log in or upload today, and no plan name or
 * launch date appears anywhere.
 *
 * The price block below is sanctioned by §10 as amended 2026-08-06: the list
 * price may appear now that the tier structure is settled, but plan names,
 * launch dates and every economics figure beyond the list price still may not.
 */

export const metadata: Metadata = {
  // Absolute, or the layout template renders "Normascope Cloud — Normascope".
  title: { absolute: "Normascope Cloud — hosted reports, history and trends" },
  description:
    "Normascope Cloud is in private preview: hosted report links, per-frame history, history-aware findings, and prepaid credits that cannot overage. Register your interest.",
  alternates: { canonical: "/cloud" },
};

const CAPABILITIES = [
  {
    head: "Hosted reports",
    body: "Upload a run and get a link you can send to anyone — revocable, expiring, and readable without a GitHub account.",
  },
  {
    head: "Trends",
    body: "Per-frame history over time, with a marker on the commit where drift first crossed your threshold. The end of archaeology through old deploys.",
  },
  {
    head: "History-aware findings",
    body: "Findings gain firstDriftCommit and recurrence — not just what changed, but that this same region has broken before, and when it started.",
  },
  {
    head: "CI auto-explain",
    body: "The top flagged frames analysed in batch at half the rate, surfaced as one escaped line in the pull-request comment.",
  },
  {
    head: "Prepaid credits",
    body: "Balance is the cap. Cache hits are free, failed analyses cost nothing, and a daily circuit breaker pauses analysis — never the product. There is no metered-overage code path to turn on.",
  },
  {
    head: "Agent budgets",
    body: "Per-key monthly budgets, so an agent cannot run up a bill. Running out produces a clear message rather than a red build.",
  },
];

export default function CloudPage() {
  return (
    <>
      <Section tone="paper">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-clay/30 bg-clay/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-clay mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-clay" />
          Private preview
        </span>
        <h1 className="display-lg mb-6">
          The part a laptop<br className="hidden md:block" /> structurally can&apos;t do
        </h1>
        <p className="text-lg text-text/60 leading-relaxed mb-4">
          Everything else on this site is free, local, and stays that way. Normascope Cloud will add one
          thing the free tier cannot have at any price: <strong className="text-text">memory</strong>.
        </p>
        <p className="text-base text-text/50 leading-relaxed">
          Because it keeps every run you have uploaded, it can say what your laptop has no way of
          knowing — that this exact section broke three times before, and which commit started it.
        </p>
      </Section>

      {/* The price goes above the fold on this page. Hiding it wastes the
          qualified visitor's time and ours — and there is no trial to soften
          it with, because the free CLI is the trial. */}
      <Section tone="ink" measure="wide">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <Label dark>What it will cost</Label>
            <p
              className="numeric font-bold leading-none text-white text-5xl md:text-6xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              $59
              <span className="text-[0.34em] font-medium text-white/45"> / month</span>
            </p>
            <p className="mt-3 text-[15px] text-white/60">Per organization. One tier.</p>
          </div>

          <div className="lg:col-span-7 space-y-4 text-[15px] leading-relaxed text-white/60">
            <p>
              <strong className="font-semibold text-white/90">Not per seat.</strong> Your designers,
              your PM and your QA cost the same as nobody. Charging for the people who only{" "}
              <em className="not-italic text-white/80">look</em> at a report would push a team
              straight back to forwarding screenshots.
            </p>
            <p>
              <strong className="font-semibold text-white/90">Not per screenshot.</strong> Captures
              run on your machines, so volume costs us nothing and we do not meter it. Unlimited
              screenshots, unlimited repos.
            </p>
            <p>
              <strong className="font-semibold text-white/90">
                AI analysis runs on prepaid credit packs.
              </strong>{" "}
              Prepaid only: when they are gone, analysis pauses and your builds stay green. There is
              no overage-invoice code path — we did not disable it, we did not build it.
            </p>
            <p className="border-t border-white/12 pt-4 text-white/45">
              There is no trial, because the free CLI <em className="not-italic text-white/65">is</em>{" "}
              the trial.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="sand" measure="wide">
        <Label>Why history is the moat</Label>
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-96 shrink-0">
            <h2 className="display-md mb-5">
              Anyone can call the same model
            </h2>
            <p className="text-base text-text/60 leading-relaxed mb-4">
              Bring your own key and you get the same analysis, from the same model, with the same
              prompt. That part is free and always will be.
            </p>
            <p className="text-base text-text/60 leading-relaxed">
              What you cannot do from a laptop is know that this region drifted in three earlier
              commits — because that history lives in a database, and it grows with every run uploaded.
              No client-side licence check could ever do that job, which is why we didn&apos;t build one.
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <ul className="grid sm:grid-cols-2 gap-3">
              {CAPABILITIES.map((c) => (
                <li key={c.head} className="rounded-xl border border-black/8 bg-white/60 px-5 py-4">
                  <p className="title-sm text-text mb-1.5">{c.head}</p>
                  <p className="text-xs text-text/50 leading-relaxed">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section tone="paper" measure="wide">
        <Label>What stays free</Label>
        <h2 className="display-md mb-5 max-w-2xl">
          Cloud is an addition, never a removal
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          Nothing that works today stops working, moves behind a login, or starts asking for a card.
          The free CLI is the product; Cloud is what you add when a team needs shared memory of it.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 mb-3">
              Free, local, forever
            </p>
            <ul className="flex flex-col gap-2">
              {[
                "Both comparison modes and all reference sources",
                "The full report, the git hook, the GitHub Action",
                "The MCP server and zero-config target mode",
                "Explain, on your own API key",
                "Your screenshots never leaving your machines",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-text/65 leading-relaxed">
                  <Spark className="w-2.5 h-2.5 text-emerald-600 shrink-0 mt-1.5" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-black/10 bg-black/[0.02] px-5 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-clay mb-3">
              What Cloud will add
            </p>
            <ul className="flex flex-col gap-2">
              {[
                "Shared, revocable report links",
                "Per-frame history and trends",
                "Findings that know what happened before",
                "Batch analysis in CI",
                "Budgets that cannot be exceeded",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-text/65 leading-relaxed">
                  <Spark className="w-2.5 h-2.5 text-clay shrink-0 mt-1.5" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-sm text-text/45 leading-relaxed mt-6 max-w-2xl">
          Uploads will always be explicit. Your baselines and snapshots are PNGs in your own repository,
          so there is nothing to export and nothing to be locked into — the free CLI keeps working
          whatever you decide about Cloud.
        </p>
      </Section>

      <Section id="waitlist" tone="ink" measure="wide" className="scroll-mt-20">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          <div className="lg:w-96 shrink-0">
            <Label dark>Register your interest</Label>
            <h2 className="display-md text-white mb-5">
              Cloud opens to a small group first
            </h2>
            <p className="text-base text-white/45 leading-relaxed">
              Leave your email and we&apos;ll come to you when there&apos;s something real to try. No
              newsletter, no drip sequence, no launch countdown — one message, when it&apos;s worth
              your time.
            </p>
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-6">
              <WaitlistForm source="cloud" tone="dark" cta="Request access" />
              <p className="text-xs text-white/30 leading-relaxed mt-4">
                We store the address and nothing else. It is never shared, and there is no tracking on
                this site — which would be a strange thing to run alongside a promise that your
                screenshots stay on your own machines.
              </p>
            </div>

            <p className="text-sm text-white/35 leading-relaxed mt-6">
              In the meantime, everything on this site is available right now:{" "}
              <span className="font-mono text-white/60">npx norma-scope init</span>.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
