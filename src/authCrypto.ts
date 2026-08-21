import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The small cryptographic pieces every part of the session layer shares —
 * FUTURENORMA §4 Step 6, PATHWAYS §10.7 5A.
 *
 * One module because these are the pieces most likely to drift when copied: a
 * second `sha256` with a different encoding, a second subnet function that
 * disagrees about IPv6, a second secret read from a different variable. Each of
 * those failures is silent — the code works, and a ceiling counts the wrong
 * subject or a hash never matches.
 */

/**
 * The one secret the session layer needs.
 *
 * It is used for **keyed hashes and signatures only** — throttle subjects,
 * audit-log subjects, OAuth state, and the login challenge. It never encrypts
 * anything and it is never a session token: session tokens are random bytes
 * whose hash is stored (see `sessions.ts`), so rotating this secret does not
 * sign anyone out.
 *
 * **Why hashes here are keyed at all.** An unkeyed `sha256(email)` is not
 * anonymisation — the space of email addresses is small enough to enumerate, so
 * anyone holding the table can recover the addresses. Keying with a secret they
 * do not hold is what makes the throttle and audit tables genuinely unable to
 * name a person.
 *
 * **Missing in production is a refusal, not a fallback.** Same reasoning as
 * `db.ts` refusing to boot without `DATABASE_URL`: a default secret would work
 * perfectly, and would mean every deployment shares a key that is in the source
 * tree. Locally there is a fixed development value, so tests and `npm run
 * dev:web` need no setup, and it is obviously a development value if it ever
 * shows up anywhere else.
 */
const DEV_SECRET = "normascope-development-auth-secret-not-for-deployment";

export function authSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AUTH_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (env.VERCEL) {
    throw new Error(
      "AUTH_SECRET is not set. Refusing to fall back to the development key, which is in the " +
        "source tree and would be shared by every deployment. Set AUTH_SECRET in the Vercel " +
        "project's environment variables (all environments)."
    );
  }
  return DEV_SECRET;
}

/**
 * A keyed hash of something personal, for a counter or a log line.
 *
 * `purpose` is mixed in so the same address hashes differently in the throttle
 * table and in the audit log. Without it, one leaked table would let someone
 * join the two together, and the whole point of hashing is that those tables
 * cannot be joined into a picture of a person.
 */
export function keyedHash(purpose: string, value: string, env: NodeJS.ProcessEnv = process.env): string {
  return createHmac("sha256", authSecret(env)).update(`${purpose}:${value}`).digest("hex");
}

/** Token hashing: unkeyed sha256, matching `api_keys` and `share_links`. */
export function tokenHash(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** A URL-safe secret with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison, for anything an attacker can retry. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) {
    // `timingSafeEqual` throws on a length mismatch, so the lengths are compared
    // first and separately. A length difference is not the secret — the content
    // is — and every token compared here is a fixed length anyway.
    return false;
  }
  return timingSafeEqual(x, y);
}

/**
 * The network a caller shares with their neighbours: `/24` for IPv4, `/64` for
 * IPv6.
 *
 * **Why a second ceiling above the per-IP one.** A per-IP limit is worth having
 * and is trivially defeated: a residential proxy pool or a cloud subnet hands an
 * attacker thousands of addresses, and each one arrives with a clean allowance.
 * The subnet is the smallest unit that is actually expensive to acquire in bulk.
 *
 * **A /64 for IPv6, not a /128.** An IPv6 host is routinely handed a whole /64 —
 * 18 quintillion addresses — so a per-address ceiling on IPv6 is not a ceiling
 * at all. /64 is the smallest block that means "one customer".
 *
 * Anything unparseable groups under `unknown`, sharing one allowance. Stricter
 * than handing out a private bucket to a caller we cannot place, and the same
 * choice `clientIp` in the web app already makes.
 */
export function subnetOf(ip: string): string {
  const address = ip.trim();
  if (address.length === 0) {
    return "unknown";
  }
  if (address.includes(":")) {
    // IPv6. Expand only as far as needed: the first four groups are the /64.
    const [head] = address.split("%"); // drop any zone index
    const parts = head.split("::");
    const left = parts[0].split(":").filter((p) => p.length > 0);
    if (parts.length === 1) {
      return left.length >= 4 ? `${left.slice(0, 4).join(":")}::/64` : "unknown";
    }
    const right = (parts[1] ?? "").split(":").filter((p) => p.length > 0);
    const missing = 8 - left.length - right.length;
    if (missing < 0) {
      return "unknown";
    }
    const full = [...left, ...Array(missing).fill("0"), ...right];
    return `${full.slice(0, 4).join(":")}::/64`;
  }
  const octets = address.split(".");
  if (octets.length !== 4 || octets.some((o) => o.length === 0 || !/^\d{1,3}$/.test(o) || Number(o) > 255)) {
    return "unknown";
  }
  return `${octets.slice(0, 3).join(".")}.0/24`;
}

/**
 * Lower-cased and trimmed, and nothing else.
 *
 * Deliberately **not** normalising Gmail's dots or `+tags`. Those rules are
 * provider-specific folklore, they are wrong for other providers, and applying
 * them would merge two addresses that a mail server treats as different people
 * — which for a login system means signing someone in as somebody else.
 *
 * The address is still the unique key in `users`, so the same person using
 * `a+work@` and `a@` gets two accounts. That is the safe direction of the two.
 */
export function normaliseAddress(email: string): string {
  return email.trim().toLowerCase();
}
