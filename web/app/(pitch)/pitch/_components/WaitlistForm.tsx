"use client";

import { useRef, useState, type FormEvent } from "react";
import { Spark } from "./primitives";

/**
 * Waitlist signup. One component behind every placement on the site
 * (docs/normascopeWeb.md §11) so the validation, the honeypot and the copy
 * can never drift between them.
 *
 * `startedAt` is stamped on mount and sent with the submission — the server
 * rejects anything filled faster than a human could type.
 */

type Tone = "light" | "dark";

export function WaitlistForm({
  source,
  tone = "light",
  layout = "inline",
  cta = "Request access",
}: {
  source: string;
  tone?: Tone;
  layout?: "inline" | "stacked";
  cta?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const mountedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);

  const dark = tone === "dark";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === "busy") return;

    setState("busy");
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source,
          website: honeypot.current?.value ?? "",
          startedAt: mountedAt.current,
          referrer: typeof document !== "undefined" ? document.referrer : "",
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (res.ok && data?.ok) {
        setState("done");
        setEmail("");
        return;
      }
      setState("error");
      setError(data?.error ?? "Something went wrong. Please try again.");
    } catch {
      setState("error");
      setError("Couldn't reach the server. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div
        className={`flex items-start gap-2.5 rounded-xl border px-4 py-3.5 ${
          dark
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            : "border-emerald-300 bg-emerald-50 text-emerald-800"
        }`}
        role="status"
      >
        <Spark className="w-3 h-3 shrink-0 mt-1" />
        <div>
          <p className="text-sm font-bold">You&apos;re on the list.</p>
          <p className={`text-xs mt-0.5 ${dark ? "text-emerald-200/70" : "text-emerald-700/80"}`}>
            We&apos;ll email you when Normascope Cloud opens up. No newsletter, no drip sequence.
          </p>
        </div>
      </div>
    );
  }

  const inputClass = dark
    ? "bg-white/8 border-white/15 text-white placeholder:text-white/30 focus:ring-pink-400/60"
    : "bg-white border-black/12 text-text placeholder:text-text/30 focus:ring-clay/50";

  const buttonClass = dark
    ? "bg-white text-ink hover:bg-white/90"
    : "bg-[#111] text-white hover:bg-black";

  return (
    <form
      onSubmit={submit}
      className={layout === "inline" ? "flex flex-col sm:flex-row gap-2.5" : "flex flex-col gap-2.5"}
      noValidate
    >
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="absolute w-px h-px -m-px overflow-hidden p-0 border-0" aria-hidden>
        <label htmlFor={`website-${source}`}>Leave this field empty</label>
        <input
          ref={honeypot}
          id={`website-${source}`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label htmlFor={`waitlist-${source}`} className="sr-only">
        Email address
      </label>
      <input
        id={`waitlist-${source}`}
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === "error") setState("idle");
        }}
        placeholder="you@company.com"
        aria-invalid={state === "error"}
        aria-describedby={error ? `waitlist-error-${source}` : undefined}
        className={`flex-1 min-w-0 rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2 ${inputClass}`}
      />
      <button
        type="submit"
        disabled={state === "busy"}
        className={`shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${buttonClass}`}
      >
        {state === "busy" ? "Sending…" : cta}
      </button>

      {error && (
        <p
          id={`waitlist-error-${source}`}
          role="alert"
          className={`text-xs sm:basis-full ${dark ? "text-amber-300" : "text-amber-700"}`}
        >
          {error}
        </p>
      )}
    </form>
  );
}
