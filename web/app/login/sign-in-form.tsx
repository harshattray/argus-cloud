"use client";

import { useState, type FormEvent } from "react";
import styles from "./login.module.css";

/**
 * The magic-link half of the sign-in page.
 *
 * **A client component, and only just.** Everything it does could be a plain
 * form POST except one thing: the proof-of-work challenge, which by definition
 * has to run in the browser. So the form works as a normal `fetch`, and the
 * challenge is solved only in the case where the server asks for one.
 *
 * **The solver is a copy of the rule, and that is a real risk.** The verifier
 * lives in `argus-cloud/authChallenge.js` and imports `node:crypto`, so it
 * cannot be bundled here; this uses Web Crypto. If the two ever disagree the
 * failure is total — nobody past the failure threshold can sign in — which is
 * why `test/authAbuse.test.mjs` solves a challenge with *this* algorithm and
 * verifies it with *that* one.
 */

interface Challenge {
  token: string;
  difficultyBits: number;
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return new Uint8Array(digest);
}

function hasLeadingZeroBits(digest: Uint8Array, bits: number): boolean {
  let remaining = bits;
  let index = 0;
  while (remaining >= 8) {
    if (digest[index] !== 0) return false;
    index += 1;
    remaining -= 8;
  }
  if (remaining === 0) return true;
  return digest[index] >> (8 - remaining) === 0;
}

/**
 * Finds a nonce whose hash starts with the required zero bits.
 *
 * At the default 16 bits this is about 65,000 hashes — tens of milliseconds,
 * and the button says what is happening while it runs. The attempt ceiling
 * stops a malformed challenge from spinning a tab forever.
 */
async function solve(challenge: Challenge, maxAttempts = 5_000_000): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = String(attempt);
    if (hasLeadingZeroBits(await sha256(`${challenge.token}:${solution}`), challenge.difficultyBits)) {
      return solution;
    }
  }
  return null;
}

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "working" }
  | { kind: "sent"; message: string }
  | { kind: "problem"; message: string };

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function post(body: Record<string, string>): Promise<Response> {
    return fetch("/api/auth/email/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "sending" });

    let response = await post({ email });
    let payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      error?: string;
      challenge?: Challenge;
    };

    // One retry, and only for a challenge. Anything else is shown as it came
    // back: retrying a refusal automatically is how a form turns into the
    // hammer the ceiling exists to stop.
    if (payload.challenge?.token) {
      setState({ kind: "working" });
      const solution = await solve(payload.challenge);
      if (solution === null) {
        setState({ kind: "problem", message: "Couldn't complete the check. Try again." });
        return;
      }
      response = await post({
        email,
        challengeToken: payload.challenge.token,
        challengeSolution: solution,
      });
      payload = (await response.json().catch(() => ({}))) as typeof payload;
    }

    if (payload.ok) {
      setState({ kind: "sent", message: payload.message ?? "Check your email." });
      return;
    }
    setState({ kind: "problem", message: payload.error ?? "Something went wrong. Try again." });
  }

  const busy = state.kind === "sending" || state.kind === "working";

  return (
    <form onSubmit={onSubmit} noValidate>
      <label className={styles.label} htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        className={styles.input}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={state.kind === "sent"}
      />
      <button className={styles.button} type="submit" disabled={busy || state.kind === "sent"}>
        {state.kind === "working" ? "Checking…" : busy ? "Sending…" : "Email me a link"}
      </button>

      {state.kind === "sent" && (
        <p className={styles.notice} role="status">
          {state.message}
        </p>
      )}
      {state.kind === "problem" && (
        <p className={styles.problem} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
