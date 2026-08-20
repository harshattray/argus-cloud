"use client";

import { useState } from "react";
import { Explainer } from "../../_components/cloud/explainer";
import styles from "./report.module.css";

/**
 * Share links (BuildV5 Phase H4). `/api/share` has existed since Stage 4 and
 * has never had an interface — creating a link meant a curl command, so the
 * feature was shipped and unusable.
 *
 * **The URL is shown once, and this says so before it is created.** Only a hash
 * of the token is stored, so nothing can re-display it later; a panel that let a
 * customer assume otherwise would be a panel that loses their link.
 *
 * **Owners only.** The page does not render this for a share-token viewer —
 * someone holding a link must not be able to mint more of them, or to see the
 * org's other links to this run (H4.3).
 */

interface ShareLink {
  id: string;
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

function state(link: ShareLink): string {
  if (link.revokedAt) {
    return "revoked";
  }
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return "expired";
  }
  return link.expiresAt ? `expires ${new Date(link.expiresAt).toLocaleDateString()}` : "no expiry";
}

export function SharePanel({ runId }: { runId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [days, setDays] = useState("7");
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auth = { authorization: `Bearer ${apiKey}` };

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/share?runId=${encodeURIComponent(runId)}`, { headers: auth });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `request failed (${res.status})`);
      } else {
        setLinks(data.links ?? []);
      }
    } catch {
      setError("network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const parsed = Number(days);
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          ...(Number.isFinite(parsed) && parsed > 0 ? { expiresInDays: parsed } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `request failed (${res.status})`);
      } else {
        setFresh(new URL(data.url, window.location.origin).toString());
        await load();
      }
    } catch {
      setError("network error — try again");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: auth });
      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : `request failed (${res.status})`);
      } else {
        await load();
      }
    } catch {
      setError("network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.share}>
      <h2 className={styles.shareHead}>
        <Explainer term="share-link" scope="panel">
          Share this report
        </Explainer>
      </h2>
      <p className={styles.shareNote}>
        A share link opens this one run, read-only, with no account and no Explain button. The URL
        is shown once when it is created — it cannot be recovered afterwards, only revoked.
      </p>
      <div className={styles.controls}>
        <input
          type="password"
          className={styles.input}
          placeholder="org API key"
          aria-label="Organization API key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <input
          type="number"
          min="1"
          max="365"
          className={styles.input}
          style={{ width: 130 }}
          placeholder="days"
          aria-label="Expires in days"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
        <button type="button" className={styles.button} onClick={create} disabled={busy || !apiKey}>
          Create link
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonQuiet}`}
          onClick={load}
          disabled={busy || !apiKey}
        >
          {links === null ? "Show links" : "Refresh"}
        </button>
        {error && <span className={styles.error}>{error}</span>}
      </div>

      {fresh !== null && (
        <div className={styles.shareRow}>
          <span className={styles.shareUrl}>{fresh}</span>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonQuiet}`}
            onClick={async () => {
              await navigator.clipboard.writeText(fresh);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {links !== null && (
        <ul className={styles.shareList}>
          {links.length === 0 && <li className={styles.shareRow}>No share links on this run yet.</li>}
          {links.map((link) => (
            <li key={link.id} className={styles.shareRow}>
              <span className={styles.shareUrl}>{link.id}</span>
              <span className={styles.shareMeta}>{state(link)}</span>
              {!link.revokedAt && (
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonQuiet}`}
                  onClick={() => revoke(link.id)}
                  disabled={busy}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
