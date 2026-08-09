# Finding — baseline mode misses colour and font-weight changes entirely

**Severity: high, and specifically high *for the showcase*.**

> **Status: FIXED AND PUBLISHED** in `norma-scope@0.7.5`. The threshold is now
> per mode — fidelity 0.15, baseline 0.03 — in `src/diff.ts`, with regression
> test T4.9 in `test/baseline.test.mjs`.
> [case-02](../case-02-regression-portfolio/) has been re-measured on the fix.
>
> Verified against the published package: the same image pair scores **100% in
> baseline mode and 0.0% in fidelity mode**, which is the per-mode split working
> rather than a blanket tightening.

## What happens

Two changes were committed to the portfolio's `/@norma` page:

- `bg-[#ece6e0]` → `bg-[#e3d9d1]` — the whole `#pull-requests` section background
- `font-black` → `font-bold` — 49 occurrences, 176 rendered elements

Both were confirmed live in the browser before capture:

```
getComputedStyle(document.querySelector('#pull-requests')).backgroundColor
  → "rgb(227, 217, 209)"          // #e3d9d1, the new value
document.querySelectorAll('.font-black').length  → 0
document.querySelectorAll('.font-bold').length   → 176
```

Normascope reported:

```
norma-prs.png   →   0.0% aligned (0.0% unaligned) · SSIM 100 · [baseline]  ✓
```

**0.00%. SSIM 100. Not flagged.** A 68%-of-pixels change reported as a
pixel-perfect match.

## Why

`src/diff.ts:42`

```ts
const PIXELMATCH_OPTIONS = { threshold: 0.15, includeAA: false, alpha: 0.1 };
```

pixelmatch's cutoff is `maxDelta = 35215 * threshold * threshold` — the
threshold is **squared**, against the maximum YIQ colour distance. So 0.15
tolerates any YIQ delta under **792**. The delta here — RGB (9, 13, 15), plus
stem-width changes from the weight swap — computes to about 73. It is discarded
as anti-aliasing noise.

(An earlier draft of this finding said the 0.15 tolerance was "roughly 5300 YIQ
units". That was wrong — it missed the squaring. 792 is the correct figure, and
it is what makes the measured cliff between 0.05 and 0.04 line up: those give
cutoffs of 88.0 and 56.3, and the delta of ~73 falls between them.)

Sweeping the same image pair (`node threshold-sweep.mjs`):

```
threshold  mismatched px      %
0.15               0    0.00%   <- shipped default
0.1                0    0.00%
0.05               0    0.00%
0.04          864271   67.14%
0.03          874075   67.90%
0.02          874438   67.92%
0.01          874957   67.97%
0             875907   68.04%
```

The cliff sits between 0.05 and 0.04. The shipped default is three steps past it.

## Why the default is wrong for baseline mode, and right for fidelity mode

The comment above the constant is explicit about its purpose:

> threshold 0.15 tolerates subpixel text rendering differences between browser
> and Figma rasterization

That is a **fidelity-mode** concern. Chrome and Figma rasterise text with
different hinting and gamma, so a large tolerance is what keeps that comparison
usable.

**Baseline mode has no such problem.** It compares Chrome against Chrome, same
version, same machine, same fonts, same scale factor. The rasterisation is
byte-identical — which the control run proves: five of seven frames sit at
exactly 0.00% across four separate regressions, and the only non-zero frame
(0.05%) is genuine on-page animation, not rendering noise.

So baseline mode is paying a large tolerance for a problem it does not have,
and buying blindness to whole classes of real regression in exchange:

- design-token changes (brand colours, backgrounds, borders)
- font-weight and font-family swaps
- opacity and shadow changes
- anything that recolours without moving

These are exactly the changes a human reviewer is least likely to catch by eye,
which is the reason the tool exists.

## The fix, applied

The threshold is now a function of the comparison mode:

```ts
const PIXELMATCH_THRESHOLD: Record<FrameMode, number> = {
  fidelity: 0.15,
  baseline: 0.03,
};
```

`runDiff` takes the mode and defaults to `fidelity`, so callers that don't know
about modes keep their existing numbers. `explain` passes the frame's mode too —
otherwise its re-score would disagree with the report already on screen.

### Why 0.03

Measured, not guessed. The full curve:

| | @0.15 | @0.08 | @0.05 | @0.04 | @0.03 |
|---|---|---|---|---|---|
| noise, animated frame, no change | 0.05% | 0.06% | 0.06% | 0.18% | 0.24% |
| noise, static frame, no change | 0.00% | 0.00% | 0.00% | 0.00% | 0.01% |
| real, container width | 3.43% | 5.44% | 6.86% | 7.54% | 8.28% |
| real, aspect ratio | 0.84% | 2.61% | 3.28% | 3.77% | 4.11% |
| **real, colour + font-weight** | **0.00%** | **0.00%** | **0.00%** | **67.14%** | **67.90%** |

The bottom row is a cliff, not a slope. 0.05 improves geometric sensitivity but
leaves colour *completely* invisible — you have to cross 0.04 to fix the actual
problem. 0.03 was chosen over 0.04 for headroom: 0.04 sits exactly at the cliff
for this particular colour delta, and a subtler change would need more room.

### What it cost

Re-measuring [case-02](../case-02-regression-portfolio/) on the fix:

- The design-token scenario went from **0.00% and clean** to **97.36% and
  flagged** — the whole point of the change.
- Geometric regressions became **~3× more visible** (s4 hero 0.84% → 4.07%,
  s2 Try It 4.18% → 12.73%). Same frames flagged — blast radius unchanged.
- Static frames stayed at **exactly 0.00%** through all five regressions. A 5×
  tighter tolerance bought **no** false positives.
- The one animated frame's noise floor rose from ~0.05% to **0.00%–0.41%**
  against a 0.5% threshold. That margin went from 10× to about 1.2× — still
  passing, but thin. Freezing animations at capture time would put it at a hard
  zero; that is the follow-up worth doing before launch.

### Not run: calibrate.mjs

An earlier draft of this finding said the change needed a `scripts/calibrate.mjs`
pass. That was wrong. `calibrate.mjs` measures **LLM token economics** for
`explain` and prices them against the live pricing page; it has nothing to do
with diff thresholds, and its single `runDiff` call uses the fidelity default,
which is unchanged. Running it would have spent 20+ paid API calls to prove
nothing.

## Scope

Case 01 is fidelity mode and is unaffected — its threshold is unchanged at 0.15.

The four scenarios in [case-02](../case-02-regression-portfolio/) are all
**geometric** — spacing, width, padding, aspect ratio — so they were detected
before the fix too, just at roughly a third of the magnitude. They have been
re-measured on 0.7.5 and every number on that page now reflects the new
threshold.

What the fix actually changes is the class of regression that was invisible
altogether. Before it, the risk was sharp: if the site claims Normascope catches
what review misses, the first prospect who tried a brand-colour tweak would have
got a green report.

**Now covered by a scenario.** `s5-design-token-drift` in
[case-02](../case-02-regression-portfolio/) is a pure recolour — one hex in
`tailwind.config.js` — and it is the demonstration this finding was missing:

| | 0.7.4 | 0.7.5 |
|---|---|---|
| Articles — Index | 0.00%, clean | **97.36%, flagged** |
| frames flagged | 0 of 7 | **5 of 7** |

### The detection floor, measured

The fix does not make colour detection unlimited, and the showcase should not
imply it does. Sweeping real token nudges through the full pipeline at the
shipped 0.03:

| token change | ΔRGB | result |
|---|---|---|
| `#eee7e4` → `#efeae7` | (1, 3, 3) | 0 of 7 flagged |
| `#eee7e4` → `#ece5e1` | (2, 2, 3) | 0 of 7 flagged |
| `#eee7e4` → `#e9e0da` | (5, 7, 10) | 0 of 7 flagged |
| `#eee7e4` → `#e6ddd6` | (8, 10, 14) | **5 of 7 flagged** |

0.03 gives a cutoff of `35215 × 0.03²` = **31.7** YIQ units, roughly ΔRGB
(6, 8, 11) on this hue. A single-step nudge in a design tool can land under it.
The claim to make is "catches a visible token change", not "catches any colour
change".

Going tighter to reach those would cost noise: the animated frame already sits
at 0.41% against a 0.5% threshold at 0.03. Freezing animations at capture time
is the prerequisite for any further tightening.

## Reproducing

`before.png` and `after.png` in this directory are the exact captures. The
patch that produced `after.png`:

```
perl -pi -e 's/font-black/font-bold/g'        frontend/src/pages/Norma.tsx
perl -pi -e 's/bg-\[#ece6e0\]/bg-[#e3d9d1]/g' frontend/src/pages/Norma.tsx
```

```bash
node threshold-sweep.mjs
```
