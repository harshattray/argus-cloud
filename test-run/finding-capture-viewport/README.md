# Finding — `init` persists the design frame's height as the browser viewport

**Severity: high.** This is the default path: it affects anyone who runs `init`,
selects a full-page Figma frame, and uses automatic capture — the primary
documented workflow. It is the root cause of the Bose case scoring 79.7%.

> **Status: FIXED AND PUBLISHED** in `norma-scope@0.7.5`, with regression test
> T3.5 in `test/adapters.test.mjs`.

## What happens

`src/init.ts:164-167` writes the Figma frame's own pixel dimensions as the
capture viewport:

```ts
if (frame.width && frame.height) {
  entry.width  = frame.width;
  entry.height = frame.height;
  entry.viewport = { width: frame.width, height: frame.height };
}
```

`src/auto.ts:33-40` then honours it, and falls back to the same values when no
explicit viewport is set:

```ts
if (frame.viewport) return { viewport: frame.viewport, fallback: false };
if (frame.width && frame.height)
  return { viewport: { width: frame.width, height: frame.height }, fallback: false };
```

For a full-page design frame — say 1260×4596 — this sets a **4596px-tall
browser viewport**. No real screen is 4596px tall, and any CSS using viewport
units resolves against it.

## Isolated reproduction

A page with a `100vh` hero and 1000px of content below it, captured at two
viewport heights:

```
viewport 1260x900   → fullPage height 1900px   (design frame is 4596)
viewport 1260x4596  → fullPage height 5596px   (design frame is 4596)
```

The hero grows by exactly the viewport delta, 3696px. The capture is not a
picture of the page as any user sees it.

## What it does to the score

On the Bose case study, with the config as committed in `Argus/.bridge/config.json`:

| viewport | captured page | vs 4596px design | result |
|---|---|---|---|
| 1260×**4596** (what `init` writes) | **8554px** | +86% | **79.7%**, SSIM 29, dimension warning, alignment disabled |
| 1260×**900** (a real screen) | 4858px | +5.7% | **36.4%**, SSIM 62, banded alignment, 3 drifted sections |

The first number is not a finding about the design — it is the tool measuring
its own misconfiguration. It also trips the dimension-mismatch guard, which
disables banded alignment, so the user loses the section analysis exactly when
they'd most want it.

## Why it is easy to miss

- `viewport` is written into `config.json` explicitly, so it looks deliberate.
- Pages that don't use `vh` units are unaffected, so it works fine on many
  projects and fails hard on modern marketing pages, which use `100vh` heroes
  constantly.
- When dimensions *aren't* persisted, `auto` prints:

  > `⚠ no viewport or Figma dimensions configured — defaulting to 1440x900 (re-run init to persist dimensions)`

  which actively steers the user toward the broken configuration. The 1440×900
  fallback is the *correct* behaviour, and the warning tells you to replace it.

## The fix, applied

The frame's **width** should come from the design; the **height** should not.
A viewport is a window onto the page, not the page's extent.

```ts
// A design frame's height is the height of the artboard, not of a screen.
// Using it as the viewport makes every vh unit resolve against a window no
// user has. Width still comes from the design so the capture matches its
// column widths.
const VIEWPORT_HEIGHT = 900;

entry.viewport = { width: frame.width, height: VIEWPORT_HEIGHT };
```

Keep `entry.width`/`entry.height` as the design's dimensions — `compare` uses
them for the dimension-mismatch check, which is legitimate.

For `capture: "selector"` frames the current behaviour is harmless (the element
is captured, not the window), but the same viewport height still affects any
`vh`-sized content inside that element, so applying the fix uniformly is
simpler and safer.

## Also worth fixing alongside

`COMMANDS.md` presents the broken config as the worked example in *"Case study:
design fidelity on a public site"* — `"width": 1260, "height": 4596` with
`capture: "fullPage"`. Anyone copying it reproduces the 79.7%. The `init`
description at step 7 documents the behaviour as intentional:

> Each frame's Figma `width`/`height` are persisted and used as the default
> capture viewport, so auto captures come out the same size as the design export

That reasoning holds for `selector` and `viewport` captures. It does not hold
for `fullPage`, and the doc should say so.
