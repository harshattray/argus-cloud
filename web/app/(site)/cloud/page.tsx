import type { Metadata } from "next";
import { Eyebrow, Section, Spark, CloudMark } from "../_components/ui";
import { WaitlistForm } from "../_components/WaitlistForm";
import { CompareRow, HistoryStrip, TrendChart } from "../_components/CloudVisuals";
import { TwinAside } from "../_components/twins";

export const metadata: Metadata = {
  title: { absolute: "Normascope Cloud — shared visual memory for your team" },
  description:
    "Normascope Cloud gives your team shared reports, visual history, trends, stable links and pull-request context. Join early access.",
  alternates: { canonical: "/cloud" },
};

const ANSWERS = [
  {
    quote: "When did this page first start drifting?",
    head: "First-drift history",
    body: "Cloud connects a change to the commit where the page first crossed your threshold.",
  },
  {
    quote: "Has this happened before?",
    head: "Recurrence context",
    body: "See whether a page has regressed before, so recurring problems become patterns instead of surprises.",
  },
  {
    quote: "How does today compare with the last run?",
    head: "Run-over-run comparison",
    body: "Every frame can show what changed since the previous run, not just whether it is over the line.",
  },
  {
    quote: "Can I send this to the rest of the team?",
    head: "Stable shared links",
    body: "Give designers, PMs and clients a report they can open in a browser instead of forwarding another file.",
  },
];

const FEATURES = [
  ["Reports everyone can open", "Turn a local result into a private hosted report your team can share."],
  ["History that survives the next run", "Keep the evidence behind a decision instead of overwriting it every time you check."],
  ["Trends across your pages", "See drift accumulate and identify the commit where a page crossed the line."],
  ["Pull-request context", "Put the current result beside its history, so a PR explains what changed and whether it has happened before."],
  ["One organization-wide workspace", "Invite the people who need to look without metering value by seats or screenshots."],
  ["Safe hosted analysis", "Use Cloud’s analysis layer with capped usage, cached results and organization-isolated data."],
];

export default function CloudPage() {
  return (
    <>
      <section className="relative isolate w-full overflow-hidden bg-ink px-4 md:px-8">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <div className="absolute right-[-140px] top-[-160px] h-[34rem] w-[34rem] rounded-full bg-clay opacity-30 blur-3xl" />
          <div className="absolute bottom-[-140px] left-[-120px] h-[26rem] w-[26rem] rounded-full bg-[#8e5c9e] opacity-25 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/80" />
        </div>

        <div className="mx-auto max-w-5xl py-16 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
            <div className="min-w-0 lg:col-span-5">
              <CloudMark size="lg" dark title="Normascope Cloud" />
              <p className="eyebrow mb-4 mt-8 text-pink-300">The team layer for Normascope</p>
              <h1 className="display-md mb-5 max-w-xl text-white">Every run. Remembered.</h1>
              <p className="mb-4 max-w-lg text-lg leading-relaxed text-white/70">
                Normascope tells you what changed. Cloud tells you when it started, whether it happened
                before, and who needs to see it.
              </p>
              <p className="mb-8 max-w-lg text-base leading-relaxed text-white/45">
                Keep the free CLI complete and local. Add Cloud when your team needs the report to
                remember.
              </p>

              <div className="max-w-md">
                <WaitlistForm
                  source="cloud"
                  tone="dark"
                  layout="stacked"
                  cta="Join early access"
                  note="Get first access and help shape the first Cloud workflows. One email when it opens — no newsletter, no drip sequence."
                />
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/45">
                {["Shared team reports", "Unlimited people", "Not per screenshot"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Spark className="h-2 w-2 shrink-0 text-pink-400" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 lg:col-span-7">
              <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow mb-2 text-pink-300">History-aware report</p>
                    <p className="truncate text-[15px] font-semibold text-white/90">Pull Requests</p>
                    <p className="font-mono text-[11px] text-white/35">baseline · main@a9f3e1 · today</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="eyebrow mb-1 text-white/35">Needs attention</p>
                    <p className="numeric font-mono text-3xl font-bold text-[#e0906a]">8.30%</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white">
                  <p className="eyebrow mb-2 text-white/35">Across the last 12 commits</p>
                  <HistoryStrip className="w-full text-white" />
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {[
                    ["First drift", "a1b2c3 · 6 commits ago"],
                    ["Recurrence", "3rd time this page regressed"],
                    ["Previous run", "2.10% on main"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3">
                      <p className="eyebrow mb-2 text-white/35">{label}</p>
                      <p className="text-[12px] leading-snug text-white/75">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 border-t border-white/10 pt-3 text-[12px] leading-relaxed text-white/35">
                  The local run tells you 8.30%. Cloud tells you the story behind it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section tone="paper">
        {/* Reading, next to the section about the questions people re-ask. */}
        <TwinAside pose="reading" className="mb-11">
          <Eyebrow>The questions behind every diff</Eyebrow>
          <h2 className="display-md mb-4 max-w-2xl">The answers your team keeps asking for</h2>
          <p className="max-w-xl text-base leading-relaxed text-text/60">
            Cloud puts the context next to the report instead of making someone reconstruct it from
            old files, Slack threads and memory.
          </p>
        </TwinAside>
        <div className="grid gap-x-10 gap-y-9 md:grid-cols-2">
          {ANSWERS.map((item) => (
            <div key={item.head} className="min-w-0 rounded-xl border border-black/8 bg-white/55 px-5 py-5">
              <p className="mb-3.5 border-l-2 border-clay/50 pl-3.5 text-[15px] font-medium leading-snug text-text/85">
                {item.quote}
              </p>
              <h3 className="title-sm mb-1.5 text-text">{item.head}</h3>
              <p className="text-[14.5px] leading-relaxed text-text/55">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="ink">
        <Eyebrow dark>Drift, made visible</Eyebrow>
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-5">
            <h2 className="display-md mb-4 text-white">Watch drift accumulate before it becomes a redesign</h2>
            <p className="text-[15px] leading-relaxed text-white/55">
              No single run tells you a page has been sliding for a month. A history of every run does,
              with the threshold and first breach made visible.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
              <TrendChart className="w-full text-white" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-white/35">
              A preview of the trend view: when did the page cross the line, and is the drift getting worse?
            </p>
          </div>
        </div>
      </Section>

      <Section tone="paper">
        <Eyebrow>What your team gets</Eyebrow>
        <h2 className="display-md mb-10 max-w-xl">Everything you need to keep visual quality in the loop</h2>
        <div className="grid gap-x-10 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([head, body]) => (
            <div key={head} className="min-w-0">
              <Spark className="mb-3 h-2.5 w-2.5 text-clay" />
              <h3 className="title-sm mb-2 text-text">{head}</h3>
              <p className="text-[14.5px] leading-relaxed text-text/55">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper">
        <Eyebrow>Side by side</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">The free CLI stays complete. Cloud adds the team layer.</h2>
        <p className="mb-9 max-w-xl text-base leading-relaxed text-text/60">
          Nothing that works on your machine moves behind Cloud. Cloud adds the history, sharing and
          organization-level context that a single local run cannot keep.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white/50">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="bg-black/[0.03]">
                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-text/40">&nbsp;</th>
                <th className="w-[30%] px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-text/45">On your machine · free</th>
                <th className="w-[30%] bg-clay/[0.12] px-3 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-clay-deep">With Cloud</th>
              </tr>
            </thead>
            <tbody className="[&>tr>td:first-child]:pl-5 [&>tr>td:last-child]:pr-5">
              <CompareRow feature="Diff engine, scores, overlays and full report" local="Everything, at full quality" cloud="Identical — never degraded" />
              <CompareRow feature="When a page first started drifting" local={false} cloud="The exact commit, and how long ago" />
              <CompareRow feature="Whether it has broken before" local={false} cloud="Recurrence context per page" />
              <CompareRow feature="Score over time" local={false} cloud="A trend chart per page" />
              <CompareRow feature="Showing it to someone else" local="Email them the file" cloud="A private, stable link" />
              <CompareRow feature="Pull-request context" local="Run explain by hand" cloud="History-aware team workflow" />
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="sand" size="sm">
        <div className="rounded-xl border-l-2 border-l-clay/50 bg-clay/[0.06] py-5 pl-6 pr-6">
          <p className="eyebrow mb-3 text-clay">Local by default. Cloud by choice.</p>
          <p className="max-w-3xl text-[14.5px] leading-relaxed text-text/70">
            Normascope never uploads screenshots implicitly. You choose what to send to Cloud when your
            team needs shared history. Your local baselines, reports and pipeline continue working if
            you never use Cloud or later stop using it.
          </p>
        </div>
      </Section>

      <Section tone="ink" id="waitlist">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-6">
            {/* Waving at the signup. The only place on the site asking a
                visitor for something, so it gets the friendly one. */}
            <TwinAside pose="wave" tone="cream" twinClassName="hidden w-20 shrink-0 sm:block">
              <CloudMark size="md" dark className="mb-6" title="Normascope Cloud" />
              <h2 className="display-md mb-4 text-white">Join the first Cloud teams</h2>
              <p className="text-[15px] leading-relaxed text-white/55">
                Get first access when hosted reports open, and help shape the workflows that matter
                to your team. One email when it&rsquo;s ready — nothing else, ever.
              </p>
            </TwinAside>
          </div>
          <div className="lg:col-span-6">
            <WaitlistForm source="cloud" tone="dark" layout="stacked" cta="Join early access" />
            <p className="mt-4 font-mono text-[12.5px] text-white/30">Would rather email? waitlist@normascope.com</p>
          </div>
        </div>
      </Section>
    </>
  );
}
