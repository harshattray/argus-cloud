import { IMAGE_SIZES } from "../../lib/imageSizes.generated";

/**
 * Every screenshot on the site goes through here.
 *
 * It exists because there were five copies of the same bare `<img>` — `Shot`
 * and `Annotated` on the site, `Figure`, `Annotated` and `ReportVariants` on
 * the pitch tree — each with the `next/image` lint rule disabled and each
 * missing the same two things. One place to fix meant one fix, and a sixth copy
 * now has somewhere to go instead of being written again.
 *
 * Two `<img>` tags deliberately do not use this: the wordmarks in `SiteNav` and
 * `YuticEndorsement`. Both are SVGs at a fixed CSS size, so there is no layout
 * shift to prevent and no raster to re-encode.
 *
 * **It is not `next/image`, deliberately.** That component would put `sharp` in
 * the request path for every screenshot, and `security/audit-allowlist.json`
 * currently accepts three high advisories in `sharp` on the recorded grounds
 * that we do not serve images through the optimiser. Quietly making that note
 * false, to save bytes that a build-time re-encode saves anyway, is not a trade
 * worth making — and it would also bill per optimised image on Vercel for
 * screenshots that never change between deploys.
 *
 * **What it adds over the `<img>` it replaces:**
 *
 * *A WebP source.* `optimise-screenshots.mjs` writes one beside each PNG; the
 * manifest records which images actually have one, so this offers it only when
 * it is really on disk. The PNG stays as the `<img>` fallback and so still
 * works on anything that cannot read WebP, at no cost to browsers that can.
 *
 * *An intrinsic width and height.* Without them the browser cannot reserve
 * space, so each screenshot shoved the page down as it arrived. The numbers
 * come from the PNG headers at build time rather than from anyone's memory.
 *
 * **`h-auto` is load-bearing, not styling.** With a `width`/`height` attribute
 * pair and a CSS `width: 100%`, the height attribute still applies and the
 * image renders stretched or squashed at every viewport except the one where
 * the numbers happen to match. `h-auto` restores the aspect ratio while leaving
 * the attributes to do their one job of reserving the right space. Removing it
 * distorts every screenshot on the site.
 */
export function Screenshot({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  /**
   * Set on a screenshot above the fold. It drops the lazy attribute — which
   * would otherwise delay the one image the reader is already looking at — and
   * asks for it early. Everything below the fold should leave this alone.
   */
  priority?: boolean;
}) {
  const asset = IMAGE_SIZES[src];

  // `h-auto` is skipped when the caller sets its own height, because two height
  // utilities on one element are resolved by their order in the generated
  // stylesheet rather than in the class attribute — so which one wins is not
  // something the caller can see or rely on. The cropped `tall` variant in
  // `editorial.tsx` passes `h-[26rem] object-cover`, and silently losing that
  // to `h-auto` would stretch the image to full height instead of cropping it.
  const callerSetsHeight = /(^|\s)(h-|max-h-|min-h-)/.test(className);
  const height = callerSetsHeight ? "" : "h-auto ";

  /* eslint-disable-next-line @next/next/no-img-element */
  const img = (
    <img
      src={src}
      alt={alt}
      width={asset?.width}
      height={asset?.height}
      className={`w-full ${height}${className}`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );

  if (!asset?.webp) {
    // No WebP generated for this one yet — render the PNG rather than point a
    // <source> at a file that is not there.
    return img;
  }

  return (
    // `block` because `<picture>` is an inline element by default. Tailwind's
    // preflight makes the `<img>` inside it a block, but the wrapper would
    // still sit on a text baseline and leave a few pixels of descender gap
    // under every screenshot on the site — including inside `Annotated`, where
    // the frame is `overflow-hidden` and the gap shows as a seam.
    <picture className="block">
      <source srcSet={src.replace(/\.png$/i, ".webp")} type="image/webp" />
      {img}
    </picture>
  );
}
