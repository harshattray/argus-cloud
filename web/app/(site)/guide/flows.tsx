/**
 * The four flowcharts from USER-GUIDE.md §18, drawn as pure SVG.
 *
 * These are the same journeys, node for node, as the mermaid diagrams in the
 * guide. When a command changes one of those journeys, both change together.
 *
 * No client JavaScript: they are static SVG that scales with its container,
 * the same approach as the Cloud page diagrams.
 */

type Tone = "step" | "decision" | "dark";

const FILL: Record<Tone, string> = {
  step: "#ffffff",
  decision: "#f5e9e7",
  dark: "#0f0f0f",
};

const STROKE: Record<Tone, string> = {
  step: "rgba(17,17,17,0.16)",
  decision: "rgba(168,115,110,0.5)",
  dark: "#0f0f0f",
};

const TEXT: Record<Tone, string> = {
  step: "rgba(17,17,17,0.82)",
  decision: "#8e5c57",
  dark: "#ffffff",
};

const LINE = "rgba(17,17,17,0.28)";

/** A rounded box, positioned by its centre. */
function Box({
  cx,
  cy,
  w = 240,
  lines,
  tone = "step",
}: {
  cx: number;
  cy: number;
  w?: number;
  lines: string[];
  tone?: Tone;
}) {
  const h = lines.length === 1 ? 44 : 54;
  const first = cy - (lines.length - 1) * 8 + 4;
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={10}
        fill={FILL[tone]}
        stroke={STROKE[tone]}
        strokeWidth={1}
      />
      <text x={cx} y={first} textAnchor="middle" fontSize={12} fill={TEXT[tone]}>
        {lines.map((line, i) => (
          <tspan key={line} x={cx} dy={i === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** A decision diamond, positioned by its centre. */
function Diamond({
  cx,
  cy,
  hw,
  hh = 42,
  lines,
}: {
  cx: number;
  cy: number;
  hw: number;
  hh?: number;
  lines: string[];
}) {
  const first = cy - (lines.length - 1) * 8 + 4;
  return (
    <g>
      <polygon
        points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`}
        fill={FILL.decision}
        stroke={STROKE.decision}
        strokeWidth={1}
      />
      <text x={cx} y={first} textAnchor="middle" fontSize={12} fill={TEXT.decision}>
        {lines.map((line, i) => (
          <tspan key={line} x={cx} dy={i === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/** A connector. `arrow` draws the head; merging lines leave it off. */
function Link({ d, arrow = true, marker }: { d: string; arrow?: boolean; marker: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={LINE}
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={arrow ? `url(#${marker})` : undefined}
    />
  );
}

/** A word on a branch, e.g. Yes / No. */
function Tag({ x, y, text, anchor = "start" }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={10.5} fill="rgba(17,17,17,0.5)">
      {text}
    </text>
  );
}

function Head({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L8 4 L0 8 z" fill={LINE} />
      </marker>
    </defs>
  );
}

const svgClass = "h-auto w-full font-sans";

/** §18 — Choosing a workflow. */
export const FlowChooseWorkflow = () => (
  <svg viewBox="0 0 760 970" className={svgClass} role="img" aria-label="Choosing a workflow: if this is your first use in the project, run init and then doctor. Either way, ask whether the app is already running. If it is not, or the UI needs a special state, capture manually. If it is, and routes are configured, run check. Both paths lead to compare, then to reviewing the report and diffs. If you need likely causes, run explain. Finally, fix, approve or share.">
    <Head id="ah-workflow" />

    <Diamond cx={380} cy={50} hw={175} lines={["First use in this project?"]} />
    <Box cx={150} cy={170} lines={["Run init"]} />
    <Box cx={150} cy={254} lines={["Run doctor"]} />
    <Diamond cx={380} cy={350} hw={180} lines={["Is the app already running?"]} />
    <Box cx={150} cy={470} lines={["Capture manually"]} />
    <Box cx={610} cy={470} lines={["Run check"]} />
    <Box cx={380} cy={560} lines={["Run compare"]} />
    <Box cx={380} cy={644} lines={["Review report and diffs"]} />
    <Diamond cx={380} cy={740} hw={150} hh={40} lines={["Need likely causes?"]} />
    <Box cx={625} cy={830} lines={["Run explain"]} />
    <Box cx={380} cy={922} tone="dark" lines={["Fix, approve, or share"]} />

    <Link marker="ah-workflow" d="M205,50 H150 V148" />
    <Tag x={162} y={42} text="Yes" />
    <Link marker="ah-workflow" d="M555,50 H680 V290 H380 V308" />
    <Tag x={566} y={42} text="No" />
    <Link marker="ah-workflow" d="M150,192 V232" />
    <Link marker="ah-workflow" d="M150,276 V290 H380" arrow={false} />
    <Link marker="ah-workflow" d="M200,350 H150 V448" />
    <Tag x={160} y={406} text="No, or special UI state" />
    <Link marker="ah-workflow" d="M560,350 H610 V448" />
    <Tag x={600} y={406} text="Yes, routes configured" />
    <Link marker="ah-workflow" d="M150,492 V516 H380 V538" />
    <Link marker="ah-workflow" d="M610,492 V516 H380" arrow={false} />
    <Link marker="ah-workflow" d="M380,582 V622" />
    <Link marker="ah-workflow" d="M380,666 V700" />
    <Link marker="ah-workflow" d="M530,740 H625 V808" />
    <Tag x={545} y={732} text="Yes" />
    <Link marker="ah-workflow" d="M380,780 V900" />
    <Tag x={392} y={848} text="No" />
    <Link marker="ah-workflow" d="M625,852 V878 H380" arrow={false} />
  </svg>
);

/** §18 — Automatic capture and comparison. */
export const FlowAutoCapture = () => (
  <svg viewBox="0 0 900 1030" className={svgClass} role="img" aria-label="Automatic capture and comparison: start the app, read the config. If a frame has no base URL and route it is reported as a manual screenshot; otherwise the route is opened in a headless browser, which waits for the page, a selector or a fixed time, then captures the selector, the viewport or the full page and writes a PNG. Both paths meet at comparing the available screenshots, loading the Figma, baseline, image or URL reference, and generating the diff and report.">
    <Head id="ah-auto" />

    <Box cx={500} cy={40} lines={["Start the app"]} />
    <Box cx={500} cy={124} lines={["Read .bridge/config.json"]} />
    <Diamond cx={500} cy={214} hw={190} hh={44} lines={["baseUrl and route configured?"]} />
    <Box cx={95} cy={344} w={160} lines={["Report manual", "screenshot expected"]} />
    <Box cx={500} cy={344} lines={["Open route in headless browser"]} />
    <Box cx={500} cy={428} lines={["Wait for page, selector, or waitMs"]} />
    <Diamond cx={500} cy={518} hw={110} hh={38} lines={["Capture mode"]} />
    <Box cx={250} cy={624} lines={["Capture matching element"]} />
    <Box cx={500} cy={624} lines={["Capture browser viewport"]} />
    <Box cx={750} cy={624} lines={["Capture full page"]} />
    <Box cx={500} cy={716} lines={["Write PNG to .bridge/screenshots"]} />
    <Box cx={500} cy={804} lines={["Compare available screenshots"]} />
    <Box cx={500} cy={892} lines={["Load Figma, baseline, image,", "or URL reference"]} />
    <Box cx={500} cy={984} tone="dark" lines={["Diff and generate report"]} />

    <Link marker="ah-auto" d="M500,62 V102" />
    <Link marker="ah-auto" d="M500,146 V170" />
    <Link marker="ah-auto" d="M310,214 H95 V317" />
    <Tag x={150} y={206} text="No" />
    <Link marker="ah-auto" d="M500,258 V322" />
    <Tag x={512} y={294} text="Yes" />
    <Link marker="ah-auto" d="M500,366 V406" />
    <Link marker="ah-auto" d="M500,450 V480" />
    <Link marker="ah-auto" d="M390,518 H250 V602" />
    <Tag x={262} y={510} text="selector" />
    <Link marker="ah-auto" d="M500,556 V602" />
    <Tag x={512} y={584} text="viewport" />
    <Link marker="ah-auto" d="M610,518 H750 V602" />
    <Tag x={664} y={510} text="fullPage" />
    <Link marker="ah-auto" d="M250,646 V676 H500" arrow={false} />
    <Link marker="ah-auto" d="M750,646 V676 H500" arrow={false} />
    <Link marker="ah-auto" d="M500,646 V694" />
    <Link marker="ah-auto" d="M500,738 V760" />
    <Link marker="ah-auto" d="M95,371 V760 H500 V782" />
    <Link marker="ah-auto" d="M500,826 V865" />
    <Link marker="ah-auto" d="M500,919 V962" />
  </svg>
);

/** §18 — What each of the three commands actually is. */
export const FlowThreeCommands = () => (
  <svg viewBox="0 0 780 350" className={svgClass} role="img" aria-label="auto creates or refreshes screenshots. compare scores screenshots already on disk. check runs auto and then compare. explain analyses an existing comparison and generates hypotheses without ever changing code.">
    <Head id="ah-three" />

    <Box cx={90} cy={90} w={140} tone="dark" lines={["check"]} />
    <Box cx={330} cy={40} w={160} lines={["auto"]} />
    <Box cx={330} cy={140} w={160} lines={["compare"]} />
    <Box cx={620} cy={40} lines={["Create or refresh screenshots"]} />
    <Box cx={620} cy={140} lines={["Score screenshots", "already on disk"]} />
    <Box cx={330} cy={250} w={160} lines={["explain"]} />
    <Box cx={620} cy={250} lines={["Analyze an existing comparison"]} />
    <Box cx={620} cy={324} lines={["Generate hypotheses;", "never change code"]} />

    <Link marker="ah-three" d="M160,90 H205 V40 H250" />
    <Link marker="ah-three" d="M160,90 H205 V140 H250" />
    <Link marker="ah-three" d="M410,40 H500" />
    <Link marker="ah-three" d="M410,140 H500" />
    <Link marker="ah-three" d="M410,250 H500" />
    <Link marker="ah-three" d="M620,272 V297" />
  </svg>
);

/** §18 — CI and pull-request sequence. */
export const FlowCI = () => (
  <svg viewBox="0 0 760 830" className={svgClass} role="img" aria-label="CI and pull requests: push a branch or open a PR, start the preview app if needed, capture the required frames and run compare with the json flag. If a strict regression is measured the job fails and you open the report to fix or approve it intentionally. Otherwise summary.json is written, comment runs, the PR comment and report artifact are published, and you review the result.">
    <Head id="ah-ci" />

    <Box cx={380} cy={40} lines={["Push branch or open PR"]} />
    <Box cx={380} cy={124} lines={["Start preview app if needed"]} />
    <Box cx={380} cy={208} lines={["Capture required frames"]} />
    <Box cx={380} cy={292} lines={["compare --json"]} />
    <Diamond cx={380} cy={392} hw={185} hh={44} lines={["strict regression measured?"]} />
    <Box cx={130} cy={510} lines={["Fail comparison job"]} />
    <Box cx={630} cy={510} lines={["Write summary.json"]} />
    <Box cx={130} cy={614} lines={["Open report and fix or", "approve intentionally"]} />
    <Box cx={630} cy={594} lines={["Run comment"]} />
    <Box cx={630} cy={686} lines={["Publish PR comment", "and report artifact"]} />
    <Box cx={630} cy={784} tone="dark" lines={["Review result"]} />

    <Link marker="ah-ci" d="M380,62 V102" />
    <Link marker="ah-ci" d="M380,146 V186" />
    <Link marker="ah-ci" d="M380,230 V270" />
    <Link marker="ah-ci" d="M380,314 V348" />
    <Link marker="ah-ci" d="M195,392 H130 V488" />
    <Tag x={142} y={444} text="Yes" />
    <Link marker="ah-ci" d="M565,392 H630 V488" />
    <Tag x={578} y={444} text="No" />
    <Link marker="ah-ci" d="M130,532 V587" />
    <Link marker="ah-ci" d="M630,532 V572" />
    <Link marker="ah-ci" d="M630,616 V659" />
    <Link marker="ah-ci" d="M630,713 V762" />
  </svg>
);

/** §18 — Optional AI explanation. */
export const FlowExplain = () => (
  <svg viewBox="0 0 760 800" className={svgClass} role="img" aria-label="Optional AI explanation: run compare first, enable explanation and code pointers, set the API key in the environment, then run explain. The outbound context is scanned for secrets. If a secret is found that frame is blocked and the reason named. If it is safe, permitted crops, metadata and excerpts are sent, findings are saved and shown as hypotheses, and a human verifies before changing code.">
    <Head id="ah-explain" />

    <Box cx={380} cy={40} lines={["Run compare first"]} />
    <Box cx={380} cy={128} lines={["Enable explanation and", "code pointers"]} />
    <Box cx={380} cy={222} lines={["Set ANTHROPIC_API_KEY", "in the environment"]} />
    <Box cx={380} cy={312} lines={["Run explain"]} />
    <Diamond cx={380} cy={410} hw={190} hh={44} lines={["Scan outbound context for secrets"]} />
    <Box cx={130} cy={532} lines={["Block that frame", "and explain why"]} />
    <Box cx={630} cy={532} lines={["Send permitted crops,", "metadata, and excerpts"]} />
    <Box cx={630} cy={636} lines={["Save findings.json and", "show hypotheses"]} />
    <Box cx={630} cy={740} tone="dark" lines={["Human verifies before", "changing code"]} />

    <Link marker="ah-explain" d="M380,62 V101" />
    <Link marker="ah-explain" d="M380,155 V195" />
    <Link marker="ah-explain" d="M380,249 V290" />
    <Link marker="ah-explain" d="M380,334 V366" />
    <Link marker="ah-explain" d="M190,410 H130 V505" />
    <Tag x={142} y={464} text="Secret found" />
    <Link marker="ah-explain" d="M570,410 H630 V505" />
    <Tag x={642} y={464} text="Safe" />
    <Link marker="ah-explain" d="M630,559 V609" />
    <Link marker="ah-explain" d="M630,663 V713" />
  </svg>
);
