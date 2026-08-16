/**
 * The twins.
 *
 * Two identical figures in dark glasses, each reading its own copy of the same
 * page. Traced from a frame of Harsha's own generated footage, which is
 * deliberately not in the repo — it is a 750 kB still, and everything below is
 * drawn from it rather than cropping it. Vector because these appear at half a
 * dozen sizes on light backgrounds and on ink, and a raster can do neither.
 *
 * The glasses are the joke that carries `/agents`: the reader that cannot see.
 *
 * One character, nine poses, `flip` to mirror it.
 *
 * **Two rules, both learned by breaking them.**
 *
 * *They appear one at a time.* A pair standing together was tried in the hero
 * and read as one drawing pasted twice however different the two poses were —
 * the eye takes the repeated silhouette before it takes the arms.
 *
 * *No pose appears twice on the site.* There were fifteen of these across the
 * pages at one point, drawn from four poses, and the effect was wallpaper: a
 * figure next to every other heading stops being a character and starts being
 * skipped. Eight placements, eight poses, and the count is the ceiling — a new
 * placement needs a new pose or it takes an existing placement's slot. The
 * inventory is in `docs/normascopeWeb.md` §5.
 *
 * **`offer` is the one exception, and it is the point of the set.** It holds
 * the cloud up, it lives only in `CloudBand` (`ui.tsx`), and it appears on
 * every page that has one. The rule against repetition exists so the figures
 * do not become wallpaper beside headings; a single gesture that always means
 * the same thing and always sits in the same place is the opposite of that. It
 * is what the other eight are walking towards: they photograph, measure,
 * magnify and stack across the site, and at the foot of whichever page you
 * were reading, one of them hands you Cloud.
 *
 * Nothing else may use it, and it may not be given a second meaning.
 *
 * Everything here is decoration: `aria-hidden` unless a `title` is passed,
 * which nothing does.
 */

export type TwinPose =
  | "reading"
  | "shrug"
  | "point"
  | "wave"
  | "camera"
  | "measure"
  | "magnify"
  | "stack"
  | "empty"
  | "offer";
export type TwinTone = "ink" | "cream";

/**
 * On paper the figure is drawn the way it was filmed: charcoal line, warm
 * off-white body. On ink everything inverts — a charcoal line disappears on a
 * charcoal section, so the line goes cream and the body goes dark. The lenses
 * invert with it, which keeps the glasses reading as glasses rather than as two
 * holes in the head.
 */
const PALETTE: Record<TwinTone, Record<string, string>> = {
  ink: {
    line: "#232323",
    body: "#f4efe9",
    shade: "#e7dbd2",
    lens: "#232323",
    glare: "#ffffff",
    paper: "#faf6f2",
    shadow: "rgba(35,25,20,0.10)",
    /* The Cloud accent: `offer`'s held cloud and the `get cloud` sticker, and
       nothing else. The lockup's own clay at this tone. */
    cloud: "#a8736e",
    stickerText: "#fbf7f4",
  },
  cream: {
    line: "#efe3db",
    body: "#242424",
    shade: "#1b1b1b",
    lens: "#efe3db",
    glare: "#242424",
    paper: "#1f1f1f",
    shadow: "rgba(255,255,255,0.06)",
    cloud: "#e0aca4",
    stickerText: "#231f1e",
  },
};

/** Arms and hands, per pose. Hands are drawn after any prop so they grip it. */
const ARMS: Record<TwinPose, { left: string; right: string; hands: [number, number][] }> = {
  reading: {
    left: "M46 180 C 30 196 28 224 40 238",
    right: "M154 180 C 170 196 172 224 160 238",
    hands: [
      [40, 242],
      [160, 242],
    ],
  },
  shrug: {
    left: "M46 172 C 24 170 14 154 18 140",
    right: "M154 172 C 176 170 186 154 182 140",
    hands: [
      [18, 136],
      [182, 136],
    ],
  },
  /* Out and *down*, at whatever is below the heading it stands beside. Raised,
     it was a second `wave` — the two poses differed by about fifteen degrees of
     forearm and read as the same drawing. */
  point: {
    left: "M46 178 C 28 190 24 206 34 214",
    right: "M154 180 C 174 186 188 198 190 212",
    hands: [
      [34, 218],
      [192, 216],
    ],
  },
  wave: {
    left: "M46 178 C 28 190 24 206 34 214",
    right: "M154 168 C 172 152 176 132 170 116",
    hands: [
      [34, 218],
      [169, 112],
    ],
  },
  camera: {
    left: "M44 176 C 30 188 38 202 52 202",
    right: "M156 176 C 170 188 162 202 148 202",
    hands: [
      [52, 206],
      [148, 206],
    ],
  },
  measure: {
    left: "M46 180 C 32 186 22 192 20 198",
    right: "M154 180 C 168 186 178 192 180 198",
    hands: [
      [19, 202],
      [181, 202],
    ],
  },
  magnify: {
    left: "M46 180 C 30 192 26 208 36 216",
    right: "M154 172 C 176 158 186 132 182 110",
    hands: [
      [36, 220],
      [182, 106],
    ],
  },
  stack: {
    left: "M46 180 C 32 190 36 202 48 206",
    right: "M154 180 C 168 190 164 202 152 206",
    hands: [
      [48, 210],
      [152, 210],
    ],
  },
  /* Both arms out to the edges of a frame held up at chest height. Wider than
     `camera`, which is the point — the two are the only poses gripping a
     rectangle in both hands, and a silhouette is recognised before a limb is.
     The frame is 108 units across against the camera's 88, and it is open
     rather than solid. */
  empty: {
    left: "M46 176 C 34 180 30 188 40 193",
    right: "M154 176 C 166 180 170 188 160 193",
    hands: [
      [40, 197],
      [160, 197],
    ],
  },
  /* Holding a cloud up. The only pose allowed to repeat, because it is the one
     the whole set is walking towards — see the note at the top of the file.
     The arm reaches higher than `wave`'s, and that is geometry rather than
     styling. The head is 120 units across at its widest and the box is only
     200, so there is nowhere beside the figure to hold anything: every prop
     that is not held against the chest has to go up, where the dome narrows.
     `magnify` solved it the same way. At `wave`'s height the cloud's left lobe
     sat across the head. */
  offer: {
    left: "M46 178 C 28 190 24 206 34 214",
    right: "M154 166 C 178 152 180 114 169 88",
    hands: [
      [34, 218],
      [168, 84],
    ],
  },
};

/**
 * Whatever the pose is holding, drawn between the arms and the hands so the
 * hands close over it.
 *
 * The props are what stop the set reading as one figure with different arms.
 * A silhouette is recognised before a limb is, so a pose that only moves an
 * elbow is the same drawing again at a glance — a pose holding something the
 * body does not have is not. `shrug`, `point` and `wave` carry nothing and are
 * the three that look most alike; keep them apart on the page.
 */
const Prop = ({ pose, c }: { pose: TwinPose; c: Record<string, string> }) => {
  switch (pose) {
    /* Two panels meeting at a fold, the outer top corner curled — the one
       detail that stops it reading as a folded napkin. */
    case "reading":
      return (
        <>
          <path d="M34 202 L100 193 L100 248 L38 255 Z" fill={c.paper} stroke={c.line} strokeWidth="6" />
          <path d="M166 202 L100 193 L100 248 L162 255 Z" fill={c.paper} stroke={c.line} strokeWidth="6" />
          <path d="M100 193 L100 248" stroke={c.line} strokeWidth="3.5" opacity="0.45" />
          <path
            d="M34 202 C 28 195 32 188 41 190 C 37 195 35 199 37 203"
            fill={c.paper}
            stroke={c.line}
            strokeWidth="5"
          />
        </>
      );

    /* A camera held at chest height, lens to the viewer. The site's first
       sentence is that Normascope photographs your running app; this is that
       sentence with no words in it. */
    case "camera":
      return (
        <>
          <rect x="76" y="150" width="26" height="10" rx="3" fill={c.paper} stroke={c.line} strokeWidth="5" />
          <rect x="56" y="158" width="88" height="52" rx="10" fill={c.paper} stroke={c.line} strokeWidth="6" />
          <circle cx="100" cy="184" r="17" fill={c.body} stroke={c.line} strokeWidth="6" />
          <circle cx="100" cy="184" r="7" fill={c.line} />
          {/* The flash, off for most of the cycle. It blooms out of the lens
              rather than over the whole drawing — a full-figure flash reads as
              the page flickering, not as a photograph being taken. */}
          <circle className="tw-flash" cx="100" cy="184" r="26" fill={c.glare} opacity="0" />
          <circle cx="130" cy="168" r="4" fill={c.line} />
        </>
      );

    /* A tape pulled taut between both hands. The widest silhouette in the set
       by a long way, which is most of why it is here. */
    case "measure":
      return (
        <>
          <rect x="18" y="192" width="164" height="16" rx="4" fill={c.paper} stroke={c.line} strokeWidth="5" />
          {[46, 70, 94, 118, 142, 166].map((x) => (
            <path key={x} d={`M${x} 192 L${x} ${x === 94 || x === 118 ? 205 : 200}`} stroke={c.line} strokeWidth="3" opacity="0.55" />
          ))}
        </>
      );

    /* Held up beside the head rather than over a lens: over the glasses it
       reads as a second pair of spectacles, not as a magnifier. */
    case "magnify":
      return (
        <>
          <path d="M187 88 L196 104" stroke={c.line} strokeWidth="9" strokeLinecap="round" />
          <circle cx="172" cy="66" r="25" fill={c.paper} opacity="0.55" />
          <circle cx="172" cy="66" r="25" fill="none" stroke={c.line} strokeWidth="7" />
          <path d="M160 74 L170 56" stroke={c.glare} strokeWidth="4.5" opacity="0.7" strokeLinecap="round" />
        </>
      );

    /* An empty frame, held up and turned towards you.
       The whole set is two figures each reading their own copy of the same
       page. This is the one holding a copy with nothing on it, which is the
       only joke a 404 needs — and it is the drawing, not the caption, that
       makes it.
       A frame rather than a blank sheet: a plain rectangle of paper reads as a
       card, and `reading` and `stack` already hold paper. The inner rule is
       what turns it into a frame, and a frame with nothing in it is legible at
       `w-28` where a subtler idea would not be. */
    case "empty":
      return (
        <>
          <rect x="46" y="152" width="108" height="66" rx="6" fill={c.paper} stroke={c.line} strokeWidth="6" />
          <rect
            x="58"
            y="163"
            width="84"
            height="44"
            rx="3"
            fill="none"
            stroke={c.line}
            strokeWidth="3"
            opacity="0.38"
          />
        </>
      );

    /* The cloud, held up. Drawn as one outline rather than the lockup's three
       circles over a bar: the mark is filled shapes with no stroke, and three
       stroked circles overlapping a stroked bar show every seam.
       Flat base, three lobes, closed — four arcs and a `z`.
       Clay rather than paper, and it is the only colour in the whole set. The
       twins are two-tone everywhere else on purpose, but this shape has to be
       read as *the product* and not as a weather symbol, and clay is what says
       so — the same value the lockup gives `norma` at this tone. */
    case "offer":
      return (
        <path
          d="M142 74 a14.5 14.5 0 0 1 -1 -28 a19 19 0 0 1 36 -7 a12.5 12.5 0 0 1 10 21 a9 9 0 0 1 -7 14 z"
          fill={c.cloud}
          stroke={c.line}
          strokeWidth="6"
        />
      );

    /* Three sheets, each a slightly different width, because a stack drawn
       from one repeated rectangle reads as a box. */
    case "stack":
      return (
        <>
          <rect x="60" y="170" width="80" height="16" rx="3" fill={c.paper} stroke={c.line} strokeWidth="5" />
          <rect x="54" y="184" width="88" height="16" rx="3" fill={c.paper} stroke={c.line} strokeWidth="5" />
          <rect x="58" y="198" width="84" height="16" rx="3" fill={c.paper} stroke={c.line} strokeWidth="5" />
        </>
      );

    default:
      return null;
  }
};

/**
 * What each pose does, and which parts of the drawing do it.
 *
 * ── Why they idle rather than waiting for a hover ───────────────────────────
 *
 * These are the site's route to Cloud now, so they have to be noticed, and a
 * figure that only moves once the pointer is already on it has been noticed
 * too late. A phone has no pointer at all.
 *
 * ── Why the motion is mostly rest ───────────────────────────────────────────
 *
 * Every cycle is 4–6 seconds and the action occupies the last fifth of it. A
 * character that acts occasionally reads as alive; the same drawing looping
 * without pause reads as an animated GIF next to your paragraph, and on a page
 * with real evidence on it (`normascopeWeb.md` §7) that is a straight loss. The
 * exception is `offer`, whose cloud drifts continuously — a held cloud that
 * stops dead looks broken, and it is the one figure whose whole job is to be
 * looked at.
 *
 * `scope` says what moves, and it is not cosmetic — a prop drawn separately
 * from the hands gripping it comes apart the moment either one moves:
 *
 * - `prop` — the prop and **both** hands, for anything held in front.
 * - `arm`  — the right arm, its hand, and whatever that hand holds.
 * - `body` — everything above the shadow, which stays on the ground.
 */
const MOTION: Record<TwinPose, { scope: "prop" | "arm" | "body"; origin?: string }> = {
  /* The page turns and settles back. */
  reading: { scope: "prop", origin: "100px 250px" },
  /* Both shoulders lift, and the shadow does not. */
  shrug: { scope: "body" },
  /* Two jabs at whatever is under the heading it stands beside. */
  point: { scope: "arm", origin: "154px 180px" },
  wave: { scope: "arm", origin: "154px 168px" },
  /* A shutter: the camera kicks, the lens flares. The site's first sentence is
     that Normascope photographs your running app, so this is the one pose whose
     animation *is* the claim. */
  camera: { scope: "prop", origin: "100px 210px" },
  /* The tape is drawn out and springs back. */
  measure: { scope: "prop", origin: "100px 200px" },
  /* The glass sweeps across, the way you actually look for something. */
  magnify: { scope: "arm", origin: "154px 172px" },
  /* The sheets are tapped square. */
  stack: { scope: "prop", origin: "100px 214px" },
  /* The frame is turned towards you and back — showing you there is nothing in
     it. Pivoting on the bottom edge rather than the centre is what makes it
     read as *shown* rather than as a picture swinging on a nail. */
  empty: { scope: "prop", origin: "100px 218px" },
  /* The cloud drifts. See the note above about why this one never rests. */
  offer: { scope: "arm" },
};

/**
 * The sticker.
 *
 * ── Loud on purpose ─────────────────────────────────────────────────────────
 *
 * Two quieter versions came first and both failed the same way. A word set in
 * the drawing's own line colour disappeared *into* the drawing — same ink, same
 * weight, it read as part of the character rather than as an offer. A board on
 * a post fixed the contrast and broke something else: the character already
 * carries a prop, and a second drawn object above its head turns one silhouette
 * into two competing ones.
 *
 * A sticker is neither. It is flat colour, so it never competes on line weight;
 * it sits at an angle over the crown, so it reads as applied to the figure
 * rather than held by it; and it is clay, so it says Cloud before it is read.
 *
 * ── Clay is the Cloud accent, and this is its second use ────────────────────
 *
 * `offer`'s held cloud was the first, and the note there still holds: the twins
 * are two-tone everywhere else on purpose. The rule is not "one coloured
 * element" — it is that **clay in this set always means Cloud**. Both things
 * wearing it are the offer. Nothing else may take it.
 *
 * The border is the paper colour, which is what makes it a sticker rather than
 * a chip: a die-cut edge is the surface showing through, and it inverts with
 * the tone like everything else in `PALETTE`.
 *
 * ── The angle ───────────────────────────────────────────────────────────────
 *
 * 6 degrees off true. Level, it reads as a UI element that happened to land on
 * a drawing; tilted, it reads as something somebody stuck there.
 *
 * ── It clears the drawing entirely, and that is a rule ──────────────────────
 *
 * The sticker sat in the empty strip over the head first, which was fine for
 * eight poses and wrong for the ninth: `offer` holds its cloud up at y=24, and
 * the sticker covered the one thing that pose exists to show. Tucking it behind
 * the figure only moved the problem — then the cloud covered the word.
 *
 * So the box opens upward to -52 and the sticker lives entirely above y=15,
 * clear of the highest thing any pose raises (`offer`'s cloud at 24, then
 * `magnify`'s lens at 41). **A new pose may not raise anything above y=20.**
 * That is cheaper to honour than a per-pose sticker offset, and it means no
 * future pose can collide with the offer by accident.
 *
 * The cost is that the figure is drawn at 300/352 of its old size at a given
 * width, which is why the placements went up a step.
 *
 * ── The type is pinned, for the same reason the wordmark's is ───────────────
 *
 * The mono face resolves to a different typeface per platform, so an unpinned
 * word is a different width on every machine — here that would push the text
 * off its own sticker. `textLength` fixes the box; the glyphs are whatever the
 * platform has. Same scheme as `marks.tsx`, same reason.
 *
 * Mono and lowercase, matching `cloud` in the lockup and `join waitlist` on the
 * header button. The three things that take you to Cloud speak in one voice.
 *
 * 26 units against a 200-unit drawing renders at 12.5px on a `w-24` twin. That
 * is the floor, and it is why the placements grew — at the old `w-14` this
 * would have been 7px. **Nothing under `w-20` may carry a sticker.**
 */
const STICKER_TEXT = "get cloud";
/** 9 characters at the 0.6em advance a mono face gives, at 26 units. */
const STICKER_LEN = 9 * 0.6 * 26;

const Sticker = ({ c }: { c: Record<string, string> }) => (
  <g transform="rotate(-6 100 -16)">
    <rect
      x="14"
      y="-38"
      width="172"
      height="44"
      rx="11"
      fill={c.cloud}
      stroke={c.paper}
      strokeWidth="5"
    />
    <text
      x="100"
      y="-7"
      textAnchor="middle"
      fill={c.stickerText}
      fontFamily="var(--font-mono-face, ui-monospace, SFMono-Regular, Menlo, monospace)"
      fontSize="26"
      fontWeight="500"
      textLength={STICKER_LEN}
      lengthAdjust="spacing"
    >
      {STICKER_TEXT}
    </text>
  </g>
);

/** The mitten hand from the reference: a blob with two finger notches. */
const Hand = ({ x, y, c }: { x: number; y: number; c: Record<string, string> }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r="9.5" fill={c.line} />
    <path
      d="M-3.5 -6 L-3.5 5 M2 -7 L2 5"
      stroke={c.body}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.4"
      fill="none"
    />
  </g>
);

/**
 * One twin.
 *
 * The viewBox is 200×300 with the feet on 290, so several of them dropped into
 * a row stand on the same line without anyone doing arithmetic.
 */
export function Twin({
  pose = "reading",
  tone = "ink",
  className = "",
  flip = false,
  sign = false,
  title,
}: {
  pose?: TwinPose;
  tone?: TwinTone;
  className?: string;
  /** Mirrors the figure. The pair uses it; so does anything facing inward. */
  flip?: boolean;
  /**
   * Stick the `get cloud` sticker over the figure's crown. `TwinLink` sets it,
   * and nothing else should — a sticker that is not a link is an instruction
   * you cannot follow. It extends the viewBox 14 units upward to clear the
   * tilt; see `Sticker`.
   */
  sign?: boolean;
  title?: string;
}) {
  const c = PALETTE[tone];
  const arms = ARMS[pose];
  const motion = MOTION[pose];
  const [handL, handR] = arms.hands;

  /* One class per pose, and the transform origin in *user units*. The default
     `transform-box: view-box` is what makes that work: an arm, the hand on the
     end of it and the thing the hand holds are three separate elements, and
     they only stay together if all three turn about the same point. Under
     `fill-box` each would turn about the centre of its own bounding box and the
     figure would come apart. */
  const anim = `tw-${pose}`;
  const originStyle = motion.origin ? { transformOrigin: motion.origin } : undefined;

  const propGroup = <Prop pose={pose} c={c} />;
  const rightHand = <Hand x={handR[0]} y={handR[1]} c={c} />;
  const leftHand = <Hand x={handL[0]} y={handL[1]} c={c} />;

  return (
    <svg
      viewBox={sign ? "0 -52 200 352" : "0 0 200 300"}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        transform={flip ? "translate(200 0) scale(-1 1)" : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Outside the `body` group on purpose: a shrug lifts the figure, and a
            shadow that lifts with it is a figure sliding up a wall. */}
        <ellipse cx="100" cy="286" rx="56" ry="8" fill={c.shadow} />

        <g className={motion.scope === "body" ? anim : undefined}>
          {/* Legs first, so the body's outline crosses them and they read as
              attached rather than as two sticks placed underneath. */}
          <path d="M78 214 L72 272 M122 214 L128 272" stroke={c.line} strokeWidth="7" />
          <path d="M72 274 L57 280 M128 274 L143 280" stroke={c.line} strokeWidth="7" />

          {/* Body. A dome over straight sides over a rounded base — the shape is
              a capsule everywhere except the base, which is tighter. */}
          <path
            d="M40 120 A60 60 0 0 1 160 120 L160 178 A42 42 0 0 1 118 220 L82 220 A42 42 0 0 1 40 178 Z"
            fill={c.body}
            stroke={c.line}
            strokeWidth="7"
          />
          {/* The volume. One crescent down the right side and under.
              It borrows the body's own dome and base arcs rather than being an
              ellipse behind a `clipPath`: a clip needs an id, and an id repeats
              the moment two twins in the same pose share a page. */}
          <path
            d="M152 90 A60 60 0 0 1 160 120 L160 178 A42 42 0 0 1 118 220 L100 220 C 132 206 146 156 152 90 Z"
            fill={c.shade}
            opacity="0.6"
          />

          <path d={arms.left} stroke={c.line} strokeWidth="7" />

          {/* The two shapes the drawing can take. A prop held in front belongs
              with both hands; a prop held up belongs with the arm holding it.
              Either way the hands stay drawn after the prop, so they still grip
              it — that ordering is the reason this is a fork and not a wrapper
              around the whole set. */}
          {motion.scope === "arm" ? (
            <>
              <g className={anim} style={originStyle}>
                <path d={arms.right} stroke={c.line} strokeWidth="7" />
                {propGroup}
                {rightHand}
              </g>
              {leftHand}
            </>
          ) : (
            <>
              <path d={arms.right} stroke={c.line} strokeWidth="7" />
              <g
                className={motion.scope === "prop" ? anim : undefined}
                style={motion.scope === "prop" ? originStyle : undefined}
              >
                {propGroup}
                {leftHand}
                {rightHand}
              </g>
            </>
          )}

          {/* The glasses. They span the whole head and overhang it, which is what
            makes them read as worn rather than drawn on. */}
          <path d="M40 111 L28 116 M160 111 L172 116" stroke={c.line} strokeWidth="6" />
          <path d="M92 111 Q100 104 108 111" stroke={c.line} strokeWidth="6" />
          <rect x="38" y="98" width="54" height="36" rx="13" fill={c.lens} />
          <rect x="108" y="98" width="54" height="36" rx="13" fill={c.lens} />
          <path
            d="M53 128 L67 104 M65 130 L77 110 M123 128 L137 104 M135 130 L147 110"
            stroke={c.glare}
            strokeWidth="4.5"
            opacity="0.85"
          />

          <path d="M84 152 Q100 167 116 152" stroke={c.line} strokeWidth="5.5" />
        </g>

      </g>

      {/* Outside the flip *and* outside every pose group, and both matter.
          Outside the pose group so it holds still while the figure moves — a
          sticker that shrugs with the shoulders is a sticker nobody can read.
          Outside the flip because `flip` is `scale(-1 1)`, and a mirrored
          drawing is a mirrored *word*: `/agents` renders `duolc teg`. Caught in
          review, and it is the reason the sticker is a sibling of the figure
          rather than the last thing inside it. */}
      {sign && <Sticker c={c} />}
    </svg>
  );
}

/**
 * One of them, holding up a sign, linking to `/cloud`.
 *
 * ── This is what the figures are for ────────────────────────────────────────
 *
 * They were decoration until now — `aria-hidden`, no title, nothing to click.
 * Making them the route to Cloud is the point: a visitor who has noticed the
 * character on five pages already has somewhere obvious to press, and it is
 * the same somewhere every time.
 *
 * ── The sign is always up ───────────────────────────────────────────────────
 *
 * It was revealed on hover once. That is the wrong default for this site: a
 * phone has no hover, so the surface that needs Cloud most would never have
 * been shown the offer at all — and even with a pointer, a cue you have to
 * find first is a cue most visitors never see. The board is part of the drawing
 * now, so it is up on every page at every width.
 *
 * Hover only lifts the whole figure a little, as an affordance. Nothing is
 * hidden behind it.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 *
 * The drawing stays `aria-hidden` — it is still decoration, and the sign's text
 * is inside it, so a screen reader is not read the same words twice. The link
 * carries the name.
 *
 * **A twin inside an `aria-hidden` container may not use this.** A focusable
 * element hidden from assistive technology is a keyboard trap for exactly the
 * people who cannot see the figure. The hero's backdrop was such a container;
 * see `Hero.tsx` for what moved.
 */
export function TwinLink({
  pose,
  tone = "ink",
  flip = false,
  className = "",
  twinClassName = "",
}: {
  pose: TwinPose;
  tone?: TwinTone;
  flip?: boolean;
  /** Sits on the `<a>`. This is where the caller puts layout and width. */
  className?: string;
  /** Sits on the drawing, for callers that size the two separately. */
  twinClassName?: string;
}) {
  return (
    <a
      href="/cloud"
      aria-label="Get Normascope Cloud"
      className={`block shrink-0 transition-transform duration-200 hover:-translate-y-1 focus-visible:-translate-y-1 ${className}`}
    >
      <Twin pose={pose} tone={tone} flip={flip} sign className={`w-full ${twinClassName}`} />
    </a>
  );
}

/**
 * A section's heading block with one of them standing beside it.
 *
 * This is the shape every placement wants — the figure at the far end of the
 * line the heading starts, sharing its baseline — and writing it out at each
 * site meant five copies of the same flex row drifting apart. Pass the heading
 * as children; the wrapper owns the spacing below it, so the heading's own
 * elements keep their margins and nothing has to be restyled to fit.
 *
 * **It moves rather than disappearing below `lg`.** Beside a heading in a
 * phone-width column the figure takes a third of the line and the heading wraps
 * around it, so under that breakpoint it drops below the block and sits against
 * the right margin at about half the size. It was simply hidden at first, which
 * cost the mobile site the whole character for no reason other than that the
 * row did not fit.
 *
 * **The figure links to `/cloud`.** That is the default and it should stay the
 * default — see `TwinLink`. `link={false}` is for the one placement already on
 * that page, where a link to where you are is a dead end with a sign on it.
 */
export function TwinAside({
  pose,
  tone = "ink",
  flip = false,
  link = true,
  twinClassName = "mt-6 ml-auto block w-28 shrink-0 lg:mt-0 lg:w-32",
  className = "",
  children,
}: {
  pose: TwinPose;
  tone?: TwinTone;
  flip?: boolean;
  /** Off only on `/cloud`, which is where the link would point. */
  link?: boolean;
  /** The two widths: the stacked one, then the `lg` one beside the heading. */
  twinClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`lg:flex lg:items-end lg:justify-between lg:gap-10 ${className}`}>
      <div className="min-w-0">{children}</div>
      {link ? (
        <TwinLink pose={pose} tone={tone} flip={flip} className={twinClassName} />
      ) : (
        <Twin pose={pose} tone={tone} flip={flip} className={twinClassName} />
      )}
    </div>
  );
}
