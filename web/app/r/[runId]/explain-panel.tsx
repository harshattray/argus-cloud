"use client";

import { useState } from "react";

/**
 * Explain button + findings list (Build 4.0 D1). Findings are untrusted
 * model output: rendered exclusively as React text nodes (auto-escaped),
 * with the confidence badge and the "generated — verify" label the report
 * renderer mandates (A6). The API key is held in component state only —
 * never persisted, never in the URL.
 */

interface Finding {
  category?: string;
  observation?: string;
  cssHypothesis?: string;
  selector?: string;
  suggestedFix?: string;
  confidence?: string;
  firstDriftCommit?: string | null;
  recurrence?: number;
}

function asFindings(value: unknown): Finding[] {
  const list = (value as { findings?: unknown })?.findings;
  return Array.isArray(list) ? (list as Finding[]) : [];
}

export function ExplainPanel({
  runId,
  frame,
  flagged,
  initialFindings,
}: {
  runId: string;
  frame: string;
  flagged: boolean;
  initialFindings: unknown | null;
}) {
  const [findings, setFindings] = useState<Finding[]>(asFindings(initialFindings));
  const [hasFindings, setHasFindings] = useState(initialFindings !== null);
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
        setFindings(asFindings(data.findings));
        setHasFindings(true);
      }
    } catch {
      setError("network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {hasFindings && (
        <div style={{ margin: "8px 0" }}>
          <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 6px" }}>
            Findings are generated — verify before applying. Nothing is auto-applied.
          </p>
          {findings.length === 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>No findings for this frame.</p>}
          {findings.map((f, i) => (
            <div key={i} style={{ background: "#191921", borderRadius: 6, padding: "10px 14px", margin: "6px 0" }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "1px 8px",
                    borderRadius: 10,
                    marginRight: 8,
                    background: f.confidence === "high" ? "#274e3b" : f.confidence === "medium" ? "#4e4327" : "#3a3a44",
                  }}
                >
                  {f.confidence ?? "?"}
                </span>
                <strong>{f.category ?? "finding"}</strong> — {f.observation ?? ""}
              </p>
              {f.cssHypothesis ? <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.8 }}>CSS: {f.cssHypothesis}</p> : null}
              {f.selector ? <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.8 }}>Selector: {f.selector}</p> : null}
              {f.suggestedFix ? <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.8 }}>Fix: {f.suggestedFix}</p> : null}
              {typeof f.recurrence === "number" && (
                <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.65 }}>
                  History: drifted {f.recurrence} time{f.recurrence === 1 ? "" : "s"}
                  {f.firstDriftCommit ? ` · first at ${f.firstDriftCommit}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {flagged && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input
            type="password"
            placeholder="org API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{
              background: "#191921", color: "#e8e6e1", border: "1px solid #2a2a32",
              borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 180,
            }}
          />
          <button onClick={() => explain(false)} disabled={busy || !apiKey} style={buttonStyle}>
            {busy ? "Explaining…" : "Explain (1 credit)"}
          </button>
          <button onClick={() => explain(true)} disabled={busy || !apiKey} style={buttonStyle}>
            Deep explain (3 credits)
          </button>
          {error && <span style={{ fontSize: 12, color: "#e0563c" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: "#2b4ea0",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};
