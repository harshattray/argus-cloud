"use client";

import { useId, useRef, useState, type FormEvent } from "react";

/* The brand spark, redrawn here rather than imported from `ui`: that module
   imports this one, and closing the loop would drag the whole server-side kit
   across the client boundary. */
const Spark = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path
      d="M12 2L13.6 9.4L21 12L13.6 14.6L12 22L10.4 14.6L3 12L10.4 9.4L12 2Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * The public site's one conversion mechanism (docs/normascopeWeb.md §11).
 *
 * Every placement — the Cloud hero, the Cloud band on the home page, the
 * waitlist section, the footer — renders this same component against the same
 * endpoint, so the validation, the honeypot and the copy can never drift
 * between them.
 *
 * `startedAt` is stamped on mount and submitted with the address; the server
 * discards anything filled faster than a person could type. The address itself
 * never enters a URL or a query string.
 */

export function WaitlistForm({
  source,
  tone = "light",
  layout = "inline",
  cta = "Join early access",
  note,
}: {
  /** Which surface this signup came from. Must be one of the API's known
   *  sources, or it is stored as null. */
  source: "home" | "cloud" | "footer" | "nav" | "report" | "commands";
  tone?: "light" | "dark";
  layout?: "inline" | "stacked";
  cta?: string;
  /** A line under the field. Omit where the surrounding copy already says it. */
  note?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const mountedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);

  /* Keyed off the instance, not the source: the Cloud page renders two of these
     and both are `source="cloud"`, so deriving ids from the source put two
     `id="waitlist-cloud"` fields in one document — and a duplicate id means the
     second field's label silently points at the first. */
  const uid = useId();

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
        role="status"
        className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${
          dark
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            : "border-emerald-300 bg-emerald-50 text-emerald-800"
        }`}
      >
        <Spark className="mt-1 h-3 w-3 shrink-0" />
        <div>
          <p className="text-sm font-bold">You&rsquo;re on the list.</p>
          <p className={`mt-0.5 text-[13px] ${dark ? "text-emerald-200/70" : "text-emerald-700/80"}`}>
            We&rsquo;ll email you once Normascope Cloud opens. One message — no newsletter, no drip
            sequence.
          </p>
        </div>
      </div>
    );
  }

  const inputClass = dark
    ? "border-white/15 bg-white/[0.08] text-white placeholder:text-white/30 focus:ring-pink-400/60"
    : "border-black/12 bg-white text-text placeholder:text-text/30 focus:ring-clay/50";

  const buttonClass = dark
    ? "bg-white text-ink hover:bg-white/90"
    : "bg-[#111] text-white hover:bg-black";

  return (
    <form
      onSubmit={submit}
      noValidate
      className={layout === "inline" ? "flex flex-col gap-2.5 sm:flex-row" : "flex flex-col gap-2.5"}
    >
      {/* Honeypot — invisible to people, irresistible to bots. */}
      <div className="absolute -m-px h-px w-px overflow-hidden border-0 p-0" aria-hidden>
        <label htmlFor={`website-${uid}`}>Leave this field empty</label>
        <input
          ref={honeypot}
          id={`website-${uid}`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label htmlFor={`waitlist-${uid}`} className="sr-only">
        Email address
      </label>
      <input
        id={`waitlist-${uid}`}
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
        aria-describedby={error ? `waitlist-error-${uid}` : undefined}
        className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2 ${inputClass}`}
      />
      <button
        type="submit"
        disabled={state === "busy"}
        className={`shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${buttonClass}`}
      >
        {state === "busy" ? "Sending…" : cta}
      </button>

      {note && !error && (
        <p
          className={`text-[12.5px] leading-relaxed sm:basis-full ${
            dark ? "text-white/35" : "text-text/45"
          }`}
        >
          {note}
        </p>
      )}

      {error && (
        <p
          id={`waitlist-error-${uid}`}
          role="alert"
          className={`text-[12.5px] sm:basis-full ${dark ? "text-amber-300" : "text-amber-700"}`}
        >
          {error}
        </p>
      )}
    </form>
  );
}
