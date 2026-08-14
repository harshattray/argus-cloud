import Link from "next/link";
import type { Metadata } from "next";
import { NPM_URL, SITE_URL, TAGLINE } from "../../lib/site";
import { Eyebrow, Section, CloudBand } from "./_components/ui";
import { CopyLine } from "./_components/CopyLine";
import { Hero } from "./_components/Hero";
import { PrComment } from "../(pitch)/pitch/_components/PrComment";
import { AgentLoop } from "../(pitch)/pitch/_components/AgentLoop";

export const metadata: Metadata = {
  title: "Normascope — see what changed before your users do",
  description:
    "Normascope photographs your running UI and tells you exactly what moved — against your design, or against yesterday's build. Free, and it runs entirely on your machine.",
  alternates: { canonical: "/" },
};

/** The s2 container-width scenario, verbatim from the measured matrix. */
const BLAST = [
  { frame: "Try It", value: 12.73 },
  { frame: "Pull Requests", value: 9.71 },
  { frame: "Hero", value: 8.27 },
  { frame: "Commands", value: 0.73 },
  { frame: "Engine", value: 0 },
  { frame: "Articles", value: 0 },
  { frame: "Lab", value: 0 },
];

/**
 * The three walls.
 *
 * This is the conversion engine of the whole site, so it is framed as things
 * that happen *to* a team rather than as features we sell. Each one is real: a
 * report that lives on one laptop, a number with no history, an agent with an
 * uncapped key.
 */
const WALLS = [
  {
    n: "01",
    when: "Someone asks “is this new?”",
    wall: "Your run knows about today. It cannot tell you whether this page has been drifting for three weeks or broke an hour ago.",
    answer: "“First exceeded your threshold at a1b2c3 — 14 commits ago.”",
  },
  {
    n: "02",
    when: "Your designer asks to see it",
    wall: "The report is a file on your laptop. So you email it. Then you email the next one, and the one after that, and nobody is sure which is current.",
    answer: "A private link they open in a browser — no account, always the latest run.",
  },
  {
    n: "03",
    when: "The same page breaks again",
    wall: "You fix it, and two months later you fix something that feels familiar. Nothing anywhere connects the two.",
    answer: "“3rd time this page has regressed.”",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Normascope",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cross-platform",
  description: TAGLINE,
  url: SITE_URL,
  downloadUrl: NPM_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Hero ──
          The wordmark carries the top-left and the live comparison schematic
          anchors the right, so a visitor sees what the product *does* before
          reading a word about it. */}
      <Hero />

      {/* ── The one proof ── */}
      <Section tone="paper">
        <Eyebrow>A real commit</Eyebrow>
        <h2 className="display-md mb-4 max-w-xl">One line changed. Four pages moved.</h2>
        <p className="mb-9 max-w-xl text-base leading-relaxed text-text/60">
          Five characters, on a real site. The kind of change that passes review without a comment —
          and a blast radius nobody predicts by eye.
        </p>

        <div className="grid gap-9 lg:grid-cols-12 lg:gap-12 items-start">
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-xl border border-black/10 bg-[#111] font-mono text-[13px]">
              <div className="border-b border-white/10 px-4 py-2 text-[11px] text-white/35">
                one file, one line
              </div>
              <div className="px-4 py-3 leading-relaxed">
                <p className="text-[#e08a7a]">- max-w-6xl</p>
                <p className="text-[#8fbf9f]">+ max-w-5xl</p>
              </div>
            </div>
            <p className="mt-6 text-[14.5px] leading-relaxed text-text/60">
              Four of seven pages flagged. And three measured{" "}
              <strong className="text-text/85">exactly 0.00%</strong> — a tool that cries wolf is
              worse than no tool, so the quiet rows matter as much as the loud ones.
            </p>
          </div>

          <ul className="lg:col-span-7">
            {BLAST.map((r) => {
              const flagged = r.value > 0.5;
              return (
                <li
                  key={r.frame}
                  className="flex items-center gap-4 border-b border-black/8 py-2.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-text/70">
                    {r.frame}
                  </span>
                  <span aria-hidden className="hidden w-36 shrink-0 sm:block">
                    <span
                      className="block h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(3, (r.value / 12.73) * 100)}%`,
                        background: flagged ? "#b6611f" : "rgba(17,17,17,0.12)",
                      }}
                    />
                  </span>
                  <span
                    className={`numeric w-16 text-right font-mono text-[13.5px] ${
                      flagged ? "font-bold text-[#b6611f]" : "text-text/35"
                    }`}
                  >
                    {r.value.toFixed(2)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <Link
          href="/report"
          className="mt-8 inline-block text-[13.5px] font-semibold text-clay underline decoration-1 underline-offset-4 hover:text-clay-deep"
        >
          What the report looks like, and how to read it →
        </Link>
      </Section>

      {/* ── How, in three commands ── */}
      <Section tone="sand" size="sm">
        <Eyebrow>The whole workflow</Eyebrow>
        <h2 className="display-md mb-9 max-w-xl">Three commands, then it&rsquo;s automatic</h2>

        <ol className="grid gap-7 md:grid-cols-3">
          {[
            ["norma-scope init", "Answer a few questions. It sets up the folder and a git hook."],
            ["norma-scope check", "Photographs your running app and scores every page you track."],
            ["open the report", "Side-by-side pictures and one number per page. Send it to anyone."],
          ].map(([cmd, body], i) => (
            <li key={cmd}>
              <span className="numeric mb-2 block text-[11px] font-bold text-text/25">
                0{i + 1}
              </span>
              <code className="mb-2 block font-mono text-[13.5px] font-semibold text-clay-deep">
                {cmd}
              </code>
              <p className="text-[14px] leading-relaxed text-text/55">{body}</p>
            </li>
          ))}
        </ol>

        <Link
          href="/commands"
          className="mt-8 inline-block text-[13.5px] font-semibold text-clay underline decoration-1 underline-offset-4 hover:text-clay-deep"
        >
          Every command →
        </Link>
      </Section>

      {/* ── The pull request ──
          The free CLI's CI story had no picture anywhere on this site, while
          the Cloud page carried a drawn PR comment — so the only pull-request
          visual a visitor met belonged to the paid tier. The Action, the sticky
          comment and the delta column are all free, and this is where they get
          shown. `normascopeWeb.md` §9 has always specced the PR comment onto
          the home page; it just never landed. */}
      <Section tone="paper">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <Eyebrow>On every pull request</Eyebrow>
            <h2 className="display-md mb-4">One comment, edited in place</h2>
            <p className="mb-5 text-base leading-relaxed text-text/60">
              The GitHub Action runs the same comparison your laptop runs, then posts one sticky
              comment. It finds its own previous comment by a hidden marker and rewrites it — ten
              pushes leave one comment, not ten.
            </p>
            <p className="mb-7 text-[15px] leading-relaxed text-text/60">
              When a summary from <code className="font-mono text-[0.95em] text-clay">main</code> is
              available, the table gains a delta column: not &ldquo;8.4%&rdquo;, but &ldquo;8.4%,
              +2.1% since main&rdquo;.
            </p>

            <ul className="mb-7 flex flex-col gap-3">
              {[
                [
                  "Nothing turns red on its own.",
                  "The job passes unless you ask for --strict. A score is information, not a verdict.",
                ],
                [
                  "The full report rides along.",
                  "Side-by-side images and diff overlays are attached as a workflow artifact.",
                ],
                [
                  "Not on GitHub?",
                  "norma-scope comment prints the same markdown to stdout — pipe it into any CI, or into Slack.",
                ],
              ].map(([head, body]) => (
                <li key={head} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay" />
                  <p className="text-[14.5px] leading-relaxed text-text/60">
                    <strong className="font-semibold text-text/85">{head}</strong> {body}
                  </p>
                </li>
              ))}
            </ul>

          </div>

          <div className="lg:col-span-7">
            <PrComment />
            {/* §7: a mockup is allowed here because a real PR cannot be
                photographed without carrying somebody's repository — but it
                says so, in its own caption. */}
            <p className="mt-4 text-[13px] leading-relaxed text-text/45">
              Drawn in GitHub&rsquo;s own shape. A screenshot of a real pull request would carry
              somebody&rsquo;s repository — the columns, the delta and the sticky behaviour are
              exactly what the Action posts.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Coding agents ──
          `normascopeWeb.md` §9 puts the agent loop on the home page, straight
          after the PR comment, and it never landed there — the whole agent
          story reached this page as one link inside the section above. The
          words and the loop are the ones already public on `/agents`; this is
          the trailer, not a second version of it. */}
      <Section id="agents" tone="ink">
        <Eyebrow dark>For coding agents</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl text-white">Your coding agent cannot see</h2>
        <p className="mb-4 max-w-2xl text-base leading-relaxed text-white/55">
          Agents ship frontends fast, and blind. They diff text, not pixels — so one finishes a UI
          task, declares it done, and has no way to know whether the thing it built looks anything
          like the thing it was asked for.
        </p>
        <p className="mb-9 max-w-2xl text-[15px] leading-relaxed text-white/45">
          Normascope gives it a camera and a measuring tape — a number it can move, so it can tell
          whether its last edit helped. Free and local, the same engine the CLI runs.
        </p>

        <AgentLoop />

        <Link
          href="/agents"
          className="mt-8 inline-block text-[13.5px] font-semibold text-pink-300 underline decoration-1 underline-offset-4 hover:text-white"
        >
          The five MCP tools, and what stops an agent fetching anything →
        </Link>
      </Section>

      {/* ── The three walls: the conversion engine ── */}
      <Section tone="sand">
        <Eyebrow>Then your team grows</Eyebrow>
        <h2 className="display-md mb-4 max-w-2xl">
          Three walls every team hits, in roughly this order
        </h2>
        <p className="mb-11 max-w-xl text-base leading-relaxed text-text/60">
          None of them are limits we put there. They&rsquo;re what a tool running entirely on one
          laptop physically cannot do.
        </p>

        <div className="grid gap-x-10 gap-y-10 md:grid-cols-3">
          {WALLS.map((w) => (
            <div key={w.n}>
              <span className="numeric mb-3 block text-[11px] font-bold text-clay/60">{w.n}</span>
              <p className="title-sm mb-2.5 text-text">{w.when}</p>
              <p className="mb-4 text-[14px] leading-relaxed text-text/55">{w.wall}</p>
              <p className="border-l-2 border-clay/50 pl-3 text-[14px] font-medium leading-relaxed text-text/80">
                {w.answer}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <CloudBand
        form
        wall="Turn every run into shared visual memory."
        answer="Cloud keeps the history, gives your team a stable link, and shows when a page first started drifting. Join early access now and be first to use it when the hosted surface opens."
      />

      {/* ── What it won't do ── */}
      <Section tone="paper" size="sm">
        <Eyebrow>Before you install it</Eyebrow>
        <h2 className="display-sm mb-7 max-w-xl">Four things it will never do</h2>
        <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {[
            ["It won't block your commit.", "Or your build, unless you explicitly ask it to."],
            ["It won't change anything.", "It reports. You decide."],
            ["It won't upload your screenshots by default.", "Cloud is opt-in when your team needs shared history."],
            ["It won't let an AI decide pass or fail.", "The score is pixels and geometry, always."],
          ].map(([head, body]) => (
            <li key={head} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay" />
              <p className="text-[14.5px] leading-relaxed text-text/60">
                <strong className="font-semibold text-text/85">{head}</strong> {body}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Close ── */}
      <Section tone="sand" size="sm">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="display-sm mb-2">Try it on your next commit</h2>
            <p className="text-[14.5px] text-text/55">
              Sixty seconds, no account, nothing to uninstall.
            </p>
          </div>
          <CopyLine command="npx norma-scope init" />
        </div>
      </Section>
    </>
  );
}
