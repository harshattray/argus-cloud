import Link from "next/link";
import type { Metadata } from "next";
import { Eyebrow, Section, Shot, Spark, CloudBand } from "../_components/ui";
import { CopyLine } from "../_components/CopyLine";
import { CommandExplorer } from "../../(pitch)/pitch/_components/CommandExplorer";
import { ConfigBuilder } from "../../(pitch)/pitch/_components/ConfigBuilder";
import { COMMANDS, FLAGS, DECISIONS, GROUPS } from "../../../lib/commands";
import { TwinAside } from "../_components/twins";

/**
 * The CLI reference.
 *
 * This is the long-form version that used to live behind the `/pitch` gate,
 * promoted to the public site on request: a config builder that writes a real
 * `.bridge/config.json`, an explorer for all ten commands, the reads/writes
 * table and the flag list. The earlier public page listed six commands as flat
 * prose, which is strictly less than the tool does.
 *
 * The interactive pieces are imported from the pitch tree rather than copied —
 * two transcriptions of the same CLI would drift, and `lib/commands.ts` is the
 * single source both pages read.
 */

export const metadata: Metadata = {
  title: "Commands",
  description:
    "Every Normascope command and flag — init, doctor, auto, compare, check, baseline, snapshot, comment, explain and clean — plus a builder that writes your config for you.",
  alternates: { canonical: "/commands" },
};

export default function CommandsPage() {
  return (
    <>
      {/* ── Hero ──
          Two columns. The left makes the argument, the right proves it with a
          real capture of the command actually running — which is the only thing
          on this page a sceptic will look at before deciding to keep reading. */}
      <Section tone="paper" size="sm">
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-5">
            <Eyebrow>The reference</Eyebrow>
            <h1 className="display-lg mb-5">Ten commands, no guesswork</h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-text/60">
              Two of them do almost everything: <span className="font-mono text-base">init</span>{" "}
              once, then <span className="font-mono text-base">check</span> forever. The rest are
              there for the days something is wrong, or CI needs to work differently.
            </p>
            <CopyLine command="npx norma-scope init" />
            <p className="mt-4 text-[13px] text-text/45">
              Nothing to install first — <code className="font-mono text-[0.95em] text-clay">npx</code>{" "}
              fetches it on the first run. Node 18 or newer is the whole list of requirements.
            </p>

            <dl className="mt-8 grid max-w-md grid-cols-3 gap-5 border-t border-black/8 pt-6">
              {[
                ["10", "commands"],
                ["1", "config file"],
                ["0", "accounts"],
              ].map(([n, label]) => (
                <div key={label}>
                  <dt className="numeric text-3xl font-bold leading-none text-clay">{n}</dt>
                  <dd className="mt-1.5 text-[12.5px] uppercase tracking-wider text-text/40">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <Shot
              src="/screens/cli-compare.png"
              alt="A terminal running npx norma-scope compare with the --json and --strict flags. It prints one line per frame — 0.3% aligned with 5.6% unaligned, SSIM 99 and two drifted sections for the first, 0.0% for the other two — then reports where the report and summary were saved, and that --strict is exiting 1 because one frame is above the threshold."
              caption={
                <>
                  One real run.{" "}
                  <strong className="font-semibold text-text/70">Every command prints like this</strong>{" "}
                  — one line per page, the numbers that matter, and exactly where it put the files.
                </>
              }
            />

            {/* The six groups, as a map of the page below. Colour is the same
                one each group carries in the explorer, so the two read as one
                system rather than as decoration. */}
            <div className="mt-7 border-t border-black/8 pt-6">
              <p className="eyebrow mb-3.5 text-text/35">Grouped by what they do</p>
              <div className="flex flex-wrap gap-2">
                {GROUPS.map((g) => (
                  <span
                    key={g.label}
                    className={`inline-flex items-center gap-2 rounded-lg border border-black/8 bg-white/60 px-3 py-1.5 text-[12.5px] font-semibold ${g.color}`}
                  >
                    {g.label}
                    <span className="numeric text-[11px] font-bold text-text/30">
                      {COMMANDS.filter((c) => c.group === g.label).length}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── The config builder ── */}
      <Section tone="sand">
        <Eyebrow>Start here</Eyebrow>
        <h2 className="display-md mb-5 max-w-2xl">
          Answer three questions,
          <br className="hidden md:block" /> get a working config
        </h2>
        <p className="mb-9 max-w-2xl text-base leading-relaxed text-text/60">
          This writes a real <span className="font-mono text-sm">.bridge/config.json</span> and the
          exact commands to run with it. Copy it into your project and it works.
        </p>
        <ConfigBuilder />
      </Section>

      {/* ── Every command ── */}
      <Section tone="paper">
        {/* Pointing at the explorer — the one thing on the page to click. */}
        <TwinAside pose="point" className="mb-9">
          <Eyebrow>Every command</Eyebrow>
          <h2 className="display-md">Pick one to see what it does</h2>
        </TwinAside>
        <CommandExplorer />
      </Section>

      {/* ── Reads and writes ── */}
      <Section tone="sand">
        <Eyebrow>At a glance</Eyebrow>
        <h2 className="display-md mb-8">What each one reads and writes</h2>

        <div className="overflow-hidden overflow-x-auto rounded-2xl border border-black/8 bg-white/50">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-black/[0.04] text-[10px] font-black uppercase tracking-[0.14em] text-text/45">
              <tr>
                <th className="w-40 px-4 py-3">Command</th>
                <th className="px-3 py-3">Reads</th>
                <th className="px-3 py-3">Writes</th>
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map((c) => (
                <tr key={c.name} className="border-t border-black/6 align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text/80">
                    {c.name}
                  </td>
                  <td className="px-3 py-3 text-xs leading-relaxed text-text/50">{c.reads}</td>
                  <td className="px-3 py-3 font-mono text-xs leading-relaxed text-text/50">
                    {c.writes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Flags and the decision table ── */}
      <Section tone="paper">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>Flags</Eyebrow>
            <h2 className="display-sm mb-7">The ones worth knowing</h2>
            <dl className="flex flex-col gap-3">
              {FLAGS.map((f) => (
                <div key={f.flag} className="flex gap-4 border-t border-black/8 py-2.5">
                  <dt className="w-24 shrink-0 pt-0.5 font-mono text-xs font-bold text-clay">
                    {f.flag}
                  </dt>
                  <dd className="text-sm leading-relaxed text-text/55">{f.effect}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <Eyebrow>Which do I want?</Eyebrow>
            <h2 className="display-sm mb-7">Start from the problem</h2>
            <div className="flex flex-col gap-4">
              {DECISIONS.map((d) => (
                <div
                  key={d.want}
                  className="rounded-xl border border-black/8 bg-black/[0.02] px-4 py-3.5"
                >
                  <p className="mb-2 text-sm italic leading-snug text-text/70">
                    &ldquo;{d.want}&rdquo;
                  </p>
                  <p className="flex items-center gap-2">
                    <Spark className="h-2.5 w-2.5 shrink-0 text-clay" />
                    <code className="font-mono text-xs text-text/80">{d.answer}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── The three papercuts ── */}
      <Section tone="sand" size="sm">
        <Eyebrow>Worth knowing</Eyebrow>
        <h2 className="display-md mb-8 max-w-xl">Three things that trip people up</h2>

        <div className="grid gap-7 md:grid-cols-3">
          {[
            [
              "Start your app first",
              "Normascope photographs a running app; it doesn't start one. Run your dev server, then run the command.",
            ],
            [
              "Nothing is ever blocked",
              "A bad score is information. The git hook always succeeds and CI stays green unless you explicitly ask for the opposite.",
            ],
            [
              "Name the file after the page",
              "The screenshot filename is what ties your design, your capture and the difference together. Keep them the same and everything lines up.",
            ],
          ].map(([head, body]) => (
            <div key={head}>
              <p className="title-sm mb-1.5 text-text">{head}</p>
              <p className="text-[14px] leading-relaxed text-text/55">{body}</p>
            </div>
          ))}
        </div>

        <p className="mt-9 text-[14px] leading-relaxed text-text/50">
          Every command ships with <code className="font-mono text-[0.95em] text-clay">--help</code>,
          and <code className="font-mono text-[0.95em] text-clay">doctor</code> explains anything
          that&rsquo;s misconfigured in your project rather than making you go and look it up.
        </p>
      </Section>

      <CloudBand
        wall="All of that runs on one machine, for one person."
        answer="The moment a second person needs to see a result, or you need to know whether a page has been drifting, you need somewhere to put it."
      />

      <Section tone="paper" size="sm">
        <Link
          href="/report"
          className="inline-block rounded-lg bg-[#111] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          What the report looks like
        </Link>
      </Section>
    </>
  );
}
