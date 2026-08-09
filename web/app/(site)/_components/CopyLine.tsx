"use client";

import { useState } from "react";

/** A copyable install command. Falls back to a plain, selectable line when the
 *  clipboard API is unavailable — the command must always be readable. */
export function CopyLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked or unavailable; the text is still on screen.
    }
  };

  return (
    <div className="inline-flex items-center gap-3 rounded-xl bg-[#111] py-3 pl-4 pr-3 font-mono text-[14px] text-white">
      <span aria-hidden className="text-emerald-400">
        $
      </span>
      <code>{command}</code>
      <button
        onClick={copy}
        className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${command} copied to clipboard` : ""}
      </span>
    </div>
  );
}
