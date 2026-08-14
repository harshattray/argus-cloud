import { CloudMark } from "./ui";
import { CloudLink } from "./HeaderNav";

/**
 * The header's right-hand corner: the Cloud destination and the waitlist action.
 *
 * ── What this replaced, and why ─────────────────────────────────────────────
 *
 * A hairline divider, the Cloud lockup at 76px rendered at 70% opacity, and an
 * outlined clay "Early access" pill. Three problems, measured rather than felt:
 *
 * 1. The lockup was *dimmed* — fainter than the grey nav labels beside it. The
 *    paid tier's mark was the quietest object in its own header.
 * 2. The pill was the only lit thing in the corner, so the eye landed on the
 *    action and never on what the action was for.
 * 3. Below `md` the lockup vanished entirely and Cloud became the sixth grey
 *    chip in the nav strip. That part is still true — see the note at the end.
 *
 * The fix is structural before it is decorative: the words sit *above* the
 * lockup as an eyebrow. Nothing else in that bar has a caption, so the Cloud
 * corner becomes the only titled object in the header. That is what raises it.
 * The pan and the storm are charm on top of a hierarchy that already works —
 * a version with the eyebrow and no drawings tested nearly as well.
 *
 * ── The sizes are constrained, not chosen ───────────────────────────────────
 *
 * The lockup is 104px because 110.3px is the ceiling. `ui.tsx` sizes the header
 * wordmark so the free mark cannot be outranked by the paid tier's lockup in
 * its own header; `norma` renders 56px there, and inside the lockup it occupies
 * 115.4 of 227.4 viewBox units, so it renders at `width × 0.5075`. Setting that
 * equal to 56 gives 110.3. At 104 the lockup's `norma` is 52.8px — under, with
 * four pixels to spare. **Do not raise this past 110 without moving the
 * wordmark first.**
 *
 * Measured at the real 1024px bar with the nav strip full: the corner needs
 * ~300px of the 960px available. The pan is 34px because at 26px the steam is
 * marginal and at 18px it is gone, and the steam is the whole point of drawing
 * a pan.
 *
 * ── Type ────────────────────────────────────────────────────────────────────
 *
 * `join waitlist` is set in the mono face, lowercase, exactly as `cloud` is set
 * in the lockup (see `marks.tsx`, which explains why the tier word is mono).
 * The button and the tier word are then the same voice rather than two.
 *
 * ── Two things this deliberately breaks ─────────────────────────────────────
 *
 * - `normascopeWeb.md` §11 makes the waitlist one shared component across four
 *   placements. This header action is now bespoke. `WaitlistBadge` still serves
 *   the hero, and every placement still points at `/cloud#waitlist`, so the
 *   *behaviour* §11 gates on is unchanged — only the header's shape diverges.
 * - The action reads "join waitlist", not "Join early access". PATHWAYS' public
 *   -site demand gate names the old wording; the gate's substance ("lands on
 *   `/cloud#waitlist`") still holds, but the doc's wording is now stale.
 *
 * ── The phone ───────────────────────────────────────────────────────────────
 *
 * This corner is hidden below `md` and always will be: there is no room for it
 * beside the brand and the button on a phone. The question was only ever where
 * the lockup goes instead.
 *
 * *First answer, 2026-08-14 — the hero.* Measured on a 390×844 phone, the
 * cluster was `display:none`, so the only Cloud a visitor met above the fold
 * was a black `join waitlist` pill that did not say what it was joining, and
 * the word "Cloud" as the sixth grey chip in the nav strip. The hero rendered
 * `CookingCluster` below `md` and put a real lockup at y=668 of the first
 * screen.
 *
 * That fixed the home page and nothing else, which the note here said at the
 * time. The hero is the home page's. Measured on a 375×812 phone, `/guide` —
 * 35,764px, the longest page on the site — met Cloud as the grey chip in a
 * strip you have to swipe to reach, as one clause of a sentence at y=2,110,
 * and then not again until the footer mark at y=35,320. **98.8% of the page
 * with no way to Cloud.**
 *
 * *Second answer, and the one in the code — the navigation row.* The lockup is
 * pinned to the end of the row the strip already occupies (`layout.tsx`), so
 * every route carries it at every width, and the grey chip is gone from the
 * strip because the lockup replaced what it was for. The hero's copy of it went
 * with the change: the header covers the home page too, and two lockups in one
 * screen is the thing this file has been avoiding from the start.
 *
 * The button is visible at every width — it is the site's only conversion
 * mechanism and phones must not lose it.
 */

/** Steam off a pan. 34 × 26, drawn to sit on the lockup's baseline. */
const Pan = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 34 26" width="34" height="26" fill="none" aria-hidden className={`shrink-0 ${className}`}>
    <g stroke="var(--color-clay)" strokeWidth="1.5" strokeLinecap="round">
      <path className="hc-steam-a" d="M11 13.5 C9 11 13 9.6 11 7.1 C9.6 5.2 11.4 4.1 11 2.6" />
      <path className="hc-steam-b" d="M17 13.5 C15 10.6 19 9.1 17 6.4 C15.6 4.3 17.4 3.2 17 1.6" />
      <path className="hc-steam-c" d="M23 13.5 C21 11 25 9.6 23 7.1 C21.6 5.2 23.4 4.1 23 2.6" />
    </g>
    <path d="M25.6 16.4 L32 14.7" stroke="var(--color-text)" strokeWidth="2.1" strokeLinecap="round" />
    <path
      d="M7 16 H26 L24.3 22.2 C24 23.4 23 24.1 21.8 24.1 H11.2 C10 24.1 9 23.4 8.7 22.2 Z"
      fill="var(--color-text)"
    />
    <path d="M5.4 15.6 H27.6" stroke="var(--color-text)" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/**
 * The storm on the waitlist button: rain for the first half of a 6.4s cycle,
 * one double-strike in the second.
 *
 * At 18px the bolt is about four pixels across, so its *shape* does not read —
 * what reads is `hc-flash`, the whole cloud lighting from inside. Keep that
 * layer if the bolt is ever redrawn; it is doing most of the work.
 *
 * The bolt's amber is an illustration colour, not a palette addition. It is
 * deliberately not the semantic amber from `globals.css` (which means
 * "flagged / above threshold") and carries no meaning here.
 */
const StormCloud = () => (
  <svg viewBox="0 0 30 28" width="19.3" height="18" fill="none" aria-hidden className="shrink-0">
    <g className="hc-rain">
      <g stroke="var(--color-paper)" strokeOpacity=".55" strokeWidth="1.7" strokeLinecap="round">
        <path className="hc-drop-a" d="M10 18.8 V21.6" />
        <path className="hc-drop-b" d="M15 19.4 V22.2" />
        <path className="hc-drop-c" d="M20 18.8 V21.6" />
      </g>
    </g>
    <path
      className="hc-bolt"
      d="M17.2 17.4 L12.8 24.2 H15.9 L14.6 27.7 L20.2 20.9 H17.1 Z"
      fill="#f5b93f"
    />
    <g className="hc-cloud">
      <Cumulus fill="var(--color-paper)" />
      <g className="hc-flash">
        <Cumulus fill="#ffffff" />
      </g>
    </g>
  </svg>
);

/** The cloud body, drawn twice — once as itself, once as the flash over it. */
const Cumulus = ({ fill }: { fill: string }) => (
  <g fill={fill}>
    <circle cx="10.5" cy="10" r="5" />
    <circle cx="17.5" cy="8.4" r="6.4" />
    <circle cx="23" cy="11.6" r="4.4" />
    <rect x="5.5" y="11.6" width="21" height="5.4" rx="2.7" />
  </g>
);

/**
 * The waitlist action. Visible at every width — it was hidden below `md` once
 * before, which left phones with no call to action at all.
 */
export const StormWaitlist = ({ className = "" }: { className?: string }) => (
  <a
    href="/cloud#waitlist"
    className={`inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-ink px-[15px] py-2 text-white transition-transform hover:-translate-y-px ${className}`}
  >
    <StormCloud />
    <span className="font-mono text-[12px] leading-none">join waitlist</span>
  </a>
);

/** The eyebrow that titles the lockup, and the recording dot beside it. */
const CookingLabel = () => (
  <span className="hc-eyebrow">
    Currently cooking
    <span aria-hidden className="hc-rec" />
  </span>
);

/**
 * The titled lockup: eyebrow, mark, pan, linking to `/cloud`.
 *
 * Exported because the header renders it twice at different breakpoints — in
 * the top row from `md` up, and at the end of the navigation row below it. The
 * caller owns the breakpoint, so exactly one of the two is ever on screen.
 *
 * `panClassName` exists so the navigation row can hide the pan on the narrowest
 * screens. A 375px phone has ~230px left in that row once the lockup is in it,
 * and the pan is 34 of them; the strip needs those more than the joke does.
 */
export const CookingCluster = ({
  className = "",
  panClassName = "",
}: {
  className?: string;
  panClassName?: string;
}) => (
  <CloudLink className={className}>
    <span className="flex items-center gap-2">
      <span className="flex flex-col items-start gap-0.5">
        <CookingLabel />
        <CloudMark size="nav" title="Normascope Cloud" />
      </span>
      <Pan className={panClassName} />
    </span>
  </CloudLink>
);

export const CloudCorner = () => (
  <div className="ml-auto flex shrink-0 items-center gap-3.5">
    <CookingCluster className="hidden md:inline-flex" />
    <StormWaitlist />
  </div>
);
