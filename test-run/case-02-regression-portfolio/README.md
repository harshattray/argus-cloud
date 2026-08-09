# Case 02 — visual regression on harshaattray.com

Seven section-level frames from the portfolio app, approved as a baseline, then
put through five separate commits. Each commit is one line and would pass code
review without comment.

Threshold **0.5%**, `norma-scope` 0.7.5. Portfolio at commit `f165935`, branch
`normascope-cloud-rename`, dev server on `:5173`, Chrome via `playwright-core`,
1440px viewport, 1x scale. Each report carries that branch and commit in its
header.

## Frames

| Frame | Route | Capture |
|---|---|---|
| Norma — Hero | `/@norma` | viewport 1440×1000 |
| Norma — Engine | `/@norma` | selector `#engine` |
| Norma — Try It | `/@norma` | selector `#try-it` |
| Norma — Pull Requests | `/@norma` | selector `#pull-requests` |
| Norma — Commands | `/@norma` | selector `#commands` |
| Articles — Index | `/articles` | viewport 1440×1000 |
| Lab — Index | `/lab` | viewport 1440×1000 |

Section-level frames matter. An earlier pass captured `/@norma` as a single
11,233px full-page frame; the CTA-button regression scored 0.3% there simply
because the button is small relative to the page. The same regression is
**3.41%** against its own section. Frame at the granularity you want to reason
about.

## Results

Aligned mismatch % per frame. **Bold** = flagged.

| Frame | s1 rhythm | s2 width | s3 button | s4 aspect | s5 token | s6 control |
|---|---|---|---|---|---|---|
| Norma — Hero | 0.40% | **8.27%** | **3.41%** | **4.07%** | **87.60%** | 0.41% |
| Norma — Engine | 0% | 0% | 0% | 0% | **95.82%** | 0% |
| Norma — Try It | **8.30%** | **12.73%** | 0% | 0% | **3.26%** | 0% |
| Norma — Pull Requests | **23.05%** | **9.71%** | 0% | 0% | 0.11% | 0% |
| Norma — Commands | 0% | **0.73%** | 0% | 0.25% | **84.96%** | 0% |
| Articles — Index | 0% | 0% | 0% | 0% | **97.36%** | 0% |
| Lab — Index | 0% | 0% | 0% | 0% | 0% | 0% |
| **flagged** | **2 / 7** | **4 / 7** | **1 / 7** | **1 / 7** | **5 / 7** | **0 / 7** |

Measured on `norma-scope` **0.7.5**, which uses a tighter colour tolerance in
baseline mode (0.03) than in fidelity mode (0.15). Under the previous shared
0.15 the geometric regressions scored roughly a third of this, and `s5` — the
design-token change — was **completely invisible**:

| | 0.7.4 | 0.7.5 |
|---|---|---|
| s5 Articles (token) | **0.00%, clean** | **97.36%, flagged** |
| s1 Pull Requests | 15.16% | **23.05%** |
| s2 Try It | 4.18% | **12.73%** |
| s2 Hero | 3.43% | **8.27%** |
| s3 Hero | 1.62% | **3.41%** |
| s4 Hero | 0.84% | **4.07%** |

**Blast radius is unchanged on the geometric four** — same frames flagged, same
story, ~3× the signal. `s5` is the one that went from silent to loud. And the
static frames did not move: `/lab` stayed at exactly 0.00% through all five
regressions, so a 5× tighter tolerance bought no false positives.

## The scenarios

### s1 — vertical rhythm

```
py-20 md:py-32  →  py-12 md:py-20     (3 occurrences, Norma.tsx)
```

"Tighten the vertical rhythm." Two sections light up. Try It shows **8.30%
aligned but 25.4% unaligned across 6 drifted sections** — the gap between those
two numbers *is* the diagnosis: most of the change is content translating
downward, not content changing. Pull Requests, which has no room to absorb the
shift, hits **23.05%** at **SSIM 70**.

### s2 — container width

```
max-w-6xl  →  max-w-5xl              (6 occurrences, Norma.tsx)
```

Five characters. **Four of seven frames flagged**, from 0.73% to 12.73%, ten
significant regions on the hero alone. This is the scenario to lead with: no
developer eyeballs a five-character diff and predicts that blast radius.

### s3 — CTA button

```
rounded-2xl pl-7 pr-5 py-5  →  rounded-lg pl-5 pr-4 py-3
```

One component, **3.41%**. **Exactly one frame flagged**, 7 regions, 1 drifted
section — the button itself plus the reflow it causes below. The other six
frames stay at 0.00%. Precision, not just detection.

Worth noting for the site: captured as a single 11,233px full-page frame this
same change scored 0.3% and would have been dismissed. Frame granularity is not
a detail.

### s4 — image aspect ratio

```
aspect-[4/3]  →  aspect-square        (4 occurrences, Norma.tsx)
```

The subtlest geometric one at **4.07%**, localised to 2 regions. This is the
scenario the sensitivity fix rescued: at the old tolerance it scored 0.84% — above a 0.5%
threshold, but close enough to it that a slightly smaller image change would
have slipped through. Commands registers 0.25% — real, sub-threshold, correctly
not flagged.

### s5 — design-token drift

```
tailwind.config.js:  paper: '#eee7e4'  →  '#e6ddd6'
```

One hex. "Warm the paper background one step." No layout, no markup, nothing
moves — and **5 of 7 frames flagged**, four of them above 84%.

This is the scenario the 0.7.5 sensitivity fix exists for. Before it, this
commit scored **0.00% and passed clean** — see
[finding-baseline-sensitivity](../finding-baseline-sensitivity/).

Three things make it the most instructive scenario here:

**The shape of the diff is inverted.** The geometric scenarios produce small red
boxes on a ghosted page. This one floods the entire background red and leaves
the text untouched — `diff/articles-index-diff.png` is the clearest single image
in this whole directory.

**Pixel mismatch and SSIM disagree, correctly.** Articles reads **97.36%
mismatch at SSIM 99.9**. Nothing structural changed, so SSIM is right to stay
high; every background pixel changed, so the mismatch is right to be enormous.
That divergence is the *signature* of a recolour, and it is how you tell a token
change from a layout break without looking at the image.

**The two frames that stayed quiet are the proof it isn't noise.** `Lab — Index`
reads exactly **0.00%** — it is dark-themed and never touches the `paper` token.
`Norma — Pull Requests` reads **0.11%**, below threshold, because that section
carries its own `bg-[#ece6e0]`. The tool tracked the token to precisely the
surfaces that use it.

#### Where the detection floor actually sits

Worth being straight about, because it bounds the claim. `#eee7e4 → #e6ddd6` is
ΔRGB (8, 10, 14). Smaller nudges are still invisible at the shipped 0.03:

| token change | ΔRGB | result |
|---|---|---|
| `#eee7e4` → `#efeae7` | (1, 3, 3) | 0 of 7 flagged |
| `#eee7e4` → `#ece5e1` | (2, 2, 3) | 0 of 7 flagged |
| `#eee7e4` → `#e9e0da` | (5, 7, 10) | 0 of 7 flagged |
| `#eee7e4` → `#e6ddd6` | (8, 10, 14) | **5 of 7 flagged** |

pixelmatch's cutoff is `35215 × threshold²`, so 0.03 rejects any YIQ delta under
~31.7 — roughly ΔRGB (6, 8, 11) on this hue. A one-step nudge in a design tool
can land under that. The honest claim is "catches a visible token change", not
"catches any colour change at all".

### s6 — control

No change at all. **0 of 7 flagged.** The six static frames read exactly 0.00%.

## The noise floor — read this before setting a threshold

Norma — Hero is the one frame that does not sit at a hard zero when nothing has
changed. It holds a live `animate-pulse` status dot and a label rotating between
"Scanning" and "Measuring", so the capture lands at a different animation phase
each run.

At 0.7.5's tighter tolerance it measures **0.00%–0.41%** across unmodified runs
(0.40% and 0.41% in the two clean scenarios above). It is not identical run to
run and should not be quoted as if it were.

**This is the real cost of the sensitivity change, and it is worth stating
plainly.** Under the old tolerance the animated frame sat at ~0.05% against a
0.5% threshold — a 10× margin. It now sits at up to 0.41% against the same
threshold, a margin of roughly 1.2×. That is still passing, but it is thin: a
slightly busier animation would start flapping. **This is the one number in this
directory I would act on before launch.**

Two ways to buy the margin back, both better practice anyway:

- **Freeze animations at capture time.** `explain` independently reached the
  same conclusion on this frame — "pause or disable CSS animations before
  capturing to avoid non-deterministic animation-phase mismatches". A capture
  hook that sets `animation-play-state: paused` would put this frame at a hard
  0.00% like the others.
- **Raise the threshold for frames that animate.** Less clean, since it is
  per-config rather than per-frame.

The six frames without animation sit at exactly **0.00%** every run, at both
tolerances. The floor is an artefact of *this page's* animation, not of the
tool.

## Reproducing

```bash
# portfolio dev server on :5173, then from a dir containing this config.json:
node bin/bridge.js baseline      # approve baseline/ as the reference
node bin/bridge.js check --json  # capture + compare
```

Each `scenarios/*/change.patch` applies to `Downloads/Projects/portfolio` at
commit `f165935`. Every patch was applied, verified live in the browser,
captured, then reverted with `git checkout`; the working tree was confirmed
clean after each scenario.

## Coverage

Four of the five regressions are **geometric** — they move pixels. `s5` is a
pure **recolour**, and it is the one that was invisible in baseline mode up to
0.7.4. Both classes are now represented, which matters: they produce opposite
diff shapes and opposite mismatch/SSIM signatures, and a prospect will try both.

What is still not represented: a font-family or font-weight change (measured in
[finding-baseline-sensitivity](../finding-baseline-sensitivity/) but not run as
a full scenario here), and anything below the colour detection floor documented
under `s5`.
