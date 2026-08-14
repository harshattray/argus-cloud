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
 * One character, eight poses, `flip` to mirror it.
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
  | "stack";
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
  },
  cream: {
    line: "#efe3db",
    body: "#242424",
    shade: "#1b1b1b",
    lens: "#efe3db",
    glare: "#242424",
    paper: "#1f1f1f",
    shadow: "rgba(255,255,255,0.06)",
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
  title,
}: {
  pose?: TwinPose;
  tone?: TwinTone;
  className?: string;
  /** Mirrors the figure. The pair uses it; so does anything facing inward. */
  flip?: boolean;
  title?: string;
}) {
  const c = PALETTE[tone];
  const arms = ARMS[pose];

  return (
    <svg
      viewBox="0 0 200 300"
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
        <ellipse cx="100" cy="286" rx="56" ry="8" fill={c.shadow} />

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
        <path d={arms.right} stroke={c.line} strokeWidth="7" />

        <Prop pose={pose} c={c} />

        {arms.hands.map(([hx, hy]) => (
          <Hand key={`${hx}-${hy}`} x={hx} y={hy} c={c} />
        ))}

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
    </svg>
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
 */
export function TwinAside({
  pose,
  tone = "ink",
  flip = false,
  twinClassName = "mt-6 ml-auto block w-14 shrink-0 lg:mt-0 lg:w-24",
  className = "",
  children,
}: {
  pose: TwinPose;
  tone?: TwinTone;
  flip?: boolean;
  /** The two widths: the stacked one, then the `lg` one beside the heading. */
  twinClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`lg:flex lg:items-end lg:justify-between lg:gap-10 ${className}`}>
      <div className="min-w-0">{children}</div>
      <Twin pose={pose} tone={tone} flip={flip} className={twinClassName} />
    </div>
  );
}
