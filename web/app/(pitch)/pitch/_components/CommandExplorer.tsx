"use client";

import { useState } from "react";
import { COMMANDS, GROUPS } from "../../../../lib/commands";
import { Spark } from "./primitives";
import { CopyCommand } from "./CopyCommand";

/**
 * The CLI surface, explorable (docs/normascopeWeb.md §8.4). Chips on desktop
 * driving one detail panel; an accordion on mobile, where a two-pane layout
 * would just mean scrolling past the chips to reach the answer.
 */
export function CommandExplorer() {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(0);
  const cmd = COMMANDS[active];

  return (
    <div>
      {/* Mobile: accordion */}
      <div className="md:hidden flex flex-col gap-6">
        {GROUPS.map((group) => {
          const items = COMMANDS.map((c, i) => ({ c, i })).filter(({ c }) => c.group === group.label);
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-2.5">
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] shrink-0 ${group.color}`}>
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-black/8" />
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map(({ c, i }) => {
                  const isOpen = open === i;
                  return (
                    <div
                      key={c.name}
                      className={`rounded-xl border transition-colors ${
                        isOpen ? "border-black/15 bg-black/[0.02]" : "border-black/8"
                      }`}
                    >
                      <button
                        onClick={() => setOpen(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
                      >
                        <code className="font-mono text-[13px] text-text/80 flex-1 min-w-0 truncate">
                          <span className="text-emerald-600">$ </span>
                          {c.cmd.replace("npx ", "")}
                        </code>
                        <svg
                          className={`w-3.5 h-3.5 shrink-0 text-text/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-3.5 pb-4">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-pink-500 mb-2">
                            {c.when}
                          </p>
                          <ul className="flex flex-col gap-1.5">
                            {c.detail.map((d) => (
                              <li key={d} className="flex gap-2.5 text-sm text-text/60 leading-relaxed">
                                <Spark className="w-2.5 h-2.5 text-pink-400 shrink-0 mt-1" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: chips + detail panel */}
      <div className="hidden md:block">
        <div className="flex flex-col gap-5 mb-9">
          {GROUPS.map((group) => {
            const items = COMMANDS.map((c, i) => ({ c, i })).filter(({ c }) => c.group === group.label);
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="grid grid-cols-[92px_1fr] gap-8 items-center">
                <span className={`text-[10px] font-black uppercase tracking-[0.24em] shrink-0 ${group.color}`}>
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {items.map(({ c, i }) => (
                    <button
                      key={c.name}
                      onClick={() => setActive(i)}
                      aria-pressed={active === i}
                      className={`shrink-0 rounded-lg px-4 py-2.5 font-mono text-[13px] transition-colors ${
                        active === i
                          ? "bg-[#111] text-white shadow-sm"
                          : "bg-black/[0.045] text-text/75 hover:bg-black/8 hover:text-text"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-black/[0.025] px-7 py-7">
          <CopyCommand command={cmd.cmd} size="md" />
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-pink-500">{cmd.when}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {cmd.detail.map((d) => (
              <li key={d} className="flex gap-3 text-[16px] text-text/75 leading-relaxed">
                <Spark className="w-2.5 h-2.5 text-pink-400 shrink-0 mt-2" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 pt-5 border-t border-black/8 grid sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-text/35 mb-1">Reads</dt>
              <dd className="text-sm text-text/60 font-mono leading-relaxed">{cmd.reads}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-text/35 mb-1">Writes</dt>
              <dd className="text-sm text-text/60 font-mono leading-relaxed">{cmd.writes}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
