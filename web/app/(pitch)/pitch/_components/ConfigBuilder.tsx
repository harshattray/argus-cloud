"use client";

import { useMemo, useState } from "react";

/**
 * Three questions in, a working `.bridge/config.json` out
 * (docs/normascopeWeb.md §8.3).
 *
 * The output has to be a config that actually runs — this is the one
 * interactive piece on the site that people will paste into a real project, so
 * a plausible-looking but invalid result would be worse than no builder at all.
 */

type Reference = "figma" | "images" | "url" | "none";
type Capture = "auto" | "manual";
type Gate = "warn" | "strict";

const REFERENCE_OPTIONS: { id: Reference; label: string; sub: string }[] = [
  { id: "figma", label: "A Figma file", sub: "Designs live in Figma" },
  { id: "images", label: "A folder of PNGs", sub: "Sketch, Penpot, or a file someone sent you" },
  { id: "url", label: "Another URL", sub: "Staging vs production" },
  { id: "none", label: "Nothing — no designer", sub: "Just tell me when something changes" },
];

const CAPTURE_OPTIONS: { id: Capture; label: string; sub: string }[] = [
  { id: "auto", label: "Yes, it runs at a URL", sub: "Locally or on staging — capture for me" },
  { id: "manual", label: "No, I'll capture by hand", sub: "Not runnable yet, or curated shots" },
];

const GATE_OPTIONS: { id: Gate; label: string; sub: string }[] = [
  { id: "warn", label: "Flag it, don't block", sub: "The default — CI stays green" },
  { id: "strict", label: "Fail the build", sub: "Opt in with --strict" },
];

function buildConfig(reference: Reference, capture: Capture): string {
  const source =
    reference === "figma"
      ? `"source": { "type": "figma" },\n  "figmaFileKey": "YOUR_FILE_KEY",`
      : reference === "url"
        ? `"source": { "type": "url", "baseUrl": "https://staging.example.com" },`
        : `"source": { "type": "images", "dir": "designs" },`;

  // Baseline frames never touch the design source, but the config still needs a
  // valid source block — images is the one with no token and no network.
  const mode = reference === "none" ? `\n      "mode": "baseline",` : "";
  const route = capture === "auto" ? `\n      "route": "/pricing",` : "";

  return `{
  "threshold": 5,
  ${source}
  "app": { "baseUrl": "http://localhost:3000" },
  "frames": [
    {
      "label": "Pricing",
      "screenshot": "pricing.png",${mode}${route}
      "viewport": { "width": 1440, "height": 900 }
    }
  ]
}`;
}

function buildSteps(reference: Reference, capture: Capture, gate: Gate): string[] {
  const steps: string[] = ["npx norma-scope init"];

  if (capture === "auto") {
    steps.push("npx norma-scope doctor");
    steps.push("# start your app, then:");
  } else {
    steps.push("# capture each PNG by hand at the size init printed");
    steps.push("# save them into .bridge/screenshots/");
  }

  if (reference === "none") {
    steps.push(capture === "auto" ? "npx norma-scope auto" : "# (screenshots already in place)");
    steps.push("npx norma-scope baseline   # this is correct now");
  }

  steps.push(
    capture === "auto"
      ? gate === "strict"
        ? "npx norma-scope check --strict"
        : "npx norma-scope check"
      : gate === "strict"
        ? "npx norma-scope compare --strict"
        : "git commit   # the hook runs compare"
  );

  if (reference === "figma") {
    steps.push("npx norma-scope snapshot   # so CI needs no token");
  }

  steps.push("open .bridge/reports/report.html");
  return steps;
}

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
  name,
}: {
  legend: string;
  options: { id: T; label: string; sub: string }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-text/40 mb-3">
        {legend}
      </legend>
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map((o) => {
          const selected = value === o.id;
          return (
            <label
              key={o.id}
              className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                selected
                  ? "border-clay/50 bg-clay/8"
                  : "border-black/10 bg-white/50 hover:border-black/20"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.id}
                checked={selected}
                onChange={() => onChange(o.id)}
                className="sr-only"
              />
              <span className={`block text-sm font-bold ${selected ? "text-clay" : "text-text/75"}`}>
                {o.label}
              </span>
              <span className="block text-xs text-text/45 mt-0.5 leading-snug">{o.sub}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ConfigBuilder() {
  const [reference, setReference] = useState<Reference>("images");
  const [capture, setCapture] = useState<Capture>("auto");
  const [gate, setGate] = useState<Gate>("warn");
  const [copied, setCopied] = useState(false);

  const config = useMemo(() => buildConfig(reference, capture), [reference, capture]);
  const steps = useMemo(() => buildSteps(reference, capture, gate), [reference, capture, gate]);

  function copy() {
    navigator.clipboard
      .writeText(config)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }

  return (
    <div className="rounded-2xl border border-black/8 bg-white/60 overflow-hidden">
      <div className="px-5 md:px-7 py-6 flex flex-col gap-6 border-b border-black/6">
        <Choice
          name="reference"
          legend="1 · What are you comparing against?"
          options={REFERENCE_OPTIONS}
          value={reference}
          onChange={setReference}
        />
        <Choice
          name="capture"
          legend="2 · Can Normascope reach your app?"
          options={CAPTURE_OPTIONS}
          value={capture}
          onChange={setCapture}
        />
        <Choice
          name="gate"
          legend="3 · What should CI do when a frame drifts?"
          options={GATE_OPTIONS}
          value={gate}
          onChange={setGate}
        />
      </div>

      {/* `min-w-0` on both columns is load-bearing: grid children default to
          min-width:auto, so the wide <pre> would stretch its column past the
          card and get clipped instead of scrolling inside itself. */}
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-black/8">
        <div className="p-5 md:p-6 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[11px] text-text/50">.bridge/config.json</p>
            <button
              onClick={copy}
              className="text-[10px] font-black uppercase tracking-widest text-text/40 hover:text-text transition-colors"
            >
              {copied ? "copied ✓" : "copy"}
            </button>
          </div>
          <pre className="font-mono text-[11px] leading-relaxed text-text/70 bg-black/[0.03] rounded-lg p-4 overflow-x-auto">
            {config}
          </pre>
        </div>

        <div className="p-5 md:p-6 min-w-0">
          <p className="font-mono text-[11px] text-text/50 mb-3">then run</p>
          <div className="rounded-lg bg-[#111] px-4 py-4 overflow-x-auto">
            {steps.map((s) => (
              <p key={s} className="font-mono text-[11px] leading-relaxed whitespace-nowrap">
                {s.startsWith("#") ? (
                  <span className="text-white/30">{s}</span>
                ) : (
                  <>
                    <span className="text-emerald-400">$ </span>
                    <span className="text-white/80">{s}</span>
                  </>
                )}
              </p>
            ))}
          </div>
          <p className="text-xs text-text/40 leading-relaxed mt-3">
            {reference === "none"
              ? "Baseline mode never touches a design source — it compares against the capture you approved."
              : reference === "figma"
                ? "Commit .bridge/design/ and CI runs with zero API calls and no token."
                : "No token, no network, no account — the reference is already in your repo."}
          </p>
        </div>
      </div>
    </div>
  );
}
