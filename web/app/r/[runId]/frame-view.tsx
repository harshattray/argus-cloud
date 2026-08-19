"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./report.module.css";

/**
 * One frame's images, findings and Explain control (BuildV5 Phase H1/H2).
 *
 * **Why the three are one component.** A finding names a rectangle, and clicking
 * it highlights that rectangle on the diff. That is one piece of state shared
 * between the findings list and the image panes, so splitting them would mean
 * lifting the state into a wrapper that does nothing else. The frame is the
 * unit the page is built from.
 *
 * **Everything rendered here is hostile.** Frame labels come from an upload;
 * category, observation, hypothesis, selector and code pointer come from a
 * model. All of them render as React text nodes, which escape unconditionally —
 * `dangerouslySetInnerHTML` appears nowhere in this tree, and E3's corpus is run
 * against this page rather than the one it replaced.
 *
 * **Images are plain `<img>` from presigned URLs, never `next/image`.** Decided
 * 2026-08-19: `next/image` runs bytes through `sharp`, and three high-severity
 * libvips advisories need attacker-chosen image bytes to matter. Uploaded
 * screenshots are exactly that. `security/audit-allowlist.json` records those
 * advisories on the stated ground that we do not do this, so a `next/image`
 * here would invalidate an accepted risk rather than merely change a renderer.
 */

/** Past this, a capture is a full-page export and is scrolled, not squashed. */
const TALL_ASPECT = 2.2;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Finding {
  category?: string;
  observation?: string;
  cssHypothesis?: string;
  selector?: string;
  codePointer?: string;
  suggestedFix?: string;
  confidence?: string;
  region?: Region;
}

export interface FrameImages {
  build: string | null;
  reference: string | null;
  diff: string | null;
  thumbnail: string | null;
}

export function asFindings(value: unknown): Finding[] {
  const list = (value as { findings?: unknown })?.findings;
  return Array.isArray(list) ? (list as Finding[]) : [];
}

interface Shot {
  src: string;
  caption: string;
  /** Overlay rectangles, drawn on the diff only. */
  regions: Region[];
}

export function FrameView({
  runId,
  frame,
  flagged,
  images,
  regions,
  initialFindings,
  viewer,
  analysisCredits,
  deepCredits,
}: {
  runId: string;
  frame: string;
  flagged: boolean;
  images: FrameImages;
  regions: Region[];
  initialFindings: unknown | null;
  /** A share-token viewer gets the report and no way to spend the org's credits. */
  viewer: "owner" | "share";
  analysisCredits: number;
  deepCredits: number;
}) {
  const [findings, setFindings] = useState<Finding[]>(asFindings(initialFindings));
  const [explained, setExplained] = useState(initialFindings !== null);
  const [active, setActive] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  const shots: Shot[] = [];
  if (images.build || images.reference || images.diff) {
    if (images.build) {
      shots.push({ src: images.build, caption: "Build", regions: [] });
    }
    if (images.reference) {
      shots.push({ src: images.reference, caption: "Reference", regions: [] });
    }
    if (images.diff) {
      shots.push({ src: images.diff, caption: "Difference", regions });
    }
  } else if (images.thumbnail) {
    // A clean frame ships one downscaled JPEG instead of three full artifacts
    // (Pathway 2 item 7). Showing it as a single pane is the honest layout —
    // two empty boxes beside it would read as missing images.
    shots.push({ src: images.thumbnail, caption: "Build (thumbnail)", regions: [] });
  }

  const aspect = natural ? natural.height / Math.max(1, natural.width) : null;
  const tall = aspect !== null && aspect > TALL_ASPECT;

  /**
   * Record the capture's natural size the first time any pane reports one.
   *
   * Measured in the browser rather than stored at upload: the server never
   * decodes a customer image, and the header-reading trick that gives
   * `cropGrounding` its dimensions would mean pulling every artifact through
   * our own function — the design this page exists to avoid.
   */
  const measure = useCallback((img: HTMLImageElement | null) => {
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNatural((current) => current ?? { width: img.naturalWidth, height: img.naturalHeight });
    }
  }, []);

  const onLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => measure(event.currentTarget),
    [measure]
  );

  /**
   * **`onLoad` alone is not enough, and the failure is silent.** The `<img>` is
   * server-rendered, so the browser can finish fetching it before React
   * hydrates — and a handler attached after the load event has already fired
   * never runs. The page then never learns the capture's aspect, and a 6:1
   * full-page export renders letterboxed into the default box: exactly the
   * sliver fix 2 exists to prevent, reintroduced by a lifecycle detail rather
   * than by the CSS. Caught by looking at the page, not by a test.
   *
   * So the ref checks `complete` on attach as well. Whichever happens first
   * wins; `setNatural` keeps the first answer and ignores the second.
   */
  const measureOnAttach = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete) {
        measure(img);
      }
    },
    [measure]
  );

  useEffect(() => {
    if (lightbox === null) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  return (
    <>
      {shots.length === 0 ? (
        <p className={styles.noArtifacts}>
          No images were uploaded with this run. The numbers above are the whole record — runs
          uploaded before artifacts shipped, and summary-only uploads, look like this.
        </p>
      ) : (
        <SyncedShots
          shots={shots}
          tall={tall}
          aspect={aspect}
          active={active}
          natural={natural}
          onLoad={onLoad}
          onAttach={measureOnAttach}
          onZoom={setLightbox}
        />
      )}

      <FindingsList
        findings={findings}
        explained={explained}
        active={active}
        onHighlight={(index) => setActive((current) => (current === index ? null : index))}
      />

      {viewer === "owner" && flagged && (
        <ExplainControls
          runId={runId}
          frame={frame}
          analysisCredits={analysisCredits}
          deepCredits={deepCredits}
          onFindings={(next) => {
            setFindings(next);
            setExplained(true);
          }}
        />
      )}

      {lightbox !== null && (
        <button type="button" className={styles.lightbox} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt={`${frame}, full size`} />
        </button>
      )}
    </>
  );
}

/**
 * The triptych. Tall captures scroll at natural size with the panes locked
 * together — three full-page exports scrolling independently is what the CLI
 * report fixed in `5d311fb`, and it defeats the entire point of a comparison.
 */
function SyncedShots({
  shots,
  tall,
  aspect,
  active,
  natural,
  onLoad,
  onAttach,
  onZoom,
}: {
  shots: Shot[];
  tall: boolean;
  aspect: number | null;
  active: number | null;
  natural: { width: number; height: number } | null;
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onAttach: (img: HTMLImageElement | null) => void;
  onZoom: (src: string) => void;
}) {
  const panes = useRef<(HTMLDivElement | null)[]>([]);
  const syncing = useRef(false);

  const onScroll = useCallback(
    (index: number) => () => {
      if (!tall || syncing.current) {
        return;
      }
      const source = panes.current[index];
      if (!source) {
        return;
      }
      const range = source.scrollHeight - source.clientHeight;
      const ratio = range > 0 ? source.scrollTop / range : 0;
      syncing.current = true;
      for (const [other, pane] of panes.current.entries()) {
        if (other === index || !pane) {
          continue;
        }
        const otherRange = pane.scrollHeight - pane.clientHeight;
        pane.scrollTop = otherRange * ratio;
      }
      // Released on the next frame: assigning scrollTop fires the other panes'
      // scroll handlers, and without the flag they would each sync back.
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    },
    [tall]
  );

  return (
    <div
      className={shots.length === 1 ? `${styles.shots} ${styles.single}` : styles.shots}
      style={aspect === null ? undefined : ({ "--shot-aspect": `1 / ${aspect}` } as React.CSSProperties)}
    >
      {shots.map((shot, index) => (
        <figure key={shot.caption} className={styles.shotFrame}>
          <figcaption>
            <span className={styles.shotTag}>{shot.caption}</span>
            <span className={styles.shotZoom} aria-hidden="true">
              click to zoom
            </span>
          </figcaption>
          <div
            className={tall ? `${styles.shotBody} ${styles.tall}` : styles.shotBody}
            ref={(node) => {
              panes.current[index] = node;
            }}
            onScroll={onScroll(index)}
          >
            <img
              src={shot.src}
              alt={shot.caption}
              // Not lazy. These are the point of the page, they are above the
              // fold on the first frame, and a lazy image that never enters the
              // viewport never reports the natural size the layout needs.
              onLoad={onLoad}
              ref={onAttach}
              onClick={() => onZoom(shot.src)}
            />
            {shot.regions.length > 0 && natural !== null && (
              <div className={styles.regionLayer}>
                {shot.regions.map((region, i) => (
                  <span
                    key={`${region.x},${region.y},${region.width},${region.height}`}
                    className={active === i ? `${styles.region} ${styles.active}` : styles.region}
                    style={{
                      left: `${(region.x / natural.width) * 100}%`,
                      top: `${(region.y / natural.height) * 100}%`,
                      width: `${(region.width / natural.width) * 100}%`,
                      height: `${(region.height / natural.height) * 100}%`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </figure>
      ))}
    </div>
  );
}

/**
 * Findings (H2). Category, confidence, observation, hypothesis, selector, code
 * pointer, and the "generated — verify before applying" label the report
 * renderer mandates (A6).
 *
 * `injection-suspected` is the one category that does not render as an ordinary
 * finding: it is the model reporting that the *content it was shown* tried to
 * give it instructions, and a reader has to be able to tell that apart from an
 * observation about the page at a glance.
 */
function FindingsList({
  findings,
  explained,
  active,
  onHighlight,
}: {
  findings: Finding[];
  explained: boolean;
  active: number | null;
  onHighlight: (index: number) => void;
}) {
  if (!explained) {
    return null;
  }
  if (findings.length === 0) {
    return <p className={styles.findingsNote}>No findings for this frame.</p>;
  }
  return (
    <div className={styles.findings}>
      <p className={styles.findingsNote}>
        Findings are generated and may be wrong or incomplete — verify before applying. Nothing is
        applied automatically, and this does not change the score or the CI result.
      </p>
      <ul className={styles.findingList}>
        {findings.map((finding, index) => {
          const injection = finding.category === "injection-suspected";
          const badge =
            finding.confidence === "high"
              ? styles.badgeHigh
              : finding.confidence === "medium"
                ? styles.badgeMedium
                : styles.badgeLow;
          const rows: [string, string][] = [];
          if (finding.cssHypothesis) {
            rows.push(["Hypothesis", finding.cssHypothesis]);
          }
          if (finding.suggestedFix) {
            rows.push(["Fix", finding.suggestedFix]);
          }
          if (finding.selector) {
            rows.push(["Selector", finding.selector]);
          }
          if (finding.codePointer) {
            rows.push(["File", finding.codePointer]);
          }
          return (
            <li key={index} className={injection ? `${styles.finding} ${styles.injection}` : styles.finding}>
              {injection && (
                <p className={styles.injectionNote}>
                  Possible injected instruction in the captured content — this is a warning about
                  the page&apos;s content, not a visual finding.
                </p>
              )}
              <div className={styles.findingHead}>
                <span className={`${styles.badge} ${badge}`}>{finding.confidence ?? "unrated"}</span>
                <span className={styles.findingCat}>{finding.category ?? "finding"}</span>
                {finding.region && (
                  <button
                    type="button"
                    className={styles.findingRegion}
                    aria-pressed={active === index}
                    onClick={() => onHighlight(index)}
                  >
                    {finding.region.x},{finding.region.y} · {finding.region.width}×
                    {finding.region.height}
                  </button>
                )}
              </div>
              <p className={styles.findingObs}>{finding.observation ?? ""}</p>
              {rows.length > 0 && (
                <dl className={styles.findingMeta}>
                  {rows.map(([label, value]) => (
                    <div key={label} className={styles.fr}>
                      <dt>{label}</dt>
                      <dd>
                        <code>{value}</code>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The Explain buttons.
 *
 * The credit prices are passed in from the server, never written here. They are
 * derived from each pass's worst-case provider cost (`providerBudget.ts`), and
 * they changed on 2026-08-10 when the earlier prices were found to lose money
 * at the ceiling. The charge followed the derivation; the labels did not, and
 * for months the button offered a price the system did not honour. Harsha
 * caught that, not a test.
 */
function ExplainControls({
  runId,
  frame,
  analysisCredits,
  deepCredits,
  onFindings,
}: {
  runId: string;
  frame: string;
  analysisCredits: number;
  deepCredits: number;
  onFindings: (findings: Finding[]) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explain(deep: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ runId, frame, deep }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `request failed (${res.status})`);
      } else {
        onFindings(asFindings(data.findings));
      }
    } catch {
      setError("network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.controls}>
      <input
        type="password"
        className={styles.input}
        placeholder="org API key"
        aria-label="Organization API key"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
      />
      <button type="button" className={styles.button} onClick={() => explain(false)} disabled={busy || !apiKey}>
        {busy ? "Explaining…" : `Explain (${analysisCredits} credit${analysisCredits === 1 ? "" : "s"})`}
      </button>
      <button type="button" className={styles.button} onClick={() => explain(true)} disabled={busy || !apiKey}>
        {`Deep explain (${deepCredits} credit${deepCredits === 1 ? "" : "s"})`}
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
