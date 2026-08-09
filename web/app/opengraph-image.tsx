import { ImageResponse } from "next/og";
import { HERO_FRAME } from "../lib/run-data";

/**
 * Default social card. Uses the real run's numbers, so the share preview makes
 * the same argument the page does.
 *
 * Satori (the renderer behind ImageResponse) is not a browser: every `div` it
 * sees needs an explicit `display`, and there is no default `flex`. Leaving it
 * off any element with more than one child fails the whole render, so every
 * node below sets it deliberately.
 */

export const alt = "Normascope — verify that what you shipped matches what you intended";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CLAY = "#A8736E";
const INK = "rgba(17,17,17,0.62)";
const MUTED = "rgba(17,17,17,0.4)";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#eee7e4",
          padding: "58px 72px 64px",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: CLAY,
              marginBottom: 30,
            }}
          >
            Free · local · no account
          </div>

          {/* The lockup: norma over a spaced, subscript scope */}
          <div style={{ display: "flex", flexDirection: "column", color: CLAY }}>
            <div style={{ display: "flex", fontSize: 126, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>
              norma
            </div>
            <div style={{ display: "flex", fontSize: 38, letterSpacing: 19, lineHeight: 1.1, marginTop: 6 }}>
              scope
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 31,
              color: INK,
              marginTop: 30,
              maxWidth: 840,
              lineHeight: 1.35,
            }}
          >
            Verify that what you shipped matches what you intended.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 52 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: MUTED,
                  textTransform: "uppercase",
                }}
              >
                Naive diff
              </div>
              <div style={{ display: "flex", fontSize: 62, fontWeight: 700, color: "#e11d48" }}>
                {HERO_FRAME.unaligned}%
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: MUTED,
                  textTransform: "uppercase",
                }}
              >
                Aligned diff
              </div>
              <div style={{ display: "flex", fontSize: 62, fontWeight: 700, color: "#059669" }}>
                {HERO_FRAME.aligned}%
              </div>
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 24, color: "rgba(17,17,17,0.45)" }}>
            npx norma-scope init
          </div>
        </div>
      </div>
    ),
    size
  );
}
