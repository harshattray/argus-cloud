import { NextResponse, type NextRequest } from "next/server";
import { clientIp, overBudget, UNLOCK_BUDGET } from "./clientRate";

/**
 * Shared-password gates for the two private trees on this site.
 *
 * These are not user authentication. There are no accounts and no per-person
 * identity — Pathway 5 in docs/PATHWAYS.md is where real sessions and roles
 * land. This is a door, sized to what is behind it.
 *
 * `/pitch` and `/admin` deliberately do NOT share a password:
 *
 *   - `/pitch` holds investor and internal narrative. The phrase gets typed
 *     into a stranger's laptop in a meeting; it is expected to leak eventually.
 *   - `/admin` holds other people's email addresses. It is personal data, and
 *     it must not be reachable by anyone who was ever shown the pitch.
 *
 * A single password across both would mean every pitch viewer could read the
 * waitlist, so `ADMIN_PASSWORD` is separate and the admin cookie is short.
 *
 * Both gates default-deny: with the environment variable unset the tree 404s
 * rather than opening. A missing variable on a fresh deploy must never publish
 * either surface.
 *
 * The cookie holds a digest of the password, never the password. It is
 * httpOnly and sameSite=lax so page JS cannot read it and it does not ride
 * along on cross-site requests. Everything here uses Web Crypto so it runs on
 * the Edge runtime, where node:crypto does not exist.
 */

export interface Gate {
  /** Path prefix this gate protects. */
  prefix: string;
  /** Scope string mixed into the token, so one gate's cookie cannot open another. */
  scope: string;
  cookie: string;
  envVar: "PITCH_PASSWORD" | "ADMIN_PASSWORD";
  unlockPath: string;
  unlockAction: string;
  /** Cookie lifetime. Shorter where the material behind the gate is personal data. */
  maxAgeSeconds: number;
}

export const PITCH_GATE: Gate = {
  prefix: "/pitch",
  scope: "pitch",
  cookie: "np_pitch",
  envVar: "PITCH_PASSWORD",
  unlockPath: "/pitch/unlock",
  unlockAction: "/api/pitch-unlock",
  maxAgeSeconds: 60 * 60 * 24 * 30,
};

export const ADMIN_GATE: Gate = {
  prefix: "/admin",
  scope: "admin",
  cookie: "np_admin",
  envVar: "ADMIN_PASSWORD",
  unlockPath: "/admin/unlock",
  unlockAction: "/api/admin-unlock",
  // Twelve hours, not thirty days. This one guards personal data, so a laptop
  // left open in a café stops being a standing key by the next morning.
  maxAgeSeconds: 60 * 60 * 12,
};

const GATES = [PITCH_GATE, ADMIN_GATE];

/** The gate protecting a path, or null when the path is public. */
export function gateFor(pathname: string): Gate | null {
  return GATES.find((g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`)) ?? null;
}

/**
 * Token derivation. The scope is part of the input, so the `/pitch` cookie is
 * not a valid `/admin` cookie even if someone sets both passwords the same.
 *
 * The literal prefix is `normascope-<scope>:` — unchanged from the original
 * pitch-only implementation, so existing `/pitch` cookies keep working.
 */
export async function gateToken(scope: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`normascope-${scope}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time comparison over the UTF-8 bytes of both strings. A
 * length-independent early-exit compare leaks the password one character at a
 * time to anyone willing to time the responses, and that costs nothing to avoid.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  // Fixed number of byte comparisons regardless of input length, so the loop
  // count cannot be used to learn the expected length.
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Exchanges a gate's shared password for its access cookie.
 *
 * The response never distinguishes "wrong password" from "no password
 * configured" from "too many attempts", and never echoes what was submitted.
 *
 * **Attempts are rate limited.** Until this was added, `ADMIN_PASSWORD` — the
 * one credential standing in front of other people's email addresses — could be
 * guessed as fast as an attacker could open connections, and nothing anywhere
 * counted. A shared phrase typed into laptops is exactly the credential that
 * needs a ceiling on guesses, because it cannot be rotated per person and
 * nobody is watching a login log for it. `lib/clientRate.ts` owns the budget
 * and is honest about what an in-process limiter is worth.
 *
 * **A refusal looks identical to a wrong phrase.** Same redirect, same
 * `error=1`, same sentence on the page. Telling an attacker they have hit a
 * limiter tells them to slow down or change address, which is the one thing
 * the limiter would rather they did not know. The cost is an operator who
 * mistypes ten times in five minutes reading "that phrase didn't work" when
 * the phrase was right — which is why {@link UNLOCK_BUDGET} is set well above
 * anything human fumbling reaches.
 */
export async function handleUnlock(request: NextRequest, gate: Gate): Promise<NextResponse> {
  const configured = process.env[gate.envVar];
  const throttled = overBudget(`unlock:${gate.scope}`, clientIp(request), UNLOCK_BUDGET);

  let submitted = "";
  try {
    const form = await request.formData();
    const value = form.get("password");
    submitted = typeof value === "string" ? value : "";
  } catch {
    submitted = "";
  }

  const nextParam = request.nextUrl.searchParams.get("next");
  // Only ever redirect within this gate's own tree. An open redirect here would
  // let the unlock page launder a link to somewhere else, and a redirect into
  // the *other* gated tree would be a confusing cross-gate jump.
  const destination =
    nextParam && nextParam.startsWith(`${gate.prefix}/`) && !nextParam.startsWith("//")
      ? nextParam
      : gate.prefix;

  /** The one shape every refusal takes — wrong phrase, unset phrase, throttled. */
  const refuse = () => {
    const url = request.nextUrl.clone();
    url.pathname = gate.unlockPath;
    url.search = "";
    url.searchParams.set("error", "1");
    if (nextParam) url.searchParams.set("next", destination);
    return NextResponse.redirect(url, { status: 303 });
  };

  // Falsy, not `undefined`: an env var set to the empty string must refuse
  // everything rather than accept an empty box.
  if (!configured) return refuse();

  // Compared even when throttled, so a refused attempt costs the same time as a
  // considered one and the throttle is not itself a timing signal for "this
  // address is being watched".
  const correct = timingSafeEqual(submitted, configured);
  if (throttled || !correct) return refuse();

  const url = request.nextUrl.clone();
  url.pathname = destination.split("?")[0];
  url.search = destination.includes("?") ? destination.slice(destination.indexOf("?")) : "";

  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set({
    name: gate.cookie,
    value: await gateToken(gate.scope, configured),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: gate.maxAgeSeconds,
  });
  return response;
}
