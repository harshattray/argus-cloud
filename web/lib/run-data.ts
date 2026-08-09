/**
 * The real run. Every number here comes from
 * `norma-bridge-usecase/reports/summary.json` — a genuine `norma-scope`
 * run against the portfolio on 2026-07-31, baseline mode, images source,
 * three frames at 1440×1000, threshold 0.1%.
 *
 * Doctrine (docs/normascopeWeb.md §6): never fabricate a number. If a figure
 * appears on the site, it traces to this file or to a published package. Do
 * not add a frame here that did not come out of a real run, and do not round
 * these values to make them prettier.
 *
 * The first frame is the site's central argument: 5.63% naive versus 0.26%
 * honest, on the very page a visitor may have arrived from. Two sections
 * moved; nothing actually broke.
 */

export interface Frame {
  /** Label as it appears in summary.json. */
  label: string;
  /** Short label for tight UI (chips, table rows). */
  short: string;
  screenshot: string;
  slug: string;
  mode: "baseline" | "fidelity";
  source: string;
  aligned: number;
  unaligned: number;
  raw: number;
  ssim: number;
  driftedSections: number;
  significantRegions: number;
  flagged: boolean;
  /** What actually happened, in one plain sentence. */
  story: string;
}

export const THRESHOLD = 0.1;
export const RUN_DATE = "2026-07-31";
export const RUN_VIEWPORT = { width: 1440, height: 1000 };

export const FRAMES: Frame[] = [
  {
    label: "Norma — Product Page",
    short: "Product page",
    screenshot: "norma-product.png",
    slug: "norma-product",
    mode: "baseline",
    source: "baseline",
    aligned: 0.26,
    unaligned: 5.63,
    raw: 7.46,
    ssim: 98.7,
    driftedSections: 2,
    significantRegions: 3,
    flagged: true,
    story:
      "Two sections slid vertically. The naive diff calls that 5.63% wrong; after sliding them back into place, only 0.26% genuinely differs.",
  },
  {
    label: "Lab — Index",
    short: "Lab index",
    screenshot: "lab-index.png",
    slug: "lab-index",
    mode: "baseline",
    source: "baseline",
    aligned: 0.03,
    unaligned: 0.37,
    raw: 0.63,
    ssim: 97.6,
    driftedSections: 2,
    significantRegions: 0,
    flagged: false,
    story:
      "Two sections moved slightly, but nothing clustered into a region worth looking at. This is what a quiet page looks like.",
  },
  {
    label: "Articles — Index",
    short: "Articles index",
    screenshot: "articles-index.png",
    slug: "articles-index",
    mode: "baseline",
    source: "baseline",
    aligned: 0,
    unaligned: 0,
    raw: 0,
    ssim: 100,
    driftedSections: 0,
    significantRegions: 0,
    flagged: false,
    story: "Byte-for-byte identical to its approved baseline. Zero is a real result, and it is the common one.",
  },
];

export const HERO_FRAME = FRAMES[0];

export const imagePaths = (frame: Frame) => ({
  baseline: `/run/baseline/${frame.screenshot}`,
  build: `/run/build/${frame.screenshot}`,
  diff: `/run/diff/${frame.slug}-diff.png`,
});

/** Frames flagged at a given threshold — drives the threshold slider. */
export const flaggedAt = (threshold: number) =>
  FRAMES.filter((f) => f.aligned > threshold);
