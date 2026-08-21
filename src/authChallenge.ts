import { createHash, createHmac } from "node:crypto";
import type { Db } from "./db.js";
import { authSecret, keyedHash, randomToken, safeEqual } from "./authCrypto.js";
import { windowStartFor } from "./authThrottle.js";

/**
 * The challenge a caller must solve once they have failed often enough —
 * FUTURENORMA §4 Step 6 ("a challenge after repeated failures").
 *
 * **Why this is not a CAPTCHA.** A hosted CAPTCHA (Turnstile, reCAPTCHA, hCaptcha)
 * means a third-party script and a third-party frame on the sign-in page, which
 * means `script-src` and `frame-src` entries for somebody else's origin in the
 * CSP. `middleware.ts` refuses third-party origins on this site and explains at
 * length why — the Vercel Toolbar was given up rather than widen it. Widening it
 * for the login page, of all pages, would be a poor trade: it is the page where
 * an injected script has the most to steal.
 *
 * A proof of work is first-party, needs no network round trip to anyone else,
 * sends no visitor data to a third party, and costs an attacker exactly what it
 * is meant to cost: CPU per attempt, multiplied by every attempt. It is worse
 * than a CAPTCHA at telling a human from a bot, and that is not what is being
 * asked of it — the ceilings above already bound volume. This makes the
 * remaining attempts expensive.
 *
 * **The sub-decision this leaves open** (recorded in FUTURENORMA §4 Open
 * decisions 4): whether the first-party version is enough, or Turnstile is worth
 * the CSP widening. Recommendation is first-party; nothing here forecloses the
 * other, because the challenge is behind one interface.
 *
 * **What it does not do.** It does not stop a determined attacker with a
 * botnet; nothing on this list does. It raises the cost of every request past
 * the failure threshold, and it is the last of five ceilings rather than the
 * first.
 */

/**
 * Leading zero **bits** required in the solution hash.
 *
 * 16 bits is ~65,000 hashes: tens of milliseconds in a browser, imperceptible to
 * a person who is already typing an email address, and a real cost when
 * multiplied by thousands of attempts. Env-overridable so an incident can raise
 * it without a deploy.
 */
export const DEFAULT_DIFFICULTY_BITS = 16;

/** How long a challenge may be held before it is solved. */
export const CHALLENGE_TTL_SECONDS = 600;

export interface Challenge {
  /** The opaque string the client must send back with its solution. */
  token: string;
  difficultyBits: number;
  expiresAt: string;
}

function difficulty(env: NodeJS.ProcessEnv): number {
  const raw = env.AUTH_CHALLENGE_BITS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  // Bounded: 0 would disable it silently and anything past 24 would hang a
  // phone. A malformed value takes the default rather than the extreme.
  return Number.isFinite(parsed) && parsed >= 8 && parsed <= 24 ? Math.floor(parsed) : DEFAULT_DIFFICULTY_BITS;
}

/**
 * Issues a challenge bound to the caller and the moment.
 *
 * The token carries its own expiry, difficulty and a hash of the caller's
 * address, signed with `AUTH_SECRET` — so nothing has to be stored to issue one,
 * and a token minted for one caller cannot be handed to another. Only the
 * *solution* touches the database, and only to make it single-use.
 */
export function issueChallenge(
  ip: string,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Challenge {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const bits = difficulty(env);
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000);
  const body = [
    "v1",
    String(expiresAt.getTime()),
    String(bits),
    randomToken(12),
    keyedHash("challenge-ip", ip, env),
  ].join(".");
  return { token: `${body}.${sign(body, env)}`, difficultyBits: bits, expiresAt: expiresAt.toISOString() };
}

function sign(body: string, env: NodeJS.ProcessEnv): string {
  return createHmac("sha256", authSecret(env)).update(`challenge:${body}`).digest("hex");
}

export type ChallengeFailure = "malformed" | "bad-signature" | "expired" | "wrong-caller" | "unsolved" | "reused";

/**
 * Checks a solved challenge, and burns it.
 *
 * Four things must hold, and the order is cheapest-first so a flood of junk
 * costs a signature check rather than a database round trip:
 *
 * 1. the token is ours and unmodified (HMAC);
 * 2. it has not expired;
 * 3. it was issued to this caller;
 * 4. `sha256(token:solution)` starts with the required zero bits.
 *
 * Then, and only then, the token is recorded as spent. Without that last step a
 * single solved challenge would authorise every request for its whole lifetime,
 * which would make the work proof-of-nothing.
 */
export async function verifyChallenge(
  db: Db,
  input: { token: string; solution: string; ip: string },
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): Promise<{ ok: true } | { ok: false; failure: ChallengeFailure }> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();

  const parts = input.token.split(".");
  if (parts.length !== 6 || parts[0] !== "v1") {
    return { ok: false, failure: "malformed" };
  }
  const body = parts.slice(0, 5).join(".");
  if (!safeEqual(parts[5], sign(body, env))) {
    return { ok: false, failure: "bad-signature" };
  }

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return { ok: false, failure: "expired" };
  }
  if (!safeEqual(parts[4], keyedHash("challenge-ip", input.ip, env))) {
    return { ok: false, failure: "wrong-caller" };
  }

  const bits = Number(parts[2]);
  if (!Number.isFinite(bits) || !hasLeadingZeroBits(createHash("sha256").update(`${input.token}:${input.solution}`).digest(), bits)) {
    return { ok: false, failure: "unsolved" };
  }

  // Single use. The row is keyed on the token's own hash and lives in the
  // throttle table's window scheme — a conditional upsert that only the first
  // caller wins, which is the same shape the ceilings use and needs no second
  // table. The window is the challenge lifetime rounded up, so the row outlives
  // the token it guards and is then swept with everything else.
  const windowStart = windowStartFor(now, CHALLENGE_TTL_SECONDS);
  const claimed = await db.query<{ used: number }>(
    `INSERT INTO auth_throttle (scope, subject, window_start, window_seconds, used)
     VALUES ('challenge_spent', $1, $2, $3, 1)
     ON CONFLICT (scope, subject, window_start) DO UPDATE
       SET used = auth_throttle.used + 1
       WHERE auth_throttle.used < 1
     RETURNING used`,
    [keyedHash("challenge-token", input.token, env), windowStart.toISOString(), CHALLENGE_TTL_SECONDS]
  );
  if (claimed.rows.length === 0) {
    return { ok: false, failure: "reused" };
  }

  return { ok: true };
}

/** True when the digest begins with `bits` zero bits. */
function hasLeadingZeroBits(digest: Buffer, bits: number): boolean {
  let remaining = bits;
  let index = 0;
  while (remaining >= 8) {
    if (digest[index] !== 0) {
      return false;
    }
    index += 1;
    remaining -= 8;
  }
  if (remaining === 0) {
    return true;
  }
  return (digest[index] >> (8 - remaining)) === 0;
}

/**
 * Solves a challenge. Lives here so the browser, the tests and any future CLI
 * sign-in all use one implementation of the rule — a solver that disagrees with
 * the verifier is a login page that never works.
 *
 * `maxAttempts` bounds it: at 16 bits the expected work is ~65k hashes, so a
 * million is a very wide margin and still terminates rather than hanging.
 */
export function solveChallenge(token: string, maxAttempts = 5_000_000): string | null {
  const bits = Number(token.split(".")[2]);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = String(attempt);
    if (hasLeadingZeroBits(createHash("sha256").update(`${token}:${solution}`).digest(), bits)) {
      return solution;
    }
  }
  return null;
}
