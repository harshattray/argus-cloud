# Build 5.0 — Deploy + Surface (Stage 4 made visible)

## Instructions for Claude

This document executes **BuildV3.5 Stage 4 items 1–3 and 9** and **BuildV4's
open Phase-D artifact gap**, in the order that makes Normascope Cloud a thing a
customer can look at. It does **not** cover auth/org management (Stage 4 items
4–5), billing UI (item 6), or the MoR integration — those follow in Build 5.5
and are deliberately out of scope here, because none of them are worth building
against a product with nothing on the screen.

Phases continue BuildV4's lettering: **F, G, H, I**. Execute strictly in order.
A phase is complete only when every test in its Test Plan passes and every item
in its Security Protocol has recorded evidence. A test that cannot run is a
listed blocker, never a pass (Doctrine 3).

Read `FUTURENORMA.md` §1–§2 first for where things live, then this.

### The finding that motivates this document

Audited 2026-08-03. The docs read as "nearly there" because they are written
from the substrate's point of view, and the substrate genuinely is finished.
The surface is not. Evidence:

| Claim in the docs | What is actually there |
|---|---|
| "Next.js web surface (`web/`): upload, explain, ci-explain, share, report page ✅ built" | 4 API routes, an 11-line home page, and a 131-line report page |
| "Hosted report page" | Renders **no images at all** — a list of frame names, `aligned mismatch 71.20% · SSIM 28.700 · fidelity/figma`, and an Explain button |
| "Dashboard + trends: mode-aware charts" (BuildV3.5 item 5) | Does not exist — no file, no route, no query |
| "Upload runs with `norma compare --upload`" (`web/app/page.tsx:7`) | **`--upload` does not exist.** The CLI has no upload command; `action.yml` uploads to GitHub artifacts only |
| "MoR webhook handling ✅ C5" | `src/webhooks.ts` is real and tested, and **no route calls it** — there is no `/api/webhooks/*` in `web/` |
| "Hosted findings are metadata-grounded" (§6, listed as a known risk) | Consequence: **the paid explain is weaker than the free CLI explain**, which crops real images |

That last row is the one that matters commercially. Until Phase G lands, the
honest pitch for hosted explain is "pay for a worse version of what's free."
Phase G exists to delete that sentence.

### Hard rules carried in

1. **The deterministic diff is the only gate.** Nothing here blocks a build.
2. **No paid logic in the published package.** Phase G adds `npx norma-scope upload` to
   the public CLI. That is a client — a `fetch` to a configured URL with an org
   key, exactly the shape `normascope-mcp` already uses at `server.ts:234–269`.
   No provider key, no pricing, no entitlement logic ever lands in Argus.
3. **Never fabricate economics.** Phase G changes what an analysis contains, so
   it changes COGS. Re-run `scripts/calibrate.mjs` before any figure derived
   from `docs/calibration.md` is quoted again (see G4).
4. **Local-first.** Artifacts leave the machine only on an explicit `upload`.
5. **Model output and uploads are untrusted.** React escaping is the E3
   guarantee; nothing goes through `dangerouslySetInnerHTML`, including the
   uploaded `report.html` (H1 covers how it is served).

---

## What this document produces

A Normascope Cloud on its own domain, its own database, and its own storage,
where a run report shows **the three images side by side**, a frame's score
**over time with the first-drift commit marked**, and findings **grounded in
crops** rather than metadata. That is the whole of the paid proposition made
visible; billing is the easy part once someone wants what they see.

**Phases H and I are the sales asset, not just product work.** With no trial
(G2c), a prospect never touches the hosted product before paying — the demo
carries the entire argument. Build them to be screenshot-worthy and publish
them: Argus has dogfooded its own Action since Stage 2, so its `frame_stats`
history is real, months deep, and ours to show. A trend chart with genuine
history and a real regression catch in it is the case study BuildHorizons asks
for, and it is something no trial account could ever have produced.

---

## Phase F — Build substrate (local; no domain, no accounts)

**Reordered 2026-08-03: build locally, deploy when there is something worth
showing.** The original draft put deployment first, which front-loads account
setup and DNS before anything exists to deploy. Nothing in F–I needs a domain;
production infrastructure moves to **Phase J**. This follows BuildV3.5's own
pattern ("local dev fully on Docker Postgres + MinIO"), and the local path
already exists: `PGLITE_DATA_DIR`, `web/scripts/seed-dev.mjs`,
`NORMA_DEV_OPEN=1`.

The one exception is **F1's preview deploy** — free, no domain, no DNS — done
early and only to prove the monorepo builds on Vercel at all. Discovering that
after H and I are written would be expensive.

**F1 — Build the monorepo correctly on Vercel.** `web/package.json` declares
`"argus-cloud": "file:.."`, so the parent's `tsc` must run before `next build`.
A Vercel project rooted at `web/` cannot see `..`. Root the project at the
**repo root**, set the install command to install both, and the build command
to `npm run build && cd web && npm run build`. Output directory `web/.next`.

**F2 — Migrations stop running on cold start.** `web/lib/db.ts` calls
`migrate()` inside the process-wide handle. On serverless, N concurrent cold
starts race N migration runs against one Postgres. Take a session-level
advisory lock around `migrate()` and make every migration idempotent, or move
migration to a deploy step (`npm run migrate` against `DATABASE_URL`). Prefer
the advisory lock — it survives a rollback deploying an older bundle.

**F3 — One storage interface, two drivers.** Everything in G–I writes through
a `Storage` port with `put`, `presignPut`, `presignGet`, `head`, `delete`, and
`deletePrefix`. Two implementations: **filesystem** (local dev, presigning
stubbed with signed local URLs) and **S3/R2** (Phase J). Object keys are
identical in both: `org/{orgId}/blob/{sha256}.png` (G2). Nothing above this
port may import an S3 SDK type — that is what keeps Phase J a config change
rather than a rewrite.

| # | Test | Pass condition |
|---|---|---|
| F1.1 | Cold `npm ci` at repo root, then the full build command | `web/.next` produced; no `Cannot find module 'argus-cloud/...'` |
| F1.2 | One Vercel **preview** deploy (no domain, no custom DNS) | Home page and `/r/<runId>` render; the `file:..` dependency resolves in Vercel's builder |
| F2.1 | 20 concurrent cold starts against one database | Exactly one migration run; no duplicate-object errors |
| F2.2 | Start an older bundle against a newer schema | Starts; no destructive migration attempted |
| F3.1 | Full G–I suite against the **filesystem** driver | Green with no S3 SDK loaded |
| F3.2 | Grep everything above the port for S3 SDK imports | None outside the R2 driver |

**Security protocol:** no credentials exist yet to leak — F1.2's preview
carries no secrets and no real data. Confirm the preview deployment is **not
indexable** (`robots`, no inbound links) and holds only seeded fixtures.

**Gate:** F1–F3 green; the preview deploy proved the build; every later phase
runs entirely offline against the filesystem driver.

---

## Phase G — The artifact pipeline

The largest single quality win available (FUTURENORMA §5 item 2), and the fix
for hosted explain being weaker than free explain.

**G1 — `npx norma-scope upload` in the CLI (Argus, public, Apache-2.0).** New command,
opt-in, never automatic. Upload is a **paid entitlement** (G2c) — a key whose
org lacks it gets a message naming the plan state and exit 0, exactly like a
missing key. The CLI never decides entitlement itself; it reports what the
server said. Reads `.bridge/reports/summary.json` plus the three
PNGs per compared frame — `.bridge/screenshots/{frame}.png`,
the reference (`.bridge/design/` or `.bridge/baseline/`), and
`.bridge/diff/{frame}-diff.png` — and posts them to
`NORMASCOPE_CLOUD_URL` with `NORMASCOPE_ORG_KEY`. Same env-var contract as the
MCP server's org-credits mode. Never-throw: no key or no URL → a message
naming the fix, exit 0.

**Region coordinates travel in the upload, not the published schema.**
`summary.v2` flattens `significantRegions` to a count (`src/summary.ts:24`)
while `compare.ts:136` holds the full `DiffRegion[]` in memory. Do **not**
widen the published JSON Schema for this — FUTURENORMA §5 item 6 documents
exactly how expensive that ripple is. Send the regions as an `artifacts`
sidecar field in the upload request body, versioned independently.

**G2 — Presigned direct-to-R2 upload.** Vercel's serverless request body cap
(~4.5MB) is below one full-page screenshot pair, let alone a 3.5MB report. So
the app never proxies image bytes in either direction — uploads are presigned
PUTs, reads are presigned GETs with a short TTL.

New migration `006_artifacts.sql`: `run_artifacts (org_id, run_id, frame,
kind, object_key, declared_bytes, actual_bytes, sha256, state, created_at)`
with `kind` in `build | reference | diff | report | regions`, `state` in
`pending | committed`, unique on `(run_id, frame, kind)`, cascade on run
delete. Plus `org_storage (org_id, bytes_stored, bytes_reserved,
runs_today, day)` for quota accounting.

**Blobs are content-addressed inside the org prefix**:
`org/{orgId}/blob/{sha256}.png`, with `run_artifacts` as the join table. A
baseline that doesn't change across 50 runs stores once. This keeps org
deletion a prefix delete (Stage 4 item 7 depends on that shape) and
deliberately does **not** dedup across orgs — identical content in another org
is a separate object, the same rule the result cache enforces. Only
run-scoped deletion needs refcounting.

**G2b — Upload abuse controls.** Once a presigned URL is issued the app is
out of the byte path, so every limit is either baked into the signature or
reconciled afterward. Nothing here exists today: there is no rate limiter in
`argus-cloud`, and `api_keys.rate_per_minute` is written by `createApiKey`,
selected by `findApiKey`, and **read by nothing**.

Three-phase upload:

1. **Declare** — `POST /api/upload` carries the summary plus, per artifact, its
   byte size and sha256. Server checks, in this order, the key → the org's
   **current** upload entitlement (G2c) → quotas; reserves the bytes; writes
   `pending` rows; issues presigned PUTs with
   **`Content-Length` as a signed header** (R2 rejects a mismatched body — a
   presigned PUT without this accepts anything up to the object limit, which
   makes size caps decorative), a 60–120s TTL, and a one-time-use nonce.
   Artifacts whose sha256 already exists in the org get no URL at all.
2. **Transfer** — the CLI PUTs directly to R2.
3. **Commit** — `POST /api/upload/{runId}/commit` HEADs each object, verifies
   actual size and hash against what was declared, and flips the run to
   visible. Any mismatch deletes the object and fails the run. **A run is not
   queryable until it commits**, so a lying or half-finished client produces
   nothing.

A sweeper deletes `pending` artifacts older than 15 minutes and releases their
reservation — otherwise abandoned uploads are both a slow leak and a trivial
griefing vector.

**G2c — Upload is a paid entitlement. Free plans cannot upload anything.**

This is a hard product rule, not a quota. Quotas shape how much an entitled org
may send; entitlement decides whether it may send at all. The free tier keeps
the entire CLI — both modes, every adapter, the Action, local HTML reports,
GitHub artifacts, and BYO explain — and **nothing it produces ever leaves the
machine**. That is the free tier's selling point (local-first, Doctrine 5), not
a withheld feature.

Enforced in three places, so no single mistake opens it:

1. **A free org cannot hold an upload credential.** `createApiKey` refuses to
   mint a `kind: "upload"` key for a plan without the entitlement. The
   credential does not exist to be leaked, stolen, or reused.
2. **Entitlement is re-checked on every request**, before quota, before any
   presigned URL is signed. Plans change — trials expire, cards fail, orgs
   downgrade — so a key that was valid at creation proves nothing about now.
   **Key existence is never authorization.**
3. **No bypass flag.** The report page has `NORMA_DEV_OPEN=1` for local dev;
   there is deliberately **no equivalent for upload entitlement**, in any
   environment. The private-preview org in F4 is provisioned as a real `team`
   org so the check is exercised from day one rather than switched off.

**Plan config** (config, not code — Stage 4 item 6's rule):

| | free | team | lapsed |
|---|---|---|---|
| Upload | ❌ **never** | ✅ | ❌ (rejected politely) |
| Hosted reports + trends | ❌ | ✅ | ✅ read-only |
| BYO explain (local, their key) | ✅ **forever** | ✅ | ✅ |
| Hosted explain (our key + enrichment) | ❌ | allotment + packs | ❌ |
| Runs / day | — | 200 | — |
| Artifacts / run | — | 600 | — |
| Bytes / run | — | 250 MB | — |
| Total stored | — | 50 GB | — |
| Retention | — | 90 days | 90 days from lapse |

Quota figures are policy starting points to tune against real traffic, not
measured figures.

**There is no trial. This supersedes BuildV3.5 Stage 4 item 6's "14-day no-card
trial"**, and with it the "trial expiry" case in that stage's billing test
plan. Decided 2026-08-03; the reasoning is worth keeping because it will be
re-litigated:

- **The free CLI is a better trial than a trial.** It is unbounded in time,
  needs no signup, and demonstrates the hardest thing to believe — that the
  diff is trustworthy. Anyone who has run `npx norma-scope compare` on their own UI has
  already been sold the difficult part.
- **A 14-day trial cannot demo the differentiator anyway.** History enrichment
  is longitudinal by nature ("first drifted three weeks ago, seen four times").
  A two-week-old org has no history, so the trial is uniquely bad at showing
  the one feature that most needs showing.
- **BYO explain already gives away the experience at zero cost to us** — it
  ships in the CLI today. Taking custody of a *customer's* provider key to run
  hosted explain on their behalf was considered and rejected: it saves ~$0.25
  per prospect and buys an encrypted-credential-storage problem, a new breach
  class, and a disclosure obligation, for a one-person operation.
- **Risk reversal replaces it: a 30-day money-back guarantee.** Worst-case cost
  of a refunded month is the explain allotment (<15% of plan price, ~$4.35) +
  ~$0.10 storage + Paddle's fee treatment on refunds (**verify** — MoRs often
  keep the transaction fee) ≈ under $6. Same worst case as a free trial, but
  only from someone who already decided to buy. No new plan state: a refund
  policy and Paddle's existing refund flow.
- **And it makes G2c absolute** — with no unpaid party holding an upload key,
  the free-plans-cannot-upload rule has no exception carved out of it.

> ⚠️ **Superseded 2026-08-15 — `plan` is `free | team`.** `lapsed` moved to
> `subscription_status` (migration 019), which is also where `past_due` and
> `refunded` live. **PATHWAYS is the reference point; this file is
> implementation detail and not authority.** The quota values below —
> 200 runs/day, 600 artifacts/run, 250 MB, 50 GB — appear in no authoritative
> document and are launch assumptions pending traffic data, not decisions.

Consequences to carry: `plan` becomes `free | team | lapsed` and
`migrations/001`'s `DEFAULT 'trial'` becomes `'free'` (new migration, do not
edit 001); signup is Paddle checkout → webhook provisions the org → magic link,
so **only paying users are ever authenticated** and Stage 4's auth surface
shrinks accordingly.

**Deferred, not discarded — the trial is a later experiment.** Everything above
is plan config, so re-enabling a trial is a table row plus a grant, not a
rewrite. Revisit it when there is conversion data to reason about rather than
speculation. Triggers to watch, in order of signal quality:

1. Prospects asking "can I try the hosted side first" — count them; the request
   itself is the data.
2. Marketing-site traffic that reaches the pricing page and does not convert,
   once there is enough of it to distinguish from noise.
3. A competitor-driven objection in a real sales conversation.

If it is re-enabled, the design is already settled: **no card, 14 days, one
trial per GitHub org** (not per user or email — GitHub identity is what makes
sybil signups tedious), upload on under trial quotas, and a **hard-capped
hosted-explain grant of ~15 reviews (~$0.25)** — never a Team-equivalent
allotment, which at <15% of $29 would be $4.35 of unrecoverable spend per
signup and the entire abuse surface. Exhaustion is a soft stop ("trial reviews
used, upgrade or add your own key"), never an error, never red CI.

**Lapse and downgrade follow the standing rule** (BuildV3.5 item 6): uploads
are rejected politely, **CI stays green**, and **nothing is deleted**. A lapsed
org keeps reading every run it already uploaded; it simply cannot add more. The
error names the plan state and the fix — never a bare 403.

Exceeding a quota behaves identically: an error naming the limit and the
upgrade path, exit 0 in CI. Per-minute limiting finally reads
`rate_per_minute`, backed by a Postgres counter row using the ledger's
atomic-upsert pattern (C1); in-memory buckets do not work across serverless
instances.

**Global ingest breaker.** Reuse `breaker.ts`'s shape for a daily
bytes-ingested budget across all orgs: trip → uploads pause, a human is
alerted, reports/diffs/explain are unaffected, the message is honest.

**Default to flagged frames only.** `npx norma-scope upload` sends full artifacts for
flagged frames and thumbnails for the rest, `--all-artifacts` to override.
Most frames pass; three full PNGs for a passing frame is waste for us and
noise for the user. This cuts typical volume by roughly the pass rate and is
the largest single reduction available — larger than any cap.

**Cost shape, for calibrating how much machinery is justified:** R2 bills
storage per GB-month and writes per million, with **zero egress** (verify
against the live pricing page before any figure is quoted anywhere). A trial
org that dumps 10GB and vanishes costs cents and is reclaimed by the 14-day
sweep. The exposure is sustained storage, not bandwidth — quotas plus
retention are sufficient, and nothing here warrants a WAF.

> ⚠️ **Superseded 2026-08-19 — the server does not crop.** The paragraph below
> has the server fetch the uploaded PNGs and cut the regions itself. That
> predates the decision that customer bytes never reach `sharp`, whose whole
> reason is that uploaded images are hostile input — decoding them inside our own
> function is that risk with a worse blast radius than the `next/image` case
> already refused. **Crops are cut in the CLI at upload time** and arrive as a
> JSON sidecar per frame; the server measures each image from its header, bounds
> it to a pixel budget, and forwards the bytes. Built and proven:
> `FinishedSPEC.md` §3r. Everything below about *what* the crops are — top-N
> regions, the Phase A budget, the A3.1 truncation order — is unchanged and is
> what the CLI implements.

**G3 — Crop-grounded hosted explain.** `explainService.ts` gains crops: for
each frame, fetch the build and reference objects, crop the top-N significant
regions from the uploaded `regions` sidecar, downscale to the Phase A budget,
and pass them to the provider. The truncation order from A3.1 (fewer crops →
smaller crops → trimmed DOM) applies unchanged — this is the same assembly
discipline, sourced from R2 instead of the local disk. Delete the "grounded in
diff metadata, not image crops" hedge from the hosted prompt **only once G3.3
passes**, and not before.

**G4 — Re-calibrate.** Crops change the input token profile, which changes
COGS, which is the floor under every pack price. Re-run
`scripts/calibrate.mjs` against the hosted path and rewrite
`docs/calibration.md`. If blended COGS rises above the 3× floor for any
seeded pack in `migrations/005_products.sql`, reprice **before** Build 5.5
creates the Paddle catalog — not after.

| # | Test | Pass condition |
|---|---|---|
| G1.1 | `npx norma-scope upload` with no `NORMASCOPE_ORG_KEY` | Message names the fix; exit 0; nothing sent |
| G1.1a | `npx norma-scope upload` with a key whose org has no upload entitlement | Message names the plan state and the upgrade path; exit 0; no bytes sent |
| G1.2 | Upload a run with 3 compared + 1 skipped frame | 3 frames' artifacts uploaded; the skipped frame contributes none |
| G1.3 | Two consecutive uploads of the same `.bridge/` | Identical `sha256` per artifact (determinism, A3.4 discipline) |
| G1.4 | Config with `"screenshot": "../../etc/passwd"` variants | Rejected before any read; S1.2 containment holds in the upload path |
| G2.1 | Presigned PUT with a body larger than the declared `Content-Length` | Rejected **by R2**, not by the app after transfer |
| G2.2 | Presigned URL replayed after its TTL, and replayed twice inside it | 403; second use inside the TTL rejected by the nonce |
| G2.3 | Org B presents org A's run id to `/api/upload` | 404 — same body as a nonexistent run (E4 discipline) |
| G2.4 | Delete a run | Rows gone **and** the R2 prefix is empty (check the bucket, not the DB) |
| G2.5 | Declare 1MB, PUT 40MB by re-signing locally | Signature invalid; object absent; run never commits |
| G2.6 | Declare truthfully, then PUT bytes with a different sha256 | Commit fails, object deleted, no run row survives |
| G2.7 | Declare and PUT, never call commit | Run invisible; sweeper deletes the objects and releases the reservation within 15 min |
| G2.8 | Team org exceeds runs/day, bytes/run, and total-stored in turn | Each returns an error naming that limit; **exit code 0 in CI every time** |
| G2.8a | `createApiKey(org, { kind: "upload" })` on a **free** org | Refused; no key row created |
| G2.8b | Free org presents a hand-crafted/forged upload key | 401; no presigned URL; no `pending` row |
| G2.8c | Team org uploads, then downgrades to free, then uploads again | First succeeds; second rejected naming the plan state; **exit 0**; the first run stays fully readable |
| G2.8d | Plan lapses mid-CI-run, between declare and commit | Commit rejected, objects swept, CI green, prior runs intact and readable |
| G2.8e | Grep every presigned-URL issuer for an entitlement check | Every path checks; **no env var or flag disables it in any environment** |
| G2.8f | Every plan in config, `upload` toggled | Entitlement follows config with no code change — the switch a future trial would use |
| G2.8g | Org enum accepts only `free \| team` (**revised 2026-08-15** — `lapsed` is a subscription status); no row defaults to `trial` | Migrations 016 and 019 applied; no `trial` rows exist |
| G2.9 | Same key, 200 uploads in one minute against `rate_per_minute` | Limited; the counter is correct under 20 concurrent requests (C1 pattern) |
| G2.10 | Re-upload an unchanged baseline across 3 runs | One blob stored; 3 `run_artifacts` rows; second and third uploads get no presigned URL |
| G2.11 | Simulated daily ingest-budget breach | Uploads pause, alert fires, reports/diffs/explain unaffected, message honest (C6 shape) |
| G2.12 | Default upload on a run with 2 flagged of 20 frames | Full artifacts for 2, thumbnails for 18; `--all-artifacts` sends all 20 |
| G3.1 | Hosted explain on a frame with uploaded artifacts | Findings reference a real region; crops appear in the assembled request |
| G3.2 | Hosted explain on a frame with **no** artifacts (pre-G upload) | Falls back to metadata grounding with the hedge intact; never errors |
| G3.3 | Same frame: CLI `explain` vs hosted explain | Findings are of comparable specificity — both name a selector and a measurement. Record both outputs in `calibration.md` |
| G3.4 | Planted secret in an uploaded DOM context file | Scanner **blocks** server-side too; file named; no provider call (A3.2 extended across the boundary) |
| G4.1 | Post-crop calibration | Every figure traces to a recorded `usage` object × live price; pack prices still ≥ 3× blended COGS, or the reprice is recorded |

**Security protocol:** artifacts are private objects served only through
short-TTL presigned GETs scoped to an authorized session or share token — never
a public bucket, never a permanent URL. A leaked upload key can burn its org's
quota and nothing else: keys are hashed, revocation takes effect on the next
request, and per-key upload counters make an anomalous spike visible in the
admin view. Quota state is org-scoped and joins the E4 tenant probe — org B
must not be able to read, reserve against, or exhaust org A's storage. The uploaded `report.html` is
**untrusted user content**: serve it from the R2 domain in a sandboxed
`<iframe>` with `sandbox="allow-same-origin"` and a CSP that forbids scripts,
or do not serve it at all in this phase. Never inline it into the app's own
document. Re-run E2 (secret-scan e2e) against the hosted assembly path, and E4
(tenant probe) against `run_artifacts` and every presigned URL issuer.

**Gate:** G1–G4 green; the hosted prompt's metadata hedge is deleted with
G3.3 as the evidence; `calibration.md` rewritten. **No presigned URL is issued
by any code path that has not checked upload entitlement and then quota, in
that order** — verified by reading every issuer (G2.8e), not by testing around
them. A free org must have no way to put a single byte in the bucket.

---

## Phase H — The report page

The page a customer actually looks at. Today it is 131 lines of numbers.

**H1 — Show the images.** Per frame: build / reference / diff overlay, the
triptych the CLI report already uses, plus a lightbox. **Reuse the visual
language from `Argus/src/report.ts`** (shipped in `5d311fb`) rather than
inventing a second one — including the three fixes that landed with it: frames
size to the capture's aspect ratio, captures above 2.2:1 scroll at natural size
with the three panes synced, and the lightbox is viewport-bounded. Do not
re-derive those; they were bugs once already.

**H2 — Show the findings properly.** Category, confidence badge, observation,
CSS hypothesis, selector, code pointer, and the "generated — verify before
applying" label (A6 shape). Highlight the finding's region on the diff image.
Escaped text only; `injection-suspected` renders as a visible warning, not a
normal finding.

**H3 — Show the history.** This is the moat, and it is currently invisible:
`enrichment.ts` computes `firstDriftCommit` and `recurrence`, injects them into
the prompt, and **no page displays them**. On each frame, show "first drifted
at `abc1234`" and "seen 4 times before" as page furniture, not just as model
context. A BYO user structurally cannot see this — which is the entire argument
for the paid tier, so it should be the most visible thing on the page.

**H4 — Share UI.** `/api/share` exists and has no interface. Create link, set
expiry, revoke, copy. A share-token viewer sees H1–H3 and no Explain button.

| # | Test | Pass condition |
|---|---|---|
| H1.1 | Run with a 5:1 full-page capture | Panes scroll at natural size, synced; no letterboxed sliver |
| H1.2 | Very tall image in the lightbox | Bounded to the viewport; no page overflow |
| H1.3 | Run uploaded before Phase G (no artifacts) | Degrades to the numbers-only layout; never a broken-image icon |
| H2.1 | Finding containing `<img onerror=alert(1)>` | Inert; source-inspected (E3) |
| H2.2 | Frame label containing `<script>alert(1)</script>` | Inert (T5.4 discipline, hosted path) |
| H2.3 | `injection-suspected` finding | Renders as a warning, visually distinct from a normal finding |
| H3.1 | Frame with 3 prior drifted runs | `firstDriftCommit` and recurrence count both visible and correct against `frame_stats` |
| H3.2 | Frame with no history | Section absent, not "null" or "0 times" |
| H4.1 | Share link: create → open logged-out → revoke → reopen | Renders, then 404 with the same body as a nonexistent run |
| H4.2 | Expired share link | 404 |
| H4.3 | Share-token viewer clicks around | No Explain button, no key field, no org data beyond this run |

**Security protocol:** every string rendered on this page originates from an
upload or a model — treat all of it as hostile. Re-run the E3 XSS corpus
against the rebuilt page, not the old one. Verify the CSP with an inline-script
probe after the redesign; a rebuilt page is a new page. Presigned image URLs
must not leak into share-token pages with a TTL longer than the token's life.

**Gate:** H1–H4 green; E3 re-run against the rebuilt page with evidence.

---

## Phase I — Trends

BuildV3.5 Stage 4 item 5, unbuilt. Every number it needs is already in
`frame_stats` with the right index (`frame_stats_trend`).

**I1 — Repo view.** Runs list with commit, branch, date, flagged count, and a
sparkline per frame. This is the landing page after login, and today no page
above `/r/{runId}` exists at all.

**I2 — Frame trend.** Aligned-mismatch over commits, threshold line, "first
exceeded" annotation, and a marker where the metric definition changed
(mode/source transitions — the columns exist for exactly this). Mode-aware:
fidelity and baseline frames must not share a y-axis without saying so.

**I3 — Trends API.** `GET /api/trends?repo&frame&limit`, org-scoped, capped,
serving the chart and nothing else. No new data, no new grants.

| # | Test | Pass condition |
|---|---|---|
| I1.1 | Repo with 40 runs | Paginated; one query per page, not per row |
| I1.2 | Org with no runs | Honest empty state naming the next action (`npx norma-scope upload`) |
| I2.1 | Frame crossing the threshold at run 7 of 12 | Annotation lands on run 7; matches `firstDriftCommit` from `enrichment.ts` exactly |
| I2.2 | Frame whose mode changed mid-history | Transition marked; the two segments are visually distinguished |
| I2.3 | Frame with `alignedMismatchPercent: null` rows (skipped) | Gaps, not zeros — a skip must never read as a pass |
| I3.1 | Org B requests org A's repo trend | 404 |
| I3.2 | `limit=100000` | Capped server-side |

**Security protocol:** I3 joins the standing tenant-isolation probe suite (E4).
Trend responses carry no org metadata beyond the requested repo — no repo list,
no counts, no plan state.

**Gate:** I1–I3 green; the trend annotation verified to agree with
`enrichment.ts` on the same data (I2.1) — two implementations of "first drift"
that disagree is a bug in one of them.

---

---

## Phase J — Go live (last; the only phase needing accounts and DNS)

Everything above this line runs on a laptop. This phase exists because at some
point there has to be a URL, and it is deliberately last so it is done once,
against a product worth showing.

**J1 — Postgres.** Neon or Supabase; `DATABASE_URL` in server env. Run the
migration suite; F2's lock is what makes this safe under concurrent cold
starts.

**J2 — R2.** Bucket `normascope-cloud`, private, no public access, S3
credentials server-side only. Swap `Storage` from the filesystem driver to the
R2 driver — **one config value if F3 held the line.** Re-run the full G suite
against real R2: presigning, `Content-Length` pinning, and TTL behave
differently against a real service than a local stub, and G2's controls are
worthless if they only hold in the stub.

**J3 — Domain + private gate.** `cloud.harshat.space` or equivalent. A free
`*.vercel.app` is sufficient for a private preview; a real domain becomes
mandatory only at Paddle production checkout (Build 5.5). Until Stage 4 auth
lands, the whole app sits behind the portfolio preview's pattern: one access code in
`NORMASCOPE_CLOUD_PASSWORD`, 30-day JWT, no public links, no sitemap. The
**private-preview org is provisioned as a real `team` org** so G2c's
entitlement check is exercised rather than bypassed.

**J4 — Retire the portfolio preview.** Delete `/normascope-cloud` and `/normascope-cloud/run/:id` from the
portfolio frontend and `api/norma/[action].ts` + `api/_norma/*` from its
backend. Drop the `norma_*` tables and delete the `normascope-cloud-*` R2 objects.
Confirm the portfolio's function count drops from 11 to 7.

| # | Test | Pass condition |
|---|---|---|
| J1.1 | Migrate a fresh production database | Schema matches local; no manual step |
| J2.1 | Full G suite against **real R2** | Green — especially G2.1 (`Content-Length` pinning), G2.2 (TTL + replay), G2.5, G2.6 |
| J2.2 | Fetch an object URL without a signature | Denied — the bucket is private |
| J2.3 | Delete a run, then delete an org | Both prefixes empty in the **bucket**, not just the DB |
| J3.1 | Any route with no session | Access gate; no data in the body |
| J3.2 | `curl -I` on the deployment | HSTS, `X-Content-Type-Options`, `frame-ancestors` present (D5, re-run — not inherited) |
| J3.3 | Client bundle grep for `DATABASE_URL`, R2 keys, `ANTHROPIC_API_KEY` | Absent from every bundle, header, and response |
| J3.4 | Upload from the private-preview org | Succeeds as a real `team` org — the entitlement path ran, it was not switched off |
| J4.1 | `/normascope-cloud` after retirement | 404; portfolio function count = 7 |
| J4.2 | `normascope-cloud-*` objects and `norma_*` tables | Gone / dropped |

**Security protocol:** every secret server-side only, verified by grep against
the built bundles (D5 method, re-run against this deployment). The access-code
JWT secret is distinct from the portfolio's `JWT_SECRET` — rotating one must
not affect the other. J2.1 is non-negotiable: **abuse controls proven only
against a local stub are not proven.**

**Gate:** J1–J4 green; the portfolio preview is gone; nothing reachable without the access
code; the full G suite green against real R2.

---

## Handover list — what Harsha must provide

Nothing here is needed for Phases F–I. **All of it is Phase J**, which is why
F–I can start today.

| # | Item | Needed at | Cost |
|---|---|---|---|
| 1 | Vercel account + project (repo root, **not** `web/`) | F1.2 (free preview) | Free |
| 2 | Postgres — Neon or Supabase; `DATABASE_URL` | J1 | Free tier |
| 3 | R2 bucket + S3 credentials, private | J2 | ~$0 at this volume |
| 4 | DNS — a `harshat.space` subdomain (optional; `*.vercel.app` works) | J3 | Owned |
| 5 | `NORMASCOPE_CLOUD_PASSWORD` + a fresh `JWT_SECRET` | J3 | — |
| 6 | `ANTHROPIC_API_KEY` on the new project + prepaid balance | G4 calibration | ~$0.20/run |
| 7 | Confirmation to delete the portfolio preview | J4 | — |

Item 6 is the only one that bites earlier than J: G4's re-calibration needs a
live key. It can run against the local build — no deployment required.

---

## Standing suites after Build 5.0

Everything from 3.5 and 4.0, plus: **free-plan upload refusal (G2.8a–G2.8e) —
this one runs on every release, forever** · upload path containment (G1.4) ·
presigned URL expiry, replay, and tenant scoping (G2.2, G2.3) ·
declared-vs-actual size and hash enforcement (G2.5, G2.6) · quota exhaustion
never reddening CI (G2.8)
· ingest-breaker trip (G2.11) · storage deletion verified in the bucket (G2.4)
· E3 XSS corpus against the rebuilt report page (H2.x) · trend tenant probe
(I3.1).

## Definition of Done (Build 5.0)

1. Phases F–I are built and green **entirely locally**, against the filesystem
   storage driver, with no account beyond a free Vercel preview. Phase J then
   puts the same code on its own project, database, storage, and URL behind an
   access code, with the full G suite re-run against real R2; `/normascope-cloud` is
   deleted and its data removed.
2. `npx norma-scope upload` exists in the public CLI, is opt-in, never throws, and sends
   nothing without an explicit invocation.
3. A run report shows the three images per frame, with the CLI report's
   aspect-ratio and lightbox behaviour preserved.
4. Hosted explain is crop-grounded; the metadata hedge is gone from the prompt
   and G3.3 records CLI-vs-hosted findings side by side.
5. `calibration.md` is rewritten from a post-crop measurement; every pack price
   is still ≥ 3× measured blended COGS, or the reprice is recorded.
6. `firstDriftCommit` and recurrence are **visible to the user**, not only fed
   to the model.
7. A frame's score over commits is a chart, with the threshold line and the
   first-exceeded annotation agreeing with `enrichment.ts`.
8. Share links can be created, opened, and revoked from the UI, and a
   share-token viewer sees exactly one run.
9. Every artifact is private, served only through short-TTL presigned URLs, and
   deleting a run empties its bucket prefix.
10. **Upload is a paid entitlement, with no unpaid exception.** A free org
    cannot hold an upload key, cannot obtain a presigned URL, and cannot put a
    byte in the bucket; the check is re-run on every request and has no bypass
    flag in any environment. There is no trial — `plan` is
    `free | team | lapsed` — and re-enabling one later is plan config, not a
    code change.
11. No presigned URL is issued without an entitlement check and then a quota
    check; declared size and hash are verified at commit; an org that exhausts
    any limit — or loses entitlement mid-run — gets a clear message, a green CI
    job, and keeps every run it already uploaded.
12. All standing suites green; every unexercised item is a named open risk.

## Open risks carried into Build 5.5

- **Auth does not exist.** Until Stage 4 items 4–5 land, "customer" is one
  access code and share links. Multi-tenancy is enforced in the data layer and
  unproven in the session layer, because there is no session layer.
- **No MoR route.** `src/webhooks.ts` remains unreachable; Paddle's real
  signature scheme (`ts=<unix>;h1=<hmac>` over `ts:body`) is **not** what the
  current generic hex verifier implements, despite the comment at
  `webhooks.ts:9`. Build 5.5 writes the adapter. It also gains a second job:
  **org provisioning**, since with no trial the purchase webhook is the only
  way an org is ever created.
- **`reconcile.ts` counts non-pack spend against pack revenue.** Line 37 sums
  *every* charged usage event with no plan or org filter, while line 45 counts
  revenue only from `kind = 'pack_purchase'`. Any explain spend funded by a
  `plan_allotment` grant — i.e. every Team org's included allotment — lands in
  the cost side with **zero offsetting revenue**, dragging reported gross
  margin down and tripping the <50% alert at line 53 into a reprice the numbers
  do not justify. Removing the trial reduces this but does not fix it: Team
  allotment spend has the same shape. Fix before the first paying org, not
  before the first pack sale. Small change; the test is a seeded month with
  both grant kinds and a known correct margin.
- **A 30-day money-back guarantee is now the only risk reversal** (G2c). It
  needs a written refund policy on the pricing page and a runbook entry for
  processing one through Paddle — neither exists. Verify how Paddle treats its
  transaction fee on refunds before the guarantee is published, because that
  number is the real worst-case exposure per refunded month.
- **The CLI still cannot spend org credits** (FUTURENORMA §6, §8). Phase G
  gives the CLI an authenticated cloud client for the first time, which makes
  the fix smaller — but it does not make it. Close it before anyone pays.
- **E1 hosted-path injection fixtures** remain unrun, and Phase G widens the
  hosted attack surface by sending uploaded images to the provider. E1 gets
  more urgent here, not less.
