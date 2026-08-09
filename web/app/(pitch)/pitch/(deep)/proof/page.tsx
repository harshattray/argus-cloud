import Link from "next/link";
import type { Metadata } from "next";
import { Label, Section } from "../../_components/primitives";
import { Chapter, Steps, Split, Figure, DataTable, Metric, Note, CloudHook } from "../../_components/editorial";
import {
  CASE_01,
  CASE_02,
  CASE_04,
  CASE_05,
  CASE_INDEX,
  CASE_02_FRAMES,
  MATRIX,
  SCENARIOS,
  isFlagged,
  SENSITIVITY_BEFORE_AFTER,
  COLOUR_FLOOR,
  AGENT_LOOP,
  AGENT_SCORES,
  AUDIT_REFUSALS,
  STICKY_COMMENT_ROWS,
  OWN_FINDINGS,
  CLI_VERSION,
} from "../../../../../lib/cases";

export const metadata: Metadata = {
  title: "Evidence",
  description:
    "Five real Normascope runs against real sites — design fidelity at 36.4%, five one-line regressions caught, a $0.38 AI run including what it got wrong, a live agent loop, and a real pull-request comment.",
  alternates: { canonical: "/proof" },
};

const pct = (v: number | null) => (v === null ? null : `${v.toFixed(2)}%`);

export default function ProofPage() {
  return (
    <>
      {/* ── Opening ── */}
      <Section tone="paper">
        <Label>Evidence</Label>
        <h1 className="display-lg mb-6">Every number on this site came out of a real run</h1>
        <p className="text-lg text-text/60 leading-relaxed mb-5">
          Nothing here is mocked, hand-drawn or retouched. Four runs against real sites — one of them
          not ours — with the reports they produced, published as they came out.
        </p>
        <p className="text-base text-text/50 leading-relaxed">
          Including the parts that went badly — the last section is a list of four defects this
          exercise found in our own tool.
        </p>
      </Section>

      {/* ── Index ── */}
      <Section tone="sand" measure="wide">
        <ol className="grid gap-px overflow-hidden rounded-xl bg-black/8 sm:grid-cols-2 lg:grid-cols-3">
          {CASE_INDEX.map((c) => (
            <li key={c.n}>
              <a
                href={c.href}
                className="flex h-full flex-col bg-paper px-5 py-5 transition-colors hover:bg-white/70"
              >
                <span className="eyebrow numeric text-clay">Case {c.n}</span>
                <span className="mt-2 text-[13px] italic leading-snug text-text/45">
                  {c.question}
                </span>
                <span className="title-sm mt-2.5 text-text">{c.headline}</span>
                <span className="mt-1.5 text-[13.5px] leading-relaxed text-text/55">{c.sub}</span>
              </a>
            </li>
          ))}
        </ol>
      </Section>

      {/* ═══════════════ CASE 01 ═══════════════ */}
      <Chapter
        n="01"
        kicker="Design fidelity"
        title="A site we don't own, against a design we didn't draw"
        lede={CASE_01.question}
      />

      <Section tone="paper" measure="wide" id="fidelity" flushTop>
        <Split
          align="start"
          visual={
            <Figure
              src={CASE_01.images.diff}
              alt="The diff overlay for the Bose landing page: large painted regions where the shipped photography differs from the design, and vertical drift below the hero."
              tall
              caption={
                <>
                  The overlay for the full 1260&thinsp;×&thinsp;4596 frame, scaled down.{" "}
                  <a
                    href={CASE_01.report}
                    target="_blank"
                    rel="noopener"
                    className="text-clay underline underline-offset-2"
                  >
                    Open the real report →
                  </a>
                </>
              }
            />
          }
        >
          <p className="text-base leading-relaxed text-text/65 mb-6">
            A public Bose landing-page implementation compared against the Figma file it was built
            from. Neither the site nor the design is ours, which is the point: this is what
            accumulated drift looks like on somebody else&rsquo;s real project.
          </p>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <Metric value="36.41" unit="%" label="aligned difference" tone="flagged" />
            <Metric value="62" label="SSIM — structure has genuinely diverged" />
            <Metric value="10" label="significant regions" />
            <Metric value="3" label="drifted sections" />
          </div>

          <ul className="space-y-3">
            {CASE_01.defects.map((d) => (
              <li key={d} className="flex gap-2.5 text-[14.5px] leading-relaxed text-text/60">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay" />
                {d}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-[13.5px] leading-relaxed text-text/45">
            A 36% score is not a broken site. It is a site that stopped matching its design a long
            time ago, and nobody was measuring.
          </p>
        </Split>
      </Section>

      {/* ═══════════════ CASE 02 ═══════════════ */}
      <Chapter
        n="02"
        kicker="Visual regression"
        title="Five one-line commits that would pass code review"
        lede={CASE_02.question}
        tone="sand"
      />

      <Section tone="sand" measure="wide" id="regression" flushTop>
        <div className="mb-10 max-w-2xl text-base leading-relaxed text-text/65">
          Seven section-level frames from a real site, approved as a baseline, then put through five
          separate commits — each of them one line, each the kind of change nobody comments on.
          Threshold {CASE_02.threshold}%, {CLI_VERSION}, all seven frames captured at{" "}
          {CASE_02.viewport}.
        </div>

        <DataTable
          head={["Frame", "s1 rhythm", "s2 width", "s3 button", "s4 aspect", "s5 token", "s6 control"]}
          rows={MATRIX.map((row) => ({
            cells: [row.frame, ...row.values.map(pct)],
            emphasis: [false, ...row.values.map(isFlagged)],
          }))}
          caption={
            <>
              Aligned mismatch per frame. Highlighted cells are above the {CASE_02.threshold}%
              threshold; an em dash is an exact 0.00%. <strong className="text-text/70">Lab — Index</strong>{" "}
              is dark-themed and never touches the changed token, so it reads zero through all five
              regressions — that row is the reason to believe the others.
            </>
          }
        />

        <div className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => (
            <div key={s.id} className="min-w-0">
              <div className="mb-2.5 flex items-baseline gap-2.5">
                <span className="eyebrow numeric text-text/30">{s.id}</span>
                <span className="title-sm text-text">{s.intent}</span>
              </div>
              <code className="mb-3 block overflow-x-auto rounded-lg bg-black/[0.055] px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-text/70">
                {s.commit}
              </code>
              <p className="mb-2.5 flex items-baseline gap-2 text-[13px]">
                <span className="numeric font-bold text-text">{s.flagged} of 7</span>
                <span className="text-text/40">flagged · peak</span>
                <span className="numeric font-bold text-text">{s.peak}%</span>
              </p>
              <p className="text-[13.5px] leading-relaxed text-text/55">{s.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <Figure
            src={CASE_02.images.geometry}
            alt="A diff overlay showing small red boxes on a ghosted page — a geometric change."
            caption={
              <>
                <strong className="font-semibold text-text/70">s2, the hero.</strong> Geometry: small
                boxes, ghosted page. 8.27% at SSIM 88.{" "}
                <a
                  href={CASE_02.reports.s2}
                  target="_blank"
                  rel="noopener"
                  className="text-clay underline underline-offset-2"
                >
                  Open this report →
                </a>
              </>
            }
          />
          <Figure
            src={CASE_02.images.recolour}
            alt="A diff overlay in which the whole background is painted red while the text is untouched — a colour change."
            caption={
              <>
                <strong className="font-semibold text-text/70">s5, the articles index.</strong>{" "}
                Recolour: flooded background, untouched text. 97.36% at SSIM 99.9.{" "}
                <a
                  href={CASE_02.reports.s5}
                  target="_blank"
                  rel="noopener"
                  className="text-clay underline underline-offset-2"
                >
                  Open this report →
                </a>
              </>
            }
          />
        </div>

        <div className="mt-10 max-w-3xl">
          <Note kind="limit" title="Where the colour floor actually sits">
            <p>
              The token commit above is caught. Smaller nudges are not, and it is worth being exact
              about that rather than claiming the tool sees everything.
            </p>
            <div className="pt-1">
              <DataTable
                head={["From", "To", "Δ RGB", "Result"]}
                rows={COLOUR_FLOOR.map((c) => ({
                  cells: [c.from, c.to, c.delta, c.result],
                  emphasis: [false, false, false, c.result.startsWith("5")],
                }))}
              />
            </div>
            <p>
              The honest claim is &ldquo;catches a visible token change&rdquo;, not &ldquo;catches
              any colour change&rdquo;.
            </p>
          </Note>
        </div>
      </Section>

      {/* ═══════════════ CASE 04 ═══════════════ */}
      <Chapter
        n="03"
        kicker="Agent verification"
        title="An agent that checked its own work and closed the loop"
        lede={CASE_04.question}
        tone="ink"
      />

      <Section tone="ink" measure="wide" id="agent" flushTop>
        <Split
          align="start"
          visual={
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="eyebrow mb-4 text-white/35">Scores the agent saw at step 2</p>
              <ul className="space-y-1.5">
                {AGENT_SCORES.map((s) => (
                  <li
                    key={s.frame}
                    className="flex items-baseline gap-3 font-mono text-[12.5px] leading-relaxed"
                  >
                    <span className="min-w-0 flex-1 truncate text-white/60">{s.frame}</span>
                    <span
                      className={`numeric w-14 text-right font-bold ${
                        s.flagged ? "text-[#e29055]" : "text-white/35"
                      }`}
                    >
                      {s.score}
                    </span>
                    <span className="numeric w-12 text-right text-white/30">ssim {s.ssim}</span>
                    <span
                      className={`w-16 text-right text-[10px] font-bold uppercase tracking-wider ${
                        s.flagged ? "text-[#e29055]" : "text-white/25"
                      }`}
                    >
                      {s.flagged ? "flagged" : "ok"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[12.5px] text-white/50">
                flagged before fix: {CASE_04.flaggedBefore} → after fix: {CASE_04.flaggedAfter}
              </p>
            </div>
          }
        >
          <p className="mb-7 text-base leading-relaxed text-white/60">
            Driven over real stdio JSON-RPC, with the raw wire transcripts recorded. No human looked
            at a screenshot at any point.
          </p>
          <Steps
            dark
            items={AGENT_LOOP.map((s) => ({
              head: s.step,
              body: <span className="font-mono text-[13px]">{s.detail}</span>,
            }))}
          />
        </Split>

        <div className="mt-14">
          <p className="eyebrow mb-3 text-pink-400">Both guardrails, tested live</p>
          <h3 className="display-sm mb-4 max-w-2xl text-white">
            An agent will try to fetch anything. These are real refusals.
          </h3>
          <p className="mb-6 max-w-2xl text-[15px] leading-relaxed text-white/55">
            Capture is default-deny: only origins you configured, and metadata endpoints, private
            ranges and non-http schemes are refused even when configured. Every refusal is written to
            an audit log with a named reason.
          </p>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <pre className="min-w-[42rem] font-mono text-[11.5px] leading-relaxed text-white/55">
              {AUDIT_REFUSALS.map(
                (r) => `${r.time}  ${r.tool}  REFUSED  ${r.target}  ${r.reason}`
              ).join("\n")}
            </pre>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/40">
            That trail is the answer to &ldquo;why not just let the agent run a screenshot
            script&rdquo;.
          </p>
        </div>
      </Section>

      {/* ═══════════════ CASE 05 ═══════════════ */}
      <Chapter
        n="04"
        kicker="The pull request"
        title="What the rest of the team actually sees"
        lede={CASE_05.question}
        tone="sand"
      />

      <Section tone="sand" measure="wide" id="pr" flushTop>
        <Split
          align="start"
          flip
          visual={
            <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
              <div className="flex items-center gap-2 border-b border-black/8 px-4 py-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#111] text-[10px] font-bold text-white">
                  n
                </span>
                <span className="text-[13px] font-semibold text-text">Normascope</span>
                <span className="ml-auto text-[11px] text-text/35">edited in place</span>
              </div>
              <div className="px-4 py-4">
                <p className="mb-3.5 text-[14px] text-text/75">
                  ⚠️{" "}
                  <strong className="font-semibold">
                    {CASE_05.flagged} of {CASE_05.compared}
                  </strong>{" "}
                  compared frame(s) above the {CASE_05.threshold}% threshold.
                </p>
                <table className="w-full border-collapse text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-black/10">
                      {["Frame", "Mode", "Aligned", "Detail", "Status"].map((h) => (
                        <th key={h} className="py-1.5 pr-3 font-semibold text-text/45">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STICKY_COMMENT_ROWS.map((r) => (
                      <tr key={r.frame} className="border-b border-black/5">
                        <td className="py-1.5 pr-3 text-text/75">{r.frame}</td>
                        <td className="py-1.5 pr-3 text-text/45">{r.mode}</td>
                        <td className="numeric py-1.5 pr-3 font-mono text-text/75">{r.aligned}</td>
                        <td className="numeric py-1.5 pr-3 font-mono text-text/45">
                          SSIM {r.ssim}
                        </td>
                        <td className="py-1.5 whitespace-nowrap text-text/60">
                          {r.flagged ? "⚠️ above threshold" : "✅"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          }
        >
          <p className="mb-5 text-base leading-relaxed text-text/65">
            Rendered by the tool from the run&rsquo;s own summary — this is byte-for-byte what the
            workflow posts. The comment is keyed on a hidden marker, so every later push edits{" "}
            <em>that</em> comment instead of stacking a new one.
          </p>
          <p className="mb-5 text-[14.5px] leading-relaxed text-text/55">
            When a summary from the default branch exists, a delta column joins it — so the row reads
            not just &ldquo;3.4%&rdquo; but how far it has moved since main.
          </p>
          <a
            href={CASE_05.report}
            target="_blank"
            rel="noopener"
            className="inline-block text-[13px] font-semibold text-clay underline underline-offset-4"
          >
            Open the full report from this run →
          </a>
        </Split>

        <div className="mt-10 max-w-3xl">
          <Note kind="limit" title="A red check means CI broke, not that your UI changed">
            <p>
              Normascope exits 0 whatever the scores are. Only{" "}
              <code className="font-mono text-[13px]">--strict</code>, which you turn on yourself,
              makes a job fail. A visual change surfaces as this comment and nothing else.
            </p>
            <p>
              One thing this run taught us: committed baselines are captured on a developer&rsquo;s
              machine and CI runs on Linux, which draws text differently enough to swamp any
              threshold. This workflow captures the base branch and the head branch{" "}
              <em>in the same job</em> so both images come from identical hardware.
            </p>
          </Note>
        </div>
      </Section>

      {/* ═══════════════ Our own defects ═══════════════ */}
      <Section tone="paper" measure="wide" id="ourselves">
        <Label>The uncomfortable section</Label>
        <h2 className="display-md mb-5 max-w-3xl">What we found in our own tool</h2>
        <p className="mb-10 max-w-2xl text-base leading-relaxed text-text/60">
          We ran this evidence set specifically to find out where the tool was wrong. It found four
          things. All four are fixed and published in {CLI_VERSION}, and one of them was serious
          enough that every number on this page was re-measured afterwards.
        </p>

        <div className="grid gap-x-10 gap-y-9 md:grid-cols-2">
          {OWN_FINDINGS.map((f) => (
            <div key={f.head} className="min-w-0">
              <h3 className="title-sm mb-2 text-text">{f.head}</h3>
              <p className="mb-3 text-[14.5px] leading-relaxed text-text/55">{f.body}</p>
              <p className="border-l-2 border-[#3e7d52]/40 pl-3 text-[13.5px] leading-relaxed text-text/60">
                {f.fix}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 max-w-3xl">
          <DataTable
            head={["Measurement", "Before the fix", "After"]}
            rows={SENSITIVITY_BEFORE_AFTER.map((s) => ({
              cells: [s.what, s.before, s.after],
              emphasis: [false, false, s.after.includes("flagged")],
            }))}
            caption="The sensitivity split, measured. The colour-token commit went from silent to loud; the geometric changes roughly tripled in signal; and the control frame did not move at all — a five-times tighter tolerance that bought no false positives."
          />
        </div>
      </Section>

      {/* ═══════════════ Close ═══════════════ */}
      <Section tone="sand" measure="wide">
        <CloudHook
          limitation="Each of these is one run."
          answer="The interesting question — is this getting worse? — needs the previous forty, and that needs somewhere to keep them."
        />

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/pitch/report"
            className="rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            Learn to read a report
          </Link>
          <Link
            href="/pitch/commands"
            className="rounded-lg border border-black/12 px-4 py-2.5 text-sm font-semibold text-text/70 transition-colors hover:border-black/25 hover:text-text"
          >
            Run it yourself
          </Link>
        </div>
      </Section>
    </>
  );
}
