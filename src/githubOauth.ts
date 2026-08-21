import { createHmac } from "node:crypto";
import { authSecret, normaliseAddress, randomToken, safeEqual } from "./authCrypto.js";

/**
 * GitHub sign-in — FUTURENORMA §4 Step 6 ("GitHub OAuth for developers").
 *
 * The half of the session layer that needs no email at all, which is also why
 * it needs none of the abuse ladder in `authThrottle.ts`: GitHub carries the
 * cost of anyone hammering it, and nothing here sends mail.
 *
 * **Default-deny.** With the client id or secret unset, `githubConfigured()` is
 * false, the button does not render, and the routes 404 — the same posture the
 * password gates take (`lib/gate.ts`). A half-configured OAuth app must not
 * present a broken button on the sign-in page of a paid product.
 *
 * **Live credentials are Harsha's to provide.** The exchange is written against
 * GitHub's documented endpoints and tested with an injected `fetch`, which
 * proves the request shapes, the state check and the account matching. It does
 * not prove the round trip against github.com — that needs a registered OAuth
 * app, and until one exists this is `Blocked` in the sense CLAUDE.md means:
 * an account, not missing local software.
 */

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API = "https://api.github.com";

/**
 * The narrowest scope that answers "who is this".
 *
 * `read:user` for the profile, `user:email` because the primary address is not
 * in the profile response when a user has it hidden. No `repo`, no `org` — this
 * product never reads anyone's code, and asking for a scope we do not use is
 * both a consent screen that scares people and a token that is worth stealing.
 */
export const GITHUB_SCOPE = "read:user user:email";

export interface GithubConfig {
  clientId: string;
  clientSecret: string;
}

export function githubConfig(env: NodeJS.ProcessEnv = process.env): GithubConfig | null {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function githubConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return githubConfig(env) !== null;
}

// ---------------------------------------------------------------------------
// State — the CSRF defence for the redirect
// ---------------------------------------------------------------------------

/** How long a sign-in may sit half-finished on GitHub's side. */
export const STATE_TTL_SECONDS = 600;

/**
 * A one-time value that goes to GitHub in the URL and into an HttpOnly cookie.
 *
 * The callback must find the same value in both. Without it, an attacker can
 * send someone a crafted callback URL carrying *their* authorization code, and
 * the victim's browser silently signs into the attacker's account — after which
 * anything the victim does happens in the attacker's organization. It is the
 * one OAuth mistake that is both easy to make and invisible when made.
 *
 * Signed and time-limited as well as compared, so a stale tab fails cleanly
 * rather than at the account-matching step.
 */
export function issueState(options: { now?: Date; env?: NodeJS.ProcessEnv } = {}): string {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const body = `${now.getTime() + STATE_TTL_SECONDS * 1000}.${randomToken(16)}`;
  return `${body}.${createHmac("sha256", authSecret(env)).update(`oauth-state:${body}`).digest("hex")}`;
}

export function verifyState(
  fromQuery: string | null | undefined,
  fromCookie: string | null | undefined,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {}
): boolean {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  if (!fromQuery || !fromCookie || !safeEqual(fromQuery, fromCookie)) {
    return false;
  }
  const parts = fromQuery.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const body = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], createHmac("sha256", authSecret(env)).update(`oauth-state:${body}`).digest("hex"))) {
    return false;
  }
  const expiresAt = Number(parts[0]);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function authorizeUrl(input: { state: string; redirectUri: string; env?: NodeJS.ProcessEnv }): string | null {
  const config = githubConfig(input.env ?? process.env);
  if (!config) {
    return null;
  }
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", GITHUB_SCOPE);
  url.searchParams.set("state", input.state);
  // Every sign-in re-asks GitHub rather than reusing a granted session, so
  // "sign out" on our side is not quietly undone by one click.
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

// ---------------------------------------------------------------------------
// The exchange
// ---------------------------------------------------------------------------

export interface GithubIdentity {
  /** GitHub's numeric account id, as a string. The stable key. */
  subject: string;
  login: string;
  displayName: string;
  /** Verified addresses only — see `verifiedEmails`. */
  emails: string[];
}

export class GithubOauthError extends Error {
  constructor(
    readonly reason: string,
    message: string
  ) {
    super(message);
    this.name = "GithubOauthError";
  }
}

async function githubJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  what: string
): Promise<T> {
  const res = await fetchImpl(url, {
    ...init,
    headers: { Accept: "application/vnd.github+json", "User-Agent": "normascope-cloud", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new GithubOauthError("provider-error", `GitHub ${what} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const config = githubConfig(input.env ?? process.env);
  if (!config) {
    throw new GithubOauthError("not-configured", "GitHub sign-in is not configured");
  }
  const body = await githubJson<{ access_token?: string; error?: string; error_description?: string }>(
    input.fetchImpl ?? globalThis.fetch,
    GITHUB_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    },
    "token exchange"
  );
  if (!body.access_token) {
    // GitHub answers 200 with an error body for a spent or wrong code, so a
    // status check alone would treat a failed exchange as a success and then
    // fail confusingly two calls later.
    throw new GithubOauthError("no-token", body.error_description ?? body.error ?? "no access token returned");
  }
  return body.access_token;
}

/**
 * Who the token belongs to.
 *
 * **Only verified addresses are returned, and that is load-bearing.** GitHub
 * lets anyone add any address to their account; it becomes *verified* only after
 * clicking a link sent to it. Matching an unverified address to an existing
 * Normascope account would mean anyone could take over a colleague's account by
 * typing their address into GitHub's settings page. The filter below is the only
 * thing standing between us and that, so it must never become "the primary
 * address" or "the profile email".
 */
export async function fetchIdentity(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubIdentity> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const auth = { Authorization: `Bearer ${input.accessToken}` };

  const profile = await githubJson<{ id: number; login: string; name: string | null }>(
    fetchImpl,
    `${GITHUB_API}/user`,
    { headers: auth },
    "profile"
  );
  const emails = await githubJson<{ email: string; primary: boolean; verified: boolean }[]>(
    fetchImpl,
    `${GITHUB_API}/user/emails`,
    { headers: auth },
    "emails"
  );

  const verified = emails
    .filter((e) => e.verified && typeof e.email === "string")
    // Primary first, so account matching prefers the address the person
    // actually uses when several match.
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map((e) => normaliseAddress(e.email));

  if (!profile?.id) {
    throw new GithubOauthError("no-profile", "GitHub returned no account id");
  }

  return {
    subject: String(profile.id),
    login: profile.login,
    displayName: (profile.name ?? profile.login ?? "").slice(0, 80),
    emails: verified,
  };
}
