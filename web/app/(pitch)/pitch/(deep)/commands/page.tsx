import type { Metadata } from "next";
import { Label, Section, Spark } from "../../_components/primitives";
import { CommandExplorer } from "../../_components/CommandExplorer";
import { ConfigBuilder } from "../../_components/ConfigBuilder";
import { COMMANDS, FLAGS, DECISIONS } from "../../../../../lib/commands";

export const metadata: Metadata = {
  title: "Commands",
  description:
    "Every Normascope command and flag — init, doctor, auto, compare, check, baseline, snapshot, comment, explain and clean — plus a builder that writes your config for you.",
  alternates: { canonical: "/commands" },
};

export default function CommandsPage() {
  return (
    <>
      <Section tone="paper">
        <Label>The reference</Label>
        <h1 className="display-lg mb-6">
          Ten commands,<br className="hidden md:block" /> no guesswork
        </h1>
        <p className="text-lg text-text/60 leading-relaxed">
          Two of them do almost everything: <span className="font-mono text-base">init</span> once, then{" "}
          <span className="font-mono text-base">check</span> forever. The rest are there for the days
          something is wrong, or CI needs to work differently.
        </p>
      </Section>

      <Section tone="sand" measure="wide">
        <Label>Start here</Label>
        <h2 className="display-md mb-5 max-w-2xl">
          Answer three questions,<br className="hidden md:block" /> get a working config
        </h2>
        <p className="text-base text-text/60 leading-relaxed max-w-2xl mb-9">
          This writes a real <span className="font-mono text-sm">.bridge/config.json</span> and the exact
          commands to run with it. Copy it into your project and it works.
        </p>
        <ConfigBuilder />
      </Section>

      <Section tone="paper" measure="wide">
        <Label>Every command</Label>
        <h2 className="display-md mb-9">
          Pick one to see what it does
        </h2>
        <CommandExplorer />
      </Section>

      <Section tone="sand" measure="wide">
        <Label>At a glance</Label>
        <h2 className="display-md mb-8">
          What each one reads and writes
        </h2>

        <div className="rounded-2xl border border-black/8 bg-white/50 overflow-hidden overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead className="bg-black/[0.04] text-[10px] font-black uppercase tracking-[0.14em] text-text/45">
              <tr>
                <th className="px-4 py-3 w-40">Command</th>
                <th className="px-3 py-3">Reads</th>
                <th className="px-3 py-3">Writes</th>
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map((c) => (
                <tr key={c.name} className="border-t border-black/6 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-text/80 whitespace-nowrap">{c.name}</td>
                  <td className="px-3 py-3 text-xs text-text/50 leading-relaxed">{c.reads}</td>
                  <td className="px-3 py-3 text-xs text-text/50 leading-relaxed font-mono">{c.writes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="paper" measure="wide">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <Label>Flags</Label>
            <h2 className="display-sm mb-7">
              The ones worth knowing
            </h2>
            <dl className="flex flex-col gap-3">
              {FLAGS.map((f) => (
                <div key={f.flag} className="flex gap-4 py-2.5 border-t border-black/8">
                  <dt className="font-mono text-xs font-bold text-clay shrink-0 w-24 pt-0.5">{f.flag}</dt>
                  <dd className="text-sm text-text/55 leading-relaxed">{f.effect}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <Label>Which do I want?</Label>
            <h2 className="display-sm mb-7">
              Start from the problem
            </h2>
            <div className="flex flex-col gap-4">
              {DECISIONS.map((d) => (
                <div key={d.want} className="rounded-xl border border-black/8 bg-black/[0.02] px-4 py-3.5">
                  <p className="text-sm text-text/70 italic leading-snug mb-2">&ldquo;{d.want}&rdquo;</p>
                  <p className="flex items-center gap-2">
                    <Spark className="w-2.5 h-2.5 text-pink-400 shrink-0" />
                    <code className="font-mono text-xs text-text/80">{d.answer}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
