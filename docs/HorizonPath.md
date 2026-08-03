# HorizonPath.md — what to build next, in order

**Private.** The single sequencing document. Companion to `FinishedSPEC.md`
(what exists today, with evidence). Written 2026-08-03.

## What this document is, and what it is not

This is the **spine**: every step from here to launch and beyond, in order,
with what blocks what and what "done" means for each. It does not restate
executable detail that already exists elsewhere — it points at it:

| Layer | Document |
|---|---|
| Where we stand, with evidence | `FinishedSPEC.md` |
| Orientation, credentials, doctrine | `FUTURENORMA.md` |
| **Steps 1–5 executable spec** (phases F–J, test plans) | `BuildV5.md` |
| Steps 6–8 source specs | `BuildV3.5.md` Stage 4 items 4–8, `BuildV4.md` Phase E |
| Long-range strategy | `roadmapV1.md`, `BuildHorizons.md` |

Where this document and an older one conflict, **this one wins** — the older
docs predate the decisions in `FinishedSPEC.md` §8.

## The two rules that shape the order

1. **Local first; deploy when there is something worth showing.** Nothing in
   Steps 1–4 needs a domain, an account, or a credit card. Production
   infrastructure is Step 5, done once, against a product that already works.
2. **Nothing paid ships before the thing it charges for is visible.** The
   engine has been finished for weeks and has earned nothing, because no one can
   see it. Surface before billing.

---

## The whole path on one screen

| # | Step | Where | Blocked on | Done when |
|---|---|---|---|---|
| 0 | Loose ends | Argus | — | Tag pushed, registry listed |
| 1 | Build substrate | argus-cloud | — | Builds on Vercel; migrations race-safe; storage port has two drivers |
| 2 | Artifact pipeline | both | 1 | `npx norma-scope upload` ships; hosted explain is crop-grounded; re-calibrated |
| 3 | The report page | argus-cloud | 2 | Images, findings, history visible; share UI |
| 4 | Trends | argus-cloud | 2 | Repo view + frame trend chart |
| 5 | Go live | argus-cloud | 1–4 | Own DB, storage, URL; lab deleted; G suite green on real R2 |
| 6 | Auth + orgs | argus-cloud | 5 | GitHub OAuth, magic links, key management |
| 7 | Paddle | argus-cloud | 5, 6 | Sandbox loop green; org provisioned by webhook |
| 8 | Launch gates | both | 7 | E1, E6, legal pages, trademark, refund runbook |
| 9 | First customers | — | 8 | Revenue |
| 10+ | Horizons | as needed | 9 | Demand-gated, individually |

**Steps 1–4 are roughly the whole of the remaining product work.** Steps 5–8
are infrastructure, plumbing, and paperwork.

---

## Step 0 — Loose ends (an hour, do it first)

Small, unblocked, and each one is a papercut that compounds.

1. **`git push origin v0.7.1`** — the tag exists locally and not on the remote.
2. **List `normascope-mcp` in an agent-tool registry** — the last outstanding
   Build 3.5 Stage 3 gate item.
3. **`doctor` reports explain readiness** — mode, key, optional SDK present.
   Today the first time a user learns they are missing a piece is the moment
   they wanted an answer.

Deliberately *not* here: `sourceType()` returning `"figma"` for baseline-only
configs. It is guarded at all four call sites, and fixing it properly ripples
into the published JSON Schema. Do it before a fourth adapter lands, not now.
(FUTURENORMA §5 item 6 has the full analysis.)

---

## Step 1 — Build substrate → `BuildV5.md` Phase F

**No accounts, no domain, no cost.** Three things:

- **F1** — make the monorepo build. `web/package.json` declares
  `"argus-cloud": "file:.."`, so a Vercel project rooted at `web/` cannot see
  its own dependency. Root at the repo root; build both. Prove it with **one
  free Vercel preview deploy** — no domain, no DNS — because discovering this
  after Steps 2–4 would be miserable.
- **F2** — stop `migrate()` running on cold start. N concurrent cold starts
  currently race N migration runs. Advisory lock.
- **F3** — one `Storage` port, two drivers: filesystem now, S3/R2 at Step 5.
  Nothing above the port may import an S3 type. **This is what keeps Step 5 a
  config change rather than a rewrite.**

**Gate:** everything after this runs entirely offline.

---

## Step 2 — Artifact pipeline → `BuildV5.md` Phase G

The largest quality win available, and the fix for the paid explain being
weaker than the free one.

- **G1** — `npx norma-scope upload` in the CLI. It does not exist today, despite the web
  home page telling users to run it. Opt-in, never-throw, never automatic.
  Region coordinates ride in the upload body, **not** the published JSON Schema.
- **G2** — presigned direct-to-R2, three-phase: declare → transfer →
  commit-verify. Content-addressed blobs inside the org prefix.
- **G2b/G2c** — abuse controls and the **paid-entitlement rule**. Free plans
  cannot upload anything: no key, no presigned URL, no bypass flag, checked on
  every request. There is no trial, so there is no unpaid party with an upload
  key.
- **G3** — crop-grounded hosted explain. Delete the metadata hedge from the
  prompt **only** once CLI-vs-hosted findings are recorded side by side.
- **G4** — **re-calibrate.** Crops change COGS, and COGS is the floor under
  every pack price. Rewrite `calibration.md` before Step 7 creates the Paddle
  catalog, never after.

**Needs from Harsha:** an `ANTHROPIC_API_KEY` with a little balance for G4
(~$0.20). Runs locally; no deployment required.

---

## Step 3 — The report page → `BuildV5.md` Phase H

The page a customer looks at. Today: 131 lines, no images.

- Three images per frame, reusing `Argus/src/report.ts`'s visual language from
  `5d311fb` — including its aspect-ratio, synced-scroll, and lightbox fixes.
  Do not re-derive them; they were bugs once.
- Findings rendered properly, region-highlighted, escaped,
  `injection-suspected` visually distinct.
- **History made visible.** `enrichment.ts` computes `firstDriftCommit` and
  `recurrence`, feeds them to the model, and **no page shows them.** That is
  the moat, unseen. It should be the most prominent thing on the page.
- Share UI for the API that already exists.

---

## Step 4 — Trends → `BuildV5.md` Phase I

Every number already exists in `frame_stats` with the right index.

- Repo view — runs, flagged counts, per-frame sparkline. **Nothing above
  `/r/{runId}` exists today.**
- Frame trend — score over commits, threshold line, first-exceeded annotation,
  mode-transition markers. Skips render as gaps, never zeros.
- Org-scoped, capped trends API.

**Gate:** the chart's "first drift" must agree with `enrichment.ts` on the same
data. Two implementations that disagree means one is wrong.

> **Steps 3 and 4 are the sales asset.** With no trial, a prospect never
> touches the hosted product before paying — the demo carries the whole
> argument. Argus has dogfooded its own Action since Stage 2, so its
> `frame_stats` history is real and months deep. Publish it: a trend chart with
> genuine history and a real regression catch is the case study BuildHorizons
> asks for, and no trial account could ever have produced it.

---

## Step 5 — Go live → `BuildV5.md` Phase J

The first step needing accounts. Postgres, R2, a URL, and deleting the portfolio preview.

**Re-run the entire G suite against real R2.** Presigning, `Content-Length`
pinning, and TTL behave differently against a real service than a local stub,
and abuse controls proven only against a stub are not proven.

A free `*.vercel.app` is enough here. A real domain becomes mandatory only at
Step 7 — Paddle production checkout requires an approved domain.

**Needs from Harsha:** items 1–5 and 7 of `BuildV5.md`'s handover table.

---

## Step 6 — Auth and orgs → `BuildV3.5.md` Stage 4 items 4–5

Until this lands there is no "customer", only an access code and share links.
Multi-tenancy is enforced in the data layer and **unproven in the session
layer, because there is no session layer.**

- GitHub OAuth for developers; **email magic links for designers** (a designer
  seat must not require a GitHub account — this is a real differentiator, not a
  detail).
- Org creation, invites, roles (`admin | member | designer`), key management UI
  with once-shown keys and working revocation.
- The report page's API-key field disappears; sessions replace it.
- **Smaller than originally specced**: with no trial and no free accounts, only
  paying users are ever authenticated.

**Gate:** cross-tenant probes denied at the session layer, not just in SQL.

---

## Step 7 — Paddle → `BuildV3.5.md` Stage 4 item 6

Sandbox first; production keys last.

1. **Signature adapter.** Paddle signs `ts:body` and sends
   `ts=<unix>;h1=<hmac>` — **not** the generic HMAC-hex `webhooks.ts`
   implements today, despite its comment. Write it, test it, keep the tampered-
   payload case.
2. **Webhook route.** `src/webhooks.ts` is currently unreachable — no
   `/api/webhooks/*` exists.
3. **Org provisioning.** With no trial, the purchase webhook is the *only* way
   an org is ever created. Checkout → webhook → org + grant → magic link.
4. **Real product ids.** Remap `migrations/005`'s provisional `pack_*` slugs
   after creating the catalog — priced from **G4's** recalibrated COGS, not the
   pre-crop numbers.
5. **Fix `reconcile.ts` first.** It counts allotment-funded spend against pack
   revenue only, and will trip the <50% margin alert into an unjustified
   reprice. Small fix; do it before the first paying org.
6. **Lapse, grace, refunds.** Uploads rejected politely, CI stays green,
   nothing deleted. Plus the 30-day money-back guarantee: a written policy and
   a runbook entry. Verify Paddle's fee treatment on refunds — that is the real
   per-refund exposure.
7. **E7 live loop in sandbox**: buy → explain → exhaust → clear message, CI
   green → re-buy → works.

**Needs from Harsha:** Paddle sandbox account (free, no business verification),
then a real domain and business verification for production.

---

## Step 8 — Launch gates → `BuildV4.md` Phase E + `BuildV3.5.md` items 8, 10

Nothing here is optional, and none of it is invisible if skipped.

- **E1** — injection fixtures against the *hosted* path, 1:1 with
  `SECURITY-LLM.md`. Step 2 widens this surface by sending uploaded images to
  the provider, so it matters more now, not less.
- **E6** — provider retention posture verified and stated on a disclosure page.
- **Close the pay-twice gap** — `npx norma-scope explain` has no cloud branch, so a
  customer with credits cannot spend them from the CLI. Step 2 gives the CLI an
  authenticated cloud client, which makes this small. **Launch blocker.**
- **Retention sweep + deletion** — 90-day sweep with dry-run; run/repo/org
  delete removes objects from storage, not just rows. Unbuilt; storage growth
  is currently bounded by nothing.
- **Ops** — backups with a *rehearsed* restore, uptime alerts that reach a
  phone, `npm audit`, security headers.
- **Legal + docs** — ToS, Privacy, subprocessors, security contact, data-flow
  disclosure, pricing page with per-review cost, BYO instructions, exact model
  list, honest limitations ("hypotheses, not diagnoses").
- **File the "Normascope" trademark** (one word mark covers both tiers).

---

## Step 9 — First customers

Break-even is **3–4 Team orgs**. Distribution per BuildHorizons: npm, the
Action marketplace, MCP registries, and one honest case study per mode — the
Bose-style writeup for fidelity, a real regression catch for baseline.

Watch three things, because each is a documented trigger:

| Signal | Triggers |
|---|---|
| "Can I try the hosted side first?" | Re-enable the trial (design settled, `BuildV5.md` §G2c) |
| "We don't have an Anthropic contract" | Provider flexibility — Claude on Bedrock/Vertex first (FUTURENORMA §8) |
| Support load approaching ~1 day/week | First hire, a support-minded engineer |

---

## Step 10+ — Horizons (demand-gated, individually)

From `roadmapV1.md`. **None begins without paying demand.** In
niche-pain-to-effort order:

1. **Provider flexibility** — Claude on Bedrock/Vertex is days of work, no
   prompt changes, no re-calibration, and unblocks AWS/GCP-committed accounts.
   The free escape hatch exists today and is undocumented: the Anthropic SDK
   honours `ANTHROPIC_BASE_URL`, so any compatible gateway already works. An
   afternoon of docs may satisfy the first enterprise that asks.
2. **Design tokens / brand compliance** — computed styles are already captured;
   checking them against a token spec turns Normascope into brand police.
   Enterprise buyer, data already collected.
3. **Localization QA** — same page × N locales, text masked, layout diffed.
4. **Email rendering QA** — new data flow, needs its own disclosure and opt-in.
5. **Mobile (RN/Flutter via simulators)** — largest build cost; only once the
   web loop is funded.

Still not doing: generic screenshot API, test runner, accessibility audits,
Figma plugins, auto-fix PRs, CI blocking by default.

---

## What only Harsha can provide, consolidated

| Needed at | Item |
|---|---|
| Step 2 | `ANTHROPIC_API_KEY` + small balance (~$0.20 for G4) |
| Step 5 | Vercel project · Postgres (Neon/Supabase) · R2 bucket + credentials · `NORMASCOPE_CLOUD_PASSWORD` + fresh `JWT_SECRET` · confirmation to delete the portfolio preview |
| Step 5 (optional) | `harshat.space` subdomain — `*.vercel.app` works until Step 7 |
| Step 7 | Paddle sandbox account; then a real domain + business verification for production |
| Step 8 | Trademark filing; ToS/Privacy content decisions; a phone number for alerts |

## Open decisions

Everything else is settled (`FinishedSPEC.md` §8). These are not:

1. **Real domain name** — needed by Step 7, not before.
2. **Repo-count ladder** — Team = 10 repos is specced; the tiers above it are
   not. Needed for the pricing page at Step 8.
3. **Refund policy wording** — 30 days is decided; the exclusions are not.
4. **Whether Step 6 ships GitHub OAuth and magic links together** or OAuth
   first. Designer seats are a differentiator; shipping OAuth alone delays it.
