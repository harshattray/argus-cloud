"use client";

import { useEffect, useRef, useState } from "react";

/** Click-to-copy command chip. The `$` is decoration and is never copied. */
export function CopyCommand({
  command,
  display,
  size = "md",
  className = "",
}: {
  command: string;
  /** Shown instead of `command` when the full string is too long for the chip. */
  display?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function copy() {
    navigator.clipboard
      .writeText(command)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }

  const sizing = {
    sm: "gap-2 rounded-lg pl-3 pr-2.5 py-1.5 text-[11px]",
    md: "gap-3 rounded-xl pl-5 pr-4 py-3.5 text-sm",
    lg: "gap-4 rounded-2xl pl-7 pr-5 py-5 text-base md:text-lg",
  }[size];

  return (
    <button
      onClick={copy}
      className={`group inline-flex max-w-full items-center bg-[#111]/95 text-white font-mono shadow-lg hover:bg-[#111] hover:shadow-xl transition-all ${sizing} ${className}`}
    >
      <span className="text-emerald-400" aria-hidden>
        $
      </span>
      <span className="truncate">{display ?? command}</span>
      <span
        className={`ml-2 shrink-0 uppercase tracking-widest text-white/40 group-hover:text-white/70 transition-colors ${
          size === "lg" ? "text-xs" : "text-[9px]"
        }`}
      >
        {copied ? "copied ✓" : "copy"}
      </span>
      <span className="sr-only" role="status">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
