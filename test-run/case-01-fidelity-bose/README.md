# Case 01 — design fidelity on a third-party site

A public Bose landing-page implementation compared against the Figma file it
was built from. Neither asset is ours.

- Implementation: `https://alina-kabanets.github.io/bose-landing-page/`
- Design: Figma `OMjQNb3hg1LKMV4OwyQ3Ao`, frame `26:51` ("Bose (1260)", 1260×4596)
- Fetched live 2026-08-05

## Result

```
Bose — Landing Page (desktop)
  36.41% aligned  ·  36.89% unaligned  ·  39.02% raw
  SSIM 62.2  ·  10 significant regions  ·  3 drifted sections  ·  banded alignment
  ⚠ above threshold (5%)
```

## What the overlay shows

Two genuine defects, both visible in `diff/bose-full-page-diff.png`:

1. **Different photography.** The hero portrait, the three category blocks and
   the closing image are all different shots from the ones in the design. This
   is most of the 36%.
2. **Vertical drift.** The implementation's hero renders taller than the design's,
   so every section below it sits out of registration. Banded alignment resolves
   this into 3 drifted sections rather than smearing it across the whole diff.

## Running it

```bash
npx norma-scope doctor
npx norma-scope check --json
```

`config.json` here is the corrected version — see below.

## The capture bug this case uncovered — fixed in 0.7.5

The Bose config committed at `Argus/.bridge/config.json` sets:

```json
"viewport": { "width": 1260, "height": 4596 }
```

4596 is the Figma frame's height. The Bose hero is `height: 100vh`, so a
4596px-tall viewport renders a 4596px-tall hero and an **8554px** page — against
a 4596px design. Result:

```
79.7% aligned · SSIM 29 · no alignment (whole-image diff)
⚠ image dimensions differ significantly — check screenshot export scale
```

That is not a finding, it is a misconfiguration, and it reads as one.

With a real browser viewport:

```json
"viewport": { "width": 1260, "height": 900 }
```

the page renders at 4858px against the design's 4596px — a 5.7% difference,
within tolerance. Banded alignment engages, the dimension warning clears, and
the score becomes the 36.41% above.

**`capture: "fullPage"` needs a viewport height that a real screen would have,
not the design frame's height.** The frame's *width* still matters and is still
correct to take from Figma.

**Fixed in 0.7.5.** `init` now persists the design's width as the viewport
width and a normal 900px window height; `auto`'s fallback does the same. The
config in this directory needs no explicit `viewport` at all — the run above
was produced from `width`/`height` alone. `doctor` warns when a configured
viewport is taller than a real screen, because existing configs carry the bad
value explicitly and upgrading cannot repair them on its own. `COMMANDS.md`'s
worked example and `init` step 7 are corrected.

## Files

| | |
|---|---|
| `config.json` | the corrected config that produced this run |
| `report.html` | the generated report |
| `summary.json` | schema v2 machine-readable summary |
| `design/bose-full-page.png` | Figma export, 1260×4596 |
| `screenshots/bose-full-page.png` | live capture, 1260×4858 |
| `diff/bose-full-page-diff.png` | overlay |
