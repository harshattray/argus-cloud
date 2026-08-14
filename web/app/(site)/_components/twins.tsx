/**
 * The twins.
 *
 * Two identical figures in dark glasses, each reading its own copy of the same
 * page. Traced from a frame of Harsha's own generated footage, which is
 * deliberately not in the repo — it is a 750 kB still, and everything below is
 * drawn from it rather than cropping it. Vector because these appear at half a
 * dozen sizes on light backgrounds and on ink, and a raster can do neither.
 *
 * They earn their place because they say what the tool does before any copy
 * is read — two things that look identical, held side by side, and the whole
 * question is what differs. The glasses are the second joke and the one that
 * carries `/agents`: the reader that cannot see.
 *
 * One character, four poses, and a `Twins` pair that mirrors the reading pose
 * the way the reference frame does. Everything is decoration — `aria-hidden`
 * unless a `title` is passed, which nothing currently does.
 */

export type TwinPose = "reading" | "shrug" | "point" | "wave" | "reach";
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
  point: {
    left: "M46 178 C 28 190 24 206 34 214",
    right: "M154 170 C 176 162 188 146 186 132",
    hands: [
      [34, 218],
      [186, 128],
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
  /** Leaning down at whatever it is standing on. The one that perches. */
  reach: {
    left: "M46 176 C 28 184 20 200 26 214",
    right: "M154 184 C 174 200 186 224 182 244",
    hands: [
      [25, 218],
      [181, 248],
    ],
  },
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

        {/* The page. Two panels meeting at a fold, the outer top corner curled
            — the one detail that stops it reading as a folded napkin. */}
        {pose === "reading" && (
          <>
            <path
              d="M34 202 L100 193 L100 248 L38 255 Z"
              fill={c.paper}
              stroke={c.line}
              strokeWidth="6"
            />
            <path
              d="M166 202 L100 193 L100 248 L162 255 Z"
              fill={c.paper}
              stroke={c.line}
              strokeWidth="6"
            />
            <path d="M100 193 L100 248" stroke={c.line} strokeWidth="3.5" opacity="0.45" />
            {/* The curled outer corner. Without it the page reads as a napkin. */}
            <path
              d="M34 202 C 28 195 32 188 41 190 C 37 195 35 199 37 203"
              fill={c.paper}
              stroke={c.line}
              strokeWidth="5"
            />
          </>
        )}

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
 * The pair. Same figure twice, turned inward — the right one is the left one
 * mirrored, so anything true of one is true of the other.
 *
 * They do *different* things, though. Two identical figures in identical poses
 * read as one drawing pasted twice; giving them separate business is what makes
 * them a pair rather than a repeat. One reads, one points at whatever is above
 * them, by default.
 */
export function Twins({
  poses = ["reading", "point"],
  tone = "ink",
  className = "",
}: {
  poses?: [TwinPose, TwinPose];
  tone?: TwinTone;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-center gap-[2%] ${className}`} aria-hidden>
      <Twin pose={poses[0]} tone={tone} className="w-1/2" />
      <Twin pose={poses[1]} tone={tone} className="w-1/2" flip />
    </div>
  );
}
