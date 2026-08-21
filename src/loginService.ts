import type { Db } from "./db.js";
import type { Alert } from "./breaker.js";
import { normaliseAddress } from "./authCrypto.js";
import {
  alertOnEmailBudget,
  challengeRequired,
  recordAuthFailure,
  reserveRequest,
  reserveSend,
  type EmailReservation,
} from "./authThrottle.js";
import { issueChallenge, verifyChallenge, type Challenge } from "./authChallenge.js";
import { recordAuthEvent } from "./authEvents.js";
import {
  attachSessionToToken,
  consumeLoginToken,
  issueLoginToken,
  signInEmailHtml,
  signInEmailText,
  signInUrl,
  SIGN_IN_SUBJECT,
} from "./magicLink.js";
import { createMailer, type Mailer } from "./mailer.js";
import { createSession, type CreatedSession } from "./sessions.js";
import {
  createUser,
  findUserByIdentity,
  findUserByEmail,
  linkIdentity,
  membershipsFor,
  recordLogin,
  type UserRecord,
} from "./users.js";
import {
  acceptInvitation,
  findInvitationByToken,
  pendingInvitationsFor,
  type Invitation,
} from "./invitations.js";
import { consumeOwnerClaim, pendingClaimFor, type OwnerClaim } from "./ownerClaims.js";
import { exchangeCode, fetchIdentity, GithubOauthError, verifyState } from "./githubOauth.js";

/**
 * Sign-in, end to end — FUTURENORMA §4 Step 6.
 *
 * The web routes are deliberately thin wrappers over this: everything with a
 * decision in it lives here, so the whole flow can be tested without HTTP, and
 * so there is exactly one order in which the ceilings are applied. A second
 * caller that reserved in a different order, or skipped the challenge check,
 * would be a hole nobody could see by reading either file alone. (Same reasoning
 * as `economicPath.ts` owning every credit movement.)
 */

export interface LoginDeps {
  db: Db;
  /** Where links point. The deployment's own origin. */
  baseUrl: string;
  mailer?: Mailer;
  alert?: Alert;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  /**
   * Runs the provider call after the response has been sent, when the platform
   * offers a way (Next's `after()`).
   *
   * **This is a timing-oracle mitigation, not a performance tweak.** §10.7
   * 5A.13 asks for "the same externally observable response shape for existing
   * and nonexistent addresses, **including timing as far as practical**". The
   * dominant difference between an address that gets a link and one that does
   * not is the few hundred milliseconds of the provider call; everything else
   * is a handful of indexed reads. Moving that call off the response path
   * removes the part an attacker can actually measure.
   *
   * Left undefined — in tests, and anywhere `after()` is unavailable — the send
   * is awaited as before, so behaviour is identical and only the timing differs.
   */
  deferSend?: (task: () => Promise<void>) => void;
}

// ---------------------------------------------------------------------------
// Asking for a link
// ---------------------------------------------------------------------------

export interface LinkRequest {
  email: string;
  ip: string;
  challengeToken?: string;
  challengeSolution?: string;
}

/**
 * What the route returns.
 *
 * **`accepted` is the answer for almost everything**, and that is the point.
 * A registered address, an unknown address, an address in its cooldown, and a
 * malformed one all produce the identical body and status. The endpoint cannot
 * be used to ask whether someone has an account.
 *
 * The two exceptions are honest and address-independent: a caller who has
 * exhausted their own per-IP or per-subnet allowance, and a day whose global
 * budget is spent. Neither reveals anything about any address — the same answer
 * comes back whatever is typed into the box — and both need to say "later"
 * rather than "check your email", because no email is coming.
 *
 * `internal` never reaches the browser. It exists for the audit log and the
 * tests, and it is what a check asserts on instead of trying to distinguish two
 * deliberately identical responses.
 */
export interface LinkResult {
  status: "accepted" | "throttled" | "challenge";
  retryAfterSeconds?: number;
  challenge?: Challenge;
  internal:
    | "sent"
    | "no-account"
    | "malformed"
    | "address-throttled"
    | "request-throttled"
    | "budget-exhausted"
    | "challenge-required"
    | "challenge-failed"
    | "send-failed";
}

const ACCEPTED: LinkResult["status"] = "accepted";

/**
 * The one message the browser is shown for every accepted outcome.
 *
 * Written to be true whether or not anything was sent: "if that address can
 * sign in" is not a hedge, it is the accurate description of what happened.
 */
export const LINK_SENT_MESSAGE =
  "If that address can sign in, a link is on its way. It works once and expires in 15 minutes.";

export const THROTTLED_MESSAGE =
  "Too many sign-in requests. Try again shortly, or use GitHub sign-in.";

export async function requestSignInLink(deps: LoginDeps, request: LinkRequest): Promise<LinkResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const db = deps.db;
  const email = normaliseAddress(request.email);
  const ip = request.ip;

  // 1. A caller who has already failed repeatedly must pay for the privilege of
  //    asking again. Checked first, so someone in challenge state cannot
  //    consume anyone's allowance by ignoring it.
  if (await challengeRequired(db, ip, { now, env })) {
    if (!request.challengeToken || !request.challengeSolution) {
      await recordAuthEvent(db, { kind: "challenge-issued", outcome: "refused", reason: "required", ip }, env);
      return {
        status: "challenge",
        challenge: issueChallenge(ip, { now, env }),
        internal: "challenge-required",
      };
    }
    const verified = await verifyChallenge(
      db,
      { token: request.challengeToken, solution: request.challengeSolution, ip },
      { now, env }
    );
    if (!verified.ok) {
      await recordAuthFailure(db, ip, { now, env });
      await recordAuthEvent(db, { kind: "challenge-failed", outcome: "refused", reason: verified.failure, ip }, env);
      return {
        status: "challenge",
        challenge: issueChallenge(ip, { now, env }),
        internal: "challenge-failed",
      };
    }
  }

  // 2. Request-phase ceilings: per IP and per subnet. Paid whatever the address
  //    is, which is what bounds enumeration.
  const requestSlot = await reserveRequest(db, { email, ip }, { now, env });
  if (!requestSlot.allowed) {
    await recordAuthFailure(db, ip, { now, env });
    await recordAuthEvent(db, { kind: "magic-link-refused", outcome: "refused", reason: requestSlot.refusedBy, ip }, env);
    return {
      status: "throttled",
      retryAfterSeconds: requestSlot.retryAfterSeconds,
      internal: "request-throttled",
    };
  }

  // 3. Shape. A malformed address cannot receive anything, and saying so would
  //    be the one response that differs — so it does not.
  if (!looksLikeAddress(email)) {
    await recordAuthFailure(db, ip, { now, env });
    await recordAuthEvent(db, { kind: "magic-link-refused", outcome: "refused", reason: "malformed", ip }, env);
    return { status: ACCEPTED, internal: "malformed" };
  }

  // 4. Is there anyone to send to? Unknown addresses stop here, having consumed
  //    the requester's own allowance and nothing else.
  const recipient = await signInEligibility(db, email, now);
  if (!recipient) {
    await recordAuthFailure(db, ip, { now, env });
    await recordAuthEvent(db, { kind: "magic-link-requested", outcome: "refused", reason: "no-account", email, ip }, env);
    return { status: ACCEPTED, internal: "no-account" };
  }

  // 5. Send-phase ceilings: the global daily budget and the two per-recipient
  //    ones. Only reached when an email is genuinely about to go out.
  const sendSlot = await reserveSend(db, { email, ip }, { now, env });
  if (!sendSlot.allowed) {
    await announceBudget(deps, sendSlot, now);
    const addressScoped = sendSlot.refusedBy === "address_cooldown" || sendSlot.refusedBy === "address_day";
    await recordAuthEvent(
      db,
      { kind: "magic-link-refused", outcome: "refused", reason: sendSlot.refusedBy, email, ip },
      env
    );
    // An address-scoped refusal must look like success. Returning "too many
    // requests" for a cooldown would confirm that this address recently
    // received a link, which confirms it has an account.
    return addressScoped
      ? { status: ACCEPTED, internal: "address-throttled" }
      : {
          status: "throttled",
          retryAfterSeconds: sendSlot.retryAfterSeconds,
          internal: "budget-exhausted",
        };
  }

  // 6. Mint and send.
  const link = await issueLoginToken(db, { email, ip }, { now, env });
  const mailer = deps.mailer ?? createMailer();
  const url = signInUrl(deps.baseUrl, link.token);
  const send = async () =>
    mailer.send({
      to: email,
      subject: SIGN_IN_SUBJECT,
      html: signInEmailHtml(url, deps.baseUrl),
      text: signInEmailText(url),
    });
  try {
    if (deps.deferSend) {
      // Handed to the platform to run after the response. A failure inside it
      // is reported by the same handler below, one turn later.
      deps.deferSend(async () => {
        try {
          await send();
        } catch (err) {
          await reportSendFailure(deps, sendSlot, email, ip, err);
        }
      });
    } else {
      await send();
    }
  } catch (err) {
    await reportSendFailure(deps, sendSlot, email, ip, err);
    return { status: ACCEPTED, internal: "send-failed" };
  }

  await recordAuthEvent(db, { kind: "magic-link-sent", outcome: "allowed", email, ip, userId: recipient.user?.id }, env);
  await announceBudget(deps, sendSlot, now);
  return { status: ACCEPTED, internal: "sent" };
}

/**
 * What happens when the provider refuses.
 *
 * **The budget slot is not released.** `authThrottle.ts` explains why: a
 * provider can accept a message and fail on the response, so "the send errored"
 * does not mean "no mail was sent", and releasing would risk sending twice what
 * the budget allows. The visible consequence is that a broken provider eats the
 * day's budget — which is why this alerts a human rather than logging a line.
 */
async function reportSendFailure(
  deps: LoginDeps,
  slot: EmailReservation,
  email: string,
  ip: string,
  err: unknown
): Promise<void> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  if (deps.alert) {
    deps.alert(
      `Normascope sign-in email failed to send (${String((err as Error)?.message ?? err).slice(0, 200)}). ` +
        `Its budget slot is spent regardless — ${slot.globalUsed} of ${slot.globalLimit} today. ` +
        "Magic-link sign-in is degraded; GitHub sign-in is unaffected."
    );
  }
  await recordAuthEvent(deps.db, { kind: "magic-link-sent", outcome: "failed", reason: "transport", email, ip }, env);
  await announceBudget(deps, slot, now);
}

// ---------------------------------------------------------------------------
// Who may be sent a link at all
// ---------------------------------------------------------------------------

export interface Eligibility {
  /** Why this address is allowed to receive a link. */
  kind: "member" | "invitation" | "claim";
  user?: UserRecord;
  invitations: Invitation[];
  claim: OwnerClaim | null;
}

/**
 * The set of addresses the service will send a sign-in link to.
 *
 * **This is the largest single reduction in the abuse surface a magic-link
 * system has available**, and it is worth being explicit about why. The naive
 * design sends a link to whatever is typed in the box, which makes the set of
 * addresses an attacker can make us mail *the entire internet*. Here it is three
 * bounded lists:
 *
 * 1. people who already belong to an organization — bounded by seats sold;
 * 2. people holding a live invitation — bounded by what admins have issued;
 * 3. the purchaser of an organization nobody has claimed yet — bounded by
 *    checkouts.
 *
 * Everything else gets the identical response and no mail. It follows directly
 * from the product having no trial and no self-serve signup (§5, FUTURENORMA
 * §4 Step 6), and PATHWAYS §10.7 5A.1 states it as a rule: "A person who
 * authenticates without membership or a valid invitation gets no customer
 * data."
 *
 * The order matters only for the `kind` label; a person can be all three.
 */
export async function signInEligibility(db: Db, email: string, now: Date = new Date()): Promise<Eligibility | null> {
  const address = normaliseAddress(email);
  const user = await findUserByEmail(db, address);
  const invitations = await pendingInvitationsFor(db, address, now);
  const claim = await pendingClaimFor(db, address, now);

  if (user) {
    const memberships = await membershipsFor(db, user.id);
    if (memberships.length > 0) {
      return { kind: "member", user, invitations, claim };
    }
  }
  if (claim) {
    return { kind: "claim", user: user ?? undefined, invitations, claim };
  }
  if (invitations.length > 0) {
    return { kind: "invitation", user: user ?? undefined, invitations, claim };
  }
  return null;
}

async function announceBudget(deps: LoginDeps, reservation: EmailReservation, now: Date): Promise<void> {
  if (!deps.alert) {
    return;
  }
  try {
    await alertOnEmailBudget(deps.db, reservation, deps.alert, now);
  } catch (err) {
    // An alert failing must never fail a sign-in.
    console.error("email budget alert failed:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * The same conservative shape the waitlist uses: one `@`, a dot in the domain,
 * no whitespace, 254 octets. Anything beyond that is guesswork — the only real
 * test of an address is delivery.
 */
function looksLikeAddress(value: string): boolean {
  return value.length > 0 && value.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

// ---------------------------------------------------------------------------
// Following a link
// ---------------------------------------------------------------------------

export type SignInResult =
  | { ok: true; session: CreatedSession; user: UserRecord; claimedOrgId?: string }
  | { ok: false; reason: string };

/**
 * Turns a clicked link into a session.
 *
 * Eligibility is re-checked here rather than trusted from the moment the link
 * was sent: fifteen minutes is long enough for an invitation to be revoked or a
 * membership removed, and a link is not a promise that anything still holds.
 *
 * **A user row may be created here, and only here on this path.** §10.7 5A.7
 * allows a magic link to create a user "only in an allowed
 * onboarding/invitation path", and this is that path — the address is holding
 * either a live invitation or a live owner claim, both of which were issued by
 * us. A link to an address holding neither never gets sent, and if one somehow
 * arrives it is refused rather than turned into an account.
 */
export async function completeMagicLink(
  deps: LoginDeps,
  input: { token: string; ip: string; userAgent?: string }
): Promise<SignInResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const db = deps.db;

  const consumed = await consumeLoginToken(db, input.token, { now });
  if (!consumed.ok) {
    await recordAuthFailure(db, input.ip, { now, env });
    await recordAuthEvent(db, { kind: "magic-link-invalid", outcome: "refused", reason: consumed.failure, ip: input.ip }, env);
    return { ok: false, reason: consumed.failure };
  }

  const eligibility = await signInEligibility(db, consumed.email, now);
  if (!eligibility) {
    await recordAuthEvent(
      db,
      { kind: "magic-link-consumed", outcome: "refused", reason: "not-eligible", email: consumed.email, ip: input.ip },
      env
    );
    return { ok: false, reason: "not-eligible" };
  }

  const user = eligibility.user ?? (await createUser(db, { email: consumed.email }));

  // The email identity is recorded on first use rather than at provisioning, so
  // `login_identities` describes how people actually sign in.
  await linkIdentity(db, { provider: "email", subject: user.email, userId: user.id });

  // A pending owner claim for this exact address is consumed now. The person has
  // just proved they control the address the checkout was made with, which is
  // the whole of what the claim asks for (§10.7 5A.5). Invitations are *not*
  // auto-accepted: joining someone else's organization is a deliberate act and
  // the console asks.
  let claimedOrgId: string | undefined;
  if (eligibility.claim) {
    const claimed = await consumeOwnerClaim(
      db,
      { claimId: eligibility.claim.id, userId: user.id, userEmail: user.email },
      { now }
    );
    if (claimed.ok) {
      claimedOrgId = claimed.orgId;
      await recordAuthEvent(
        db,
        { kind: "owner-claimed", outcome: "allowed", email: user.email, ip: input.ip, userId: user.id, orgId: claimed.orgId },
        env
      );
    } else {
      // Not fatal: the sign-in still succeeds, and an operator sees an
      // organization that is paid for and unopened.
      await recordAuthEvent(
        db,
        { kind: "owner-claimed", outcome: "failed", reason: claimed.failure, email: user.email, ip: input.ip, userId: user.id },
        env
      );
    }
  }

  const session = await createSession(
    db,
    { userId: user.id, method: "email", ip: input.ip, userAgent: input.userAgent },
    { now, env }
  );
  await attachSessionToToken(db, consumed.id, session.id);
  await recordLogin(db, { userId: user.id, provider: "email", subject: user.email }, now);
  await recordAuthEvent(
    db,
    { kind: "magic-link-consumed", outcome: "allowed", email: user.email, ip: input.ip, userId: user.id, sessionId: session.id },
    env
  );
  return { ok: true, session, user, claimedOrgId };
}

// ---------------------------------------------------------------------------
// Accepting an invitation
// ---------------------------------------------------------------------------

/**
 * Turns an invitation link into a membership and a session.
 *
 * **Holding the token is the proof of identity**, and it is the same standard a
 * magic link meets: the token was sent to that address and nowhere else, it is
 * single-use, and it expires. §10.7 5A.6 requires acceptance "only after
 * authenticating as the invited identity"; this is one of the two ways to do
 * that, the other being a GitHub account whose verified address matches.
 *
 * A forwarded link is the case worth naming. It works for whoever opens it —
 * exactly as a forwarded magic link would — because the address it was sent to
 * is the only identity claim either one carries. That is why invitations expire
 * in days rather than weeks, why resending revokes the previous link, and why
 * the role is fixed in the row rather than chosen at acceptance.
 */
export async function completeInvitation(
  deps: LoginDeps,
  input: { token: string; ip: string; userAgent?: string }
): Promise<SignInResult & { orgId?: string }> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const db = deps.db;

  const invitation = await findInvitationByToken(db, input.token, now);
  if (!invitation) {
    await recordAuthFailure(db, input.ip, { now, env });
    await recordAuthEvent(db, { kind: "invitation-accepted", outcome: "refused", reason: "unknown", ip: input.ip }, env);
    return { ok: false, reason: "invalid-invitation" };
  }

  const user = (await findUserByEmail(db, invitation.email)) ?? (await createUser(db, { email: invitation.email }));
  await linkIdentity(db, { provider: "email", subject: user.email, userId: user.id });

  const accepted = await acceptInvitation(
    db,
    { invitationId: invitation.id, userId: user.id, userEmail: user.email },
    { now }
  );
  if (!accepted.ok) {
    await recordAuthEvent(
      db,
      { kind: "invitation-accepted", outcome: "refused", reason: accepted.failure, email: user.email, ip: input.ip, orgId: invitation.orgId },
      env
    );
    return { ok: false, reason: accepted.failure };
  }

  const session = await createSession(
    db,
    { userId: user.id, method: "email", ip: input.ip, userAgent: input.userAgent },
    { now, env }
  );
  await recordLogin(db, { userId: user.id, provider: "email", subject: user.email }, now);
  await recordAuthEvent(
    db,
    {
      kind: "invitation-accepted",
      outcome: "allowed",
      reason: accepted.role,
      email: user.email,
      ip: input.ip,
      userId: user.id,
      orgId: accepted.orgId,
      sessionId: session.id,
    },
    env
  );
  return { ok: true, session, user, orgId: accepted.orgId };
}

// ---------------------------------------------------------------------------
// Coming back from GitHub
// ---------------------------------------------------------------------------

/**
 * Turns an authorization code into a session.
 *
 * **No account is ever created here.** A GitHub account that matches nobody is
 * refused, exactly as an unknown email address is. Organizations come from the
 * purchase webhook and nowhere else (§5), so a stranger completing OAuth
 * successfully still ends up outside.
 *
 * **Only verified GitHub addresses can claim an existing account.** See
 * `fetchIdentity` — an unverified address would let anyone take over a
 * colleague's account from GitHub's settings page.
 */
export async function completeGithubSignIn(
  deps: LoginDeps,
  input: {
    code: string;
    state: string | null;
    cookieState: string | null;
    redirectUri: string;
    ip: string;
    userAgent?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<SignInResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const db = deps.db;

  if (!verifyState(input.state, input.cookieState, { now, env })) {
    await recordAuthFailure(db, input.ip, { now, env });
    await recordAuthEvent(db, { kind: "github-refused", outcome: "refused", reason: "bad-state", ip: input.ip }, env);
    return { ok: false, reason: "bad-state" };
  }

  let identity;
  try {
    const accessToken = await exchangeCode({
      code: input.code,
      redirectUri: input.redirectUri,
      env,
      fetchImpl: input.fetchImpl,
    });
    identity = await fetchIdentity({ accessToken, fetchImpl: input.fetchImpl });
  } catch (err) {
    const reason = err instanceof GithubOauthError ? err.reason : "provider-error";
    await recordAuthEvent(db, { kind: "github-refused", outcome: "failed", reason, ip: input.ip }, env);
    return { ok: false, reason };
  }

  let user = await findUserByIdentity(db, "github", identity.subject);
  let claimedOrgId: string | undefined;

  if (!user) {
    // First sign-in for this GitHub account.
    //
    // **A matching address is not permission.** §10.7 5A.7 forbids automatic
    // account merging: "Matching email strings are evidence for a link/claim
    // flow, not permission to merge two existing users silently." So a GitHub
    // account whose verified address happens to equal an existing user's is
    // *refused* — that person signs in by email and links GitHub from their
    // account page, with a session already in hand.
    //
    // The one sanctioned exception is an address holding something we issued: a
    // live invitation or an owner claim. Completing either while presenting a
    // GitHub account whose address GitHub has verified *is* authenticating as
    // the invited identity, which is exactly what 5A.6 asks for.
    const onboarding = await firstGithubOnboarding(db, identity.emails, now);
    if (!onboarding) {
      await recordAuthEvent(
        db,
        { kind: "github-refused", outcome: "refused", reason: "no-linked-account", ip: input.ip },
        env
      );
      return { ok: false, reason: "no-linked-account" };
    }

    user = onboarding.user ?? (await createUser(db, { email: onboarding.email, displayName: identity.displayName }));
    const link = await linkIdentity(db, { provider: "github", subject: identity.subject, userId: user.id });
    if (link.conflict) {
      await recordAuthEvent(db, { kind: "github-refused", outcome: "refused", reason: "identity-taken", ip: input.ip }, env);
      return { ok: false, reason: "identity-taken" };
    }
    if (onboarding.claim) {
      const claimed = await consumeOwnerClaim(
        db,
        { claimId: onboarding.claim.id, userId: user.id, userEmail: onboarding.email },
        { now }
      );
      if (claimed.ok) {
        claimedOrgId = claimed.orgId;
        await recordAuthEvent(
          db,
          { kind: "owner-claimed", outcome: "allowed", ip: input.ip, userId: user.id, orgId: claimed.orgId },
          env
        );
      }
    }
  }

  const session = await createSession(
    db,
    { userId: user.id, method: "github", ip: input.ip, userAgent: input.userAgent },
    { now, env }
  );
  await recordLogin(db, { userId: user.id, provider: "github", subject: identity.subject }, now);
  await recordAuthEvent(
    db,
    { kind: "github-callback", outcome: "allowed", ip: input.ip, userId: user.id, sessionId: session.id },
    env
  );
  return { ok: true, session, user, claimedOrgId };
}

/**
 * The one path on which a GitHub account we have never seen may become a user.
 *
 * Verified addresses only, in GitHub's own primary-first order, and only where
 * that address holds an owner claim or a live invitation. Returns the matching
 * address plus whatever it holds; null means refuse.
 */
async function firstGithubOnboarding(
  db: Db,
  verifiedEmails: string[],
  now: Date
): Promise<{ email: string; user?: UserRecord; claim: OwnerClaim | null; invitations: Invitation[] } | null> {
  for (const candidate of verifiedEmails) {
    const claim = await pendingClaimFor(db, candidate, now);
    const invitations = await pendingInvitationsFor(db, candidate, now);
    if (claim || invitations.length > 0) {
      const existing = await findUserByEmail(db, candidate);
      return { email: candidate, user: existing ?? undefined, claim, invitations };
    }
  }
  return null;
}
