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

> ⚠️ **Starter's 3 repositories is a hypothesis, and it conflicts with the
> operational line.** FUTURENORMA has carried a 10-repo fair-use figure since
> before the single-tier decision. If we operate at 10 and later publish a
> Starter of 3, every existing $59 customer loses seven repositories the day
> tiers launch — grandfathering costs revenue, not grandfathering costs trust.
>
> Two rules follow, and both bind this section:
>
> 1. **Do not quote a repository number to anyone** — pricing page, sales call,
>    or docs — until the launch figure is decided (FUTURENORMA §3, Open
>    Decisions #2).
> 2. **A published Starter must be no smaller than the fair-use line we were
>    already operating.** Raise Starter to meet it, or lower the line before
>    anyone relies on it. Never shrink an existing customer's allowance to make
>    a ladder look better.

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

- [ ] dependency and secret scanning in CI;
- [ ] tenant-isolation and authorization probes;
- [ ] stored-XSS and sandbox/CSP probes;
- [ ] prompt-injection and hostile-content suites;
- [ ] SSRF, redirect, DNS-rebinding, and capture containment suites;
- [ ] rate-limit, quota, concurrency, replay, and abuse tests;
- [ ] webhook signature, session, CSRF, and key-revocation tests;
- [ ] backup restore, retention, deletion, and incident-drill evidence;
- [ ] redacted audit logs and working operator alerts/kill switches;
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

#### What “Join early access” does

Every persistent **Join early access** action points to `/cloud#waitlist`:

1. The visitor lands on the public Cloud page and is taken to the waitlist
   form.
2. They submit an email address.
3. `POST /api/waitlist` validates and normalises the address.
4. Postgres stores one unique row in `waitlist`, including the signup source,
   referrer origin, and timestamp.
5. A repeat submission is deduplicated and does not inflate the count.
6. The visitor sees a confirmation: “You’re on the list.”
7. A genuinely new signup sends one notification to the configured owner
   inbox; notification failure must not lose the stored signup.

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

- [ ] every Join early access action lands on `/cloud#waitlist`;
- [ ] a new address round-trips into Postgres and produces the visitor
  confirmation;
- [ ] duplicate addresses remain one row;
- [ ] source, referrer origin, and timestamp are recorded;
- [ ] owner notification is configured and best-effort;
- [x] an admin-only count, list, and CSV export are available — `/admin/waitlist`,
  gated by `ADMIN_PASSWORD` (separate from the pitch phrase), verified
  2026-08-10; see FinishedSPEC.md §4a;
- [ ] the Cloud page describes private preview / future capabilities honestly;
- [ ] the site does not claim that visitors can log in, upload, subscribe, or
  use Cloud yet.
- [ ] the footer identifies Normascope as a product by Yutic;
- [ ] legal-facing copy states that Normascope is operated by Yutic, a sole
  proprietorship of Harsha Attray;
- [ ] the future Paddle seller/payment identity is documented and consistent
  with the proprietor information before billing is enabled.

Once live, measure interest using unique signups and signup rate by source,
not raw form submissions. Review the signal weekly before changing Cloud
priorities or pricing doctrine. The waitlist can justify advancing the next
Cloud pathway; it does not by itself prove willingness to pay.

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
counts, GitHub Action usage where available, documentation traffic, and the
waitlist. These are directional and must not be presented as unique-user
counts.

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

“Dashboard” means two separate products with different permissions, not one
unrestricted master screen.

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

1. Make migrations race-safe under concurrent serverless cold starts. (§10.3 1A)
2. Complete filesystem and S3/R2 storage drivers. (§10.3 1D)
3. Enforce real request rate limits for upload and agent keys. (§10.3 1C)
4. Reserve provider dollars before every call; settle, release, and refund
   idempotently. (§10.3 **1B.1** and **1B.3**)
5. Derive credit prices from each operation's hard maximum cost, so no operation
   can be sold below cost. (§10.3 **1B.2**)
6. Deliver budget alerts at 50%, 75%, 90% and 100%, with an audited manual reset
   for a tripped breaker. (§10.3 1C, second half)
7. Fix reconciliation so allotment and pack-funded usage are attributed
   correctly. (§10.3 1B)
8. Add the reachable MoR webhook route and Paddle signature adapter.
9. Add retention sweeps and deletion of database rows and storage blobs.
10. Add backups, restore rehearsal, and operational alerts.

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

### Pathway 2 — Build the artifact pipeline

**Goal:** ensure paid explain is stronger than free explain.

1. Add `npx norma-scope upload`.
2. Upload only on explicit user or CI opt-in.
3. Upload summary JSON plus bounded build/reference/diff artifacts.
4. Use direct presigned uploads; do not proxy large images through serverless.
5. Enforce entitlement and quota server-side on every request.
6. Deduplicate content-addressed artifacts within an organization.
7. Upload full artifacts for flagged frames and thumbnails for clean frames.
8. Secret-scan DOM and code context before provider submission.
9. Recalibrate after crops ship and reprice packs before billing.

**Tests:** containment, forged keys, free-plan refusal, quota isolation,
abandoned uploads, duplicate artifacts, crop grounding, secret scanning, COGS.

**Gate:** findings reference actual image regions and all pricing uses measured
post-crop COGS.

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

Implement:

- GitHub OAuth for developers;
- magic-link access for designers and PMs;
- organization creation, invitations, and roles;
- upload/agent key creation and revocation;
- credit balance separated into monthly allowance and purchased packs;
- usage history showing cache hits as free;
- subscription, invoices, renewal, cancellation, and refund paths;
- repository and seat list;
- internal admin view for margin, storage, spend, and breaker status.

**Gate:** session-layer tenant probes pass; a designer can read a report without
GitHub; an admin can explain every credit movement without support.

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
- [ ] backup restore is rehearsed;
- [ ] pricing is recalibrated after artifacts ship;
- [ ] refund policy and runbook exist;
- [ ] a real demo uses real historical Normascope data.
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
9. Enable paid Cloud for qualified waitlist users and validate the $59 entry
   plan with the first customers.
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

#### 5B. Make plans configuration-driven

Do not scatter `team` checks across routes. Add a plan entitlement object/service
covering upload, hosted reports, hosted explain, active repositories, daily
runs, artifacts/run, bytes/run, total storage, and retention. Each route asks
the service for an entitlement; the service owns the policy.

The launch policy remains `free|team|lapsed` until a plan ladder is approved.
Keep Growth/Team pricing as configuration and documentation, not a half-built
billing branch.

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
customer ledger checks, and sandbox billing provisioning pass.

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
