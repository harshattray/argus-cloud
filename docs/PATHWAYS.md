# PATHWAYS.md — Normascope Cloud execution pathways

**Status:** implementation roadmap  
**Canonical strategy:** [FUTURENORMA.md](./FUTURENORMA.md)  
**Reviewed:** 2026-08-10

## 0. Purpose

`FUTURENORMA.md` is the source of truth for doctrine, strategy, pricing,
security, current state, and the canonical sequence. This document is the
implementation companion: it supplies work breakdowns, tests, and gates for
that sequence. It must not create a second plan or silently change a decision.

The central product thesis is:

> Normascope Cloud is the organization’s continuous visual-quality memory and
> verified repair loop.

The free CLI answers: **what is different in this run?**

Cloud should answer:

- When did the difference begin?
- Has this defect happened before?
- Which routes and components accumulate quality debt?
- Who needs to act?
- Did the proposed fix actually resolve the issue?
- Can developers, designers, PMs, QA, and agents share the same evidence?

## 1. Business diagnosis

### What is already strong

- Deterministic, alignment-aware visual comparison.
- Visual regression and design-fidelity modes.
- Figma, image-folder, URL, and baseline sources.
- Local HTML reports.
- GitHub Action and sticky PR comments.
- MCP integration for coding agents.
- BYO-key explanations.
- Strong capture, secret, SSRF, and model-output safety foundations.
- Cloud credits, metering, caching, budgets, breakers, and history enrichment.

### What is not yet sellable

The cloud audit identifies these gaps:

- Hosted reports do not yet show the three images.
- Artifact upload is incomplete.
- Trends and dashboards are incomplete.
- Authentication and organization management are incomplete.
- Billing webhook wiring is incomplete.
- Share-link UI is incomplete.
- Hosted explain is weaker than local explain until crop-grounding ships.
- `norma explain` cannot yet spend Cloud credits.
- Retention/deletion and hosted-path security evidence remain open.
- Reconciliation misattributes included-credit spend.

These are launch blockers, not optional polish. See
[FinishedSPEC.md](./FinishedSPEC.md) §4, §7, and §9.

### Economics

Measured post-intro provider COGS are approximately `$0.0164` per review.
500 included credits cost approximately `$8.20` at worst-case provider cost.
The $59 subscription therefore has healthy gross contribution.

The business risk is usage and expansion:

- ordinary teams may not consume 500 credits;
- result-cache hits are intentionally free;
- unlimited seats and repositories remove expansion levers;
- hosted history may be visited periodically rather than daily;
- packs sell only when teams generate recurring explanations.

The $59 price can work as an entry plan. It should not be the only possible
revenue level forever.

## 2. Commercial model

> This is the implementation contract for the launch plan described in
> `FUTURENORMA.md` §3. `FUTURENORMA.md` remains authoritative; if plan contents
> change, update that document first and then mirror the executable limits here.
> Do not add a second price, tier, or repository-policy decision in this file.

### Launch model

Keep the current launch decision:

- Normascope CLI: free forever.
- Normascope Cloud: `$59/month per organization`.
- 500 monthly credits, expiring monthly.
- Prepaid credit packs; no overage invoices.
- Unlimited viewers/designers while serving cost remains negligible.
- 30-day money-back guarantee.
- No client-side paid locks.

Treat $59 as a validated entry point, not a permanent promise of unlimited
infrastructure.

### Expansion model

After the first 5–10 paying organizations, measure repository count, credit
consumption, storage, support, and retention. If demand supports it, add:

| Path | Indicative shape | Purpose |
|---|---|---|
| Starter | $59/month, fair-use repositories, 500 credits | Entry team or agency |
| Team | $149–199/month, more repositories and credits | Natural expansion |
| Enterprise | Custom | SSO, audit, retention, private deployment, residency |
| Credit packs | Existing prepaid packs, repriced after crop calibration | High-volume CI and agents |

Do not charge per designer, reviewer, screenshot, or cache hit. Those charges
would reduce sharing and weaken distribution.

### Shared organization wallet and credit exhaustion

Credits belong to the organization, not to individual seats. Thirty or one
hundred people may belong to an organization without multiplying the
subscription price, but all hosted AI usage draws from the organization’s
shared credit balance.

The product must distinguish three different activities:

| Activity | Uses Cloud credits? | Effect of many users |
|---|---:|---|
| Local `check`/`compare`/report | No | Runs on customer machines; no provider cost to us |
| Explicit Cloud upload | No AI credit by itself | Consumes storage/run/repository quota |
| Hosted or automatic AI explain | Yes | Consumes the shared organization wallet |

### AI guidance and user responsibility

AI explanations are optional guidance, never an authoritative result or an
automatic decision. Every surface that displays an AI response must clearly
state that the response may be inaccurate or incomplete, and that the user may
use it, edit it, ignore it, or discard it entirely. Whether to act on it is the
user's decision alone.

The product must not imply that Normascope, Yutic, or the AI provider reviewed,
approved, or guarantees a suggested change. Normascope/Yutic is not responsible
for decisions, code changes, or outcomes made from relying on an AI response,
subject to the final wording approved for the Terms and applicable law.

This disclosure must appear:

- beside hosted AI findings and explain results;
- in CI/PR explanation output where a human may act on it;
- in the first-run or upload disclosure before data is sent for hosted AI;
- in the public website's AI explanation section;
- in the Terms of Service and a dedicated AI-use disclosure before paid launch.

The deterministic visual score, comparison status, and CI gate remain separate
from AI. AI can describe a possible cause, but it must never change the score,
decide pass/fail, or silently apply a fix.

When the shared credit balance reaches zero, the organization enters **AI
exhausted** state. It must not receive free provider-backed explanations and
the service must not pay for them from an internal account.

| Capability | Active subscription, credits available | Active subscription, credits exhausted |
|---|---|---|
| Local capture/comparison | Available | Available |
| Local HTML report | Available | Available |
| GitHub comparison Action | Available | Available |
| Explicit upload | Available within storage/quota policy | Available within storage/quota policy |
| Hosted report/history/trends | Available | Available |
| Share links | Available | Available |
| Hosted AI Explain | Available | Paused with a clear message |
| Automatic PR Explain | Available within caps | Skipped; CI stays green |
| Credit packs | Available | Available while subscription is active |
| Monthly allowance | Granted at renewal | Granted at next renewal |

The visible CI/report state should be:

    Visual comparison: completed
    Hosted report: available
    History/trends: available
    AI explanation: skipped — credits exhausted
    CI: green

At exhaustion, the user-facing message must explain that visual comparison,
reports, and CI continue, while hosted AI is paused until a pack is purchased
or the next monthly allowance is granted. Do not silently fall back to our
provider account, bypass the ledger, or turn a credit exhaustion into a failed
build.

#### Shared-wallet controls

The organization admin must be able to see and control consumption through:

- organization-wide monthly credit budget;
- per-repository monthly budgets;
- per-agent-key budgets;
- per-key/user rate limits;
- per-organization concurrent-explanation limit;
- per-run automatic-explanation cap;
- repository priority or reservation policy;
- alerts at 50%, 75%, 90%, and 100% usage;
- a usage ledger showing user/key, repository, run, frame, model, credits,
  cache status, and no-charge failures;
- an organization switch to disable automatic explanations while retaining
  manual explanations.

Suggested initial allocation for a 500-credit organization allowance:

| Repository class | Example allocation |
|---|---:|
| Production application | 300 credits |
| Marketing/public site | 100 credits |
| Internal tools | 50 credits |
| Agent experiments | 50 credits |

These values are policy examples, not launch constants. The important rule is
that one noisy repository or runaway agent must not consume the entire wallet
without an admin-visible limit.

Subscription and AI entitlement are separate states:

- active subscription + credits: full enabled product;
- active subscription + no credits: all non-AI features continue, AI pauses;
- lapsed subscription: existing reports/history remain read-only, new uploads
  and hosted AI are rejected politely;
- renewed subscription: new monthly allowance is granted;
- purchased pack: additional AI credits become available while subscribed.

### Plan dimensions and the repository gap

Repository count alone is not sufficient billing. It is a useful capacity
dimension, but it does not capture CI volume, storage, AI usage, collaboration,
or governance. The launch plan should therefore use a hybrid model:

- subscription for hosted state, collaboration, history, and support;
- active-repository fair use for product scale;
- prepaid credits for provider-backed AI;
- storage and retention limits for artifact cost;
- higher plans for coordination and governance.

An “active repository” is one that uploads at least one run during the billing
month. Registered or archived repositories should not consume a customer’s
active-repository allowance.

**Decision — 2026-08-22:** the launch fair-use allowance is **3 active
repositories** on the $59/month Starter plan. This is intentionally a capacity
boundary, not per-repository billing: the base plan remains a complete product,
while teams with more active projects have a clear reason to move up the
ladder. The expansion figures are 10 active repositories for Growth and 25 for
Team; Enterprise is custom.

The first expansion hypothesis is intentionally narrower than the old
3–5-versus-15–25 gap:

| Plan | Price hypothesis | Active repositories | Included credits |
|---|---:|---:|---:|
| Starter | $59/month | 3 | 500 |
| Growth | $89–99/month | 10 | 1,000 |
| Team | $149/month | 25 | 2,000 |
| Enterprise | Custom | Custom | Custom |

These are not launch commitments. Validate them against the first 5–10 paying
organizations. Until then, retain the single $59 Cloud plan and use fair-use
limits operationally rather than publishing a large pricing ladder.

The customer should never be forced from $59 to $149 merely because it has six
or seven repositories. A Growth step or a measured fair-use conversation is
needed before a Team upgrade.

The launch figure is now decided: Starter is 3 active repositories, Growth is
10, and Team is 25. The usage UI may display those numbers because they are the
plan's active-repository allowances, not an unpublished operational guess.

### What belongs in each plan

Starter must be a complete product, not a crippled preview:

- hosted reports with images;
- history and trends;
- share links and unlimited viewers/designers;
- GitHub Action integration;
- bounded automatic PR explanations;
- 500 credits;
- 90-day history;
- basic repository dashboard;
- basic upload/storage quota;
- scoped API keys;
- self-serve deletion and cancellation.

Growth adds capacity and workflow breadth:

- 10 active repositories;
- 1,000 credits;
- longer history and more storage;
- more automatic explanations per PR;
- multiple agent keys;
- per-repository credit budgets;
- notifications;
- repository ownership and quality-debt views.

Team adds coordination and governance rather than better pixels:

- 25 active repositories;
- 2,000 credits;
- organization-wide quality dashboard;
- project grouping and ownership;
- approval workflows for baselines and contracts;
- audit exports;
- configurable retention;
- higher API rate limits;
- advanced budgets and rate controls;
- priority support.

Enterprise is for procurement and security requirements:

- SSO/SAML and SCIM;
- advanced audit logs;
- private deployment;
- regional storage and inference;
- customer-controlled provider configuration;
- legal hold and custom retention;
- security reviews and contractual support.

No Starter feature should be removed merely to make Team look attractive.
Higher plans should sell scale, control, security, and operational assurances.

## 3. Ordered implementation pathways

### Mandatory gated execution rule

Implementation is strictly sequential. An agent must not begin a later
delivery phase, feature, migration, or dependent UI surface until the current
phase's implementation and verification gate are both green. A capability
work package may be implemented earlier only when the canonical phase table
explicitly places it there and its own gate remains green.

### Canonical delivery phases

This is the only execution order. The numbered sections below are capability
work packages and acceptance criteria; their labels must not be read as a
second schedule.

| Phase | Delivery milestone | Work packages used | Required condition before advancing |
|---|---|---|---|
| P | Public website + waitlist | Public website demand test | `normascope.com` is live, waitlist evidence works, and Cloud availability is described honestly |
| 0 | Loose ends | Pathway 0 | CLI loose ends are verified |
| 1 | Cloud substrate and safety | Pathway 1 | Pathway 1 gate is green; no payment, tenant, storage, retention, accounting, or spend-safety blocker remains |
| 2 | Artifact pipeline | Pathway 2 plus the CLI/Cloud portion of Pathway 4 | Upload, containment, crop grounding, pricing calibration, and upload tests are green |
| 3 | Hosted report | Pathway 3 plus report-facing CI links from Pathway 4 | Images, findings, history, sharing, tenant, and XSS gates are green |
| 4 | Trends and CI loop | Pathway 6 plus the remaining Pathway 4 wiring | Trend and CI gates are green; Cloud/provider failure keeps CI safe |
| 5 | Cloud infrastructure go-live | BuildV5 Phase J and deployment evidence | Real DB/storage, R2 suite, backups, and operational evidence are green |
| 6 | Auth, organizations, and dashboards | Pathway 5 | Session tenant, role, deletion, and customer-control-plane gates are green |
| 7 | Billing | Pathway 5 billing work | Paddle sandbox purchase/provision/exhaustion/recovery loop is green |
| 8 | Paid launch gates | Security, retention, legal, operations, and CLI Cloud-credit closure | Every launch checklist item is verified |
| 9 | Paid Cloud launch | First-customer runbook | Enable paid access for qualified waitlist users |

Pathways 7–10 are post-launch horizons. They must not start until Phase 9 and
must each retain their own acceptance gate. This mapping keeps CI work in the
product-building phases, trends before infrastructure go-live, and auth/billing
after the real Cloud surface exists.

“Code exists” is not completion. Each pathway has four states:

| State | Meaning |
|---|---|
| Planned | Design and files are identified; no implementation claim |
| Implemented | Code is present, but the full gate has not passed |
| Verified | Required tests, failure paths, security checks, and evidence passed |
| Blocked | A required test/account/provider/evidence step cannot pass; downstream work stops |

The only state that permits downstream work is **Verified**. A skipped test,
fixture-only result where a real integration is required, or undocumented
manual check is not a pass.

### Security and abuse-resistance baseline

Normascope cannot promise that attacks will never happen. It must instead use
defense in depth so that untrusted input is contained, credentials and tenant
data are isolated, spend is bounded, and an incident can be detected,
contained, investigated, and recovered from.

#### Trust boundaries

Treat all of the following as untrusted data, never as instructions or code:

- screenshots, OCR, DOM text, uploaded HTML, CSS, and design exports;
- repository names, branches, commits, routes, form fields, and PR text;
- agent/tool requests and user-provided URLs;
- model/provider output, cached findings, and shared-report content.

The system must keep these boundaries explicit:

    browser / CLI / Action / agent
    → authenticated API boundary
    → organization-scoped service
    → storage and database
    → provider adapter

No browser, uploaded artifact, agent, or model response may directly execute
code, access the database, mint credentials, call an arbitrary internal URL,
or choose a provider/budget decision.

#### Required controls

1. **Identity and tenant isolation**
   - Require authentication and authorization on every Cloud route.
   - Scope every read, write, cache key, object key, job, and event by
     organization ID and verify ownership server-side.
   - Use least-privilege roles, short-lived sessions where possible, hashed
     API keys, immediate revocation, rotation, and no secrets in logs.
   - Run automated cross-tenant probes for reports, artifacts, cache hits,
     exports, events, deletion, and shared links.

2. **Prompt and content injection**
   - Delimit captured content as untrusted data in provider prompts.
   - Never obey instructions found in screenshots, DOM, HTML, code, PRs, or
     model output.
   - Schema-validate and length-limit model output; reject unexpected fields,
     links, markup, tool calls, or executable content.
   - Render findings as inert escaped text. AI must never auto-apply a fix,
     change a score, decide pass/fail, or execute a command.
   - Keep injection-suspected findings visible as warnings and test them with
     screenshots and HTML containing hostile instructions.

3. **XSS and uploaded artifact containment**
   - Escape user, repository, PR, finding, and provider text at every render.
   - Treat uploaded HTML as hostile; serve it only in a sandboxed origin or
     iframe with a restrictive CSP and no access to app cookies or APIs.
   - Block inline scripts, dangerous URLs, active content, and unsafe HTML
     attributes. Add stored-XSS probes to report, share-link, PR, and export
     tests.

4. **SSRF and capture safety**
   - Restrict capture targets to configured origins or explicit allowlists.
   - Block localhost, private/link-local ranges, cloud metadata addresses,
     unsafe schemes, unexpected ports, and DNS rebinding across redirects.
   - Re-check resolved addresses on every hop; enforce timeouts, response-size
     limits, redirect limits, and separate capture network credentials.
   - Add hostile URL, redirect, IPv6, encoded-address, and metadata-endpoint
     tests.

5. **Abuse, credential, and cost controls**
   - Apply IP, user, organization, repository, agent-key, endpoint, upload,
     and concurrency limits before expensive work.
   - Reserve customer credits and provider dollars before provider calls;
     expire, settle, or release reservations exactly once.
   - Enforce file-size, image-dimension, DOM-size, prompt-size, batch-size,
     retention, and storage quotas.
   - Add breakers and operator kill switches for uploads, captures, AI,
     sharing, and authentication abuse while keeping local comparison safe.

6. **Webhooks, sessions, and browser security**
   - Verify webhook signatures over the raw body, reject replays, and make
     provisioning/refunds idempotent.
   - Use secure, HttpOnly, SameSite cookies where sessions are cookie-based;
     protect state-changing routes against CSRF and fix a strict origin policy.
   - Set CSP, frame-ancestors, HSTS, X-Content-Type-Options, Referrer-Policy,
     and appropriate permissions headers.

7. **Operations and recovery**
   - Keep redacted structured audit logs for authentication, admin actions,
     key changes, uploads, shares, deletes, provider calls, budget trips, and
     anomaly decisions.
   - Alert on login/key abuse, cross-tenant probe failures, unusual upload or
     spend volume, provider failures, queue growth, storage growth, and data
     deletion failures.
   - Maintain encrypted backups, tested restores, retention sweeps, deletion
     evidence, incident runbooks, credential rotation, and a human-controlled
     emergency shutdown path.

#### Security release gate

No paid Cloud launch is verified until the relevant pathways have evidence for:

- [x] dependency and secret scanning in CI — `.github/workflows/ci.yml`, added
  2026-08-12. Dependency findings are gated by `scripts/audit-check.mjs`, which
  fails on anything new, stale, or past its review date rather than on a fixed
  threshold. Three high-severity advisories are recorded and **unconfirmed**;
  see `FinishedSPEC.md` §9;
- [ ] tenant-isolation and authorization probes;
- [ ] stored-XSS and sandbox/CSP probes — **the CSP half is probed against the
  live deployment**, not only against the config: `scripts/golive-check.mjs`
  (2026-08-21) checks the served headers, that `/r/` carries a nonce, that the
  nonce differs between two requests, and that the strict policy does not also
  allow inline scripts. Stored XSS is still unprobed;
- [ ] prompt-injection and hostile-content suites;
- [ ] SSRF, redirect, DNS-rebinding, and capture containment suites;
- [ ] rate-limit, quota, concurrency, replay, and abuse tests — **the storage
  half is now proven against a real S3 API rather than a local stub** (2026-08-21):
  an upload exceeding the pinned `Content-Length`, an unsigned read, an expired
  URL, and the upload protocol's own size and hash verification. CI runs them on
  every push against MinIO; they have been run once against R2. `FinishedSPEC.md` §3y;
- [ ] webhook signature, session, CSRF, and key-revocation tests — **the session
  and CSRF halves landed 2026-08-21** (`FinishedSPEC.md` §3aa): server-side
  sessions with rotation, idle and absolute expiry, per-device and global
  revocation, membership removal taking effect on the next request, OAuth state
  bound to the initiating browser, same-origin checks on every state-changing
  route, and the outbound-email ceilings proven across 20 processes with a
  naive counter-test beside them. Webhook signature and key revocation are
  unchanged;
- [ ] backup restore, retention, deletion, and incident-drill evidence —
  **three of four.** Retention and deletion are proven (`FinishedSPEC.md` §3j),
  and a real backup was restored and compared table by table on 2026-08-14
  (§3k). **No incident drill has been run**, and backups are not yet scheduled
  against the production database;
- [ ] redacted audit logs and working operator alerts/kill switches —
  **alerts, plus the authentication half of the audit log (2026-08-21).**
  `auth_events` records every sign-in, refusal and failure with keyed hashes
  rather than addresses or IPs, keyed per purpose so two leaked tables cannot be
  joined; the email budget is a kill switch an operator can set to zero. The
  rest below stands: Spend and operational alerts reach a configured webhook or
  mailbox, and an alert claimed but never delivered is itself an alert (§3k).
  The breaker is the one kill switch that exists; the scoped pauses and the
  redacted audit log are Phase 6 work;
- [ ] an external security review or penetration test before scaling beyond
  the first controlled customers.

Any untested security boundary is an open risk, not a claim of safety.

### Mandatory economic loss firewall

No provider-backed feature may proceed to customer launch unless it preserves
all of these invariants:

- no unbounded provider spend;
- no negative credit balance;
- no duplicate charge or refund;
- no provider call for an unknown/unpriced model;
- no upload/storage cost without entitlement and quota approval;
- no CI or agent loop that can spend beyond its configured cap;
- no pack sold below its measured hard-cost floor;
- no financial report that mixes subscription, pack, goodwill, and provider
  costs without identifying the funding source.

The economic request path must be:

    active subscription
    → valid key/session
    → plan entitlement
    → rate limit and concurrency limit
    → result-cache lookup
    → per-run cap
    → agent/key budget
    → organization budget
    → global provider-budget reservation
    → credit reservation
    → provider request
    → idempotent usage settlement

If any pre-provider check fails, no provider call is allowed. The current
average blended COGS is not a hard safety limit. Every model/payload combination
must have a bounded maximum cost derived from input tokens, output tokens,
images, cache pricing, and batch/interactive pricing.

The release gate must prove:

1. provider dollars are reserved before the provider call;
2. actual usage settles that reservation and releases the unused amount;
3. provider failure releases the reservation and refunds credits exactly once;
4. concurrent requests cannot overshoot global or organization budgets;
5. concurrent batch collectors cannot double-charge or double-refund;
6. subscription, pack, goodwill, payment-fee, refund, and provider-cost
   accounting reconcile separately;
7. a breaker trip pauses explain while reports, diffs, and CI remain safe;
8. 50%, 75%, 90%, and 100% budget alerts reach an operator, with manual reset
   for a tripped breaker.

These are loss-prevention requirements, not future enhancements.

### Customer credits are not provider tokens

The product must keep two ledgers separate:

1. **Customer entitlement ledger:** monthly plan credits and purchased packs
   that the organization is allowed to spend.
2. **Provider billing ledger:** the actual dollars charged to NormaScope's
   Anthropic/AI-provider account after a request runs.

A customer purchase does not and should not trigger a real-time purchase of
provider tokens. NormaScope maintains its provider account with an approved
payment method, prepaid balance, or provider billing limit. Customer money
first becomes an internal entitlement only after the payment processor's
verified webhook. Provider cost is incurred later, when an AI request is
actually admitted and executed.

The required lifecycle is:

    customer checkout
    → verified payment webhook
    → grant monthly allowance or pack credits exactly once
    → customer explicitly requests hosted AI
    → reserve customer credits
    → reserve maximum provider-dollar cost
    → call provider using NormaScope's provider account
    → settle actual usage and release unused provider reservation
    → finalize the customer ledger

For a failed provider call, refusal, timeout, schema failure, or worker retry,
release the provider reservation and refund the customer reservation exactly
once. If the payment webhook has not been verified, do not grant credits. If
the provider account balance, daily budget, or payment status is unsafe, reject
the AI request even when the customer still has credits; never use an uncapped
internal account as a fallback.

Customer-facing copy must say that credits are a NormaScope usage allowance,
not tokens purchased directly from an AI provider. The product must not imply
that a top-up reserves capacity with Anthropic or guarantees provider
availability.

#### Payment failure safe state

Payment failure must fail closed for new entitlement while preserving customer
data and avoiding surprise deletion. Paddle webhook events are the source of
truth for subscription state, and every event must be signature-verified,
deduplicated, replay-safe, and applied idempotently. A delayed or missing
webhook must not grant credits, but it must also not immediately destroy an
organization's history.

Use explicit states rather than a boolean `paid` flag:

| State | Customer experience |
|---|---|
| `active` | Hosted product and entitled AI available within credits and quotas |
| `past_due` / grace | Clear payment-update notice; existing reports, history, and share links remain available; no new monthly allowance; new paid work follows the configured grace policy and hard budget checks |
| `lapsed` | Existing reports/history remain read-only; new uploads, hosted AI, and new paid work are rejected politely; no provider call is made |
| `refunded` / `chargeback` | Entitlement is revoked at the processor-confirmed effective time; data is retained read-only subject to retention and deletion policy |
| `deleted` | Data and storage are removed according to the verified deletion workflow |

The safe payment-failure behavior is:

1. On a failed charge, mark the organization `past_due`, alert the admin, and
   provide a secure payment-management path.
2. During the documented grace period, never grant a new allowance or permit
   spending beyond already-authorized credits and budgets.
3. After grace, transition to `lapsed`; keep local CLI use, existing hosted
   history, and existing share links available where policy allows.
4. Never delete reports, artifacts, users, repositories, or audit history just
   because a payment failed.
5. On renewal, restore entitlement and grant the next allowance exactly once;
   do not retroactively grant missed allowances unless policy explicitly says
   so.
6. On duplicate, late, out-of-order, refund, or chargeback events, preserve a
   complete ledger and make the final entitlement state deterministic.
7. If Paddle or the webhook route is unavailable, pause entitlement changes
   and alert an operator; do not fall back to manual “looks paid” flags.

Payment failure tests must cover declined cards, expired cards, retries,
webhook delay, duplicate events, out-of-order events, renewal after lapse,
refunds, chargebacks, cancellation, grace-period expiry, and concurrent
requests at the entitlement boundary. The organization must never receive
credits without a verified payment event, incur provider cost after entitlement
has been revoked, or lose data solely because payment failed.

#### Registration-to-deletion lifecycle

The launch flow is payment-first for a solo customer:

```text
visitor
  → Get Cloud
  → Paddle checkout
  → signed, verified webhook
  → org + plan + credits + pending owner claim
  → GitHub or magic-link authentication
  → user + identity + owner membership
  → authenticated Cloud access
```

Rules for each state:

- An abandoned checkout creates no usable Cloud account, no active tenant and
  no entitlement. Any pending owner claim is expiring state, not access.
- A payment webhook is the only launch path that provisions a paid solo
  organization. Retries are idempotent by processor event/customer/subscription
  reference and cannot create duplicate orgs, claims or grants.
- The checkout email is not itself authentication. It becomes the claim target;
  the buyer must prove control through a magic link or a GitHub account with a
  matching verified email.
- A buyer whose GitHub email differs from the checkout email must use the
  checkout email or an audited recovery path. Do not silently attach the
  subscription based on a browser-supplied address.
- An invited employee does not pay and does not create a second subscription.
  An admin invitation leads to GitHub/email authentication and membership in
  the paying organization.
- A person may have an individual account with no organization only as a
  limited identity/security surface. It cannot browse, upload, spend, create a
  free Cloud tenant or receive customer data.
- A free CLI user can use local Normascope without a Cloud account. The free
  CLI must not be forced through Cloud registration.

The normal cancellation path ends access at the paid-period boundary. A failed
renewal enters `past_due` for the documented **14-day grace period**. During
grace, existing hosted data and shares remain available, no new monthly
allowance is granted, and new work follows the configured grace policy. After
grace, `lapsed` is read-only: reports/history remain available, while uploads,
hosted AI and new paid work stop. Renewal restores the organization and the
next allowance exactly once. Refunds and chargebacks use their processor-
confirmed effective times.

#### Retention deadline after lapse

The launch policy is:

```text
paid period → 14-day grace → lapsed read-only → 90-day deletion deadline
```

The 90-day deadline begins at the organization’s transition to `lapsed`, not
at the creation time of each run. Implement this with an explicit lifecycle
deadline such as `orgs.retention_expires_at` or an equivalent authoritative
deletion record. Do not infer the customer promise from a generic age-based
sweep.

The deadline is paused or overridden only by a documented legal hold,
accounting obligation or active renewal. The operator console must show the
reason, actor, deadline, hold/override state and next deletion action. The
customer console must show the lapsed state, deletion date, renewal action and
export action clearly.

Before the deadline, renewal must cancel the scheduled deletion safely and
restore the organization without duplicating credits or resurrecting revoked
keys. After the deadline, the deletion job removes organization rows, storage,
artifacts, sessions, memberships and keys according to the verified deletion
workflow. Keep only the minimum anonymized/accounting evidence required by the
documented legal policy.

#### Export before deletion

Owners/admins can request an export while the organization is active, past due
or lapsed, until deletion begins. Export is a bounded asynchronous job:

- the requester must have the role and recent authentication;
- the job records scope, requested time, requester, state, counts, bytes and
  errors;
- the result contains repositories, runs, commits, frames, trends, report
  metadata, findings, usage events, credit ledger records, retained artifacts,
  share metadata and a manifest of omitted/expired data;
- API keys, session cookies/tokens, magic-link tokens, OAuth secrets, provider
  credentials and internal operator data are never exported;
- large artifacts are delivered through short-lived authorized downloads rather
  than an unbounded request or permanent public URL;
- the download expires and the receipt records creation, expiry and requester;
- export requests and downloads are audited and organization-scoped;
- export failures are retryable and visible, not silently reported as complete.

The organization deletion confirmation must show the export option and explain
what will and will not be included before requiring:

```text
recent authentication
  → typed organization name
  → export offered
  → irreversible confirmation
  → immediate key/session revocation
  → retry-safe deletion job
  → completion receipt
```

Personal account deletion is a separate action. It deletes the user's
identities, sessions, invitations and preferences, but never deletes an
organization the user does not own. An owner must transfer ownership or delete
the organization first. A deleted organization does not delete unrelated
members' personal accounts or their memberships elsewhere.

Lifecycle acceptance tests must cover abandoned checkout cleanup, webhook
replay, owner claim races, invited employees, cancellation at period end,
failed-renewal grace, lapse deadline, renewal before deletion, export contents
and exclusions, export expiry, deletion retry, legal hold, personal deletion,
owner transfer and cross-tenant export refusal.

### Provider-agnostic hard-cost management

Anthropic is an implementation choice, not a customer-facing product
commitment. NormaScope may move hosted AI work to another provider when the
measured economics, quality, privacy posture, latency, or reliability make
that decision sensible. This is provider substitution, not an automatic
customer-visible fallback.

The customer sees a stable NormaScope AI capability and credit price. The
server records the actual provider and model internally for cost, debugging,
audit, and reconciliation. Do not expose provider-specific model names,
provider keys, or raw provider errors in the customer workflow.

The provider boundary must use a common internal contract:

    NormaScope operation
    → routing policy
    → provider/model adapter
    → normalized usage and findings

Each adapter must declare:

- model and provider identity;
- input, output, image, and cache prices;
- maximum permitted payload;
- maximum cost for each operation class;
- quality and schema requirements;
- privacy/retention and region metadata;
- rate limits and availability status.

The measured blended cost in calibration.md is a pricing and forecasting
figure. It is not the authorization limit. Every provider/model/operation
combination needs a hard maximum derived from the actual payload caps. The
admission check must use:

    maximum input cost
    + maximum output cost
    + maximum image/crop cost
    + cache and batch factors
    = hard maximum provider cost

The hard maximum must be below the revenue floor of the credits consumed. If
it is not, reduce the payload, change the model, or charge more credits before
launch. Never preserve a friendly credit price while knowingly accepting a
hard-cost loss.

#### Budget layers

The system must enforce all of these layers independently:

1. request maximum cost;
2. user/API-key daily and monthly budget;
3. organization billing-period budget;
4. provider-specific daily budget;
5. global NormaScope all-provider daily and monthly budget;
6. concurrency and in-flight reservation limit.

The global budget must include all providers. Spending 100 dollars at one
provider and then 50 dollars at another must still count as 150 dollars
against NormaScope's aggregate limit.

No provider call may start until both the customer-credit reservation and the
selected provider/global-dollar reservation succeed. Reservations must expire,
be settled against actual usage, or be released exactly once.

#### Provider selection and planned substitution

Provider selection is a server-side policy decision. Before replacing a
provider:

1. run identical calibration fixtures against the candidate;
2. compare cost per successful result, not cost per attempted call;
3. compare quality, schema-valid response rate, latency, refusal rate, image
   support, privacy terms, retention, region, and rate limits;
4. verify the candidate's hard maximum fits the credit margin floor;
5. run a small internal canary or shadow evaluation;
6. record the routing-policy version;
7. cut over centrally with rollback available;
8. reconcile the new provider's usage separately from the old provider.

This is not a request-time fallback requirement. A provider change is a
controlled release. During the cutover window, the old provider may remain
available for rollback, but the global budget still applies to both.

#### External provider account controls

Maintain a separate production account/workspace and key for each provider.
Development and human experimentation must not share production credentials.
Provider auto-reload, if enabled, must be bounded by a small reload amount,
operator alerts, and an application-level breaker. Auto-reload is an
availability mechanism, not a NormaScope loss guarantee. A manual-funding mode
is acceptable at launch if the provider balance reaching zero safely pauses AI.

Alert at 50%, 75%, 90%, and 100% of each provider budget and the aggregate
NormaScope budget. A 100% trip must stop new provider calls, including calls
that would use customer credits. Reports, diffs, history, and other non-AI
features must remain available.

#### Required economic tests

Before provider substitution or a new provider launch, test:

- largest allowed standard, deep, image, and batch payloads;
- concurrent reservations across two providers;
- global cap enforcement when provider-specific caps have room;
- provider timeout after admission;
- duplicate worker retry and duplicate settlement;
- provider rejection, rate limit, and zero-balance response;
- auto-reload failure and manual breaker trip;
- candidate-provider calibration and margin-floor assertion;
- reconciliation by provider, model, plan allowance, pack, refund, and
  goodwill grant.

#### Launch operating policy

At launch, use a dedicated production provider account and production key.
Never use a founder's personal key, share the production key with customers,
use the production key for development, or permit an agent to call a provider
directly. All provider calls must pass through the NormaScope server budget
and credit ledger.

The safest initial funding policy is:

1. preload only a small provider balance;
2. disable automatic reload while traffic and cost distributions are being
   measured;
3. alert at 50% of the provider balance and at every budget threshold;
4. pause hosted AI when the balance or application budget becomes unsafe;
5. manually approve additional provider funding.

Controlled auto-reload may be enabled later only with a small reload amount,
minimum-balance threshold, card/bank alerts, NormaScope daily and monthly
caps, and an emergency kill switch. Auto-reload must never be the only
spending control.

For planning only, if 100 organizations each receive 500 internal credits:

    100 organizations × 500 credits = 50,000 internal credits
    50,000 × $0.0164 measured list-price review cost ≈ $820

This is not an instruction to pre-purchase $820 from a provider. Track actual
daily usage, maintain a bounded operating float, and admit work only while
the provider-dollar reservations fit the application budgets. Internal
customer credits do not authorize unlimited concurrency.

#### Explicit emergency states

| State | Hosted AI behavior |
|---|---|
| Normal | Requests run within all caps |
| Budget warning | Requests run; operators receive alerts |
| Budget critical | New expensive/deep requests pause |
| Provider balance unsafe | All hosted AI pauses |
| Global breaker tripped | No provider calls |
| Organization credits exhausted | Only that organization's AI pauses |
| Provider outage | AI pauses; reports, diffs, and local comparison continue |

The user-facing response must be honest, for example:

    AI explanation unavailable: organization spending protection is active.
    Your reports and visual comparisons remain available.

Never silently fall back to an uncapped internal provider account.

At the end of every pathway, the implementation agent must:

1. stop editing the next pathway;
2. run the repository and pathway-specific tests;
3. run the relevant failure, security, tenant, accounting, and deletion tests;
4. record commands, results, and evidence in the task handoff;
5. update the pathway status to `Verified` or `Blocked`;
6. name the exact next pathway and remaining risks.

If a gate fails, fix the current pathway before adding new dependent behavior.
Do not hide a failure by weakening an assertion, increasing a timeout, changing
the expected economics, or marking a test informational.

### Gate ledger

Maintain this ledger in the implementation task or release notes. The checked
state is the source for deciding whether work may advance:

| Pathway | Required state before next pathway | Minimum evidence |
|---|---|---|
| 1. Substrate | Verified | build, migration race, accounting, limiter, storage deletion |
| 2. Artifacts | Verified | CLI upload, entitlement, quota, hash/size, cleanup, secret scan |
| 3. Hosted report | Verified | images, fallback, history, share, tenant, XSS |
| 4. CI explanations | Verified | Action loop, batch/refund, bounded credits, outage/green CI |
| 5. Auth/control plane | Verified | sessions, roles, billing provisioning, deletion, tenant probes |
| 6. Trends/quality debt | Verified | pagination, first-drift agreement, gaps, org isolation |
| 7. Contracts | Verified | versioning, exceptions, evidence trace, deletion |
| 8. Journeys | Verified | bounded capture, SSRF/security, deterministic evidence |
| 9. Verified repair | Verified | isolated patch, collateral check, human PR, outcome metrics |
| 10. Enterprise | Verified per capability | provider/residency/audit/retention-specific evidence |

For external dependencies, record `Blocked` rather than `Verified` when the
required account, deployment, provider, storage service, or production-like
test cannot be exercised. Local fixtures may prove logic, but they cannot prove
real R2, Paddle, OAuth, provider retention, or production deployment behavior.

### Pathway 0 — Preserve the source of truth

**Goal:** keep strategy and execution separate.

1. Keep `FUTURENORMA.md` authoritative.
2. Use this document for implementation order and acceptance criteria.
3. Update `FinishedSPEC.md` when code state changes.
4. Mark work `planned`, `in progress`, `verified`, or `blocked`.
5. Keep measured economics in `calibration.md`.

**Gate:** readers can distinguish shipped, planned, and blocked work.

### Public website demand test — waitlist traction

The public Normascope website launches before Normascope Cloud is ready to
charge. Its purpose at this stage is to explain the free CLI, make the Cloud
direction legible, and measure whether people want the hosted product. This is
the first public release; it is separate from the later paid Cloud launch.

This is a demand test, not a Cloud product launch. Do not wait for the full
Cloud launch checklist in §7 before publishing the public site; that checklist
governs charging customers for Cloud.

#### What the waitlist action does

Every persistent waitlist action points to `/cloud#waitlist`. The label is
**Join early access** in the home strip, on `/cloud` and in the footer, and
**join waitlist** in the site header as of 2026-08-13 — same anchor, same
endpoint, same row. What this gate turns on is the destination, not the wording.

1. The visitor lands on the public Cloud page and is taken to the waitlist
   form.
2. They submit an email address.
3. `POST /api/waitlist` validates and normalises the address.
4. Postgres stores one unique row in `waitlist`, including the signup source,
   referrer origin, and timestamp.
5. A repeat submission is deduplicated and does not inflate the count.
6. The visitor sees a confirmation: “You’re on the list.”
7. A genuinely new signup sends one branded confirmation **to the person who
   joined**; mail failure must not lose the stored signup.

Clicking the action does not create an account, start a subscription, grant
Cloud access, or imply that Cloud is available today.

#### Minimum traction mechanism

The waitlist database is the source of truth. Email notifications are useful
for immediate awareness but are not a measurement system by themselves. Add a
private, admin-only view or export with:

- total unique signups;
- signups today, this week, and this month;
- new signups over time;
- source breakdown: home, Cloud page, header, footer, and other placements;
- referrer breakdown;
- email, signup date, source, and referrer for each row;
- CSV export for follow-up and analysis.

The first version may be a protected admin command or report backed by:

```sql
SELECT COUNT(*) FROM waitlist;

SELECT email, source, referrer, created_at
FROM waitlist
ORDER BY created_at DESC;
```

Do not expose the count, email list, or export through a public endpoint. Keep
the waitlist behind admin authentication and preserve the existing privacy
rules: no email addresses in URLs, query strings, or logs.

#### Public-site demand gate

Before publishing `normascope.com`, verify:

- [x] every waitlist action lands on `/cloud#waitlist` — verified on the **live
  site** 2026-08-13, including the `#waitlist` anchor existing on `/cloud`. The
  header's action was relabelled to "join waitlist" later the same day; the
  anchor did not change;
- [x] a new address round-trips into Postgres and produces the visitor
  confirmation — verified 2026-08-13 against the **real production Neon
  database** over HTTP, with the row read back from a separate process;
  see FinishedSPEC.md §4f;
- [x] duplicate addresses remain one row — same address in different case
  added no row, verified 2026-08-13;
- [x] source, referrer origin, and timestamp are recorded — verified
  2026-08-13, including the referrer query string being stripped;
- [ ] ~~owner notification is configured and best-effort~~ — **removed
  2026-08-13.** `notify()` is gone; the route now mails the person who signed
  up instead. Nothing pushes a signup to the operator any more.

  This was a checked item and it is no longer true, so it is unchecked rather
  than deleted. The signup itself is not at risk — the row is committed before
  any mail is attempted, and `/admin/waitlist` still shows the count, the rows
  and the CSV. What is lost is *push*: nobody finds out a signup happened
  unless they go and look. During a demand test, where the whole point is
  noticing traction early, that is worth a deliberate decision rather than a
  silent one. Either accept it and check `/admin/waitlist` on a cadence, or
  restore a second best-effort send to the owner alongside the confirmation;

- [x] the visitor confirmation renders and points at real assets — 14 checks in
  `test/waitlistConfirmationEmail.test.mjs`, covering both linked images
  existing in `web/public`, no third-party hosts, `NEXT_PUBLIC_SITE_URL` being
  honoured so a preview cannot mail production links, balanced table markup,
  HTML/text parity, and the Yutic endorsement appearing exactly once. Three of
  those were watched failing before being trusted (Doctrine, "a guard you have
  not watched fail is not a guard"). **Deliverability is not covered** — that a
  real inbox accepts it, and does not file it as spam, is still unverified;
- [x] an admin-only count, list, and CSV export are available — `/admin/waitlist`,
  gated by `ADMIN_PASSWORD` (separate from the pitch phrase), verified
  2026-08-10; see FinishedSPEC.md §4a;
- [x] the Cloud page describes private preview / future capabilities honestly —
  "Get first access when hosted reports open"; no availability claim, no price;
- [x] the site does not claim that visitors can log in, upload, subscribe, or
  use Cloud yet — checked across the public tree 2026-08-13; the only "sign in"
  strings are in the user guide, describing the *visitor's own* application;
- [x] the footer identifies Normascope as a product by Yutic;
- [x] legal-facing copy states that Normascope is operated by Yutic, a sole
  proprietorship of Harsha Attray — **added 2026-08-13.** The line existed on
  `/pitch` only; the public footer, which is the surface the public actually
  sees, did not carry it. Verified live;
- [ ] the future Paddle seller/payment identity is documented and consistent
  with the proprietor information before billing is enabled.

> **Closed 2026-08-13 — the deployed path is now the one that was tested.** The
> earlier ticks were proven against the real production database but from
> localhost, so the deployed path was unproven. `normascope.com` is live on
> Vercel and a signup was round-tripped through it. That deployment immediately
> found what localhost could not: `migrate()` read `migrations/*.sql` from a
> path computed at runtime, which resolves differently inside a function
> bundle, so the **first database request on the live site failed with
> `ENOENT`** while every local build and all 400+ checks stayed green. See
> `FinishedSPEC.md` §4g.

Once live, measure interest using unique signups and signup rate by source,
not raw form submissions. Review the signal weekly before changing Cloud
priorities or pricing doctrine. The waitlist can justify advancing the next
Cloud pathway; it does not by itself prove willingness to pay.

**Signup rate became computable on 2026-08-16.** Until then only the numerator
existed — `/admin/waitlist` counts signups, and nothing counted visits, so the
rate asked for above could not be worked out. Vercel Web Analytics now runs on
the public pages and supplies the denominator. It is mounted in the public
site layout only, so `/pitch`, `/admin` and `/r/{runId}` stay unmeasured. It
sets no cookies and stores nothing on the visitor's device;
`docs/legal/COOKIE-NOTICE.md` and `docs/legal/PRIVACY.md` describe it, and
`test/siteAnalytics.test.mjs` fails if a tracker is added without updating
them.

Two limits on what this can be claimed to show. Visitors are counted by a hash
that is recomputed daily, so a returning visitor counts twice — the figure is
visits, not people. And nothing links a page view to a signup row, so "signup
rate" here means signups over visits for a period, not a tracked conversion
per visitor. Both are deliberate, and both mean the number stays directional
under the rule below.

**Search visibility — the demand test has no traffic to measure yet.** Checked
2026-08-16: `normascope.com` is not in Google's index at all. That is not a
technical fault. Titles, descriptions, canonicals, `robots.txt`, `sitemap.xml`,
the social card and `SoftwareApplication` JSON-LD were all already correct; the
domain was three days old with no inbound links and nobody had told Google it
exists. On-page work was tightened anyway (see `FinishedSPEC.md` §4j and
`normascopeWeb.md` §12), and the sitemap now discovers routes from the
filesystem rather than the navigation menu, which was silently dropping pages
in both directions.

**The blocking step is not code and is not done.** Verifying the domain in
Google Search Console and Bing Webmaster Tools, and submitting the sitemap
there, requires Harsha's accounts. Until that happens the analytics above will
measure a site almost nobody can find, and any read of "demand" from the
waitlist is a read of direct and referral traffic only. Do not treat a low
signup count as evidence about the product before this is done — it is
currently evidence about distribution.

The first inbound links are the other free lever: the npm package page and the
GitHub repository already carry some authority with Google and neither links to
`normascope.com` today.

### Paid-launch website and waitlist cutover

The public site has two deliberately different states. Do not implement the
paid-launch state early by making the waitlist pretend to be authentication.

#### State A — current demand test

The current site explains both products, with the free/local CLI as the proof
and Cloud as the future hosted product. The Cloud CTA writes a waitlist row.
The waitlist does not create an account, organization, session, subscription
or access entitlement.

#### State B — paid Cloud launch

At the launch cutover:

- the homepage hero, primary navigation, metadata and dominant CTA make Cloud
  the product being sold;
- the free/local Normascope CLI moves to a clearly labeled secondary area,
  with installation, CLI documentation and local-first messaging still easy to
  find;
- `Log in` is available wherever Cloud access is relevant;
- `Get Cloud` / `Start Cloud` leads to the paid checkout and owner-claim flow;
- `Register` leads to an allowed Cloud path—paid owner claim or invitation—not
  an unrestricted free Cloud tenant;
- all old waitlist CTAs are removed from navigation, footer, metadata and
  transactional copy;
- the Cloud page explains the subscription, shared organization model, credits,
  retention, hosted data flow, AI limitations and the free CLI boundary;
- old pre-launch URLs receive intentional redirects or an explicit retired
  state, with no accidental indexing of the old waitlist funnel.

The free CLI remains free forever and remains complete. The positioning changes,
not the CLI contract: local `check`, `compare`, reports, the Action and the
free/local workflows cannot be weakened to force a Cloud account.

#### Cutover runbook

Run the transition as one versioned release:

1. Record a cutover timestamp and freeze the current waitlist export.
2. Verify Cloud checkout, webhook provisioning, owner claim, GitHub OAuth,
   magic links, invitations, organization switching and logout before changing
   the public CTA.
3. Deploy the Cloud-first copy and login/register navigation.
4. Disable new waitlist writes or return a clear retired message; do not leave
   an apparently successful form that nobody monitors.
5. Send one launch notification to qualified waitlist addresses using a
   bounded, auditable batch. Deduplicate by the existing normalized address;
   do not send repeated launch mail on deployment retries.
6. Route failures to `help@normascope.com` and record delivery failures without
   exposing the waitlist export publicly.
7. Verify redirects, canonical URLs, sitemap, robots rules, analytics events,
   both themes, mobile layout, accessibility, CSP and the free CLI path.
8. Preserve the waitlist for its declared retention period, then delete or
   anonymize it. A waitlist record is not an account and must not be treated as
   consent for unrelated marketing.

#### Public contact routing

The launch site and legal pages use these addresses consistently:

| Address | Route questions here | Must not do |
|---|---|---|
| `help@normascope.com` | Login, invitations, Cloud usage, account and product support | Ask customers to email passwords, magic-link tokens or API keys |
| `queries@normascope.com` | General questions, privacy requests and non-sales correspondence | Become the hidden support or billing system |
| `business@normascope.com` | Sales, partnerships, procurement and commercial requests | Grant customer-data or operator-console access |

Use `auth@normascope.com` for transactional login/invitation mail and
`alerts@normascope.com` for operational alerts. Those senders must not be
presented as public support addresses. Configure and test SPF, DKIM, DMARC,
reply handling, bounce handling and monitored ownership before launch.

The old `waitlist@normascope.com` address may forward during a short transition
window. It must be removed from primary copy, legal contact sections and error
pages when the waitlist is retired. Contact changes require updating the site,
generated legal artifacts, email templates, support runbook and privacy/data
flow documentation together.

### Preview, production demo and customer environment contract

Do not use one shared production test account to cover deployment QA, product
demos and customer operation. Build three explicit environment paths.

#### Preview/staging environment

Preview is for code and deployment verification. It must use:

- a separate preview database and storage bucket/prefix;
- preview-only OAuth client IDs, webhook endpoints, API keys and session secrets;
- preview-only email sender or a sink/test mailbox, never customer-facing auth
  mail by accident;
- billing disabled or connected only to a provider sandbox;
- synthetic seed data and disposable users;
- preview environment variables on every Vercel preview deployment;
- no production customer rows, storage objects, API keys, session cookies or
  provider credentials.

Vercel may create a new immutable deployment URL for every build. Configure a
stable alias, recommended as `preview.normascope.com`, to the current preview
deployment or dedicated staging branch. The alias must not be mistaken for a
production environment: its deployment target, database, storage, email and
OAuth configuration remain preview-only. Test the alias after every deployment
and verify that its `NEXT_PUBLIC_SITE_URL`, OAuth redirect URI and email links
use the alias rather than a stale deployment URL.

#### Production demo tenant

External demos use a dedicated synthetic organization in production only when a
real Cloud console is needed. Seed it as a named tenant, for example:

```text
DEMO — Normascope Cloud
├── synthetic repositories and runs
├── demo viewer/designer account
└── separate demo-admin account, only when needed
```

Required boundaries:

- demo data is synthetic, approved public material, or explicitly consented
  material; never copy customer screenshots, source, prompts, emails or AI
  responses into it;
- the demo organization has no cross-tenant path, customer membership or
  customer API key;
- a demo viewer can read only the intended demo reports and trends;
- demo admin is a separate least-privilege identity and cannot reach the
  operator console, billing controls, raw storage or customer organizations;
- never distribute a shared owner password, API key, browser cookie or reusable
  magic-link URL;
- disable uploads and hosted AI by default; if a demo needs them, apply a small
  explicit budget, rate limit, storage quota and alert;
- disable or hide destructive actions, payment actions, exports and support
  actions unless they are being demonstrated in a safe sandboxed path;
- mark the organization and every demo account as demo data in the UI;
- exclude the tenant from customer revenue, retention, usage, COGS and product
  adoption metrics, or label it explicitly as non-customer data;
- support a deterministic reset from a versioned seed snapshot, with an audit
  event and no impact on any other organization;
- include demo users, sessions, keys and storage in the same revocation,
  deletion, backup and access-review procedures as customer data.

For a simple marketing walkthrough, prefer a sanitized single-run share link.
Use an authenticated demo account only when someone needs the organization
console. If a demo account must be temporary, give it an expiry and revoke it
after the session or event. If it is persistent, review it on a fixed cadence.

#### Customer production boundary

Customer production contains only real customer organizations and their data.
Do not seed fixtures, run destructive tests, reuse demo credentials, or test
new migrations against customer rows. A support or operator action against a
customer organization must use the separate audited operator console and
break-glass rules; it must never be disguised as a test account.

#### Environment and demo acceptance checks

- [ ] A preview deployment cannot read customer database rows or production
  storage objects, even if a preview URL or org ID is changed by hand.
- [ ] Preview OAuth callbacks reject production redirect URIs and production
  callbacks reject preview redirect URIs.
- [ ] Preview email requests never send customer-facing login or invitation
  mail without an explicit test configuration.
- [ ] The stable preview alias continues to point at the intended deployment
  after a new deployment and all generated links use the alias.
- [ ] A production demo user can access only the demo organization and intended
  role surface.
- [ ] Demo viewer, demo admin, operator and customer roles are tested directly
  against routes and APIs, not only through navigation.
- [ ] Demo AI, upload, email, storage and export budgets have hard server-side
  limits and alerts.
- [ ] Demo reset is idempotent, audited and cannot delete or mutate another
  organization.
- [ ] Demo tenants are excluded or clearly labeled in revenue, usage, COGS,
  retention and customer analytics.
- [ ] No shared production password, session token, API key or reusable magic
  link appears in documentation, screenshots, tickets, logs or chat.

#### Launch acceptance checks

- [ ] There is no visible waitlist CTA on the launch homepage, Cloud page,
  navigation, footer, legal pages, error pages or email templates.
- [ ] A visitor can distinguish Cloud purchase/login from free CLI installation
  in one screen and one navigation path.
- [ ] A new Cloud purchaser is provisioned exactly once and can claim ownership.
- [ ] An invited employee can register/login without accidentally creating a
  second organization or subscription.
- [ ] A free CLI user can continue using the CLI without Cloud registration.
- [ ] Waitlist rows are frozen, exportable, access-controlled and not silently
  converted into accounts.
- [ ] Launch notification sending is deduplicated, rate-limited, audited and
  paused safely on provider or global email-budget exhaustion.
- [ ] `help@`, `queries@` and `business@` are monitored by named owners and do
  not share credentials or customer-content permissions.
- [ ] Auth mail uses the dedicated transactional sender; support mail cannot
  accidentally issue login credentials.
- [ ] All public and legal copy uses the new product positioning and contact
  routing, with the paid Cloud terms and privacy disclosures live before
  checkout.

### Adoption measurement and product observability

The free CLI is currently local-first and does not identify its users. That is
good for the privacy promise, but it means we cannot answer basic questions
such as installs, active users, command adoption, failure rate, or retention.
Cloud must not repeat that gap once accounts and hosted runs exist.

#### Free CLI: opt-in only

Do not add silent or mandatory user tracking to the free tool. The default
installation must continue to work without an account, network access, or
telemetry. Add an explicit opt-in telemetry setting instead, for example:

```text
norma-scope config set telemetry opt-in
norma-scope config set telemetry off
```

With opt-in enabled, send only a minimal event envelope:

- a randomly generated installation identifier, not an email or machine ID;
- CLI version, operating system family, and coarse runtime information;
- command name and success/failure outcome;
- duration bucket and high-level failure category;
- whether the run was local, CI, or agent-driven.

Never send screenshots, DOM text, source code, URLs, repository names, file
paths, Git remotes, API keys, environment variables, prompts, AI responses, or
raw error contents. Explain exactly what leaves the machine, provide a visible
disable switch, and document retention and deletion. The CLI must remain fully
useful with telemetry disabled.

Until opt-in telemetry exists, use only aggregate signals such as npm download
counts, GitHub Action usage where available, website traffic, and the
waitlist. These are directional and must not be presented as unique-user
counts.

Website traffic is measured as of 2026-08-16 (see the demand gate above);
npm downloads and GitHub Action usage still are not. Website traffic counts
visits, not people, so it is subject to the same rule as the rest — it is a
direction, not a user count.

#### Normascope Cloud: authenticated and robust

Cloud should record an organization-scoped event ledger for every meaningful
product action, with user/key, organization, repository, run, frame, commit,
feature, outcome, timestamp, latency, and cost/credit fields where relevant.
Track at minimum:

- sign-in, invite, activation, first upload, first hosted report, and first
  resolved finding;
- runs, repositories, viewers, designers, agents, and repeat usage;
- command/upload/report/explain success and failure rates;
- provider failures, timeouts, breaker trips, quota exhaustion, duplicate
  jobs, reconciliation anomalies, and unusual spend;
- credits consumed, cache hits, refunds, storage, retention, cancellations,
  reactivation, and time to first verified fix.

Every event must be tenant-isolated, access-controlled, deletion-aware, and
safe to aggregate without exposing customer content. Provide organization
admins with usage, credits, failures, and anomaly views; provide operators
with a separate redacted health and cost view. Do not use raw screenshots,
DOM, source, prompts, or AI responses as analytics payloads.

#### Required control surfaces

"Dashboard" means two separate products with different permissions, not one
unrestricted master screen. These are two navigation shells within the same
Cloud application: the organization console for customers and the operator
console for us. They must be designed and tested as complete control planes,
not assembled as unrelated feature pages.

**Organization dashboard — customer-facing**

- users, roles, invitations, active sessions, and last activity;
- repositories, active-repository count, upload status, and storage quota;
- runs, frames, hosted reports, share links, and history usage;
- per-user, per-key, per-repository, and organization-wide credit usage;
- cache hits, explanations, automatic PR activity, failures, and skipped work;
- subscription state, payment status, next renewal, credits, packs, invoices,
  cancellation, and secure payment-management link;
- retention, deletion, API-key, notification, and automatic-explain controls;
- clear explanations when AI is paused, payment is past due, or a budget is
  exhausted.

**Operator console — internal, restricted**

- organization and subscription inventory;
- active users, activation funnel, retention, repository and run growth;
- payment/webhook state, refunds, chargebacks, failed renewals, and
  reconciliation discrepancies;
- provider spend, credits, cache rate, storage, latency, queue health, and
  contribution margin signals;
- failure and anomaly views grouped by customer, provider, deployment,
  endpoint, model, and time window;
- rate-limit, abuse, suspicious-login, upload-volume, and cross-tenant probe
  alerts;
- scoped controls to pause hosted AI, uploads, captures, sharing, a provider,
  an organization, or an agent key;
- audit trail for every operator action, with reason, actor, timestamp, and
  rollback or expiry where possible;
- incident mode, provider breaker state, backup/restore status, and deletion
  sweep status.

There must not be a single unsafe “turn everything off/on” button. Emergency
controls must be scoped, least-privilege, audited, reversible, and separated
from ordinary customer support. Operator access must not grant casual access
to customer screenshots, DOM, source, prompts, or AI responses; content access
requires a logged break-glass procedure.

#### Control-plane information architecture

All customer and operator pages must fit the following navigation. A new page
needs an explicit owner area before implementation.

| Console | Area | Owns |
|---|---|---|
| Organization | Overview | status, recent activity, unresolved work, credits, storage, attention items |
| Organization | Runs and reports | repositories, runs, frames, reports, findings, history, shares |
| Organization | Trends | recurrence, first drift, quality debt, repository and org trends |
| Organization | Explain and automation | hosted explain, CI explain, caps, skipped work, AI state |
| Organization | Organization | members, roles, invitations, repositories, keys, notifications, policies |
| Organization | Billing and usage | subscription, invoices, packs, allowance, usage ledger, payment management |
| Organization | Privacy and data | upload mode, disclosure, exclusions, retention, export, deletion |
| Operator | Operations | health, incidents, queues, breakers, provider, backups, restore, sweeps |
| Operator | Organizations | tenant inventory, account state, activity, storage, credits, support context |
| Operator | Revenue and reconciliation | payments, webhooks, refunds, chargebacks, credits, cost, margin, discrepancies |
| Operator | Usage and spend | provider cost, cache, reservations, budgets, concurrency, rate limits, anomalies |
| Operator | Security and abuse | sign-ins, upload abuse, tenant probes, key events, injection alerts |
| Operator | Controls | scoped pauses, kill switches, expiry, rollback, and reason capture |
| Operator | Audit and support | operator actions, break-glass access, incident notes, customer context |

The shared UI contract is mandatory: persistent navigation, organization and
environment context, breadcrumbs, deep-linkable filters, search, pagination,
clear loading/empty/stale/partial-failure/paused/read-only states, accessible
keyboard and screen-reader support, responsive layouts, readable contrast, and
reduced-motion behavior. Every critical number shows its time window, source,
and timezone. Every destructive or operational action is scoped, confirmed,
audited, and produces a result or completion receipt.

The role matrix is server-enforced and must be reflected in navigation:

| Role | Customer console | Operator console |
|---|---|---|
| Organization owner/admin | full organization control, billing, deletion, member/key management | none by default |
| Member | reports, runs, trends, permitted explain/automation | none |
| Designer | reports, findings, trends, comments/share access as granted | none |
| Share viewer | one authorized shared run only | none |
| Support operator | no customer console impersonation by default | scoped support views; break-glass content access only with reason and audit |
| Finance/reliability/security operator | no customer console impersonation by default | domain-specific console areas and controls only |

No new admin or account page is complete until it has an information-architecture
area, server-side role tests, tenant-isolation tests, audit-event definition,
empty/error/paused states, and a usable keyboard/screen-reader path.

#### Dashboard release gate

Before the paid product is called operationally ready:

- [ ] an organization admin can answer “who used what, when, and how much?”;
- [ ] an operator can answer “what is failing, who is affected, and is spend
  safe?”;
- [ ] payment, credits, provider spend, storage, and usage totals reconcile;
- [ ] anomaly alerts lead to a visible, scoped control;
- [ ] failed payments and exhausted credits have clear customer states;
- [ ] every privileged action is audited and permission-tested;
- [ ] cross-tenant dashboard queries and exports are denied by default;
- [ ] dashboards continue to show safe read-only history during outages or
  payment failure;
- [ ] dashboard data is deletion-aware and follows documented retention.
- [ ] every customer and operator page belongs to the canonical information
  architecture and is reachable through stable navigation;
- [ ] role/navigation checks prove users cannot discover or call another
  console's routes, data, exports, or object URLs;
- [ ] core workflows pass responsive, keyboard, screen-reader, and reduced-
  motion checks;
- [ ] destructive, financial, and operational actions show scope, confirmation,
  audit context, and completion/failure state.

#### Measurement gate

Before Cloud billing, verify:

- [ ] free CLI telemetry is explicit opt-in and fully disableable;
- [ ] telemetry payloads pass a secret/content redaction test;
- [ ] Cloud events are organization/user/repository/run scoped;
- [ ] per-user and per-organization usage views work;
- [ ] failure and anomaly dashboards distinguish customer, provider, and
  internal failures;
- [ ] credit, payment, storage, and provider-cost events reconcile;
- [ ] deletion removes or anonymises associated analytics as documented;
- [ ] aggregate metrics do not claim more precision than the data supports.

### Pathway 1 — Close launch-critical substrate gaps

**Goal:** make the existing backend safe to expose.

Implement in this order. **This list is the whole of Pathway 1** — §10.3 expands
each item, and nothing lives only there:

1. ✅ Make migrations race-safe under concurrent serverless cold starts. (§10.3 1A)
2. ✅ Complete filesystem and S3/R2 storage drivers. (§10.3 1D)
3. ✅ Enforce real request rate limits for upload and agent keys. (§10.3 1C)
4. ✅ Reserve provider dollars before every call; settle, release, and refund
   idempotently. (§10.3 **1B.1** and **1B.3**)
5. ✅ Derive credit prices from each operation's hard maximum cost, so no operation
   can be sold below cost. (§10.3 **1B.2**)
6. ✅ Deliver budget alerts at 50%, 75%, 90% and 100%, with an audited manual reset
   for a tripped breaker. (§10.3 1C, second half) — `FinishedSPEC.md` §3f
7. ✅ Fix reconciliation so allotment and pack-funded usage are attributed
   correctly. (§10.3 1B) — `FinishedSPEC.md` §3h
8. ✅ Add the reachable MoR webhook route and Paddle signature adapter. —
   `FinishedSPEC.md` §3i. The route, signature scheme, replay window,
   idempotency and state ordering are verified; the **Paddle sandbox loop is
   `Blocked`** on an account, which is Phase 7's gate, not this item's.
9. ✅ Add retention sweeps and deletion of database rows and storage blobs. —
   `FinishedSPEC.md` §3j. Run/repo/org deletion and the 90-day sweep, claimed,
   batched and resumable; dry run is the default. **One decision is owed:**
   erasing an org cascades its `usage_events`, `credit_grants` and
   `subscription_periods`, which rewrites past reconciliation months. The
   receipt keeps the aggregate; whether anonymised per-event records must be
   retained is a policy call, not an implementation gap.
10. ✅ Add backups, restore rehearsal, and operational alerts. —
    `FinishedSPEC.md` §3k. Encrypted `pg_dump` through the storage port with a
    manifest taken inside the dump's own snapshot; a rehearsal that restores into
    a scratch database and compares every table's row count; eight operational
    signals delivered once per period through a real webhook/email channel. A
    real backup was restored and compared on 2026-08-14, and both failure paths
    were watched. **The schedule is deferred, not blocked — Harsha's decision,
    2026-08-15.** With no paying customer yet, the only data at risk is the
    waitlist, and a hand backup covers it. `npm run backup` is the interim
    control. `.github/workflows/backup.yml` is written and inert: with no
    secrets set it prints a notice and exits 0.

    **Trigger: turn the schedule on when the first organization pays.** The
    deferred work, in full, so none of it has to be worked out again:

    1. **A separate R2 bucket for backups.** Not `normascope-test` — that
       bucket's token lives in `.env.r2` and gets sourced into test runs, so a
       test could overwrite or sweep a production backup.
    2. **The repository secrets.** `BACKUP_DATABASE_URL` must be the *direct*
       Neon endpoint (the pooled URL with `-pooler` removed) — `pg_dump` reads a
       snapshot exported by a second connection, and a pooler does not guarantee
       both land on the same backend. Then `NORMA_BACKUP_KEY` and the five
       `NORMA_STORAGE_*` values for the new bucket.
    3. **Alerts.** `RESEND_API_KEY` already exists in the Vercel production
       environment; add `NORMA_ALERT_EMAIL` beside it. A webhook is the
       alternative. With neither, `ops-check` is log-only and says so.
    4. **A lifecycle rule on the bucket** so backups expire — 30 or 90 days.
       Nothing in the product deletes them, so the bill grows forever otherwise.
    5. **One manual run with `rehearse: true`** before trusting the schedule.
       That exercises dump → encrypt → store → restore → row-count compare in a
       single run, instead of finding out at 03:00.

    **The key is unrecoverable.** `NORMA_BACKUP_KEY` is in Harsha's password
    manager and nowhere else. Nothing here stores it or a hash of it, so a wrong
    key is only discovered when a restore is attempted — which is why item 5
    above is a step and not a nicety.

> Items 4–6 were previously described **only** in §10.3 and were missing from
> this list. That is not a formatting detail: an agent working from the list
> finished items 1–3 and reported Pathway 1 nearly done while the largest
> spend-safety hole in the product — every provider call authorized against a
> total that only updated *after* the call — was still open. Added 2026-08-10.
> If §10.3 describes work, it belongs here too.

**Tests:** migration concurrency, quota races, tenant probes, storage deletion,
rate-limit concurrency, provider-budget reservation race, idempotent
settlement/refund, margin-floor assertion, alert/breaker, Paddle signatures,
reconciliation fixtures, restore.

**Gate:** no known payment, tenant, storage, retention, or accounting blocker.

**Gate state — 2026-08-15.** All ten items are implemented and their suites are
green: **598 checks on PGlite, 626 against a real Postgres server**, across
twenty suites, plus `npm run verify` (types for both packages, the web build,
the dependency audit). Three things remain, and none is a logic gap:

- the **Paddle sandbox loop** (item 8) — `Blocked` on an account, and Phase 7's
  gate rather than this one;
- the **backup schedule** (item 10) — **deferred to the first paying
  organization** by decision on 2026-08-15, not blocked. Hand backups cover the
  waitlist meanwhile; item 10 above lists everything the switch-on needs;
- the **org-deletion policy question** (item 9) — a decision for Harsha, not
  code.

### Pathway 2 — Build the artifact pipeline

**Goal:** ensure paid explain is stronger than free explain.

1. Add `npx norma-scope upload`.
2. Upload only on explicit user or CI opt-in.
3. Upload summary JSON plus bounded build/reference/diff artifacts.
4. Use direct presigned uploads; do not proxy large images through serverless.
5. Enforce entitlement and quota server-side on every request.
6. Deduplicate content-addressed artifacts within an organization.
7. ✅ Upload full artifacts for flagged frames and thumbnails for clean frames.
8. ✅ Secret-scan DOM and code context before provider submission.
9. ✅ Recalibrate after crops ship and reprice packs before billing — recalibrated 2026-08-19; no reprice needed.

**Tests:** containment, forged keys, free-plan refusal, quota isolation,
abandoned uploads, duplicate artifacts, crop grounding, secret scanning, COGS.

**Gate:** findings reference actual image regions and all pricing uses measured
post-crop COGS.

**Progress — 2026-08-15. Items 1-6 are built and proven end to end.**
Migrations 015-018, `artifactUploads.ts`, `plans.ts`, `uploadHttp.ts`,
`/api/blob`, both upload endpoints, `/admin/keys`, and `norma-scope upload` in
Argus (branch `feat/cloud-upload`, `norma-scope@0.8.0`, 107 checks). Cloud side:
**598 checks on PGlite, 626 against a real Postgres server**.

**Proven against a real run, not only against fixtures.** The portfolio capture
in `norma-bridge-usecase/` — three frames, 2.1 MB of genuine screenshots — was
compared, uploaded from the CLI through presigned PUTs, committed after size and
content-hash verification of every object, and read back in a browser with its
real numbers. Deduplication held on a second upload (3 of 9 files already
stored, not re-sent), a failed transfer left its reservation held until the
sweeper reclaimed all 300,866 bytes, and `deleteOrg` afterwards removed 9
objects and 1,083,850 bytes and left a receipt.

Real payload sizes, measured: **0.30 MB** for the default `flagged` mode and
**0.78 MB** for all three frames.

**The per-plan quota numbers are not settled and this document does not set
them.** `plan_limits` is seeded with 200 runs/day, 600 artifacts/run, 250 MB
per run and 50 GB stored — figures taken from `BuildV5.md` §G2c, which is
implementation detail and not authority. Neither FUTURENORMA nor this document
states them. The dimensions are settled here ("runs, artifacts/run, bytes/run,
total storage, and retention"; the service owns the policy); **the values are
owed to FUTURENORMA §3's plan contract and are Harsha's call**, alongside the
open question of what 500 credits should buy. Until then they are configuration
that can be changed with an UPDATE, which is the point of holding them in a
table.

**Item 7 landed 2026-08-19.** The default upload no longer means "only flagged
frames leave" — it means full artifacts for flagged frames and one downscaled
JPEG for each clean one, so a run's history contains the frames that passed
without three full-resolution PNGs apiece. `--all-artifacts` overrides it.
BuildV5 G2.12's own example is the test: 2 flagged of 20 sends 6 full images and
18 thumbnails; the override sends all 60. Argus `cloud` suite C5, C8, C14–C18
(28 checks); cloud-side `uploadPipeline` U9b–U9d.

Two things were found by tracing the feature against what already existed rather
than by testing the feature alone, and both are closed:

- **`contentType` was client-supplied and unvalidated.** It is signed into the
  presigned PUT, stored on the object, and returned as the `content-type` header
  on every presigned GET — so a caller with a valid upload key could declare
  `text/html` for a screenshot and be handed a URL a browser renders as markup
  on the storage origin. That is the stored-XSS probe §3's security baseline
  asks for, reachable through the ordinary upload path. `CONTENT_TYPES` in
  `artifactUploads.ts` is now an allowlist per kind, checked with the other
  malformed-field rules so nothing is reserved or signed for a request that will
  be refused.
- **The object key's extension was derived from the kind, not the content.**
  `extensionFor("thumbnail")` returned `png` unconditionally, so a JPEG
  thumbnail — the common case — would have been stored at `<sha256>.png` while
  its own content type said otherwise. Derived from the resolved content type
  now.

One correction to `makeThumbnail`'s behaviour lives in the upload path rather
than in the shared function: it only considers keeping the original when it did
*not* resize, so a downscaled frame always came back as JPEG even where the JPEG
was larger. For a screenshot that is academic; for a large flat-colour frame it
is not, and it would have made this feature *increase* what a clean frame costs
the customer's quota. `thumbnailFor` never uploads a thumbnail larger than the
image it stands in for. `report.ts` is the other caller and is deliberately left
alone — it embeds thumbnails as data URIs and has its own reasons.

**Item 8 landed 2026-08-19.** A credential in a run's data no longer reaches the
provider. The scan lives in `src/promptAssembly.ts` — the one function the
interactive and batch paths both call, so an unscanned payload cannot be
assembled at all. A hit **blocks and names the field**; it never redacts, because
a redaction that misses is an exfiltration. Interactive explain returns
`secret_blocked` and releases both reservations; the batch path skips that frame
before it reserves anything and still submits the clean ones. Either way CI stays
green and nothing is charged. `test/secretScan.test.mjs`, 42 checks, including
SS7 — the pre-item-8 assembly run through the same harness to prove the rest has
teeth. Detail: `FinishedSPEC.md` §3q.

The scan reads the source fields rather than the assembled string: the stats
blob is capped, so scanning the output would call a secret "safe" whenever the
cap happened to cut it off.

**Crop grounding landed 2026-08-19 (BuildV5 G3).** Hosted explain reasons over
image crops of the flagged regions. Proven against the real portfolio capture
with a real key: the crop-grounded answer reports the rectangle `compare`
recorded (`960,400 336×48`) and describes a green element present in the
reference and missing in the build, where the metadata-only answer said the
location could not be determined and returned `0,0,0,0`.

**The crops are cut in the CLI, not on the server** — BuildV5 G3 says otherwise
and is superseded. Cropping means decoding, and the 2026-08-19 sharp decision
exists precisely because uploaded images are hostile input; decoding them in our
own function is that risk with a worse blast radius. `FinishedSPEC.md` §3r has
the mechanism and the evidence.

**Crops cost exactly one credit.** Vision is billed on area, so the crop budget
is the price: an analysis is 3 credits without crops and 4 with. The budget is
sized by the deep pass, which binds first. The server measures every image from
its own header before spending anything on it, so a client cannot decide what an
analysis costs us.

**Item 9 landed 2026-08-19 (BuildV5 G4).** `scripts/calibrate-hosted.mjs` makes
real billed calls through the real service and reads every figure back out of
`usage_events`. Three results:

- **Crops made the hosted analysis 2.3× cheaper** — $0.0083 crop-grounded against
  $0.0194 metadata-only. They add ~600 input tokens and cut output from ~1,700 to
  ~519, and output costs 5× input. G4 was written expecting the opposite.
- **Our price table was wrong.** `usage.ts` priced Sonnet 5 at $3/$15 per MTok
  against a live page saying $2/$10 — and the page states the $3/$15 increase
  scheduled for 2026-09-01 will not occur. Every recorded Sonnet cost was 50%
  high. Corrected; the harness now refuses to run while the two disagree.
- **Every pack clears its 3× floor by 9-11×.** No reprice needed, which is the
  gate's condition.

Detail and caveats: `docs/calibration.md`, `FinishedSPEC.md` §3s.

**Pathway 2 is complete.**

**Uploads are deliberately not scanned.** The server is out of the byte path for
artifacts once a presigned URL is issued, and the enforcement this item asks for
is at submission. Crop grounding will add image and DOM context to the outbound
request through the same function, so it inherits the guard.

**Not yet true in production:** nothing has been deployed and **the R2 leg has
never carried a real artifact**. Everything above is the filesystem driver.
`Step 5` requires the whole G suite re-run against real R2, and that requirement
stands — presigning, `Content-Length` pinning and TTL behave differently against
a real service, and the local driver is now a complete implementation precisely
so that difference is the only thing left untested.

**Two things must be scheduled before uploads are enabled for customers.** Both
are built and neither runs:

1. **`scripts/sweep-uploads.mjs`** — an abandoned declaration holds a byte
   reservation nothing else releases. Without this on a schedule the quota only
   ever tightens: a CI job killed mid-upload costs that organization capacity
   permanently, and a hostile one can declare its whole allowance, transfer
   nothing, and repeat. It is also what clears a commit refused on plan grounds,
   which deliberately deletes nothing at the time.
2. **The backup schedule** (Pathway 1 item 10) — already deferred by decision,
   and uploads are the point at which customer data starts existing.

What landed, and why each was a prerequisite rather than the work itself:

- **`run_artifacts` can now hold a declaration as well as a delivery.** Once a
  presigned URL is issued the application is out of the byte path, so the only
  defence left is comparing what the client said it would send against what
  arrived. One byte count could not express that.
- **One artifact per `(run, frame, kind)`**, so a client cannot declare the same
  frame twice and reserve its bytes twice.
- **`org_storage`** keeps reserved bytes apart from stored bytes, so twenty
  concurrent declares cannot each pass the same quota check.
- **`plan_limits`** is the config row `retention.ts:54` has described as absent
  since it was written, and `orgs.plan` finally lost the trial state abolished
  on 2026-08-03.

**Two gaps found by tracing the new work against what already existed, rather
than by testing the new work alone.** Both were "built the piece, never wired
it", and both are now closed:

- **Entitlement was checked at declare and not at commit.** An organization that
  declared while paying and downgraded before committing published a run on a
  plan not entitled to it. The module header claimed entitlement was re-checked
  on every request; it was not. Any protocol whose phases are separated in time
  crosses state that can change in between — check at each phase, not the first.
- **`bytes_stored` only ever rose.** Deleting a run freed the objects and not the
  quota, so an organization that deleted everything still read as full and would
  eventually be refused an upload into an empty account. The release now happens
  in the branch that deletes the object, not the one that deletes the row —
  `bytes_stored` counts objects, and a deduplicated artifact never added to it.

**Four more found only by running the thing, after the suite was green.** Every
one of them sat where no test could see it, which is the point worth keeping:

- **`runs.state` promised uncommitted runs were invisible and nothing read it.**
  Half-finished uploads were viewable at `/r/{id}`, could be turned into a public
  share token, would have provider money spent explaining them, and counted in
  history. Live from the moment 017 landed, including under everything built on
  top of it that day.
- **The transfer phase had never run.** The filesystem driver signs URLs pointing
  at `/api/blob`, and that route did not exist — the verifier for it did, which
  is how it survived review. The suite bypasses the leg entirely by calling
  `storage.put`, so the one phase where the application is deliberately not in
  the byte path was never exercised. A real CLI upload failed on it with a 404.
- **An uploaded run rendered as "no compared frames".** Only the older
  summary-only route wrote `frame_stats`, and that is what the report lists and
  what `enrichment.ts` derives first-drift and recurrence from. Artifact uploads
  arrived committed, with their images, contributing nothing to the history that
  is the entire paid argument.
- **The explain buttons quoted 1 and 3 credits.** Those prices were abandoned on
  2026-08-10 for losing money at the ceiling; the charge followed the decision
  and the labels never did. Harsha caught it, not a test.

**Carried forward — open, and none of them blocking today's work:**

| # | Item | Why it matters |
|---|---|---|
| 1 | ~~`/r/` is a blank page in production~~ **Fixed 2026-08-15, confirmed on the live site 2026-08-19** | `middleware.ts` now issues a per-request nonce with `strict-dynamic`, plus the `font-src` that was also missing. Verified against a real production build: the page renders, fonts return 200, the nonce differs per request, and a hostile frame label rendered as visible text without executing. Then confirmed against `normascope.com` itself — **27 scripts, 27 nonces**, hydrated, fonts loaded, no console errors, a different nonce on each of three requests. `'unsafe-inline'` was never shipped. **Half-closed 2026-08-19 by Phase H, and the other half is not closing.** The page's styling moved into `report.module.css`, so `style-src-elem` on `/r/` and `/admin` no longer permits inline styles in production — verified against a production build: 2 stylesheet links, 0 inline `<style>` tags, 31 scripts and 31 nonces. `style-src-attr` still permits them and will keep having to: a meter's fill width, a region overlay's position and a pane's aspect ratio are computed per frame and have no stylesheet to live in. `style-src` is kept behind both as the fallback, because a browser implementing neither specific directive would otherwise fall through to `default-src 'none'` and load no CSS at all. |
| 2 | ~~`plan` and `subscription_status` can both say `lapsed`~~ **Resolved 2026-08-15, migration 019** | `plan` is now `free \| team` — what was bought. `subscription_status` owns the lifecycle, which is the only place `past_due` and `refunded` could ever live. The tie-breaker: the `lapsed` limits row differed from `free` on one column read only *after* a gate both fail, so the duplicate decided nothing. It also closed a live gap — `subscription_status` was written by the webhook and read by nothing, so a lapsed organization kept uploading. |
| 3 | The sweeper and the backup schedule are built and unscheduled | Both must run before customers upload. See above. |
| 4 | ~~500 included credits buy 100 analyses, not 500~~ **Softened 2026-08-19 — now 125** | The Sonnet 5 price correction (§3s) took an analysis from 5 credits to 3, and the crop budget put one back: **4 credits, 125 analyses a month**. Still short of 500, so whether that is the right allowance remains Harsha's call — but it is no longer a number moving in the wrong direction, and it improved without touching the model. |
| 5 | The R2 leg has never carried a real artifact | Step 5 requires the G suite re-run against real R2. |
| 6 | `--target` produces no summary, so it cannot upload | The zero-config flow is outside the upload path entirely. Fine today; a decision if that flow should reach Cloud. |
| 7 | `revokeApiKey` now has a surface, but no rotation | A leaked key can be withdrawn from `/admin/keys`. Issuing a replacement is still a script. |
| 9 | G3.3's selector half is untested | Crop grounding's parity check asks that CLI and hosted findings both name a selector and a measurement. Both name the measurement — the same region rectangle, the same missing element. Neither names a selector, because selectors are derived from DOM context and the portfolio fixture is an offline capture with no `.bridge/context/`. Closing it needs a capture run against a live page, which is a browser, not a fixture. |
| 8 | Argus's secret scanner flags ordinary file paths | Found while building item 8 here. With `/` in S8's entropy alphabet, `artifacts/build/marketing-hero-desktop-1440x900` scores 4.52 bits against a 4.5 threshold — a false positive that **blocks** a local explain and names an innocent file. Argus's copy (`src/explain/scanner.ts`) scans DOM and code context, where paths are far more common than in summary metadata, so it is likelier to bite there than here. The fix is the one-character change already made in `src/secretScan.ts`; it is a CLI change with a publish attached, so it waits for the next `norma-scope` release rather than riding along with a Cloud commit. |

Next: Pathway 3 — the report page. **It is no longer blocked** — item 1 above was
fixed on 2026-08-15 and verified against the live site on 2026-08-19. Pathway 2's
own item 9 comes first under the canonical order, and it cannot start until crop
grounding (G3) ships, because there is nothing to recalibrate until the payload
changes.

#### CLI-to-Cloud connection

The paid and free users use the same `norma-scope` executable. Cloud is an
explicit connection, not a separate CLI fork.

Free flow:

    norma-scope check → local screenshots → local comparison → local report

Paid flow:

    norma-scope check → local comparison → norma-scope upload → Cloud history

The initial authentication flow is:

1. User signs into the Cloud web application.
2. User creates or joins an organization and subscribes.
3. An admin opens Organization Settings → API Keys.
4. The admin creates a scoped upload key, shown exactly once.
5. The key is stored in a GitHub Actions secret as `NORMASCOPE_ORG_KEY`.
6. The repository sets `NORMASCOPE_CLOUD_URL` and invokes `norma-scope upload`.

The first implementation should use the existing environment-variable contract
because it is CI-safe and already matches MCP org-credit mode. A later CLI
workflow should add:

    norma-scope cloud login
    norma-scope cloud status
    norma-scope cloud upload

`cloud login` may use a browser/device flow and an OS credential store. It must
not require a permanent plaintext organization key on a developer laptop.

Upload is explicit. It is not triggered by ordinary `check`, `compare`, or the
pre-commit hook. The repository configuration may make the CI upload explicit:

    {
      "cloud": {
        "enabled": true,
        "upload": "flagged",
        "autoExplain": { "enabled": true, "maxFramesPerRun": 5 }
      }
    }

Supported upload modes should be `none`, `flagged`, `all`, and eventually
`metadata-only`. The paid default is `flagged`; clean frames should not leave
the machine unless the customer asks for them.

> **This sentence and item 7 disagree, and the disagreement is Harsha's to
> settle — flagged 2026-08-19, not decided.** Item 7 ships thumbnails for clean
> frames *by default*, so on the paid default a downscaled JPEG of every clean
> frame now leaves the machine. Item 7 and BuildV5 G2.12 are specific and agree
> with each other; this line is older and more general. The implemented reading
> is that "clean frames do not leave" meant their full-resolution artifacts, and
> a thumbnail is the history record the hosted report and trends are built on —
> but that is an interpretation of a privacy promise, not a settled decision.
> `metadata-only` remains the mode that sends no pixels at all. If the promise
> was meant literally, the fix is to default clean frames to no thumbnail and
> put them behind an opt-in, which is a one-line change to `framesToSend`.

The server must enforce entitlement on every request. Free organizations must
not be able to mint upload keys, obtain presigned URLs, or bypass the rule with
a client flag. The free CLI remains complete and local; Cloud adds persistent
state and hosted services.

### Pathway 3 — Make the hosted report irresistible

**Goal:** make the paid report visibly additive without degrading the free one.

Show:

- build/reference/diff triptych;
- region overlays and lightbox;
- confidence, selector, CSS hypothesis, and verification label;
- first-drift commit;
- recurrence count;
- previous-run delta;
- prior-finding recall;
- revocable share links;
- safe fallback for pre-artifact runs.

History must be prominent. “First drifted at commit X” is the core paid
differentiator and should not be faint text beneath an AI explanation.

**Gate:** a prospect can compare one real local report with Cloud and immediately
understand what historical state adds.

**Built 2026-08-19 — BuildV5 Phase H, H1–H4.** Images, findings with region
overlays, history as page furniture, and a share interface for the API that had
none. Detail and evidence: `FinishedSPEC.md` §3t. `test/reportPage.test.mjs`
(41 checks) plus 5 added to `uploadPipeline`; the suite total is **775 across 26
suites** on PGlite. Four guards were watched failing before being trusted, and a
fifth was found to be asserting nothing at all — see §3t, because that one is the
best argument for the practice this repo already has.

**The gate above is not yet met, and it is not code that is missing.** The gate
asks that a *prospect* can put a local report beside a hosted one. Every check
so far is against seeded data on a laptop; nothing is deployed, and the only
real capture in the repo is the portfolio run. Meeting it needs Step 5 and a run
someone did not seed.

**Still open on this page, none of it blocking Step 4:**

| # | Item | Why it matters |
|---|---|---|
| 1 | The capture's aspect is measured in the browser, not stored | Nothing decodes a customer image server-side, and dimensions are not on `run_artifacts`. So the first paint uses a 4:3 fallback and corrects once the image loads. Storing width/height at declare would remove the reflow — it is a CLI change with a publish attached, so it waits for a release rather than riding along here. |
| 2 | `style-src-attr 'unsafe-inline'` remains | The page's geometry is computed per frame — meter width from a score, region position as a percentage of natural size. There is no stylesheet those can live in. Carried-forward item 1 asked for `'unsafe-inline'` to go when Phase H rewrote the page; the `-elem` half went, this half did not, and pretending otherwise would be worse than saying so. |
| 3 | Region overlays assume the diff shares the build's dimensions | True for every capture the CLI produces today. A diff rendered at another size would misplace every box, and nothing checks it. |
| 4 | ~~No page above `/r/{runId}`~~ | **Closed 2026-08-20.** `/repos/{repoId}` lists a repository's runs and frames, and the run report links up to it for owners. See Pathway 6 below. |

### Pathway 4 — Create the recurring CI explanation loop

**Goal:** make explanations part of normal development and create legitimate
credit consumption.

For every configured PR:

1. capture and compare;
2. upload needed artifacts;
3. select the top flagged frames;
4. queue bounded batch explanations;
5. append one concise escaped finding line to the sticky comment;
6. link to the hosted report;
7. record whether the issue later resolved;
8. stay green when credits, Cloud, or the provider are unavailable.

Default to a bounded top-N per run. Let organizations set caps inside their
budget. Never create an unbounded CI or agent billing path.

**Gate:** a team installs the Action once and receives useful explanations
without manually opening Cloud.

### Pathway 5 — Complete auth, organizations, and collaboration

**Goal:** turn a demo tenant into a safe multi-user product.

> **Status — 2026-08-21: the identity spine is built; the consoles are not.**
>
> **Done, with evidence in `FinishedSPEC.md` §3aa:** server-side sessions
> (rotation, idle and absolute expiry, recent-auth, per-device revoke and revoke
> all), GitHub OAuth keyed on the immutable subject with state and exact
> redirect URIs, magic links at 15 minutes and single use, invitations with
> their state machine, owner claims and the ownership invariant, the redacted
> auth audit log, the five-ceiling outbound-email budget with its alert and
> pause, the first-party challenge, `/login`, and session-layer tenant
> isolation on `/r/` and `/repos` — including `/repos` itself, which is the
> repository list Pathway 6 carried as its open item 2.
>
> **2026-08-22 adds two rows of 5A.8 without adding the page they belong to.**
> *Sign out* and *sign out everywhere* are reachable from an account menu in the
> masthead of every signed-in page, so the session a person is holding is no
> longer one they cannot end. The rest of 5A.8's account surface — the session
> *list*, with its device label, last-seen time, sign-in method and per-row
> revoke — is still absent, and the menu is deliberately not a substitute for
> it: it ends sessions, it does not show them.
>
> **2026-08-22 adds the organization console's shell, and nothing behind it.**
> One masthead, one context row and one navigation across seven areas, built
> before the workflows because this section says to. `src/consoleIA.ts` is the
> page-ownership map and the role matrix, in one list that the navigation
> renders, every page guards from, and the suite imports and evaluates. Four of
> the seven areas answer with something real only where something real existed
> — Runs and reports (`/repos`) and the per-repository trend view — and the
> other five state what will be in them, rendered from the map rather than
> restated. The **individual account dashboard is still not built**, and it is
> the natural next piece: 5A.8's session list is what the account menu
> deliberately is not.
>
> Two things came out of building it. `/repos/{id}/trend` and its CSV export
> were still gated by `NORMA_DEV_OPEN` alone and 404ed for every customer —
> §7's open-item table had recorded that gate closed. And the launch role
> matrix is now written down: Overview, Runs, Trends and Explain for every
> role; Organization, Billing and Privacy for admins alone, which is where
> every write in 5A.9's table already sat.
>
> **The judgement in it is decided — Harsha, 2026-08-22: the launch default is
> deny.** 5A.9 gives members and designers a "permitted read" of the usage and
> credit ledger; "permitted" is an organization policy and no policy system
> exists, so members and designers get product and report access only, and **no
> financial or usage data**. A read-only usage view can be added later if it is
> wanted — a new surface with its own design, not a widening of this matrix.
> Proven on the wire rather than only in configuration: a designer with a valid
> session, typing the URLs directly, is refused exactly Organization, Billing
> and Privacy and reaches exactly the other four, while an admin of the same
> organization gets the real page — `scripts/tenant-gate-check.mjs` G5.
>
> **2026-08-22 — the Organization area is built, and 5A.14 item 1 is done.**
> Members with roles, invitations with their state, and upload and agent keys
> shown once and revocable. Seven writes behind one dispatcher, each guarded by
> `requireOrgAdmin` before the dispatch, which reads the permitted roles from
> `CONSOLE_AREAS` rather than naming `admin` — the same list the navigation
> renders and the page guards from. No form carries an `orgId`, and both revokes
> scope their `UPDATE` to the organization the session resolved.
>
> **The prediction in the paragraph below held, with one exception.** Almost all
> of it was a browser surface over services that already existed. Three pieces of
> domain logic genuinely did not: `membersOf`, `changeMembershipRole` with the
> owner and last-admin refusals, and an organization scope on the two revokes,
> which took a row id and nothing else — safe while `/admin` was the only caller,
> unsafe the moment a form could supply the id.
>
> **The exception is the one that mattered.** An invitation was a row, a hashed
> token and nobody told: the whole send path did not exist, and the page said
> *"Invitation sent"*. `sendInvitation` reserves `INVITE_SCOPES` — themselves
> written and uncalled since the abuse ladder — then creates the row, then sends,
> so a refused ceiling leaves no live link behind that nobody knows about.
>
> Evidence: 66 checks in a new `organization` suite, 22 in `cloudShell` S12, 16
> in `tenant-gate-check` G6, four counter-tests, eleven source breaks and three
> HTTP breaks watched failing. `FinishedSPEC.md` §3af.
>
> **Not done:** the operator console, the account and billing pages (including
> that session list), deletion UI, privacy controls, the "generated by" line,
> identity linking from an account page, and `api_keys.last_used_at` — deferred
> deliberately because `findApiKey` runs on every authenticated request, so
> recording last use is a write on the hot path.
>
> **What "not done" meant precisely, recorded 2026-08-22 before the area was
> built, and kept because the reasoning generalises to the six areas still to
> come.** The lifecycles behind those pages were *written and under test* —
> `src/invitations.ts` had create, accept, revoke, list and expire with the
> hashed single-use token and the conditional consume; `src/apiKeys.ts` had
> create, list, revoke and per-key budgets; `src/ownerClaims.ts` had the claim.
> **None of them had an HTTP route or a page.** An admin could not invite a
> colleague or mint an upload key without a database client. **So the remaining
> Step 6 work is mostly a browser surface over services that exist, not new
> domain logic** — which is also why the surface is where the risk sits: every
> one of those services is an admin-only write, and 5A.9's matrix has to hold on
> the route, not in the navigation.
>

> **The GitHub round trip has run against github.com** — 2026-08-21, on
> `preview.normascope.com` with a registered OAuth app. `github-started allowed`
> then `github-refused (no-linked-account)`: state verified, code exchanged,
> profile and *verified* emails fetched, and 5A.7's no-silent-merge rule
> applied. The refusal is the pass. `FinishedSPEC.md` §3aa.
>
> **The gate's concurrency half is met**: 20 separate processes against one
> global email budget of 5 authorise exactly 5, and the naive per-process
> counter through the same harness authorises all 20.

This pathway builds the complete organization console and the first complete
operator console surface together. Do not scatter account, billing, usage,
deletion, and support pages across unrelated routes. Implement the shared shell,
navigation, role matrix, and page ownership map before adding individual
workflows.

#### The control-plane hierarchy

There are three layers of account and control UI. They share visual primitives
but not authority or data visibility:

```text
Public / unauthenticated
  └── Individual account
        ├── Organization A console
        ├── Organization B console
        └── Organization switcher

Yutic operator identity
  └── Operator master console
        ├── Operations and incidents
        ├── Organizations and support
        ├── Revenue and reconciliation
        ├── Usage, spend and capacity
        ├── Security and abuse
        └── Audited controls and break-glass
```

These layers answer different questions:

| Layer | Who uses it | Owns | Must not see/control |
|---|---|---|---|
| Individual account | Any authenticated person | Identity providers, display name, sessions, personal invitations, memberships, notification preferences, personal deletion | Organization data merely because the person exists |
| Organization console | Owner, admin, member, designer | One organization’s reports, repositories, trends, members, keys, usage, billing and policies according to role | Other organizations, Yutic operations, global provider state |
| Yutic operator console | Separately authenticated Yutic staff/operator roles | Global health, tenant inventory, billing/reconciliation, provider spend, abuse, backups, scoped operational controls | Casual customer-content access or unrestricted impersonation |

An individual account is not a personal organization dashboard. It is the
identity and security layer above one or more organization workspaces. A solo
customer sees one organization because they own one, not because all data is
implicitly attached to their user row.

##### Individual account dashboard

The account dashboard is user-scoped and must remain useful even when the user
belongs to several organizations:

- identity: display name, linked GitHub identity, verified email identities and
  identity-linking/recovery actions;
- organizations: memberships, role, current organization, pending invitations,
  leave-organization action, and owner/admin warnings;
- sessions: current and other browsers/devices, last seen, method, expiry and
  per-session/all-session revoke;
- security: recent authentication events, recent-auth status, identity changes,
  and recovery guidance without exposing raw audit secrets;
- preferences: notification routing, timezone, reduced motion and UI settings;
- privacy: personal data export/deletion, data-flow disclosures and support
  contact routes;
- support: a safe reference ID and links to `help@normascope.com`, never a
  request to email passwords, cookies, magic links or API keys.

The account page must not display a combined cross-organization data feed that
could confuse ownership or leak information. Cross-organization summaries may
show only non-sensitive membership/status facts unless a future product
decision explicitly defines an aggregate.

##### Organization console

The organization console has an explicit organization context on every page:
organization name, environment, subscription state and current role. Its
sections are:

1. **Overview** — current status, recent activity, unresolved findings,
   credits, storage, failed/paused work and attention items.
2. **Runs and reports** — repositories, runs, frames, findings, history and
   shares; all list views bounded, paginated and organization-scoped.
3. **Trends** — recurrence, first drift, quality debt and repository/organization
   trends, with the selected time window and retention boundary visible.
4. **Explain and automation** — hosted explain, CI explain, automatic-explain
   policy, caps, skipped work, credits exhausted state and provider pauses.
5. **Organization** — members, invitations, roles, repositories, API/agent
   keys, notifications, upload policy and automatic-explain policy.
6. **Billing and usage** — subscription, renewal, invoices, payment management,
   monthly allowance, packs, usage ledger, cache hits as free and storage.
7. **Privacy and data** — upload disclosure, exclusions, retention, exports,
   deletion, object access and completion receipts.

Every organization summary number must state its time window, timezone, source
ledger and whether it includes the demo tenant, cache hits, failed work or
deleted data. The organization dashboard is a control plane, not a decorative
analytics page: every control has an entitlement, role, confirmation, audit
event and result state.

##### Yutic operator master dashboard

Yutic needs a separate operator identity and a master dashboard with global
views. It must not be implemented as “an admin user who can browse every
customer page.” The master dashboard is a control plane with domain-scoped
operator roles:

- **Operations** — deployments, route health, queues, latency, errors,
  database/storage health, backups, restore rehearsals, scheduled jobs and
  deletion sweeps;
- **Organizations** — searchable tenant inventory, plan, subscription state,
  owner/admin count, active sessions, repositories, runs, storage, retention,
  last activity and support context;
- **Revenue and reconciliation** — checkout/subscription events, renewals,
  refunds, chargebacks, credit grants, usage attribution, provider cost,
  contribution margin and mismatches;
- **Usage and spend** — global/provider/org/key budgets, reservations,
  concurrency, cache rate, model/operation cost, storage growth and forecast;
- **Security and abuse** — login failures, magic-link volume, invitation abuse,
  suspicious sessions, key events, upload abuse, cross-tenant probes, secret
  scan blocks and incident timelines;
- **Customer support** — bounded tenant metadata, subscription state, support
  contacts, audit references and safe actions such as resend invite or revoke
  session;
- **Controls** — scoped pause/resume for hosted AI, uploads, captures, sharing,
  a provider, an organization or an agent key; every action requires reason,
  actor, expiry/rollback and an audit event;
- **Audit and break-glass** — operator actions, sensitive-content access,
  incident notes, approvals and completion receipts.

The operator home is a summary with drill-down links, not a giant unbounded
table. Every view needs filters for organization, environment, time window,
plan, subscription state and severity, plus pagination/export with explicit
authorization. Global totals must reconcile to organization totals and the
underlying ledger; a dashboard number without a source query and time window
is not operational evidence.

Operator access is separate from customer membership. At minimum define
`support`, `finance`, `reliability`, `security` and `operator-admin` scopes.
Operator-admin can manage operator access; no ordinary customer admin receives
operator scope. Customer-content access requires a separate break-glass action
with reason, exact tenant/resource scope, short expiry, notification/audit and
no standing impersonation session.

The master dashboard must never offer one unrestricted “disable everything” or
“impersonate customer” button. Controls are least-privilege, reversible where
possible, scoped to one resource or organization, and tested for accidental
cross-tenant effects.

##### Dashboard and control-plane release gate

Before Pathway 5 is complete:

- account, organization and operator routes have separate server authorization;
- a user can move between organizations without cross-tenant data appearing in
  a stale page, tab, export or object URL;
- organization admins can answer “who used what, when, and how much?”;
- Yutic can answer “what is failing, who is affected, and is spend safe?”;
- a support operator can help with access without seeing customer content by
  default;
- finance can reconcile subscription, credits, usage and provider costs;
- security can investigate auth, key, upload and tenant-isolation events;
- reliability can pause one provider/org/key without pausing unrelated tenants;
- every dashboard query is bounded, paginated, time-windowed and sourceable;
- direct route/API calls receive the same role decision as navigation;
- demo, customer and operator data are visibly and technically separated;
- operator break-glass, destructive actions and control changes are audited;
- dashboard totals and controls have empty, loading, stale, partial-failure,
  paused, read-only and permission-denied states.

Implement:

- GitHub OAuth for developers;
- magic-link access for designers and PMs — **both ship together**
  (FUTURENORMA §4 Open decisions 4, closed 2026-08-21);
- the outbound-email abuse ladder that makes magic links safe to expose:
  per-address cooldown and daily cap, per-IP and per-subnet hourly caps, a
  global daily email budget that alerts and then pauses, a challenge after
  repeated failures, identical responses whether or not the address is
  registered, and short-lived single-use tokens. **Gate item, not hardening**
  — FUTURENORMA §4 Step 6 carries the numbers;
- organization creation, invitations, and roles;
- upload/agent key creation and revocation;
- credit balance separated into monthly allowance and purchased packs;
- usage history showing cache hits as free;
- subscription, invoices, renewal, cancellation, and refund paths;
- repository and seat list;
- internal admin view for margin, storage, spend, and breaker status;
- **"Generated by" on the run report header** — see the decision below.

#### "Generated by *username*" — decided 2026-08-20, deferred to here

Asked for on the run report header; **Harsha decided to wait for this step**
rather than ship an approximation.

**Why it could not ship earlier.** There is no session, so nothing knows who is
reading the page or who ran the build. The two identities actually available
today are the label on the API key that uploaded the run (which identifies a CI
pipeline, not a person, and is the same string for every run from one key) and a
name the CLI could be changed to send — `GITHUB_ACTOR` in CI, `git config
user.name` locally. Both are stand-ins for the thing Step 6 supplies properly,
and shipping one means a migration, an Argus release, and a column to reconcile
against real identity later.

**The policy is settled, so it does not need re-deciding when it is built:**

| Question | Decision |
|---|---|
| Which views show it | **Both.** Owner *and* share. A report sent to a designer is more useful when it says who ran it |
| What is shown | **Display name only.** Never an email address, and never a git author email |
| Why share views are different from the breadcrumb | The breadcrumb is owner-only because it names the repository and offers a link the holder cannot open. A name is neither — it widens no capability |

**Two things to get right when it lands.** A name is untrusted text, rendered as
a React text node like everything else on that page. And the column has to
tolerate runs that predate it: the header simply omits the line, the way it
already omits a branch or a commit that was never recorded.

#### Standing up a preview environment — the order that matters

Done 2026-08-21 for `preview.normascope.com`. Written down because half of these
steps only reveal themselves by being skipped, and the failures are quiet.

1. **Vercel first, DNS second.** Add the domain, pin its **Git Branch** to
   `staging`, then create the CNAME with the value Vercel displays — it is
   project-specific and not the one an existing subdomain uses. Lower the TTL
   while getting it right.
2. **A separate OAuth app**, not a second redirect URI on production's. A leaked
   preview secret then reaches nothing. Never enable GitHub's wildcard redirect
   matching to cover previews: `https://*.vercel.app/…` would let any Vercel app
   in the world receive our authorization codes.
3. **Set `NEXT_PUBLIC_SITE_URL` to the preview's own host.** Left as production,
   the preview mails sign-in links pointing at production, where the token does
   not exist — and the generic response means nobody can tell.
4. **Set `GITHUB_OAUTH_REDIRECT_URI`** to the preview's callback. It is a
   separate fact from the site URL and only coincides on production.
5. **Every secret is per-environment in Vercel.** `AUTH_SECRET` set for
   Production only means the preview boots, renders `/login`, and throws on the
   first POST — the page short-circuits before the database when there is no
   session cookie, so rendering proves nothing.
6. **Lower the preview's email budget** (`AUTH_EMAIL_DAILY_BUDGET`). The ceiling
   is per-database, so two environments each get their own — and they share one
   Resend account, whose free plan caps the day at 100. Two independent 50s
   exhausts it, and production is what starts failing.
7. **Its own storage bucket and credentials.** Both environments run retention
   sweeps, organization deletion and the abandoned-upload sweeper, and all three
   delete objects. A shared bucket puts production bytes within reach of a
   preview bug.
8. **Redeploy.** Environment changes do not reach an existing deployment.
9. **Check it over the wire**, not by reading settings:
   `VERCEL_AUTOMATION_BYPASS_SECRET=… node scripts/golive-check.mjs https://…`

**Deployment protection and the auth flows.** Vercel Authentication intercepts
every path with a redirect to `vercel.com/sso-api` carrying the original URL —
including an OAuth `code` or a sign-in token — in a query parameter. A browser
holding the bypass cookie is never intercepted, so unlocking the browser once
keeps credentials off that path entirely; the cookie is per-browser, so a link
opened on a second device lands on the login page instead.

#### Re-branching staging — the step that is not obvious

A Neon **schema only** branch copies table structures and **no rows**. That
includes `schema_migrations`, whose rows *are* the record of what has been
applied. So a fresh schema-only branch arrives with every table its parent has
and a log claiming nothing was ever applied.

`migrate()` then reads an empty log, starts at `001`, and fails:

    error: relation "orgs" already exists

The database is not broken and must not be re-created. The record is missing,
not the schema. Sequence:

1. Delete and re-create the branch from production, schema-only.
2. Point Vercel's **Preview** `DATABASE_URL` at the new connection string.
3. `node scripts/adopt-schema.mjs --url "<staging url>"` — records the
   migrations the schema already reflects. It refuses unless every table the
   build creates is present, so it cannot mask a database that genuinely needs
   migrating.
4. `node scripts/schema-drift.mjs --from "$PROD_URL" --to "$STAGING_URL"` —
   expect *level*.

`schema-drift` recognises this state and says so; it used to advise re-branching,
which would have produced another branch with the identical problem.

**Redesign the operator surfaces as one pass, before launch.** The pages under
`/admin` were each built beside the control they expose — rate limits and spend
with the breaker, waitlist with its export, API keys with revocation — which is
why every one of them works and none of them was designed. They share no shell,
no navigation beyond hand-written links between three routes, and no consistent
way of showing a control that is currently irrelevant. The breaker reset is the
clearest symptom: its form is correct to hide when nothing is tripped, and the
result is a page where a control simply is not there, with nothing saying why.

This is deliberately *not* work to do now. They are internal, gated, and used by
one person, so the cost of them being plain is close to zero until there is a
second operator or an incident someone has to work through under pressure.
Do it as part of this pathway's shared shell rather than as a separate effort —
the same shell, navigation, role matrix and page-ownership map named above.
Scope when it comes: `/admin/limits`, `/admin/waitlist`, `/admin/keys`, and
whatever Pathway 5 adds beside them.

**Gate:** session-layer tenant probes pass; a designer can read a report without
GitHub; an admin can explain every credit movement without support; **and no
sequence of requests from one address, one IP, one subnet, or the whole
internet can make the service send more mail than its configured budget** —
proven across concurrent processes against a real Postgres, with the naive
per-process counter run through the same harness.

#### Account and data deletion

Deletion is customer-initiated in the web account UI, but the service remains
responsible for executing it reliably and proving that it happened.

Personal account deletion removes the user profile, sessions, login
identifiers, invitations, and preferences. It must not delete organization
data when the user is not the organization owner.

Organization deletion is restricted to an owner/admin and requires:

1. recent authentication;
2. typing the organization name;
3. explicit irreversible-deletion confirmation;
4. optional export before deletion;
5. immediate upload-key and agent-key revocation;
6. asynchronous deletion of database rows and storage blobs;
7. completion confirmation by email.

Admins must also be able to delete an individual run, repository history, or
artifacts while retaining summary metadata. The UI must say exactly whether it
will remove images, reports, findings, trends, usage history, and AI-related
records.

Required tests include owner-only deletion, cross-tenant deletion refusal,
storage-prefix deletion, refcount cleanup, retry-safe deletion jobs, and a
customer-visible deletion receipt.

#### Privacy controls

The first-run Cloud disclosure must explain what leaves the machine, when it
leaves, which frames are included, what DOM/code context is sent, which provider
receives it, retention, and deletion.

Repository settings should support:

- upload only flagged frames;
- metadata-only mode;
- excluded routes and selectors;
- excluded DOM text and code pointers;
- hosted reports without hosted AI;
- 7/30/90/365-day retention;
- delete artifacts after explanation;
- disable history for sensitive repositories.

Add a pre-upload manifest so the user can inspect the files, frames, regions,
and context that will leave the machine. Add `[data-norma-private]` redaction
for DOM content and configurable screenshot redaction regions. The existing
secret scanner protects text fields, but screenshot-visible secrets need a
separate redaction path.

Enterprise privacy options are a later pathway: Bedrock/Vertex/Azure
inference, regional storage, customer-controlled keys, private deployment, and
contractual retention/deletion guarantees.

### Pathway 6 — Add trends and quality debt

**Goal:** turn stored history into an operational retention product.

Frame-level history:

- score over commits;
- threshold line;
- first-exceeded marker;
- source/mode transitions;
- gaps for skipped frames;
- prior finding and resolution history.

Organization-level quality debt:

- regressions open for 7/30/90+ days;
- frequently recurring defects;
- routes with worsening drift;
- components associated with multiple regressions;
- fixes that reintroduced the same issue;
- critical routes below policy;
- owner and due date;
- improved/worsened frames since the prior default-branch run.

This is where Cloud becomes organizational memory rather than report hosting.

**Gate:** trend charts, enrichment, and quality-debt counts agree on the same
underlying data.

**Frame-level history is built — 2026-08-20, BuildV5 Phase I (I1–I3).** Score
over commits, a threshold line that steps where the threshold moved, the
first-exceeded marker, source/mode transitions, and gaps for runs that measured
nothing. `test/trends.test.mjs` (71 checks); the suite total is **878 across 28
suites** on PGlite and **906** against real Postgres. Detail and evidence:
`FinishedSPEC.md` §3u.

The gate is met for the part that is built, and met by construction rather than
by comparison: first drift is not calculated twice. `frameHistory()` in
`enrichment.ts` remains the only implementation, and the chart places its answer
— which is what §10.8's "do not calculate first drift independently in multiple
places" asks for.

**Organization-level quality debt is not built**, and is deliberately still
here rather than pulled forward. It needs records this schema does not carry —
owner, due date, status, resolution commit — and §10.8 item 5 says to add them
only after the basic chart agrees with enrichment. It now does.

**Open on this pathway:**

| # | Item | Why it matters |
|---|---|---|
| 1 | ~~`/repos/*` is gated by `NORMA_DEV_OPEN` and 404s in production~~ | **Closed 2026-08-21 for `/repos` and `/repos/{id}`, and this row was wrong about the rest until 2026-08-22.** The trend view and its CSV export still answered to `NORMA_DEV_OPEN` alone, so every customer who clicked a sparkline got "Not found" — while this row read as closed, because the page above them had been fixed. Both now take membership in the owning organization, with the dev flag left as the local door. A share token still cannot open a repository-wide view, for the reason this row always gave. Guards: `cloudShell` S11.24–S11.26 for the shape, and **`scripts/tenant-gate-check.mjs` for the behaviour** — 17 checks over HTTP against a production build on real Postgres with the door shut, isolation checked in both directions, watched failing against the pre-fix build (the *member* is refused; every stranger check still passes). `FinishedSPEC.md` §3ae. |
| 1b | A share view carries no breadcrumb, so it shows no organization name | Deliberate — the trail would name the repository and offer a link the holder cannot open. It has one consequence worth knowing: the demo tenant's `DEMO — … (sample data)` label rides on the breadcrumb, so a demo report sent as a share link is unlabelled. `seed-demo` prints that caveat; a durable fix is a share-view label, which is Pathway 5's territory. |
| 2 | ~~There is no repository *list*~~ | **Closed 2026-08-21.** `/repos` answers "what does this organization have" from the membership list the session resolved — never from a URL. The trends API is unchanged and still answers only about a frame. |
| 3 | The x-axis is runs in which the frame was *compared* | A run where the frame is absent entirely is not a point on the chart, where a run that recorded a null measurement is a gap. Both are honest; they are not the same picture, and nothing yet says which happened. |
| 4 | Quality debt, recurrence resolution, and org-level summaries | Items 5–7 of §10.8. Unblocked as of this build. |
| 5 | No "generated by" on the report header | No session, so nothing knows who ran the build. Decided 2026-08-20 to wait for Pathway 5 rather than approximate it from an API key label; the policy for when it lands is settled and written up under Pathway 5. |
| 6 | `style-src-attr 'unsafe-inline'` is unchanged, and neither the explainers nor the chart tooltips widened it | Recorded because it was the live question when they were built. The bubbles position from `_styles/surface.module.css` and CSS anchor positioning off the popover's *implicit* anchor — an `anchor-name` would have to be unique per instance and could only come from an inline style. The hover cards are SVG attributes, not CSS. Carried-forward item 2 stands exactly where it did. |
| 7 | Chart tooltips and the brush both need a pointer | Hover is an enhancement: every point is also a row in the Runs table with the same facts and a link, and the range links do what the brush does, coarsely, without a drag. `touch-action: pan-y` on the brush is reasoning rather than evidence — **no touch device has been tried**. |
| 8 | Every density figure behind the two-level chart is a fixture | The 200-run stress frame was seeded locally and deleted. No real tenant holds more than ten runs of one frame, so the thresholds in §3x (`MAX_INTERACTIVE_POINTS`, `DOT_MIN_SLOT`, `OVERVIEW_BUCKETS`) are measured against invented data. They are the right shape; the exact numbers want re-checking against a real busy repository at Step 5. |

**Closed on this pathway — 2026-08-20.** Every figure on `/r/` and `/repos/` is
now a defined term that opens a plain-language definition from
`web/lib/glossary.ts`, the same file the public `/report` page prints, so the
vocabulary a prospect learns before signing up is the vocabulary the product uses
after; and hovering a point on either chart names its run. Native HTML popover
and plain `:hover`, so `/repos/` still ships zero client JavaScript.
`npm run seed:real` adds a second tenant of ten runs that actually happened —
real images, real percentages, the real recorded findings — kept in its own
organization so "(sample data)" is never stamped on a measurement, and
`npm run capture:cloud` photographs every page in both themes into
`docs/screenshots/cloud/`. `FinishedSPEC.md` §3w, 73 new checks and two shipped
bugs that only real data surfaced.

**And the chart learned to hold a real history — 2026-08-20.** It drew 30 runs
while first drift was computed over all of them, so it named drifts it could not
show. Now a time-spaced overview across the tenant's whole retention, bucketed
without averaging anything, with a drag that selects the period the exact chart
then renders. Interactive elements are bounded; the data is not — 25 rows a page
and a CSV export carry the rest. `FinishedSPEC.md` §3x. **This is where `/repos/`
stopped being zero-JavaScript**, by decision, and §3v's claim was corrected in
the same change rather than left standing.

### Pathway 7 — Add organization-level quality contracts

**Goal:** move from “compare to an image” toward “verify an intended experience.”

Store versioned Cloud contracts for:

- approved design tokens and allowed ranges;
- responsive invariants;
- loading, empty, error, hover, focus, and modal states;
- route criticality and thresholds;
- approved visual exceptions;
- component ownership;
- focus and keyboard evidence.

A local-only token checker remains free. The paid feature is organization-level
versioning, enforcement against uploaded evidence, and longitudinal history.

**Gate:** one contract traces from intent to region to commit to finding to human
decision.

**Current web reference:** the Normascope Cloud error-state treatment is defined
in `docs/normascopeWeb.md` under **Error states**. That section is the source for
the desktop/mobile composition, recovery actions, and contextual character
variations; future quality contracts should preserve those distinctions between
empty results, missing resources, and actual failures.

**Built 2026-08-22** — `FinishedSPEC.md` §3ad. `error.tsx` under `/repos` and
`/r/`, `global-error.tsx` for the failure that takes the root layout with it,
and one shared card so a segment failure and a document failure say the same
thing. `/login` and the marketing site have no segment boundary by decision:
they hold nothing that can fail on its own, so a retry there would reload the
same page. Add one the day either of them starts loading something.

### Pathway 8 — Add bounded behavior and journey evidence

**Goal:** catch important failures that static screenshots miss.

Start with bounded checkpoints, not a general test-runner:

- navigation;
- form submission;
- loading/error states;
- modal and focus behavior;
- keyboard path;
- responsive transitions;
- console errors tied to captured checkpoints.

Tie evidence to the same route, commit, component, and contract identity as
visual findings.

**Gate:** this enriches Normascope findings instead of becoming a separate
Playwright/Cypress competitor.

### Pathway 9 — Build verified repair proposals

**Goal:** shorten time from regression to verified fix.

1. Produce a grounded hypothesis.
2. Generate a minimal patch in an isolated worktree.
3. Run visual, behavioral, accessibility, and existing tests.
4. Compare before/after evidence and collateral regressions.
5. Open a normal human-reviewed PR when policy allows.
6. Record accepted, edited, rejected, and verified outcomes.

Start with high-confidence CSS spacing, token values, and mapped component
props. Never make autonomous production changes.

**Gate:** first-review acceptance rate and verified-fix time improve versus
ordinary explanations.

### Pathway 10 — Enterprise expansion

**Goal:** monetize procurement and operational requirements when demand exists.

Prioritize only after repeated prospect requests:

1. SSO/SAML;
2. audit exports;
3. configurable retention and legal hold;
4. private deployment;
5. Bedrock/Vertex/Azure provider options;
6. regional inference and data residency;
7. security questionnaires and support commitments;
8. additional CI providers.

## 4. Revenue and retention loops

Every paid feature must strengthen at least one loop.

### PR loop

PR opens → capture → diff → automatic explanation → hosted report → fix →
verification → history improves.

**Revenue:** subscription, included credits, and top-ups.

### Collaboration loop

Developer uploads → designer opens link → decision is recorded → baseline or
contract is approved → later drift is compared against the decision.

**Revenue:** subscription retention. Keep viewers unlimited.

### Agent loop

Agent builds → MCP compares → bounded explanation → proposed change →
Normascope verifies → agent key reaches a budget cap.

**Revenue:** credit packs and larger agent budgets.

### Quality-debt loop

Repeated drift → recurrence and ownership → prioritized debt → fix → verified
resolution → organizational history becomes more valuable.

**Revenue:** higher plans and enterprise controls.

## 5. Metrics before pricing changes

Instrument:

- first upload, hosted report, designer invite, automatic explanation, history
  view, and resolved finding;
- runs per repository, PRs analyzed, explanations per run, cache-hit rate, and
  active viewers;
- included credits consumed, pack purchases, credits per organization, and
  organizations exceeding 500 credits;
- month-1/month-3 retention, cancellation reason, reactivation, and time to
  first resolved finding;
- accepted, edited, rejected, and verified findings;
- median time from regression to verified fix;
- provider failure/refund rate;
- contribution after provider, payment, storage, support, and refund costs.

## 6. Experiments before changing doctrine

Run these in order:

1. **Hosted-value test:** show a real months-deep trend and local-vs-Cloud
   report; measure conversion.
2. **PR-explain test:** enable bounded automatic explanations for design
   partners; measure credits and repeat usage.
3. **Pack test:** observe actual 100/200/1,000-credit demand.
4. **Fair-use test:** measure repositories, storage, and support before setting
   repository limits.
5. **Quality-debt test:** measure whether recurrence, ownership, and resolution
   increase active usage and retention.
6. **Repair test:** measure verified-fix time for a narrow CSS/token workflow.
7. **Enterprise trigger test:** record repeated requests for SSO, residency,
   private deployment, and provider choice.

## 7. Launch checklist

Cloud is not ready to charge until:

- [ ] CLI/Action upload works;
- [ ] hosted reports show images and findings;
- [ ] history is prominent and accurate;
- [ ] trends/dashboard work;
- [ ] bounded CI auto-explain is wired;
- [ ] CLI can spend Cloud credits;
- [ ] auth, organizations, roles, and magic-link viewers work;
- [ ] Paddle webhook works in sandbox;
- [ ] included-credit reconciliation is correct;
- [ ] tenant, storage, deletion, and hosted injection suites pass;
- [ ] provider retention posture is documented;
- [x] backup restore is rehearsed — 2026-08-14 against a test database, and on
  **2026-08-15 against production**: the real Neon database dumped, encrypted,
  restored into a scratch cluster and compared table by table, 32 tables
  (`FinishedSPEC.md` §3k).
  **This is rehearsed, not scheduled:** the nightly schedule is deferred to the
  first paying organization (2026-08-15). Until then production is covered by
  hand backups — `npm run backup`, which needs the direct Neon URL and the
  backup key. **This box does not go green on the rehearsal alone.** Launch
  means paying customers, and by then the schedule must be on: see Pathway 1
  item 10 for the switch-on checklist;
- [x] **`next` is on 16, taken as its own dedicated change** — **done
  2026-08-21** at `16.3.1` (`FinishedSPEC.md` §3z). `npm audit` is **0** and
  `security/audit-allowlist.json` is empty. Uploaded artifacts still must not
  use `next/image` (§10.5 3A) — that rule is now `test/reportPage.test.mjs` R8
  rather than a sentence inside the allowlist entry that the upgrade deleted.
  **Left open on purpose:** `middleware.ts` is deprecated in favour of
  `proxy.ts`, which always runs on Node, so that rename is a runtime move and
  its own decision;
- [ ] pricing is recalibrated after artifacts ship;
- [ ] refund policy and runbook exist;
- [ ] a real demo uses real historical Normascope data;
- [ ] the operator surfaces have had a design pass — one shell and one
  navigation across `/admin/*`, and a control that is currently irrelevant says
  so rather than vanishing. Built beside their controls rather than designed;
  cheap to leave until there is a second operator or an incident to work
  through. See Pathway 5.
- [ ] provider dollars are reserved before calls and settled idempotently;
- [ ] hard maximum COGS per model/pass is below its credit revenue floor;
- [ ] global, organization, and agent-key budget races are tested;
- [ ] duplicate batch collection and duplicate refunds are harmless;
- [ ] subscription, pack, goodwill, payment, refund, storage, and provider
  costs reconcile separately;
- [ ] provider account balance and 50/75/90/100% spend alerts are operational;
- [ ] circuit-breaker reset requires an audited human action.
- [ ] first-run data-flow disclosure and pre-upload manifest exist;
- [ ] user, run, repository, and organization deletion are self-serve and
  verified against storage;
- [ ] screenshot and DOM redaction controls are tested;
- [ ] free `check`/`compare` never upload implicitly;
- [ ] the CLI-to-Cloud upload flow is documented for both local use and CI.

## 8. Rule for new features

Before implementation, record:

1. Which paid loop does this strengthen?
2. Does it require stored state, a key we hold, or another person/workflow?
3. What is the smallest implementation that proves demand?
4. How will usage, retention, or verified-fix value be measured?
5. What security, privacy, storage, and COGS changes does it create?
6. What is the completion gate?

If question 2 is “no,” classify the work as free-CLI marketing spend and attach
an adoption metric. If “yes,” implement it in Cloud with tenant isolation,
metering, deletion, and reconciliation in its definition of done.

## 9. Final sequence

1. Pass the public website and waitlist demand-test gate; publish
   `normascope.com` with honest Cloud-coming-soon copy.
2. Complete Pathway 1: substrate, provider-budget safety, reconciliation,
   payment plumbing, retention, deletion, backups, and operational alerts.
3. Ship upload and crop-grounded explain.
4. Build the hosted report with visible history and sharing.
5. Add trends and wire automatic PR explanations.
6. Deploy the real Cloud infrastructure privately/under a preview URL.
7. Finish auth, organizations, designers, dashboards, and plan configuration.
8. Connect Paddle and pass all launch gates.
9. Switch `normascope.com` to Cloud-first positioning, retire the waitlist,
   open login/register and paid onboarding, notify qualified waitlist users, and
   validate the $59 entry plan with the first customers.
10. Add repository/fair-use and higher-plan expansion from observed demand.
11. Add contracts, bounded journey evidence, verified repair proposals, and
    enterprise controls when demand justifies them.

First make Cloud visibly better. Then make it habitual. Then make its
accumulated history operationally indispensable.

## 10. AI implementation handbook

This section is written for Claude Code, Codex, or another implementation
agent working across the two repositories. It is intentionally concrete. An
agent must inspect the current code before editing, preserve the contracts
below, implement one pathway at a time, and stop at the stated gate.

### 10.1 Repository map: what exists today

#### Argus: public CLI, Action, and MCP

The main CLI entry point is `Argus/src/index.ts`. Commands are implemented as
separate modules:

| Responsibility | Existing files |
|---|---|
| Command dispatch/help | `src/index.ts` |
| Config/schema parsing | `src/config.ts` |
| Capture | `src/auto.ts`, `src/browser.ts` |
| Compare and summary | `src/compare.ts`, `src/summary.ts` |
| Reports | `src/report.ts` |
| BYO explain | `src/explain/command.ts`, `src/explain/assemble.ts`, `src/explain/client.ts` |
| Security scanner/context | `src/explain/scanner.ts`, `src/explain/context.ts`, `src/explain/codepointers.ts` |
| Action | `action.yml` |
| MCP | `packages/normascope-mcp/src/server.ts` |
| CLI tests | `test/*.test.mjs` |

The CLI currently has no `upload`, `cloud login`, or `cloud status` command.
`src/index.ts` is the command seam. `src/compare.ts` already holds the full
`ComponentResult`, including significant-region coordinates, but the published
`summary.json` is intentionally flatter. Do not widen the published schema just
to carry upload-only fields; create a versioned upload sidecar.

`src/report.ts` already generates the trusted visual triptych, lightbox,
synced tall-image panes, escaped findings, and size-aware thumbnails. Reuse
its behavior and CSS decisions in Cloud; do not build a second visual design
from memory.

#### argus-cloud: private backend and web surface

| Responsibility | Existing files |
|---|---|
| Database/migrations | `src/db.ts`, `migrations/001`–`007` |
| Credits | `src/ledger.ts` |
| Usage/costs | `src/usage.ts` |
| Result cache | `src/resultCache.ts` |
| Hosted explain | `src/explainService.ts`, `web/lib/provider.ts` |
| History enrichment | `src/enrichment.ts` |
| CI batch explain | `src/ciBatch.ts`, `web/app/api/ci-explain/route.ts` |
| Keys/auth primitive | `src/apiKeys.ts`, `web/lib/auth.ts` |
| Reconciliation | `src/reconcile.ts` |
| MoR handler | `src/webhooks.ts` |
| Upload route | `web/app/api/upload/route.ts` |
| Explain route | `web/app/api/explain/route.ts` |
| Share route | `web/app/api/share/route.ts` |
| Current report page | `web/app/r/[runId]/page.tsx` |
| Current explain UI | `web/app/r/[runId]/explain-panel.tsx` |
| Cloud tests | `test/metering.test.mjs`, `test/enrichment.test.mjs`, `test/cibatch.test.mjs` |

The current upload route stores summary JSON and frame statistics. It does not
yet implement artifact declaration, presigned storage, entitlement checks,
quota reservations, or commit verification. The current report page reads
summary/frame/finding rows and does not yet render uploaded build/reference/diff
images. Treat this as the baseline, not as completed Cloud functionality.

### 10.2 Instructions every implementation agent must follow

Before changing code:

1. Read `CLAUDE.md`, `FUTURENORMA.md`, `PATHWAYS.md`, and the relevant Build
   spec for the pathway.
2. Run the existing tests in the repository being changed.
3. Inspect the current implementation and its callers; do not trust a plan
   document over code.
4. Write a short implementation note identifying files, data flow, security
   boundaries, and tests before making a large change.
5. Keep the free CLI local-first. Never add paid logic, pricing, provider keys,
   or Cloud entitlement decisions to the published CLI package.
6. Keep all new Cloud data organization-scoped and deletion-aware.
7. Preserve never-throw/non-blocking behavior in the CLI and Action. Cloud
   failure, credit exhaustion, or missing upload credentials must not redden a
   visual comparison job.
8. Treat screenshots, DOM text, uploaded HTML, code excerpts, provider output,
   and user-controlled labels as untrusted.
9. Add a test before or alongside every new security or accounting rule.
10. Do not mark a pathway complete because TypeScript compiles. Run its gate.
11. Do not start the next pathway until the current gate ledger row is
    `Verified`.
12. If a test cannot run, mark the pathway `Blocked` and stop downstream work.

At the end of each pathway, report:

- files changed;
- migration added, if any;
- tests run and their output;
- security/accounting assumptions;
- known open risks;
- exact next pathway.

Use this handoff format:

    Pathway: 2 — Artifact pipeline
    Status: Verified | Blocked
    Implementation: files, migration, interfaces
    Tests: exact commands and pass/fail output
    Security/accounting: checks and evidence
    Manual/external checks: deployment/provider/account status
    Open risks: named risks only
    Next allowed pathway: 3 — Hosted report

The agent must not claim `Verified` if any required line is missing.

### 10.3 Pathway 1 implementation: substrate and launch blockers

#### 1A. Make migrations safe

**Current seam:** `argus-cloud/src/db.ts:migrate()` discovers SQL files and
executes them. The web database initialization currently calls migration from
the runtime path.

Instructions:

1. Keep migration files append-only and numerically ordered.
2. Add a database-level advisory lock around migration discovery/execution, or
   move migration to an explicit deployment command.
3. Make each migration idempotent where practical; never silently mutate an
   already-applied migration.
4. Test 20 concurrent cold starts against one database.
5. Test an older application bundle starting against a newer schema.

Do not put application data backfills into a cold-start migration. If a
backfill is needed, create a resumable job with progress and retry state.

#### 1B. Fix reconciliation before selling credits

**Current seam:** `src/reconcile.ts` reads usage events and revenue grants.
The known bug counts allotment-funded usage against pack revenue only.

Instructions:

1. Define the accounting report explicitly: subscription contribution,
   pack-funded contribution, goodwill cost, provider COGS, storage cost, and
   payment fees.
2. Add a grant/revenue reference to usage consumption if the current ledger
   does not expose which grant funded the charge.
3. Keep the customer-facing credit ledger separate from internal margin
   attribution.
4. Reconcile plan allotment usage against the subscription period, not zero
   pack revenue.
5. Ensure refunds and failed analyses reverse usage attribution correctly.
6. Add a seeded month containing monthly allowance, pack credits, goodwill,
   cache hits, failed calls, and deep calls.

The report must be deterministic from append-only usage/grant records. Do not
fix the alert by merely raising the threshold.

#### 1B.1 Reserve provider dollars before every call

The current circuit breaker records actual spend after a provider call. That is
not a hard cap: concurrent requests can all pass the check before any one of
them trips it. Replace post-factum protection with a reservation/settlement
protocol.

Add a provider-budget service, preferably in `src/breaker.ts` or a dedicated
`src/providerBudget.ts`, with operations equivalent to:

    reserveProviderBudget(scope, reservationId, maximumCost, expiresAt)
    settleProviderBudget(reservationId, actualCost)
    releaseProviderBudget(reservationId)

The scope must support at least global UTC day and organization billing month;
agent-key scope should be available where the request is machine-generated.
Reservations must be atomic in the database. A process-local counter is not
enough for serverless concurrency.

Before calling a provider:

1. Resolve a verified model price; unknown models fail closed.
2. Calculate maximum possible input/output/image/cache cost from fixed caps.
3. Atomically reserve that maximum against global and org budgets.
4. Refuse the call if either reservation cannot be made.
5. Call the provider with the same or tighter token/image caps.
6. Settle using actual usage and release the difference.
7. On error/refusal/schema failure, release the full reservation.

The reservation must have an expiry and a sweeper. An abandoned worker must not
leave spend permanently reserved, and an expired reservation must not become a
permission to spend.

#### 1B.2 Price credit classes from hard maximums

The measured blended COGS is for pricing analysis, not authorization. Derive a
hard maximum per operation from the actual Argus caps in
`Argus/src/explain/assemble.ts` and `Argus/src/explain/command.ts`.

For each model and pass, record:

- maximum input tokens;
- maximum output tokens;
- maximum image/crop tokens;
- cache-write/read assumptions;
- batch discount, if applicable;
- maximum provider cost;
- credits required;
- resulting gross margin after payment fees.

No operation may be sold below its hard maximum cost. Reduce the payload cap,
use another model, or charge more credits — never retain a friendly credit price
while accepting a known hard-cost loss, and never close the gap by lowering the
revenue floor.

> **Settled 2026-08-10: credit prices are derived, not chosen.** Rather than
> checking a fixed price against cost, `src/providerBudget.ts` computes the
> credits an operation must charge for its worst case to clear a stated margin
> floor, and the suite fails if any operation would earn less. The earlier
> wording here — "if a standard analysis cannot fit within one credit… if deep
> cannot fit within three" — assumed 1 and 3 credits as fixtures. They were
> chosen against *measured* cost and lost money at the ceiling; analysis is now
> 5 credits and deep 8. See `FUTURENORMA.md` §3 and `FinishedSPEC.md` §3e.

Add a calibration fixture for the largest allowed payload and a test asserting
that every sellable operation satisfies the configured margin floor.

#### 1B.3 Make settlement and refunds idempotent

The current credit refund path must not be callable twice for the same provider
attempt. Add a reservation/settlement identity with a state transition such as:

    reserved → charged
    reserved → refunded

Only one terminal transition is valid. Store the reservation ID on usage and
refund records, enforce uniqueness in the database, and make retries return the
existing outcome rather than applying credits again.

Apply the same rule to CI batches. A collector must claim a pending batch with
an atomic status transition or row lock before processing entries. A second
collector must observe the claimed/collected state and do nothing.

Test provider timeout plus worker retry, duplicate webhook, duplicate batch
collector, duplicate refund, and database failure during settlement.

#### 1C. Add rate limiting and operational controls

**Current seam:** `src/apiKeys.ts` stores `rate_per_minute`, but the value is
not currently enforced by a request path.

Instructions:

1. Add an atomic per-key request counter/window or a database-backed limiter.
2. Apply it before upload declaration, hosted explain, and CI batch enqueue.
3. Return a stable, non-sensitive error with retry timing.
4. Keep limits org/key scoped; never use a process-local counter as the only
   protection in serverless deployment.
5. Add admin visibility for rejected requests and unusual upload volume.

Test concurrent requests against one key and confirm another organization is
not affected.

Add budget alerts at 50%, 75%, 90%, and 100% for global and organization
budgets. A 100% breaker trip must pause explain, require an audited manual
reset, and leave uploads, stored reports, local comparisons, and CI green.
Provider account balance thresholds should also alert before the external
provider balance becomes the limiting failure.

#### 1D. Add storage/deletion primitives

Create a storage port with `put`, `presignPut`, `presignGet`, `head`, `delete`,
and `deletePrefix`. Implement a filesystem driver for tests/local development
and an S3/R2 driver for deployment. Files above the port must not import an S3
SDK type.

Add a resumable deletion job. A successful organization deletion must remove
database rows and the organization storage prefix. Test retries, partial
failure, and idempotency.

**Pathway 1 gate:** `npm test`, `npm run build:web`, migration race test,
reconciliation fixture, hard-cost calibration, provider-budget reservation race,
idempotent settlement/refund test, duplicate batch-collector test, limiter
concurrency test, alert/breaker test, and storage deletion test all pass. No
payment/accounting/tenant/provider-spend risk is silently downgraded.

### 10.4 Pathway 2 implementation: CLI upload and artifact storage

#### 2A. Add the public CLI upload module

Add `Argus/src/upload.ts` and wire it from `Argus/src/index.ts`. Keep the
command opt-in and never-throw.

Input files:

- `.bridge/reports/summary.json`;
- `.bridge/screenshots/<frame>`;
- `.bridge/design/<frame>` or `.bridge/baseline/<frame>`;
- `.bridge/diff/<frame>-diff.png`;
- upload-only region sidecar derived from the comparison result or report data.

Implementation sequence:

1. Load and validate summary JSON.
2. Resolve every path with containment checks under the project directory.
3. Select frames according to `none|flagged|all|metadata-only`.
4. Produce an upload manifest containing repo, commit, branch, frame, artifact
   kind, byte length, SHA-256, dimensions, and region coordinates.
5. `POST` the manifest and summary to Cloud using `NORMASCOPE_CLOUD_URL` and
   `NORMASCOPE_ORG_KEY`.
6. Receive presigned PUT URLs and upload bytes directly.
7. `POST` a commit/finalize request.
8. Print the hosted report URL if successful.
9. On missing credentials, entitlement refusal, or Cloud failure, print an
   actionable message and exit 0 unless the user explicitly requested strict
   upload behavior in a future flag.

Do not add provider keys, pack prices, plan names, or credit consumption logic
to `Argus/src`. The server owns entitlement and billing.

Add a shared HTTP helper with timeouts, bounded response bodies, redacted
errors, and no logging of API keys or presigned URLs.

#### 2B. Add upload configuration without changing free behavior

Extend `NormaConfig` only with Cloud connection/upload preferences, never with
secret values. Candidate shape:

    "cloud": {
      "enabled": true,
      "upload": "flagged",
      "autoExplain": { "enabled": true, "maxFramesPerRun": 5 }
    }

`check`, `compare`, `auto`, and the pre-commit hook must not upload merely
because this block exists. Upload occurs only from `upload` or an explicit
Action step. Add config parsing tests for unknown/invalid upload modes.

#### 2C. Add the Cloud declaration/transfer/commit protocol

Extend `web/app/api/upload/route.ts` or split it into a small route plus service.
Keep route parsing thin; put business rules in a testable service.

Declare:

1. authenticate key;
2. resolve org and current plan;
3. reject free/lapsed upload entitlement;
4. validate repo/fair-use/storage quotas;
5. validate artifact manifest and size caps;
6. reserve bytes transactionally;
7. insert `pending` run/artifact rows;
8. issue presigned PUTs with signed content length, short TTL, and nonce.

Transfer is direct to storage. Commit must HEAD every object, compare actual
length and SHA-256, mark artifacts committed, release reservations, and only
then make the run visible. A sweeper must delete pending uploads older than
the configured timeout and release reservations.

Add `run_artifacts` and `org_storage` in a new append-only migration if they are
not already present. Keep object keys inside `org/<orgId>/blob/<sha256>`. Do not
deduplicate across organizations.

#### 2D. Artifact and privacy tests

Add tests for:

- traversal/absolute path refusal;
- missing file and corrupted hash;
- free/lapsed plan refusal before presigning;
- org B presenting org A run/key IDs;
- content-length mismatch;
- expired/replayed presigned commit;
- abandoned upload cleanup;
- duplicate blob reuse within one org;
- clean default upload selecting thumbnails/metadata only;
- secret in DOM/code context blocked before provider call.

**Pathway 2 gate:** Argus build/package tests plus Cloud tests pass; a real
fixture uploads one compared and one skipped frame, and the hosted run is not
visible until commit verification succeeds.

### 10.5 Pathway 3 implementation: hosted report and share surface

#### 3A. Reuse the Argus report contract

The hosted page is `web/app/r/[runId]/page.tsx`. Keep its data access
organization/session scoped. Add a report view model that resolves artifact
references to short-lived authorized GET URLs. Do not expose object keys or
permanent public URLs to the browser.

> **Render those URLs with a plain `<img>`. Never `next/image`.** Decided by
> Harsha on 2026-08-19, before this pathway starts, so it is settled rather than
> discovered late.
>
> `next/image` puts `sharp` in the request path, and
> `security/audit-allowlist.json` accepts three high-severity libvips advisories
> in `sharp` **on the recorded ground that we do not serve user-uploaded images
> through the optimiser**. Those advisories need attacker-chosen image bytes to
> matter, and an uploaded screenshot is exactly that: a customer, or anyone
> holding their upload key, can craft a malformed PNG. Routing artifacts through
> the optimiser would feed hostile input straight into `sharp` on Vercel *and*
> silently make the allowlist's stated reason false.
>
> Three reasons this way round: customer bytes stay out of `sharp`, it matches
> the storage design already in place (short-TTL presigned GETs direct from
> storage, never through our origin), and it avoids both a breaking Next 15→16
> major and per-image optimisation billing.
>
> `web/app/_components/Screenshot.tsx` is the precedent and its header explains
> the same trade for our own screenshots. Anything that would make the
> allowlist's sentence untrue re-opens that entry rather than quietly
> invalidating it.

Reuse visual behavior from `Argus/src/report.ts`:

- three panes for build/reference/diff;
- natural-size scrolling for tall captures;
- synchronized panes;
- viewport-bounded lightbox;
- escaped findings and labels.

Add history furniture above the AI finding: first drift, recurrence, trend
strip, prior-run delta, and prior-finding recall. If artifacts are absent,
render the existing numbers-only fallback without broken-image icons.

#### 3B. Finish sharing safely

The share API is `web/app/api/share/route.ts`. Add UI to create, expire, revoke,
and copy links. A share-token viewer may see only one run and its authorized
artifacts; it must not receive an Explain button, API-key field, organization
list, or long-lived presigned URL.

Run the hosted E3 XSS corpus against frame labels, uploaded HTML, findings, and
share pages. Treat every uploaded/model string as hostile.

**Pathway 3 gate:** one real dogfood run renders all images, history, findings,
and a revocable share link; tenant and XSS tests pass.

### 10.6 Pathway 4 implementation: automatic CI explanations

The backend primitives already exist in `src/ciBatch.ts` and the route pair
`web/app/api/ci-explain/route.ts`. The missing work is the Action/CLI wiring.

Implement in this order:

1. Run ordinary compare and produce `summary.json`.
2. Upload according to repository mode.
3. POST the run ID and top flagged frames to `/api/ci-explain`.
4. Poll the batch status with bounded retries and a timeout.
5. Append the escaped one-line `prLine` to the existing sticky comment.
6. Keep the job green on 402/503/provider failure and write an honest warning.
7. Ensure reserved credits are refunded for failed/uncollected entries.

Extend `action.yml` with explicit Cloud inputs/secrets. Do not make Cloud
upload implicit for existing Action users. Preserve the current report artifact
as a local GitHub artifact even when Cloud upload is enabled.

Test top-N caps, partial batch failure, polling timeout, duplicate collection,
credit refund, XSS in PR lines, missing Cloud credentials, and Cloud outage.

**Pathway 4 gate:** a fixture PR receives one updated sticky comment containing
the hosted report URL and bounded findings; CI remains green when credits are
exhausted.

### 10.7 Pathway 5 implementation: auth, plans, and customer control plane

#### 5A. Replace API-key-only browser access

`web/lib/auth.ts` currently resolves API keys. Keep that path for CI/API
requests, but add session authentication for humans. Implement provider OAuth
and magic links behind a small session interface. Store only hashed/session-safe
identifiers; never expose upload keys after creation.

Required roles are `admin`, `member`, and `designer`. Every server-side page and
route must derive `orgId` from the authenticated session/key and apply it to
every query. A caller-provided org ID is never authorization.

##### 5A.1 Identity and organization rules

Model a person and an organization separately:

```text
users ──< memberships >── orgs
  │                         │
  └── login_identities       ├── repos, runs, artifacts, storage
                              ├── credits, usage, subscription
                              └── api_keys
```

- One user may belong to many organizations, with one role per membership.
- One organization may have many users and shares one credit wallet and billing
  state across them.
- A solo customer gets a one-person organization; there is no second personal
  data path and no user-owned repository path.
- A GitHub OAuth identity and a verified email identity may link to the same
  user. Key GitHub identities by immutable provider subject, not username.
- A person who authenticates without membership or a valid invitation gets no
  customer data. Do not create an unrestricted free Cloud account at launch.
- Invitations are organization-scoped, expiring and single-use. Accepting one
  creates or activates the membership; having the same email domain alone does
  not.
- Organization creation is the paid/provisioned path. The first user becomes
  owner/admin. Later users are invited by an organization admin.

##### 5A.2 Sessions and active organizations

Use server-side sessions, not self-contained JWT authorization:

- The browser cookie contains only a random session token; store its hash.
- Store method, creation time, last seen time, expiry, revocation state, and
  hashed IP/user-agent metadata for the session list.
- Allow concurrent sessions on multiple browsers and devices.
- Show active sessions and support revoking one session or all sessions.
- Membership removal, session revocation and account deletion must be checked
  on every request and take effect without waiting for a JWT expiry.
- The selected organization is UI state only. Each request re-resolves the
  session's membership and role and scopes all queries to that organization.
- Rotate/renew active sessions, enforce an absolute expiry, use Secure,
  HttpOnly, SameSite cookies, and require recent authentication for destructive
  actions, billing changes, key management and organization deletion.

The browser session is not a CLI credential. CLI uploads, GitHub Actions and
agents use separately labelled, organization-scoped API keys. Keys are shown
once, hashed at rest, independently revocable, and should normally be separate
per pipeline or agent. A future CLI device flow may mint a key without exposing
the browser cookie; it is not part of this step's minimum surface.

##### 5A.3 Provider and abuse behavior

GitHub OAuth and magic links ship in the same Step 6 release, behind the same
session and membership interface. GitHub is the developer path; magic links
allow designers and PMs without GitHub accounts. **Passkeys (WebAuthn) are a
future additional method to pursue after the account surface is complete.**
Passkey registration must require an authenticated/recent session, credentials
must be listable and revocable from the account page, and magic links remain the
recovery path. Use a maintained WebAuthn library rather than implementing the
credential protocol and cryptography in-house. Magic-link requests must use
the Step 6 outbound-email budget: per-address cooldown, IP/subnet limits,
global concurrent-safe daily cap, generic responses, short-lived single-use
tokens, redacted auth events, and a challenge after repeated failures.

The endpoint must not reveal whether an address is registered. A forwarded link
must not become a reusable credential or grant access beyond the invited user's
memberships.

##### 5A.4 Required scenario tests

The session gate must cover at least these cases:

- a user belongs to two organizations and cannot read the other organization's
  runs after changing a URL or active-organization cookie;
- an invited designer can read permitted reports without a GitHub account;
- a GitHub developer and magic-link login for the same verified identity do not
  create two users or two seats;
- a signed-in user with no membership sees no organization data;
- two browsers and two machines may be signed in simultaneously;
- one session can be revoked without revoking the others, and “sign out all”
  invalidates every session;
- removing a membership blocks an existing session on its next request;
- a browser cookie cannot authenticate an upload/API request in a terminal;
- an API key from organization A cannot upload, commit, read, spend against,
  or export organization B's data;
- account deletion does not delete an organization the user does not own;
- organization deletion requires recent authentication and removes all tenant
  data and storage with a completion receipt;
- concurrent magic-link requests cannot exceed the global email budget across
  multiple Postgres-backed application processes.

**5A gate:** these probes pass against real Postgres, including concurrent
session revocation, membership removal, invitation consumption, and the
outbound-email budget. A per-process in-memory throttle is not evidence of a
global cap.

##### 5A.5 First-owner and organization onboarding

The paid onboarding sequence is deliberately explicit:

```text
Paddle checkout
  → verified subscription webhook
  → organization + plan + subscription state
  → pending owner claim tied to the checkout identity
  → owner authenticates with GitHub or magic link
  → owner claim is consumed atomically
  → owner/admin session opens the organization console
  → owner invites additional people
```

Rules:

- The webhook is the only automatic organization-provisioning path at launch.
  It must be idempotent on the processor's customer/subscription identity and
  must not create a second organization when the webhook is retried.
- The checkout email is an invitation/claim target, not proof of a browser
  session. Store the pending claim in a form that can be expired and consumed
  once; do not put a raw email or claim authority in a URL.
- A magic link may claim the pending owner only for the normalized checkout
  address. GitHub may claim it only after the provider returns a verified email
  matching that address. Do not match on GitHub username.
- If the purchaser's GitHub email and checkout email differ, do not silently
  attach the subscription to the GitHub account. Present a recovery/claim path
  that requires control of the checkout email or an audited operator action.
- The owner claim must be a conditional database update. Two tabs, two devices,
  or a retried callback must not create two owner users or two memberships.
- Provisioning failure after payment is an operational alert, not a second
  checkout. The operator console must show an unclaimed organization and allow
  safe retry of the claim email without duplicating the tenant.
- Until the claim is completed, the organization has no human console access.
  The payment webhook may grant the purchased plan and credits, but it must not
  issue a reusable browser session.

The database needs an explicit owner invariant. Add an owner reference on the
organization (or an equivalent constrained ownership record), require that the
owner also has an `admin` membership, and make owner transfer transactional:

```text
authenticate current owner
  → verify new owner is an active member/admin
  → require new owner acceptance
  → update owner and memberships atomically
  → audit old owner, new owner, actor and reason
```

There must always be one owner while an organization is active. Removing the
last admin or owner is refused; transfer ownership first. Organization
deletion is the exception and requires the owner-only, re-authenticated flow.

##### 5A.6 Invitations and membership lifecycle

An invitation is organization-scoped and has its own state machine:

```text
pending → accepted
pending → revoked
pending → expired
```

Implementation rules:

- Store a hash of the invitation token, never the token itself.
- Tokens are single-use, short-lived, and consumed with a conditional update.
- An admin can resend an invite; resending revokes the prior token and creates
  one replacement, so multiple live links cannot exist for one invitation.
- Inviting the same normalized address twice updates or reuses the existing
  pending invitation rather than creating duplicate membership rows.
- Accepting an invitation is allowed only after authenticating as the invited
  identity. A matching email domain is not sufficient.
- If the person already has a user account, acceptance adds a membership to
  that user. If not, the provider login creates the user and then the
  membership, in one transaction.
- An invitation cannot grant access to an organization other than the one in
  its server-side row. It cannot grant owner status, billing access beyond the
  assigned role, or access to another user's organizations.
- Removing a member revokes their membership immediately and invalidates their
  organization access on the next request. It does not delete their personal
  account or memberships in other organizations.
- A user may hold only one membership per organization. Role changes are
  audited and take effect on the next authorization check.
- The invitation UI must show organization name, inviter display name, role,
  expiry, and the email/identity being invited without exposing other members.

Email identity handling must be conservative: trim surrounding whitespace,
lowercase the domain, apply one shared normalization function everywhere, and
never apply provider-specific transformations such as Gmail dot removal or
plus-tag stripping unless that policy is explicitly adopted. Keep the raw
address only where delivery requires it; use keyed hashes for throttles and
redacted audit events.

##### 5A.7 Identity linking and recovery

`login_identities` is the authority for provider credentials. One user may have
both a GitHub subject and a verified email identity. Linking rules are:

- OAuth callbacks use state, PKCE where supported, exact registered redirect
  URIs, and a one-time callback exchange. Never accept an arbitrary return URL.
- A GitHub subject maps to exactly one user. A renamed GitHub account continues
  to work because the immutable provider subject is stored.
- A verified email identity maps to exactly one user. A magic link may create a
  user only in an allowed onboarding/invitation path; it must not create a
  free customer organization.
- Automatic account merging is forbidden. Matching email strings are evidence
  for a link/claim flow, not permission to merge two existing users silently.
- Adding a second identity requires an authenticated current session plus
  proof of the second identity. Record the link in the auth audit log.
- Removing the last identity is refused until another verified identity or a
  deliberate recovery path exists.

Recovery must not become hidden impersonation:

- A user who still controls either verified identity can add the other identity
  after recent authentication.
- A user who controls neither identity enters a support recovery flow with
  explicit evidence, expiry, operator identity, reason and audit record.
- Support operators do not receive the user's session or impersonate them by
  default. Break-glass content access is separate, scoped and audited.
- Organization owners must be able to transfer ownership before deleting or
  abandoning their personal account. The last owner cannot simply disappear.

##### 5A.8 Session lifecycle and browser behavior

The launch defaults below are implementation defaults, not provider behavior:

| Item | Launch default |
|---|---|
| Magic-link validity | 15 minutes, single-use |
| Idle browser timeout | 30 days since last activity |
| Absolute browser lifetime | 90 days, then re-authentication |
| Session renewal | Rotate the token during renewal; never extend past absolute expiry |
| Concurrent sessions | Allowed; one row per browser/device |
| Sign out | Revoke the current session |
| Sign out everywhere | Revoke every active session for the user |
| Membership removal | Deny access on the next request and revoke org sessions as practical |
| Destructive action re-authentication | Fresh proof within 15 minutes |

The account page must list sessions without storing or displaying raw IP
addresses: device/browser label, approximate last-seen time, sign-in method,
created time, current-session marker, and a revoke action. “Last active” is
diagnostic metadata, not authorization. A stale session must fail closed if the
row is expired or revoked.

Use `Secure`, `HttpOnly`, `SameSite=Lax` cookies, a narrow `Path`, and a
production-only `__Host-` prefix where deployment permits. State-changing
browser requests must also validate the expected origin and use a CSRF defense;
SameSite alone is not the complete policy. Do not put session tokens, magic
tokens, email addresses, or organization IDs into analytics or ordinary logs.

Multiple tabs share a session. Organization switching in one tab must not
silently change another tab's data scope: every navigation and server request
must re-check the active organization, and stale pages must fail with a clear
organization-context response rather than showing the previous org's data.

##### 5A.9 Role and control rules

At launch, `owner` is an ownership invariant and `admin`, `member`, and
`designer` are membership roles:

| Action | Owner | Admin | Member | Designer |
|---|---:|---:|---:|---:|
| Read permitted reports, runs and trends | yes | yes | yes | yes |
| Use permitted hosted explain | yes | yes | policy | policy |
| Invite/remove members | yes | yes | no | no |
| Change member roles | yes | yes | no | no |
| Create/revoke upload or agent keys | yes | yes | no | no |
| View usage and credit ledger | yes | yes | permitted read | permitted read |
| Change billing/payment settings | yes | yes, recent auth | no | no |
| Transfer ownership | yes, acceptance required | no | no | no |
| Delete organization | yes, recent auth | no | no | no |
| Delete personal account | yes | yes | yes | yes |

“Permitted” explain access is an organization policy checked by the server;
the role table is not a client-side hiding mechanism. Navigation may hide
unavailable controls, but direct requests must receive the same authorization
decision.

##### 5A.10 API keys and machine access

API keys are organization credentials, not user login sessions:

- Keep `upload` and `agent` kinds separate. An upload key cannot silently gain
  hosted-explain authority.
- Show each key once, store only a hash, display its label and created time, and
  record creator/last-used metadata where available.
- Let admins revoke keys independently. Revocation must be checked on every
  request, without a cache that extends the key's life.
- Prefer one key per CI pipeline, repository integration or agent. Never put a
  browser session token in a shell profile or CI secret.
- Key usage is attributed to the organization and, when available, the key and
  creator metadata. It is not attributed to a human merely because that human
  created the key.
- A key from organization A must fail closed for every organization B upload,
  commit, report, trend, export, storage reservation and credit operation.
- If a user leaves an organization, decide key behavior by ownership: shared
  organization keys remain until an admin revokes them; personal/creator
  metadata is retained only for audit and does not grant access.

##### 5A.11 Privacy, audit and operational safeguards

Authentication data is personal data and needs its own retention policy:

- Keep only the email data required for identity, delivery, billing linkage or
  legal/security obligations.
- Store token hashes, keyed address/IP hashes and redacted auth events rather
  than bearer tokens or raw abuse subjects.
- Sweep expired magic tokens, invitations and sessions; preserve only the
  minimum redacted audit evidence needed for abuse and security investigation.
- Auth events must record time, event kind, allowed/refused/failed outcome,
  reason, user when known, session when known, and redacted subject/IP hashes.
- Never log magic-link URLs, OAuth codes, cookies, API keys, raw email addresses
  in URLs, or customer content in ordinary auth logs.
- Alert on unusual sign-in volume, repeated failed links, new-country/device
  changes where the signal is available, invitation spikes, session-revoke
  spikes, and global email-budget usage.
- A provider outage must leave existing sessions usable where safe; it must not
  silently fall back to an insecure login path.
- If the global email budget is exhausted, login requests receive a truthful
  paused message while existing sessions and GitHub OAuth continue if healthy.

##### 5A.12 Development and release gate

Before Step 6 is called complete, run the following against real Postgres and
the deployed preview shape:

- payment webhook retry creates one organization, one pending owner claim and
  one credit grant;
- owner claim is atomic across two devices and two provider methods;
- a solo paying user can sign in and use a one-person organization;
- an admin can invite a GitHub developer and a non-GitHub designer;
- pending, accepted, revoked and expired invitations behave as specified;
- one user can switch between two organizations without cross-tenant reads;
- an uninvited authenticated user sees no organization data;
- all role rows are tested at both UI and direct-route/API level;
- concurrent sessions, renewal, expiry, individual revoke and global revoke
  behave correctly;
- membership removal and owner transfer take effect without stale access;
- personal deletion and organization deletion have separate scopes and receipts;
- API keys remain independent of browser sessions and cannot cross tenants;
- OAuth state/PKCE, CSRF, redirect validation, token replay and account-linking
  races are covered;
- magic-link per-address, IP, subnet and global budgets hold across processes;
- expired auth rows are swept without deleting required audit evidence;
- operator break-glass and every destructive auth/org action are audited.

No checklist item passes from a single green unit test: concurrency and tenant
isolation require multi-process probes against the shared database, and a
naive implementation must be run through the same harness to prove the test
would catch the failure.

##### 5A.13 Threat model and defense-in-depth invariants

The session layer is only one boundary. The following rules apply to every
customer page, server action, route handler, export, presigned object URL and
background job.

**Authorization must be deny-by-default.** A request needs all of the following:

```text
valid credential
  → active user/session or live API key
  → active membership/key organization
  → current subscription/entitlement where required
  → resource belongs to that organization
  → role/policy permits this exact action
  → audit event for sensitive actions
```

Never use any one of these as a substitute for the others:

- a valid session is not access to every organization;
- membership is not access to every resource or action;
- an organization ID in a URL, form, cookie or JSON body is not authorization;
- an API key's existence is not permission to upload if the organization is not
  entitled;
- a share token is not membership and must remain limited to its one authorized
  run and explicitly permitted report surface;
- a payment event is not a browser session;
- a GitHub email string is not proof unless GitHub has verified that identity;
- a successful page render is not evidence that a later API or object request is
  authorized.

**One credential path skips proving the address, and it is fenced (2026-08-22).**
`POST /api/auth/dev-signin` mints an ordinary session for one configured address
with no emailed link, so the signed-in surface can be worked on locally without
fishing a URL out of a console. It is listed here rather than left as a
development detail because it is, by construction, the one route that issues a
credential without evidence — so the fence is part of the threat model:

- three conditions, all required — `NORMA_DEV_SIGNIN_EMAIL` is set, `NODE_ENV`
  is not `production`, and `VERCEL` is unset. **No default**, so it cannot
  arrive by omission;
- the route answers **404** when any condition fails, not 403 — a 403 confirms
  there is a bypass to look for;
- POST and same-origin, because it hands out a credential rather than revoking
  one;
- the session is not special: same `createSession`, same absolute and idle
  limits, same revocation on the next request;
- its own audit kind, `dev-signin`, so the log cannot read it as a consumed
  magic link.

The guard is a pure function in `web/lib/devSignIn.ts`; `test/auth.test.mjs` A13
evaluates it against every environment combination, with A13.7b showing the
naive `NODE_ENV`-only version open on a Vercel preview. No other address is
affected — every one of them goes through the abuse ladder, the challenge, the
email budget and the fifteen-minute single-use token.

Where practical, reinforce service checks with database constraints. At minimum,
tenant-crossing tests must cover composite relationships such as a run whose
`repo_id` belongs to another organization, a frame whose `run_id` is foreign,
an artifact whose object key is outside the organization prefix, a share whose
run is foreign, and usage/credit events attributed to the wrong org. If a
legacy schema cannot express a composite foreign key, keep the invariant in one
service and require a counter-test against an intentionally naive query.

**OAuth callback threats.** The GitHub flow must:

- generate a high-entropy state tied to a short-lived login attempt and the
  initiating browser;
- use exact registered redirect URIs and reject arbitrary `next` URLs;
- exchange the code once, server-side, and never put the provider code in a
  client-accessible response;
- request the minimum scopes; handle denied scopes and provider outages without
  falling back to an unsafe path;
- use GitHub's immutable subject as identity and fetch a verified email through
  the provider API, never trust a client-supplied login name or email;
- prevent callback replay and session fixation by creating a fresh session only
  after a successful one-time exchange;
- record allowed, refused and failed callbacks without logging the code, token,
  access token, raw email or full redirect URL.

**Magic-link and token leakage.** In addition to throttling and single-use
  redemption:

- consume the token server-side, then redirect to a clean URL with no token;
- set `Referrer-Policy: no-referrer` on the redemption and login surfaces;
- do not load third-party images, fonts, analytics or scripts on a token URL;
- prevent tokens from appearing in access logs, analytics, error reports,
  browser history where the platform allows, or support screenshots;
- bind the redeemed token to the intended login flow, but do not bind it to an
  IP address so ordinary mobile-network changes do not break legitimate login;
- return the same externally observable response shape for existing and
  nonexistent addresses, including timing as far as practical;
- enforce a per-invitation and per-organization invitation budget in addition
  to the global magic-link budget.

**Session fixation and browser boundaries.** On login, rotate to a new session
  identifier; never adopt a session identifier supplied by the browser or an
  OAuth `state` value. On privilege change, ownership transfer, email/identity
  linking, key creation, billing changes and deletion, require recent proof and
  rotate the session. Do not share the session cookie across unrelated hosts or
  subdomains. A session must not be accepted by an API route that expects a
  machine key, and an API key must not be placed in a browser cookie.

**Resource authorization.** Define and test the scope of every identifier:

| Resource | Minimum authorization |
|---|---|
| Organization console | active membership in that organization |
| Repository/run/frame/artifact | resource's organization plus role/policy |
| Presigned object GET | short-lived authorization for the exact object and org |
| Share link | valid share capability for one run; no org navigation |
| Export | same scope as the data being exported; bounded and audited |
| Hosted explain | resource access plus current organization entitlement and credits |
| API key management | owner/admin membership plus recent authentication |
| Billing and cancellation | owner/admin policy plus recent authentication |
| Organization deletion | owner only, recent authentication, typed confirmation |
| Operator break-glass | operator role, exact scope, reason, expiry and audit |

Do not let a report page authorize a later image request by implication. Every
presigned URL, download, export and API call repeats the relevant check. A
share viewer must not receive the organization name, breadcrumb or a link that
widens the share into repository history.

**Billing and provisioning races.** Treat payment webhooks as untrusted,
replayed input until signature and event identity are verified:

- verify the webhook signature before reading customer fields;
- record processor event IDs with a uniqueness constraint;
- make subscription, organization, owner-claim and credit-grant updates
  idempotent and transactional;
- do not grant credits twice if the webhook retries or events arrive out of
  order;
- do not revoke a tenant on a transient webhook failure;
- make past-due, lapsed, refunded and cancelled states explicit and test their
  effect on existing reports, uploads, explains and shares;
- never let a checkout email, customer ID or subscription ID supplied by a
  browser choose an organization without the verified webhook relationship.

**Audit evidence.** Authentication, membership, ownership, key, billing,
export, deletion, break-glass and abuse-control actions must produce structured
events with actor, organization, target, outcome, reason, timestamp and a
correlation/request ID. Logs must be redacted, access-controlled and append-only
from the application perspective. Audit rows must survive personal deletion
where legally/security-required, with the user reference nulled rather than
reintroducing identifying data. An audit event is evidence of an action, not a
permission to perform it.

**Abuse and denial-of-service behavior.** Rate limits must be scoped separately
for login requests, invitation sends, OAuth starts, callback failures, session
creation, key creation, uploads, exports and hosted explains. Each expensive or
externally visible action needs a global ceiling in shared storage, not an
in-memory counter per serverless instance. When a ceiling is reached:

- stop the expensive action before calling the provider or issuing a URL;
- return a generic, actionable response;
- preserve existing sessions and already-authorized read access where safe;
- alert the operator with scope, current usage, and reset time;
- make the pause reversible and audited;
- do not turn a failed login or exhausted email budget into an account
  enumeration signal.

**Secrets and recovery.** OAuth client secrets, Resend keys, session-hash keys,
token-hash keys and webhook secrets are deployment secrets, never database rows
or client configuration. Rotation must support overlap long enough to deploy
without invalidating every legitimate session unexpectedly, except during an
active compromise. A compromised session secret, provider key or API key needs
an operator runbook with scope, revocation, replacement, customer notice and
post-incident audit.

**Failure-mode rules.** Fail closed for unknown roles, missing memberships,
missing entitlement rows, invalid subscription states, expired sessions,
unverified identities, malformed webhook events and missing org scope. Do not
fall back to a global/demo organization, founder credentials, a caller-provided
email, or a client-side “logged in” flag. A provider outage may make login or
new claims unavailable, but it must not silently widen existing access.

**Security review scenarios.** Add an end-to-end probe for each of these before
release:

- attacker changes only `orgId`, `repoId`, `runId`, `frame`, export filters or
  object keys and receives no other tenant data;
- attacker replays an OAuth callback, magic link, invitation, share token,
  presigned URL or webhook and gets no second capability;
- attacker fixes a session before login, changes an active-org cookie, or opens
  a stale tab after switching organizations and gets no widened access;
- attacker uses a valid member session to call admin, billing, key, delete or
  operator routes directly;
- attacker submits a checkout/customer/subscription ID for another tenant;
- concurrent webhook, invite, claim, session-revoke, key-revoke and deletion
  requests leave one coherent final state;
- expired objects and auth rows cannot be retrieved from backups, exports,
  logs, caches or presigned URLs after their retention boundary;
- an operator can answer what happened, who acted, what was exposed, and how
  access was revoked without reading raw secrets.

##### 5A.14 The order the remaining console work is taken in

Sequencing only. It does not change 5A.1–5A.13, and it does not change
FUTURENORMA's canonical step order — Step 6 stays Step 6 and Paddle stays Step
7. Recorded 2026-08-22, at the point where the shell exists and five of the
seven areas hold nothing.

| # | Work | Why here |
|---|---|---|
| 1 | ~~**Organization area** — members, roles, invitations, API and agent keys~~ ✅ **done 2026-08-22** | The only remaining area whose whole data layer was already written (5A.6, 5A.10). It was also the one that unblocked the most of 5A.12's gate list: invitation states, membership removal taking effect on the next request, and key isolation across tenants. `FinishedSPEC.md` §3af |
| 2 | **Account page** — 5A.8's session list, with device label, method, last-seen, current-session marker and per-row revoke | Explicitly owed. The masthead menu *ends* sessions and deliberately does not *show* them, so the person cannot see what they are ending |
| 3 | **The refusal status decision** — FUTURENORMA §4 Open decisions 5 | It gets dearer with every page added, and items 1 and 2 add several |
| 4 | **Overview**, then **Explain and automation** | Read surfaces over data that already exists |
| 5 | **Privacy and data** | The deletion and retention primitives landed in Pathway 1 item 9; this is their door, plus the export and the completion receipt |
| 6 | **Billing and usage** | Last of the seven. Subscription state, invoices and the allowance-versus-packs split need Step 7's real Paddle data to show anything true, and a placeholder that invents a renewal date is worse than an area that says what is coming |

Two decisions inside item 1, taken here rather than left implicit:

- **Invitations and keys ship together, in one area.** `consoleIA.ts` already
  gives Organization both, and splitting them would mean two passes over the
  same guard, the same admin-only route policy and the same audit plumbing.
- **Every write is an admin-only route, checked on the route.** The navigation
  hiding a control is not the control. 5A.9's table is the authority, and the
  evidence for it is HTTP-level, in the shape `scripts/tenant-gate-check.mjs`
  already established: a member and a designer with valid sessions, refused; an
  admin of the same organization, served; an admin of *another* organization,
  refused; and isolation checked in both directions.

**Item 1's gate — met 2026-08-22.** Against real Postgres, over HTTP, on a
production build with `NORMA_DEV_OPEN=0`:

| Claimed | Where it is proven |
|---|---|
| an invitation is consumed exactly once under concurrency | O6.1–O6.2 in process, **O6r.2** across 10 real processes; O6b.1 shows the read-then-write version letting all 10 through |
| a resend leaves exactly one live token | the partial unique index plus `createInvitation`'s supersede-in-one-transaction, `auth` A5.6 |
| a member and a designer are refused every write | **G6.2, G6.3** — all seven, 403; watched answering 303 with the role check removed |
| an admin of B cannot touch A's invitation or key | **G6.6, G6.8**, holding the real row id; O3/O4 at the query level, O3b/O4b as counter-tests |
| a revoked key fails closed on the next request | **G6.9**, and O4.4 — `findApiKey` re-reads with no cache in front of it |
| a created key is shown once and is not retrievable | **G6.10–G6.12**: one `HttpOnly`, path-scoped cookie carries it, a later plain request for the page does not contain it, and the key it carried is a working credential |
| removing or demoting the last admin is refused | **G6.14** over HTTP; O2.4–O2.7 and **O2c** for the unclaimed-organization case where the last-admin rule is the only one that can fire |
| every membership change is audited | S12.11, and O8.14–O8.15 for the invitation's three outcomes |

Each guard was watched failing before it was believed (CLAUDE.md rule 3):
eleven deliberate source breaks against `cloudShell` S12, and three against a
rebuilt production server for the HTTP checks.

**What the gate does not cover, stated rather than implied:** delivery. The
gate script runs against a server with no mail transport, so G6.5b asserts the
console tells the truth about that — *"the invitation exists but the email did
not go out"* — rather than claiming a send. The message itself is O8, with an
injected mailer.

#### 5B. Make plans configuration-driven

Do not scatter `team` checks across routes. Add a plan entitlement object/service
covering upload, hosted reports, hosted explain, active repositories, daily
runs, artifacts/run, bytes/run, total storage, and retention. Each route asks
the service for an entitlement; the service owns the policy.

The launch policy is `free|team` until a plan ladder is approved. Keep
Growth/Team pricing as configuration and documentation, not a half-built billing
branch.

> **Changed 2026-08-15 (migration 019), by decision.** This read
> `free|team|lapsed`. `lapsed` moved to `subscription_status`, where the
> payment-failure section above already models it alongside `past_due` and
> `refunded` — neither of which a three-valued tier column could express.
> `plan` now means only what the organization bought; the status means what
> happened to it. Entitlement asks both.
>
> The duplicate was also doing no work: the `lapsed` row in `plan_limits`
> differed from `free` on one column that is read only after a gate both plans
> fail. And removing it closed a live gap — `subscription_status` was written by
> the webhook and read by nothing, so a lapsed organization kept uploading.

#### 5C. Add customer account and deletion UI

Add account pages for:

- subscription state, renewal, invoices, cancellation;
- monthly allowance versus purchased packs;
- usage events, cache hits, deep calls, and failed/no-charge calls;
- repositories, keys, members, and storage;
- delete run/repository/organization;
- export before deletion.

Organization deletion must require recent authentication, typed name, key
revocation, database cascade, storage-prefix deletion, retry-safe job status,
and a completion receipt. Personal deletion must not delete an organization
unless the user owns it.

**Pathway 5 gate:** browser session probes, role probes, deletion probes,
customer ledger checks, operator authorization probes, control-action audit
tests, responsive/accessibility checks for core workflows, and sandbox billing
provisioning pass.

#### 5D. Shared-wallet exhaustion tests

Before marking the control plane verified, run a multi-user fixture with at
least 30 logical users and concurrent requests. Confirm that:

1. local `check`/`compare` calls consume zero Cloud credits;
2. hosted explanations consume the shared organization balance exactly once;
3. one repository cannot consume another repository’s configured budget;
4. an agent key cannot exceed its monthly budget;
5. concurrent requests cannot drive the balance negative;
6. the 100%-exhausted response is stable and actionable;
7. hosted reports, history, trends, uploads within quota, and share links remain
   available after AI exhaustion;
8. automatic PR explanations are skipped and CI remains green;
9. no provider call occurs after the balance is exhausted;
10. renewal grants the next allowance exactly once;
11. purchased packs remain usable while the subscription is active;
12. lapsed subscriptions become read-only without deleting existing data.

Use the same fixture to test 100 logical users and a runaway agent loop. This
is a concurrency and accounting gate, not merely a UI test.

### 10.8 Pathway 6 implementation: trends and quality debt

`frame_stats` and `src/enrichment.ts` already provide the data foundation.
Implement the UI/API in this order:

1. Add an org-scoped runs/repositories query with pagination.
2. Add `GET /api/trends?repo&frame&limit` with a hard server-side cap.
3. Render aligned mismatch over commits, threshold, first-exceeded marker, and
   gaps for skipped rows.
4. Mark source/mode transitions so incompatible metrics are not silently
   plotted on one axis.
5. Add quality-debt records only after the basic chart agrees with enrichment.
6. Add recurrence, owner, due date, status, resolution commit, and prior finding.
7. Add organization-level summaries only from org-scoped queries.

Do not calculate first drift independently in multiple places. Extract or share
one deterministic query/service so `enrichment.ts`, trends, and quality debt
agree.

Test 40-run pagination, no-history empty state, skipped rows, mode transition,
threshold crossing, org B probing org A, and large `limit` values.

**Pathway 6 gate:** a months-deep dogfood repository renders an accurate trend,
first drift, recurrence, and quality-debt queue.

### 10.9 Pathway 7 implementation: quality contracts

Do not start with a broad design-token scanner in the free CLI. That would be
valuable but unchargeable under the capture test. Store contracts in Cloud and
evaluate uploaded evidence against them.

Start with one schema-versioned contract type:

- route/frame identifier;
- token/property name;
- expected value/range;
- allowed exception;
- owner;
- effective version;
- evidence and decision status.

Add migrations and org-scoped CRUD, then evaluate only the uploaded evidence
needed for that contract. Attach violations to runs/frame regions and retain
the history of accepted exceptions. Keep deterministic measurements separate
from AI hypotheses.

Test contract versioning, exception expiry, org isolation, route identity,
mode/source changes, and deletion cascade.

**Pathway 7 gate:** one contract can be traced from intent to evidence to commit
to human decision and later recurrence/resolution.

### 10.10 Pathway 8 implementation: bounded journey evidence

Reuse the existing capture safety boundary in `Argus/src/browser.ts` and the
MCP origin/path checks in `packages/normascope-mcp/src/security.ts`. Do not turn
this into a generic remote browser or test-runner service.

Implement one journey type first:

1. declared route and allowed origin;
2. bounded action list;
3. checkpoint screenshots;
4. focus/keyboard state;
5. console error summary;
6. deterministic pass/fail evidence;
7. optional hosted explanation after evidence exists.

Bound action count, duration, bytes, and captured states. Upload only explicit
checkpoints. Add SSRF, path, secret, tenant, and billing tests before adding
more actions.

**Pathway 8 gate:** navigation or form journey evidence enriches an existing
visual finding without introducing a general-purpose test-runner promise.

### 10.11 Pathway 9 implementation: verified repair

Keep repair proposals outside the deterministic gate and outside production
automation.

Implement:

1. finding evidence bundle with region, selector, code pointer, and confidence;
2. minimal patch proposal limited initially to CSS spacing/token/property values;
3. isolated worktree or branch generation;
4. local compare, existing tests, and relevant contract/journey checks;
5. before/after report with collateral-regression check;
6. normal human-reviewed PR;
7. accepted/edited/rejected/verified outcome recording.

Never execute model output as a command. Never auto-merge or change production.
Use the same secret scanning, escaping, and untrusted-output rules as explain.

**Pathway 9 gate:** record acceptance and verified-fix time for a real fixture;
do not expand beyond CSS/tokens until the repair loop demonstrably helps.

### 10.12 Pathway 10 implementation: enterprise controls

Build enterprise features only after a repeated demand signal. For each one,
create a provider/data-flow/security decision before code:

- SSO/SAML/SCIM: session and membership provisioning, deprovisioning tests;
- audit: append-only actor/action/resource records and export controls;
- retention/legal hold: policy precedence, deletion exceptions, sweep tests;
- private deployment: deployment recipe, secrets, backups, upgrade path;
- Bedrock/Vertex/Azure: provider adapter, schema/refusal/image tests,
  recalibration, data-flow disclosure;
- regional inference/storage: enforce region at routing and object layers;
- support/SLA: status, incident, and customer communication runbooks.

Do not add a provider by changing a model ID. Provider transport, structured
output, refusal signals, image format, caching economics, and security posture
must each be implemented and tested.

### 10.13 Required verification commands

For Argus changes:

    npm test
    npm run typecheck
    npm pack --dry-run

For argus-cloud backend changes:

    npm test
    npm run build

For Cloud web changes:

    npm run build:web
    npm run typecheck --workspace web

For storage, auth, billing, or hosted AI changes, also run the pathway-specific
tenant, deletion, XSS, secret-scan, accounting, and provider tests. A test that
cannot run because an account or provider is unavailable is an explicit open
risk, not a pass.

### 10.14 Definition of done for an AI implementation agent

An agent may mark a pathway complete only when:

- the current code was inspected and the planned files still match reality;
- migrations are append-only and applied in a fresh database test;
- the implementation preserves free CLI behavior;
- all new queries are org/session scoped;
- failure paths are non-blocking where specified;
- credits are reserved/refunded/metered exactly once;
- customer data can be deleted from rows and storage;
- user/model/upload content is escaped and treated as untrusted;
- pricing/COGS claims are recalibrated when payloads change;
- tests pass in both the normal and relevant failure paths;
- the final report names remaining open risks and the next pathway.
