/**
 * Client-IP derivation and the in-process token bucket built on it.
 *
 * One copy, because there are now two callers with different stakes and the
 * bucket is the kind of code that drifts silently when duplicated: the waitlist
 * (`app/api/waitlist/route.ts`) and both gate unlocks (`lib/gate.ts`). The
 * waitlist copy came first and this is it, moved and corrected.
 *
 * **What this is honestly worth.** The state is a `Map` in one process. On
 * serverless that is per instance and per isolate, not global, so a determined
 * attacker spread across enough concurrent instances gets more attempts than
 * the numbers below suggest. It raises the cost of abuse; it is not a durable
 * limiter, and it must not be described as one. The durable version belongs
 * with the API-key rate limit in `argus-cloud/rateLimit.js`, which is backed by
 * the database — this exists because the two surfaces below are reached without
 * an API key, so that limiter cannot see them.
 *
 * No Node built-ins are used, because `lib/gate.ts` and both unlock routes run
 * on the Edge runtime.
 */

/**
 * The caller's address, preferring the headers a client cannot forge.
 *
 * **The bug this fixes.** The waitlist read `x-forwarded-for.split(",")[0]` —
 * the leftmost entry. On any proxy chain that appends rather than replaces, the
 * leftmost entry is whatever the *client* sent, so an attacker rotating one
 * header string got a fresh bucket on every request and the limiter counted to
 * one forever. A limiter keyed on attacker-controlled input is not a limiter;
 * it is a comment that looks like one.
 *
 * `x-vercel-forwarded-for` and `x-real-ip` are both stamped by Vercel's own
 * proxy, which overwrites whatever arrived, so neither can be set by a caller.
 * They are preferred in that order.
 *
 * The `x-forwarded-for` fallback is for local development and any self-hosted
 * run, where there is no trusted proxy in front and therefore nothing to
 * spoof past. It is deliberately last, and it is the only spoofable branch.
 *
 * Everything unresolvable shares the `"unknown"` bucket. That is stricter than
 * handing out a free pass, and it is the right way round: a caller we cannot
 * identify should not get a private allowance.
 */
export function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel.split(",")[0]!.trim();

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export interface Budget {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * One `Map` per named budget, so the waitlist and the unlock attempts cannot
 * consume each other's allowance. Signing up must not lock an operator out.
 */
const buckets = new Map<string, Map<string, Bucket>>();

/** Bounded by traffic to one instance; swept opportunistically when it grows. */
const SWEEP_ABOVE = 10_000;

/**
 * Counts one request against `ip` in the named budget. `true` means refuse.
 *
 * Counting happens on the way in, before the work is done, which is the only
 * placement that limits anything — a check after the cost has been paid limits
 * nothing. For the unlock routes that means a wrong password and a right one
 * both count, deliberately: an attacker must not be able to keep their
 * allowance topped up by mixing in a guess that happens to be correct.
 */
export function overBudget(name: string, ip: string, budget: Budget): boolean {
  let scope = buckets.get(name);
  if (!scope) {
    scope = new Map();
    buckets.set(name, scope);
  }

  const now = Date.now();
  const bucket = scope.get(ip);

  if (!bucket || now > bucket.resetAt) {
    scope.set(ip, { count: 1, resetAt: now + budget.windowMs });
    if (scope.size > SWEEP_ABOVE) {
      for (const [key, value] of scope) {
        if (now > value.resetAt) scope.delete(key);
      }
    }
    return false;
  }

  bucket.count += 1;
  return bucket.count > budget.max;
}

/**
 * Waitlist signups. Unchanged from the route's original figures — the fix here
 * was the key, not the budget.
 */
export const WAITLIST_BUDGET: Budget = { windowMs: 60_000, max: 5 };

/**
 * Gate unlock attempts.
 *
 * Ten in five minutes per address. Deliberately generous: an operator who
 * mistypes a passphrase twice and then pastes it must never be locked out of
 * the waitlist during an incident, and the security value does not come from
 * the limit being tight. It comes from there being one at all — an unlimited
 * endpoint lets a `ADMIN_PASSWORD` guess run at thousands per second, and this
 * caps a single address at 120 an hour whatever it does.
 */
export const UNLOCK_BUDGET: Budget = { windowMs: 5 * 60_000, max: 10 };
