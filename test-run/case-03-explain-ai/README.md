# Case 03 — `explain`, the AI layer

`norma-scope explain` run for real against the s2 container-width regression,
billed to a live Anthropic key. Everything here is verbatim output, including
the parts that are wrong.

```bash
export ANTHROPIC_API_KEY=...
npx norma-scope explain
```

Config that turned it on:

```json
"explain": {
  "enabled": true,
  "codePointers": [
    "frontend/src/pages/**/*.tsx",
    "frontend/src/index.css",
    "frontend/tailwind.config.js"
  ],
  "models": { "analysis": "claude-sonnet-5" }
}
```

## What it cost

```
claude-haiku-4-5:  3753 in /  409 out                    — est. $0.0058
claude-sonnet-5:      6 in / 3772 out / 2696 cache-read  — est. $0.3714
Estimated cost at list prices: $0.3772 — billed to your key.
```

**$0.38 for a 7-frame run**, and the triage layer is why. Of 7 frames:

- 3 were **below threshold** → skipped without an API call
- 1 (`norma-commands`, 0.51% — barely over) → cheap haiku triage returned
  *"not worth a full analysis… consistent with anti-aliasing, no actionable
  findings"* and stopped before the expensive model
- 3 got the full sonnet analysis

That is the part worth showing on the site: the expensive model is only
reached for frames that earn it.

## What it got right

- **Localisation.** On `norma-prs` it identified that the card is narrower and
  that internal columns had compressed and reflowed left — which is exactly
  what `max-w-6xl → max-w-5xl` does.
- **It saw the actual class.** On `norma-tryit` it named `#try-it .max-w-5xl`
  as the suspect container.
- **A genuine prompt-injection catch.** The /@norma page contains a *mock*
  diff-tool UI as decoration, with text reading "18.4% SHIFTED", "REFERENCE",
  "BUILD", "Δ18px". `explain` flagged that region `injection-suspected` and
  said the embedded percentages must not be treated as authoritative diff
  metrics because they are page content, not engine output. That is the
  documented threat model working on a real page, unprompted.

## What it got wrong

Being straight about this, because the site should not overclaim:

- **It never named the root cause.** No finding says "`max-w-6xl` was changed
  to `max-w-5xl` at Norma.tsx:390". It described symptoms and gestured at the
  right container, but a developer still has to find the line.
- **A confidently wrong hypothesis.** On `norma-prs` it claimed the
  `+ PULL REQUESTS` label renders at the wrong weight and suggested the
  Poppins Black webfont was failing to load. Nothing about font loading
  changed; that finding is noise.
- **Another wrong one.** On `norma-tryit` it proposed a capture viewport /
  device-pixel-ratio mismatch. Both captures came from the same runner at the
  same 1440×1000, 1x.
- **Several "this looks identical to me" findings** on the hero, marked `low`,
  suggesting the regions were false positives. They were not — they were real
  3.4% drift the model could not see in a crop.

## The honest framing

The tool already labels this correctly and the site should use its language,
not stronger language:

> findings are hypotheses, never gates, and nothing is ever auto-applied

Every finding prints `generated — verify before applying` with a confidence
badge, and the deterministic diff remains the only thing that decides pass or
fail. `explain` is a triage assistant that narrows where to look and
occasionally misleads. Sold as "it tells you what broke", the first wrong
finding costs trust. Sold as "it gives you a ranked starting point for $0.38",
it holds up.

## Files

| | |
|---|---|
| `terminal-output.txt` | full verbatim run, including token usage and cost |
| `findings.json` | structured findings the report embeds |
| `report.html` | report with findings embedded (`compare` after `explain`) |
| `summary.json` | the deterministic scores — unaffected by explain |
| `config.json` | the explain block used |
| `change.patch` | the regression analysed |
| `diff/` | overlays |

## Guardrails, unmodified from `SECURITY-LLM.md`

- Secret scanner runs over everything outbound **before** any network call; a
  hit blocks that frame and names the file rather than silently redacting.
- `.env*` and gitignored files are excluded from code pointers unconditionally.
- The key is read from the environment only — never written, logged, persisted.
- Per-frame errors are isolated; the command always exits 0.
