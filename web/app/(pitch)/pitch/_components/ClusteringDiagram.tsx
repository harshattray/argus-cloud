/**
 * How mismatched pixels become "3 significant regions".
 *
 * Deliberately a SCHEMATIC, and labelled as one. The real run records the
 * region *count* in summary.json but not their coordinates, so drawing them
 * over the real diff image would mean inventing positions — which doctrine
 * (docs/normascopeWeb.md §6) forbids. The four stages below are the real
 * algorithm; the cells are illustrative.
 */

const HOT = new Set([9, 10, 17, 18, 19, 26, 27, 43, 44, 51, 52, 68, 76, 77]);
const NOISE = new Set([5, 22, 39, 60, 71]);

const COLS = 8;
const ROWS = 11;

function Grid({ stage }: { stage: 1 | 2 | 3 | 4 }) {
  const cells = Array.from({ length: COLS * ROWS }, (_, i) => i);

  return (
    <svg viewBox={`0 0 ${COLS * 10} ${ROWS * 10}`} className="w-full h-auto" aria-hidden>
      {cells.map((i) => {
        const x = (i % COLS) * 10;
        const y = Math.floor(i / COLS) * 10;
        const isHot = HOT.has(i);
        const isNoise = NOISE.has(i);

        let fill = "transparent";
        if (stage === 1 && (isHot || isNoise)) fill = "rgba(244,63,94,0.45)";
        if (stage === 2) {
          if (isHot) fill = "rgba(244,63,94,0.45)";
          if (isNoise) fill = "rgba(244,63,94,0.10)";
        }
        if (stage >= 3 && isHot) fill = "rgba(244,63,94,0.28)";

        return (
          <rect
            key={i}
            x={x + 0.6}
            y={y + 0.6}
            width={8.8}
            height={8.8}
            rx={1}
            fill={fill}
            stroke="rgba(0,0,0,0.07)"
            strokeWidth={0.4}
          />
        );
      })}

      {/* Stage 4: the clusters that fall out, with a merge gap applied */}
      {stage === 4 && (
        <g fill="none" stroke="rgb(245,158,11)" strokeWidth="1.2" strokeDasharray="3 2">
          <rect x="9" y="9" width="42" height="32" rx="2" />
          <rect x="19" y="49" width="22" height="22" rx="2" />
          <rect x="39" y="79" width="32" height="22" rx="2" />
        </g>
      )}
    </svg>
  );
}

const STAGES = [
  { n: 1, head: "Mismatched pixels", body: "The raw diff. Scattered, and on its own it only tells you a percentage." },
  { n: 2, head: "Binned into a grid", body: "Pixels are binned into cells. Cells below a minimum density are dropped as noise." },
  { n: 3, head: "Hot cells marked", body: "What survives is the pixels that clustered — not the ones that happened to differ." },
  { n: 4, head: "Flood-filled into regions", body: "Adjacent hot cells merge, within a merge gap, into regions with real coordinates." },
] as const;

export function ClusteringDiagram() {
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAGES.map((s) => (
          <figure key={s.n} className="rounded-xl border border-black/8 bg-white/60 p-4">
            <div className="mb-3">
              <Grid stage={s.n as 1 | 2 | 3 | 4} />
            </div>
            <figcaption>
              <p className="text-[10px] font-black tabular-nums text-text/25 mb-1">0{s.n}</p>
              <p className="title-sm text-text leading-tight mb-1.5">{s.head}</p>
              <p className="text-xs text-text/50 leading-relaxed">{s.body}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="text-xs text-text/35 mt-3">
        Schematic — the stages are the real algorithm; the cells are illustrative. Region coordinates
        are written into your own report, not published here.
      </p>
    </div>
  );
}
