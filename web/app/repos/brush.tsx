"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./trends.module.css";

/**
 * Drag across the overview to choose the span the detail chart inspects.
 *
 * **This is the first client component on the `/repos/` tree, and that is a
 * property being given up rather than an oversight.** `FinishedSPEC.md` §3v
 * claimed zero client JavaScript here: no nonce to thread, no hydration to wait
 * for, the chart in the first byte. Harsha decided on 2026-08-20 to accept the
 * cost for a real drag, and the docs were corrected in the same change rather
 * than left saying something that had stopped being true.
 *
 * **What is given up, precisely, and what is not:**
 *
 *   - The overview and detail charts are still server-rendered inert SVG. This
 *     component renders *over* the overview and draws nothing but a selection
 *     rectangle. With JavaScript disabled or still loading, both charts are
 *     complete and correct; the range links above them still work. Only the
 *     drag is missing.
 *   - The bundle is this file. It holds no data — the selection is converted to
 *     a URL and the server answers it, so nothing about a tenant's history is
 *     serialised into the page for the client to filter.
 *   - `script-src` already carries a per-request nonce with `strict-dynamic`
 *     (`middleware.ts`), which is what the report page's components ride on.
 *     Nothing in the CSP changes.
 *
 * **The selection becomes a URL, not state.** A brushed range is a thing people
 * paste to a colleague and come back to tomorrow, and a range that lives in
 * memory is neither. It also keeps the detail chart, the runs table and the
 * export reading one span from one place, instead of three components agreeing
 * to be consistent.
 *
 * **A selection holding no runs does not navigate, and says so while you
 * drag.** Most of the overview is blank — 180 buckets of uniform time, a
 * handful of them holding anything — so dragging across empty space is the
 * ordinary gesture rather than a mistake, and it used to send the reader to a
 * page that said "Not found". The occupied spans arrive as fractions from
 * `occupiedSpans`, so this is a comparison rather than a second date
 * calculation that has to agree with the server's.
 *
 * That is the cue, not the guard. The server still handles a hand-edited or
 * pasted URL that names an empty span, because this component is not in that
 * path at all.
 */

export function Brush({
  from,
  to,
  href,
  occupied,
}: {
  /** Bounds of the overview, ISO. A drag is interpolated between these. */
  from: string;
  to: string;
  /** Where to send the reader, with `from`/`to` appended. */
  href: string;
  /** Parts of the width holding runs, as 0–1 fractions. See `occupiedSpans`. */
  occupied: [number, number][];
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();

  /** Pointer x as a 0–1 fraction of the overview's width. */
  const fraction = useCallback((clientX: number): number => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const onDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Primary button only. A right-click opening a context menu mid-drag
      // leaves the selection stuck on screen with no pointer to end it.
      if (event.button !== 0) {
        return;
      }
      // Capture, so a drag that leaves the element still tracks and still ends.
      // Without it, releasing outside the chart leaves the rectangle painted and
      // the component convinced a drag is still running.
      event.currentTarget.setPointerCapture(event.pointerId);
      const at = fraction(event.clientX);
      setDrag({ a: at, b: at });
    },
    [fraction]
  );

  const onMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      setDrag((current) => (current === null ? null : { ...current, b: fraction(event.clientX) }));
    },
    [fraction]
  );

  const onUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      const current = drag;
      setDrag(null);
      if (current === null) {
        return;
      }
      const lo = Math.min(current.a, current.b);
      const hi = Math.max(current.a, current.b);
      // A click is not a zero-width brush. Below this it is someone tapping the
      // chart, and navigating to an empty span would look like the page broke.
      if (hi - lo < 0.01) {
        return;
      }
      // Nor is a drag across blank chart. The selection has been labelled "no
      // runs here" for the whole gesture, so staying put is the answer to it.
      if (!holdsRuns(lo, hi, occupied)) {
        return;
      }
      const at = (f: number) => new Date(fromMs + (toMs - fromMs) * f).toISOString();
      router.push(`${href}&from=${encodeURIComponent(at(lo))}&to=${encodeURIComponent(at(hi))}`);
    },
    [drag, fromMs, toMs, href, occupied, router]
  );

  const lo = drag === null ? 0 : Math.min(drag.a, drag.b);
  const hi = drag === null ? 0 : Math.max(drag.a, drag.b);
  const barren = drag !== null && !holdsRuns(lo, hi, occupied);

  return (
    <div
      ref={box}
      className={styles.brush}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="presentation"
    >
      {drag !== null && hi - lo >= 0.002 && (
        <>
          <div
            className={barren ? `${styles.brushSelection} ${styles.brushBarren}` : styles.brushSelection}
            style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
          />
          {/*
            Only once the selection is wide enough to be a real drag, so the
            label does not flicker on under a pointer that is still moving off
            a tap. Same 0.01 threshold `onUp` uses to tell the two apart.
          */}
          {barren && hi - lo >= 0.01 && (
            <span className={styles.brushHint} style={{ left: `${((lo + hi) / 2) * 100}%` }}>
              no runs here
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Does `[lo, hi]` overlap any part of the chart that holds runs? */
function holdsRuns(lo: number, hi: number, occupied: [number, number][]): boolean {
  return occupied.some(([a, b]) => b > lo && a < hi);
}
