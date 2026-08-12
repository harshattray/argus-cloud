# FinishedSPEC.md — what is concretely built

**Private.** Companion to `FUTURENORMA.md` §5 (what to build next). This document
answers only one question: **what exists right now, and what is the evidence?**

Last audited: **2026-08-10**, by reading the code and querying live registries,
not by re-reading the previous audit. Where a planning document and the code
disagreed, the code won and the disagreement is recorded in §7.

## How to read this

| Mark | Meaning |
|---|---|
| ✅ | Built **and** verified by a suite that was actually run, or by a live smoke test with recorded evidence |
| 🟡 | Built and tested against fixtures only — the real integration has never run |
| ⚠️ | Code exists but is **unreachable** — nothing calls it |
| ❌ | Named in a planning doc; **does not exist in code** |

Nothing is marked ✅ on the strength of a plan saying it was done.

---

## 1. Verified this audit

Both suites were run on 2026-08-10, not quoted from memory:

| Repo | Command | Result | Previous audit |
|---|---|---|---|
| Argus | `npm test` | **83 checks, 0 failures** | 66 |
| argus-cloud | `npm test` (PGlite + filesystem storage) | **226 checks, 0 failures** | 63 |
| argus-cloud | `npm test` (real Postgres 17.10, filesystem storage) | **237 checks, 0 failures** | — |
| argus-cloud | `npm test` (real Postgres 17.10 + real Cloudflare R2) | **173 checks, 0 failures** — measured *before* §3c and not re-run since; the R2 leg needs credentials this run did not have | never run |
| argus-cloud | `npm run typecheck --workspace web` | clean | — |
| argus-cloud | `npm run build:web` | clean | — |

Heads: Argus `main` @ `12af929`; argus-cloud `main` @ `e42810d` (merge of
`normascope-site`).

⚠️ **Both working trees are dirty at audit time.** argus-cloud carries the
uncommitted waitlist/admin work described in §4c, the rate limiter in §3c,
and the provider-dollar reservations in §3d. Argus carries uncommitted
edits to `COMMANDS.md`, `README.md`, `.gitignore`, `.claude/launch.json`, an
untracked `USER-GUIDE.md`, and six untracked `assets/normascope-cloud-*`
concept directories. The suite results above are for the working trees, not for
the commits.

---

## 2. Argus — the CLI, Action, and MCP server

Private repo; public npm package. **This tier is the finished product** — it is
free, published, and it works. It also moved more than any other tier since the
last audit: eight commits, three of them real defect fixes found by running the
tool against real sites.

| Area | State | Evidence |
|---|---|---|
| Diff engine — AA-aware pixelmatch, band alignment, SSIM, region clustering | ✅ | T1 suite |
| Source adapters — `figma` / `images` / `url` | ✅ | T3 suite |
| Baseline mode (visual regression, no designer) | ✅ | T4 suite |
| Version-keyed cache, 429 retry, degradation ladder, `snapshot` | ✅ | T2 suite |
| `summary.json` v2 + published JSON Schema | ✅ | ajv-validated, T5 |
| Sticky PR comment + composite Action, `--strict` | ✅ | Verified on a real PR |
| MCP server — `list_frames`, `capture`, `compare`, `get_summary`, `explain` | ✅ | T6.1–T6.7; SSRF 5/5 refused and logged |
| Explain engine (Build 4.0 Phase A) | ✅ | 25 checks, zero live calls in CI |
| Calibration harness | ✅ and **executed live** | `calibration.md`, 22 recorded calls |
| Commands | `init` `doctor` `auto` `compare` `check` `comment` `explain` `baseline` `snapshot` `clean` | 10 commands — **no `upload`** |

**Published, verified live against the registry on 2026-08-10:**
`norma-scope@0.7.5` (`dist-tags.latest = 0.7.5`) and `normascope-mcp@0.2.2`,
both Apache-2.0.

> The previous audit recorded 0.7.3 and 0.2.0 as current. **Two further
> norma-scope releases and two MCP releases have shipped since**, and the
> release notes for them live only in commit messages.

### 2a. The three post-audit defect fixes

Each was found by using the tool, not by a test. Worth recording because one of
them invalidates a number quoted elsewhere.

**`b3db0c7` — capture viewport, diff sensitivity by mode.** `init` persisted
each Figma frame's dimensions and `auto` used *both* as the browser viewport.
But a design frame is an artboard — full-page exports run 4,000–9,000px tall —
so every `vh` unit resolved against a window no user has. A 100vh hero rendered
thousands of pixels tall and everything below it shifted; the resulting size gap
then tripped the dimension guard that disables section alignment, losing the
analysis exactly where it would have helped.

> ⚠️ **This invalidates the committed Bose example's recorded score.** It was
> **79.7% with a size warning and no alignment**; the same config now scores
> **36.4% with banded alignment across 3 drifted sections**. The 79.7% was the
> tool measuring its own misconfiguration. Anywhere that figure is quoted as
> evidence of quality is now wrong — including any deck or page reusing it.

**`ce0a147` — MCP `compare` captures before scoring.** The tool had two branches
with opposite capture semantics: the zero-config branch captured then diffed;
the configured-frames branch only diffed screenshots already on disk. For an
agent this is the worst possible failure — it edits the UI, calls `compare`, and
is handed the score of the app *before* its edit. A false all-clear from the
tool whose whole job is catching what you cannot see. Both branches now capture;
`capture: false` opts out. Adds T6.7, which covers the configured branch that
previously had none.

**`8e96b5e` — ERESOLVE install failure on npm 10.** `@anthropic-ai/sdk` was
declared `^0.112.3` in `peerDependencies` with `optional: true`. `optional` only
means the peer may be *absent* — it does not widen the range, so any project
already depending on the SDK outside that caret could not install norma-scope at
all. npm 11 tolerates it; npm 10 does not, and Node 20 is still the common
`setup-node` pin — so this broke installs for users while staying invisible on a
maintainer machine. Both manifests now declare `>=0.112.3`.

### 2b. Loose ends in this tier

- **Release tags — recorded, not a task.** Local tags stop at `v0.7.3`; the
  remote has only `v0.2.1`, `v0.6.0`, `v0.7.0` (checked live with
  `git ls-remote`, 2026-08-10), and `0.7.4`/`0.7.5` have no tag at all.
  Noted for accuracy only: **FUTURENORMA §2 settles that tags are deliberately
  not tracked as a task** — npm and `main` are the record of what shipped, and
  no step is blocked on it. Do not re-raise this as a risk.

  > ✅ **Reconciled 2026-08-10.** FUTURENORMA §4's Step 0 row said "Done when:
  > **Tag pushed**, registry listed" while §2 said tags are not a task. The §4
  > row now matches §2 and Step 0's own body text — registry listing and
  > `doctor` explain-readiness, no tag.
- ❌ **Still no `upload` command.** `src/upload.ts` does not exist and
  `src/index.ts` dispatches 10 commands, none of them `upload`. See §7 #1.
- Open: `doctor` says nothing about explain readiness — `grep -ic "explain"
  src/doctor.ts` returns **0**.
- Open: `sourceType()` (`src/config.ts:105`) still returns `"figma"` for
  baseline-only configs. Guarded at the call sites — `doctor.ts:125` carries an
  explicit comment explaining the guard — but still unsafe by type.
- Open, **unverified this audit**: MCP registry listing (the last Build 3.5
  Stage 3 gate item). I did not check the registry.

---

## 3. argus-cloud — the backend substrate

**This remains finished and good** — with two modules that nothing calls.

| Area | State | Evidence |
|---|---|---|
| Stage 4 schema — orgs, users, memberships, hashed api_keys, repos, runs, share_links, frame_stats | ✅ | `migrations/001` |
| Credits ledger — grants, expiry, atomic consume/refund, computed balance | ✅ | C1, incl. a race test |
| Usage meter — append-only, microdollar costs, cache splits | ✅ | C-suite |
| Org-scoped result cache — org in the key hash **and** the row | ✅ | C3, incl. cross-org miss |
| Circuit breaker + admin spend view | ✅ | C6 |
| Agent keys with per-key monthly budgets | ✅ | C7 |
| History enrichment — trend, `firstDriftCommit`, `recurrence`, 2K cap | ✅ | 15 checks (D6) |
| Waitlist traction queries + CSV | ✅ | 28 checks, live-verified — §4c |
| Race-safe migrations (advisory lock, one transaction) | ✅ | 16 checks incl. 20 real cold starts on real Postgres — §3a |
| Storage port + filesystem and S3/R2 drivers | ✅ | 45 checks, one contract run against both drivers, S3 leg verified on **real Cloudflare R2** — §3b |
| Request rate limiting — per key **and** per org, counted in the database | ✅ | 34 checks incl. 20 separate processes sharing one ceiling on real Postgres — §3c |
| Provider-dollar reservation before every call, idempotent settlement | ✅ | 54 checks incl. 20 separate processes sharing one budget on real Postgres — §3d |
| Credit prices derived from worst-case cost, 50% margin floor enforced | ✅ | Asserted every run: no operation can be sold below cost — §3e |
| CI batch service — Batches API, 50% rate, reserve→refund, escaped PR line | 🟡 | 18 checks (D2), **fixture-level only** |
| MoR webhook handling — HMAC, idempotent | 🟡 ⚠️ | C5 fixture-level, **and unreachable** — §7 #4 |
| Monthly reconciliation + <50% margin alert | 🟡 ⚠️ | C8 — **unreachable, and carries a bug** — §7 #7 |
| Credit packs seeded from measured COGS | ✅ | `migrations/005`, repriced by `007` |
| Credits per operation | ✅ **derived, not chosen** | analysis 5, deep 8 — §3e |

Migrations are `001`–`007`. Four suites: `metering`, `enrichment`, `cibatch`,
`waitlist`.

**Reachability, traced this audit.** Every module is imported by a web route or
transitively through `explainService.ts` / `ciBatch.ts` — **except two**:

| Module | Imported by |
|---|---|
| `src/reconcile.ts` | ⚠️ **nothing** — no route, no script, no other module |
| `src/webhooks.ts` | ⚠️ **nothing** — no route, no script, no other module |

`resultCache`, `enrichment` and `breaker` have no direct web import but are
reached through `explainService`/`ciBatch`, so they are live.

**`src/providerBudget.ts` now exists** (pre-call provider-dollar reservation) —
see §3d. It was listed here as missing in the previous audit.

### 3a. Migrations are safe to run at the same time — Pathway 1, item 1 ✅

Done 2026-08-10 (PATHWAYS §10.3 "1A").

**The problem.** The server runs `migrate()` every time it starts. On serverless,
many copies of the server can start at once. They all tried to create the same
tables at the same moment and crashed into each other.

**The fix**, in [`src/db.ts`](../src/db.ts):

1. Ask Postgres for a lock before migrating. One caller runs; the others wait,
   then look again and find the work already done.
2. Run all migrations inside one transaction. If any migration fails, they all
   roll back. A half-migrated database is worse than one that never started.

**Why the lock is tied to the transaction, not the connection.** Postgres offers
both kinds. A connection-level lock is only released when that connection
closes — so if the process dies while holding it, the lock stays held and every
future start hangs forever. A transaction-level lock is released by COMMIT,
ROLLBACK, or the process dying. The worst case becomes a retry.

**A second bug found on the way.** Our PGlite wrapper had an `exec` that ignored
the transaction it was handed and ran SQL on the outer connection instead. So
migration SQL inside a transaction actually ran *outside* it. The tables would
have survived a rollback, quietly defeating the fix above. Check M5.2 guards
against it coming back.

**Tests** — `test/migrations.test.mjs`. 12 checks on PGlite, 16 against real
Postgres. Included in `npm test`.

| Check | What it proves |
|---|---|
| M1–M2 | A fresh database gets all 7 migrations. Running `migrate` three times still leaves 7. |
| M3 | 20 migrations at once: none fail, exactly 7 rows. |
| **M3b** | The old code **fails** that same test — 19 of 20 rejected with `relation "orgs" already exists`. |
| M4 | An older build starting against a newer database works. It ignores the migration it has never heard of and changes nothing. |
| M5 | A migration with bad SQL rolls everything back. No half-created tables, no leftover bookkeeping row. |
| M6 | The lock is released afterwards, so a later `migrate` can take it. |
| **M7** | *(real Postgres)* 20 separate processes start against one database: none fail, **20 different Postgres backends**, exactly 7 rows. |
| **M7b** | *(real Postgres)* The old code **fails** that too — 12 of 20 processes die with `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`. That is two processes creating tables at the same instant, colliding inside Postgres's own catalog. |

**Why M7 exists when M3 already passed.** M3 runs 20 migrations at once, but they
share one connection pool. Real serverless starts are separate processes with
their own connections. M7 does that, and confirms they used 20 different Postgres
backends. It is the test PATHWAYS §10.3 1A item 4 actually asks for. It skips
itself on PGlite, where each process would get its own private in-memory database
and the result would mean nothing.

**Why M3b and M7b exist.** A test that passes both before and after a fix proves
nothing. These two re-run the old code and check it still fails. If either ever
starts passing, the test it guards has stopped testing anything.

**Repeatable.** The real-Postgres run was done twice against the same database,
with identical results. To run it yourself:

```bash
DATABASE_URL="$(scripts/test-db.sh start)" npm test
```

That script starts a throwaway Postgres. It does not install a background
service and does not touch your default cluster.

**Live check.** The dev server started through the new code against the existing
`.pgdata` database. Migrations were already applied there, so it took the
"nothing to do" path. `/` and `/admin/waitlist` both returned 200. No server
errors.

### 3b. Storage — one interface, two backends — Pathway 1, item 2 ✅

Done 2026-08-10 (PATHWAYS §10.3 "1D"; BuildV5 F3).

**What this is.** Everything that stores a file goes through one interface.
Behind it sit two implementations: local disk for development and tests, S3/R2
for production. Switching between them is a change of environment variables, not
code.

| File | What it does |
|---|---|
| `src/storage.ts` | The interface — `put`, `get`, `head`, `presignPut`, `presignGet`, `delete`, `deletePrefix` — and the code that picks a backend |
| `src/storage/keys.ts` | Builds and validates file paths, and the expiry rules for temporary links |
| `src/storage/filesystem.ts` | Local disk, used by the test suites. Its temporary links are really signed, not faked |
| `src/storage/s3.ts` | S3 and Cloudflare R2. **The only file allowed to import the AWS SDK** |

**Where files live:** `org/{orgId}/blob/{sha256}.{ext}` — the same path in both
backends.

Files are named after a hash of their contents, but **only within one
organisation**. The same image uploaded by two customers is stored twice. That is
deliberate:

- If the hash were shared across customers, knowing a hash would be enough to
  read another customer's file.
- If two customers shared one stored file, deleting a customer would mean
  checking every other customer first. Keeping them separate means deleting a
  customer is just deleting one folder.

**About `get()`.** BuildV5 lists six methods; this is a seventh, added on
purpose. On local disk, a temporary download link points back at our own app, so
the code serving that link has to read the file. It must do that through this
interface. Letting it call `node:fs` directly would bake "files live on disk"
into code above the interface — the same mistake as importing S3 types, just in
the other direction.

> **Temporary link** (a "presigned URL") means a URL that lets someone upload or
> download one specific file without logging in, and stops working after a set
> time. Anyone holding it can use it, which is why the expiry is short.

**The same tests run against both backends.** `test/storage.test.mjs` runs one
20-check contract against local disk and against S3. If the local backend were
more forgiving than S3, every later test suite would be proving something that
is not true in production. 45 checks in total.

| Check | What it proves |
|---|---|
| S0 | File paths are built and normalised correctly, and bad org IDs, bad hashes and unwanted file types are refused (`svg` and `exe` are not allowed) |
| S1 / S4 | The shared contract, on local disk and on S3: files round-trip, a missing file returns nothing rather than erroring, deleting twice is fine, folder delete reports a true count, **one org's file survives another org's deletion even with identical contents**, an over-long link expiry is refused rather than shortened, 6 malicious paths refused |
| S2 | Link signatures: a swapped file path, a stretched expiry, a wrong secret, and empty or malformed signatures all fail |
| S3 | Nothing is ever written outside the storage folder |
| **S5** | *(real S3)* Temporary links are **actually used**: upload without logging in works, download returns the exact bytes, uploading more bytes than agreed is refused, an unsigned link is refused, an expired link is refused |
| **S6** | *(real S3)* Deleting a folder of **1050 files** — past S3's 1000-file page limit — removes and counts all of them, and running it again is a clean no-op |
| S9 | No file above the interface imports the AWS SDK (BuildV5 F3.2), the S3 file genuinely is the one that imports it, and it is loaded on demand so the local-disk path never touches it |

Two of these are worth calling out:

- **S5** uses the temporary links for real. A link that is refused when actually
  used is a failure no shape check can catch.
- **S6** matters because S3 lists and deletes in pages of 1000. Anything past
  that number takes a different code path, and that path is the first thing a
  real customer deletion runs. A mistake there loses customer data while
  reporting success.

**Test totals, three setups, 0 failures:**

| Setup | Checks |
|---|---|
| Default — PGlite and local disk | **139** |
| Plus real S3 (MinIO) | **169** |
| Plus real Postgres **and** real S3 | **173** |

```bash
eval "$(scripts/test-s3.sh start)"                  # local S3 (MinIO)
export DATABASE_URL="$(scripts/test-db.sh start)"   # local Postgres
npm test
```

**Tested against real Cloudflare R2 on 2026-08-10.** The same 33 S3-side checks
were re-run against a real R2 bucket, using an API token limited to that one
bucket. No code changed and no test changed — only environment variables. All
passed, and the bucket was left with 0 files in it.

Two things only a real service could tell us:

- **The upload size limit holds on R2.** FUTURENORMA §4 Step 5 warns that
  "presigning, `Content-Length` pinning, and TTL behave differently against a
  real service than a local stub". Check S5.4 — uploading more bytes than the
  link agreed to — is refused on R2. That was the most likely thing to break,
  and it did not.
- **R2 and MinIO refuse an unsigned link differently.** R2 answers `400`, MinIO
  answers `403`. Harmless only because S5.5 checks that the request was
  *refused*, not which number came back. It is a live example of why a local
  stand-in is not proof: a test written against the exact number would have
  passed locally and failed here.

The token cannot list buckets. That is intended, and it confirms the token is
limited to the test bucket and cannot reach the portfolio's existing R2 files.

> ⬜ **Still unproven on R2:** behaviour at production scale, billing and quota
> limits, multipart upload (nothing uses it yet), and lifecycle rules. A separate
> **production** bucket and token are still a Step 5 item — the bucket used here
> is disposable.
>
> The **deletion job** that removes storage folders alongside database rows is
> Pathway 1 **item 6**, not this one. What item 2 delivers is the piece that job
> needs: a folder delete that is safe to retry, resumable, and reports a true
> count.

### 3c. Request rate limiting — Pathway 1, item 3 ✅

Done 2026-08-10 (PATHWAYS §10.3 "1C" items 1–5).

**The problem.** `api_keys.rate_per_minute` has been stored since migration 001
and was enforced by nothing. Every authenticated API path — upload, hosted
explain, CI batch enqueue and collect — accepted requests as fast as they
arrived. The only limiter in the repo was the waitlist route's per-IP bucket,
which lives in process memory and says so in its own comment.

**Why memory is not an option here.** The deployment target is serverless. A
counter in module scope caps one instance, and the platform decides how many
instances exist, so the real ceiling is however many the platform starts. The
count has to live where every instance can see it: the database.

| File | What it does |
|---|---|
| `migrations/008_rate_limits.sql` | `rate_limit_windows` — one row per (scope, subject, minute), with `allowed` and `rejected` counted separately |
| `src/rateLimit.ts` | The limiter, the caller-facing message, and the read-only operator queries |
| `web/lib/auth.ts` | `rateLimited()` — turns a refusal into a 429 with `Retry-After` |
| `web/app/admin/limits/page.tsx` | Operator view: totals and busiest subjects, worst first |
| `test/rateLimit.test.mjs` | 31 checks on PGlite, 34 against real Postgres; wired into `npm test` |

**Two ceilings, not one.** Every request is counted against the key *and* the
organization. A per-key limit on its own is not a limit, because an org that can
mint keys can mint its way past it. Both counters move inside one transaction,
organization first, then key — a fixed order, so concurrent requests queue
instead of deadlocking, and a request refused by the org ceiling leaves the key
counter untouched.

**A refused request costs no window budget.** The counter only advances when the
request is let through. If refusals counted, a client retrying hard would push
its own recovery past the end of the window it is already inside. Refusals are
counted in a separate column, for the operator view.

**What the caller gets:** HTTP 429, a `Retry-After` header, and a stable body —
`code: "rate_limited"`, the caller's own ceiling, and the seconds to wait. The
message ends "No credits were used", because a refusal must not read like a
spend.

Evidence — the suite run against real Postgres 17.10, not fixtures:

| Check | Result |
|---|---|
| 20 **separate processes**, one database, one key with a limit of 5 | exactly 5 got through |
| The same 20 processes against a process-local counter | all 20 got through — the test above has teeth |
| 50 concurrent calls, one key, limit 10 | exactly 10 allowed, 40 recorded as rejected |
| Two keys under their own ceilings, one org ceiling of 4 | 4 of 6 allowed; the org ceiling is what refused |
| Org A exhausted | org B unaffected, zero rejections |
| A limit of 0 | refuses the first request of the window, not just later ones |
| Org deleted | its counter rows go with it (`ON DELETE CASCADE`) |
| Operator view | counts only — key ids, never key material |

Live end-to-end against the dev server, not only the unit suite: a key with a
limit of 3 returned `201, 201, 201, 429, 429` on `/api/upload`, and the same
key was then refused on `/api/explain` and `/api/ci-explain` inside the same
minute — one bucket per key across all routes, because partitioning per route
would multiply the real ceiling by the number of routes.

> ⬜ **Not covered, and named rather than assumed away:**
>
> - **Unauthenticated flooding.** The limiter sits *after* key lookup, so a
>   request with no valid key is rejected 401 without touching a counter. That is
>   correct — an anonymous caller must not be able to fill someone else's bucket
>   — but it means there is still no IP or endpoint limit in front of auth.
>   PATHWAYS' §"Required controls" 5 asks for both; this is the key half.
> - **The window is fixed, not sliding.** A caller can spend the tail of one
>   minute and the head of the next, so the worst case over any 60-second span is
>   2× the limit. Acceptable for an abuse ceiling; it is not a throughput
>   guarantee and must not be described as one.
> - **Budget alerts at 50/75/90/100%** (the rest of §10.3 1C) are unbuilt. The
>   breaker still only acts at 100%.
> - **The defaults are engineering judgement, not measurement.** 60/min per key,
>   300/min per org, both env-overridable. Nothing in pricing depends on them.

### 3d. Provider dollars are reserved before the call — Pathway 1, item 1B.1 ✅

Done 2026-08-10 (PATHWAYS §10.3 "1B.1"–"1B.3"; FUTURENORMA Doctrine 11).

**The problem.** `breaker.ts` added a call's cost to the day's total *after* the
call returned, and tripped when the total passed the budget. That is detection,
not a cap. Ten requests arriving together all read the same pre-call total, all
saw room, and all called the provider. The eleventh was stopped; the ten already
in flight were not. FUTURENORMA §6 carried this as an open risk in exactly those
words.

**The fix.** Money is set aside before the call, sized to the worst that call
could cost, and the call is refused if it does not fit. The real cost settles the
reservation afterwards and the unused part is released.

| File | What it does |
|---|---|
| `migrations/009_provider_reservations.sql` | `provider_reservations` — one row per attempt, `reserved → settled \| released \| expired` |
| `src/providerBudget.ts` | Hard maximums, reserve/settle/release, the sweeper, the operator view |
| `src/promptAssembly.ts` | The prompt-size cap that makes the hard maximum real (moved out of `web/lib/provider.ts` so it can be tested) |
| `src/breaker.ts` | `tripBreaker()` — the 100% stop, now reached by a refused reservation |
| `src/explainService.ts`, `src/ciBatch.ts` | Reserve before the call, settle or release after |
| `web/app/admin/limits/page.tsx` | Spent / reserved-in-flight / cap / percent, per UTC day |
| `test/providerBudget.test.mjs` | 54 checks on PGlite, 58 against real Postgres; wired into `npm test` |

**Where the maximum comes from.** Not from measurement. The measured blended
$0.0164 is a forecast and says nothing about the worst case. The reservation is
computed from caps the request path actually enforces: 4096 output tokens
(`max_tokens`), a 24,000-character user prompt, a 4,000-character system prompt,
and a deliberately low 2.5 characters per token. Every input token is priced as a
cache *write* (1.25×), the most expensive way it can be billed. The prompt cap is
new — frame stats are customer-supplied and were previously bounded only by the
2MB upload limit, so the "maximum" would have had nothing enforcing it.

**Two ledgers stay separate.** Customer credits are what the customer bought;
provider dollars are what we owe Anthropic. Both are reserved before the call,
both are given back on failure, and neither nets against the other.

Evidence — real Postgres 17.10:

| Check | Result |
|---|---|
| 20 **separate processes**, one budget with room for 4 | exactly 4 granted, nothing overshot |
| The same 20 processes running the **pre-1B.1** check-then-call logic | all 20 granted — the test above has teeth |
| 40 concurrent reservations, room for 3 | exactly 3 |
| Settle, then settle again (retried worker) | the day's spend is unchanged |
| Release after settle / settle after release | both refused — one terminal transition only |
| Abandoned reservation, past expiry | stops holding capacity; a late settle still records the real spend |
| Org ceiling exhausted | that org refused, another org unaffected, global untouched |
| Unpriced model | refused before any reservation; the breaker does not trip |
| Org deleted | reservations cascade away |
| 700KB frame stats | prompt assembles within the cap, truncation is declared, the data delimiter still closes |

**The breaker changed meaning, and the test moved with it.** C6 previously
asserted that a call went through, the spend was recorded, and *then* the breaker
tripped — i.e. the budget was discovered after being exceeded. That path no
longer runs, because the reservation refuses first. The global ceiling now trips
the breaker on refusal, so it stays sticky and still needs a manual reset, and
C6 asserts the stronger property: no provider call, no spend, no credits used.

### 3e. Credits are derived from cost — Pathway 1, item 1B.2 ✅

Decided and implemented 2026-08-10. **The rule: credits are relative to the cost
we incur, and no scenario may deny profit.**

Computing the worst case in §3d showed every operation losing money at its
ceiling — analysis cost up to $0.1034 against $0.0353 of revenue. That was a
pricing decision, not a bug, and it was taken: **prices are no longer chosen,
they are derived.**

`creditsRequired(model)` divides the operation's hard maximum by the revenue a
credit earns at the cheapest pack net of payment fees ($0.03535), applies
`MARGIN_FLOOR = 0.5`, and rounds **up** — so rounding always favours us and no
operation is ever free. `explainService.ts` and `ciBatch.ts` price every call
from the model that call will actually use, so there is no path where the price
and the model disagree.

| Pass | Model | Worst case | Credits | Revenue | Margin at worst case |
|---|---|---:|---:|---:|---:|
| analysis | Sonnet 5 | $0.0784 | **5** (was 1) | $0.1767 | 55.6% |
| deep | Opus 4.8 | $0.1307 | **8** (was 3) | $0.2828 | 53.8% |

The maximum also got more accurate, not just more pessimistic: the system prompt
is priced as a cache write (1.25×) because that is its worst case, user content
as ordinary input because that is what it is, characters-per-token moved 2.5 →
3.0, and the prompt cap 24,000 → 12,000 chars (realistic content is ~9,000). An
inflated maximum is not free caution — it reserves money we were never going to
spend and, now that credits derive from it, charges the customer for headroom
that does not exist.

Enforced, not documented:

| Check | What it stops |
|---|---|
| Every operation clears the margin floor at its worst case | A model swap without the price following it |
| No operation can be sold below cost under any input we accept | The original defect, permanently |
| Credits track model cost: haiku 2 < sonnet 5 < opus 8 | The derivation degenerating into a typed constant |
| An unpriced model has no credit price | Selling something we cannot cost |
| No operation rounds to zero credits | A free call by arithmetic accident |

The existing suites were changed to *derive* their expected balances from
`CREDITS_PER_ANALYSIS` rather than assert `1`. A test that hardcodes a price
stops testing the behaviour the moment the price is allowed to move.

> ⚠️ **Consequence that needs a decision: the monthly allowance buys less.**
> At 5 credits per analysis, the 500 included credits are **100 analyses a
> month**, not 500. Nothing is loss-making — but the plan feels smaller.
>
> The lever is the model, and cost-wise it is large:
>
> | If a pass ran on | Worst case | Credits per call |
> |---|---:|---:|
> | Haiku 4.5 | $0.0261 | **2** |
> | Sonnet 5 | $0.0784 | 5 |
> | Opus 4.8 | $0.1307 | 8 |
>
> Analysis on Haiku 4.5 would be 2 credits — 250 analyses in the allowance. This
> is a **cost** result only. PATHWAYS §"Provider substitution" requires the
> calibration fixtures re-run against the candidate and its quality, schema
> validity and refusal rate compared before cutover; that needs live API calls
> and has not been done. **Do not treat 2 credits as available until it has.**

> ✅ **Closed by §3f:** the 50/75/90% alerts that §3d and §3e computed but never
> delivered now reach a human.

---

### 3f. Budget alerts, and a reset with a name on it — Pathway 1, item 6 ✅

Two things were missing and both were about the human, not the arithmetic.

**Spend protection existed at one point: the refusal at 100%.** The percentages
were computed and shown on the operator page, but nothing sent anything, so the
first news of a budget was explain pausing — at which point there is no decision
left to make. `src/budgetAlerts.ts` delivers at 50, 75, 90 and 100% for the
global day, an organization's month, an API key's month, and the funded provider
account balance.

**The breaker could be cleared invisibly.** `resetBreaker(db)` took no arguments
and wrote no record, so the one control that stops spending left no trace of who
released it. It now requires an actor and a reason, checked in the function *and*
by a `CHECK` constraint, and appends to `breaker_events` — as do trips, in the
same transaction that flips the state.

| Rule | How it is enforced |
|---|---|
| One alert per threshold per period | `budget_alerts` primary key `(scope, subject, period, threshold)` |
| Concurrent instances do not duplicate | The row is claimed *before* the send; only the claimer sends |
| A crash mid-send does not lose the alert | `claimed_at` + `ALERT_RETRY_AFTER_SECONDS` re-arms it |
| A send that throws is retried at once | The row is re-armed immediately with the error recorded |
| A new day/month/funding re-arms | `period` is part of the key |
| An unattributed reset is impossible | Required arguments *and* a database `CHECK` |
| A trip always has an audit row | Both writes are one transaction |

**Where the alert message is decided.** A budget that goes 40% → 95% has crossed
three marks. All three are recorded, but **one** message is sent, naming 90% and
saying which marks it passed on the way. Three pages for one event trains an
operator to ignore the channel.

**Claim-then-deliver is a deliberate trade.** Marking a row delivered only after
a successful send lets every concurrent evaluation claim the same row — the first
cut did exactly that and B4 caught it, 20 alerts for one event. Claiming first
costs a lost alert if the process dies between claim and send; `claimed_at`
bounds that to two minutes. A bounded duplicate beats an unbounded loss.

`test/budgetAlerts.test.mjs` — **50 checks** on PGlite, **54** against real
Postgres, all green. The concurrency claim is
proven the way §3a and §3d prove theirs: **20 separate processes**, released
together on a wall-clock barrier, page a human exactly once. The control that
gives it teeth — read-what-has-been-alerted, decide, send — pages **20 times**
for the same event. Without the barrier the control only collided twice in
twenty; process start-up stagger, not concurrency, and it would have been weak
evidence dressed as strong.

The end-to-end case (B8) asserts the state matrix FUTURENORMA §3 sets out: at
100% the next explain is refused *before* the provider is called, the refusal is
recorded as `blocked_no_charge` rather than a customer failure, `ciStaysGreen`
stays true, clearing the day's spend does **not** clear the breaker, and only an
attributed reset resumes it.

**Provider balance.** `provider_fundings` records what the account was funded
with and who entered it; depletion is measured against `provider_spend_days`
from that date, so there is no second ledger of spend. With no funding recorded
the status is null and nothing is alerted — the launch policy is a small
preloaded float with auto-reload off, and an unfunded provider account is the
one failure a daily cap cannot prevent.

Operator surface: `/admin/limits` gained the balance, the alert log (with
undelivered rows called out as a broken channel, not a quiet one), the
trip-and-reset history, and the reset control itself. The control is a **server
action**, not an API route, so `middleware.ts`'s `/admin` gate covers it — an
`/api/*` route would sit outside that matcher and need its own auth.

> ⬜ **Known limit, stated rather than hidden:** behind the admin password there
> is no session, so the actor on a reset is **self-declared**. It records who
> says they made the call, which is what an incident review needs, but it is not
> authentication. Step 6's session layer should take the actor from the session
> and stop trusting the field.

Migrations are now `001`–`010`. Full suite: **276 checks green** on PGlite,
**291** against real Postgres, across nine suites — run 2026-08-12.

---

## 4. argus-cloud — the web surface

**This section changed more than any other.** The previous audit described "six
files" and an 11-line home page. The `normascope-site` merge (`e42810d`) landed
a real marketing site: **12,314 lines across 70 files** in `web/app` and
`web/lib`.

The distinction that matters: **the marketing site is built; the Cloud product
surface is not.** Those are different things and the line counts do not blur.

### 4a. What now exists

| Tree | Routes | State |
|---|---|---|
| Public site `(site)` | `/`, `/cloud`, `/commands`, `/guide`, `/how-it-works`, `/report` | ✅ built, **not deployed** — see 4d |
| Pitch `(pitch)` | `/pitch` + 7 deep pages, password-gated | ✅ built |
| Operator `/admin` | `/admin/waitlist` + CSV export, `/admin/limits`, password-gated | ✅ built and verified — 4c, §3c |
| Hosted report | `/r/[runId]` | 🟡 **unchanged at 131 lines** |
| API | `upload`, `explain`, `ci-explain`, `share`, `waitlist`, `pitch-unlock`, `admin-unlock` | mixed — below |

### 4b. The Cloud product surface — still the gap

Re-checked by grep this audit, not assumed:

| Capability | State | How checked |
|---|---|---|
| Hosted report showing screenshots / diff overlay | ❌ | no `<img>`, `artifact`, `presign` or `blob` reference in `r/[runId]/page.tsx` |
| Artifact upload — presigned, hashed, quota'd | ❌ | no `artifact`/`presign`/`quota`/`entitle` reference in `api/upload/route.ts`; still summary-JSON only |
| Artifact storage (R2) | ❌ | `src/storage.ts` does not exist |
| Trends / dashboard / charts | ❌ | no file, no route, no query |
| Auth — GitHub OAuth, magic links, sessions | ❌ | `web/lib/auth.ts` is API-key bearer only |
| Org management, invites, key management UI | ❌ | — |
| Billing UI, pricing page, checkout | ❌ | — |
| MoR webhook route | ❌ | no `api/webhooks/*` directory exists |
| Share links UI | ❌ | API exists (42 lines), no UI |
| Rate limiting | ✅ **for authenticated paths** — see §3c. Nothing in front of auth yet |
| Storage/upload quotas | ❌ | no entitlement or quota check on any route |

Access control for a hosted report is still a share token, or `NORMA_DEV_OPEN=1`
for local dev.

### 4c. Waitlist traction — the operator surface ✅

Added 2026-08-10. Closes the "minimum traction mechanism" item in PATHWAYS.md's
public-site demand gate. **Uncommitted at audit time.**

| File | What it is |
|---|---|
| `src/waitlist.ts` | Read-only queries: counts, 30-day series, source/referrer breakdowns, rows, CSV |
| `test/waitlist.test.mjs` | 28 checks, wired into `npm test` |
| `web/lib/gate.ts` | Shared-password gate mechanics for `/pitch` **and** `/admin` |
| `web/middleware.ts` | Gates both trees; default-deny when the password is unset |
| `web/app/admin/waitlist/page.tsx` | Counts, daily chart, breakdowns, signup table |
| `web/app/admin/waitlist/export/route.ts` | CSV download, gated by living under `/admin/` |
| `web/app/api/admin-unlock/route.ts` | Password exchange for the `/admin` cookie |

`ADMIN_PASSWORD` is deliberately **separate from `PITCH_PASSWORD`**: the pitch
phrase gets typed into strangers' laptops and is expected to leak; `/admin`
exposes signup email addresses. The admin cookie expires in 12 hours, not 30 days.

Evidence — run against a seeded local database, not fixtures:

| Check | Result |
|---|---|
| Wrong password | rejected, no access |
| Correct password | page renders; counts match the seed exactly |
| CSV export | `text/csv`, `no-store, private`, attachment filename |
| Spreadsheet formula injection | `=formula@…` exported as `"'=formula@…"` |
| `ADMIN_PASSWORD` unset | **404 on every `/admin` path**, including the export — and including a request carrying a previously-valid cookie |
| Admin cookie against `/pitch` | redirected to the pitch unlock |
| Pitch cookie against `/admin` | redirected to the admin unlock |
| `/pitch` unlock after the refactor | still issues its cookie and admits |
| `robots.txt` | now disallows `/admin/` |

Not covered: this is a shared-password door, not authentication. No accounts, no
per-operator identity, no audit trail of who read the list — Pathway 5. Signups
are deduplicated by address, **not** by person.

### 4d. The site is built but not deployed — which is on plan

Recorded as fact, **not** as a discovered problem: `normascope.com` is not
registered (`whois` returns `No match`, no A record, no NS delegation, checked
2026-08-10), and `web/lib/site.ts:4` defaults `SITE_URL` to it, so `sitemap.ts`,
`robots.ts` and the OG image all build absolute URLs from a hostname nobody owns.

> **This is expected at this stage.** FUTURENORMA §1 and §4 Step 5 say the
> domain is required at **Step 7** (Paddle production checkout demands an
> approved domain) and that a free `*.vercel.app` covers Step 5. Open Decisions
> #1 closes the naming question and states "registration and DNS are needed by
> Step 7, not before; everything until then is local." Nothing here is off-plan.

The one consequence worth tracking: **PATHWAYS' public-website demand test
cannot run until the site is deployed somewhere.** Waitlist traction is
currently zero-by-construction, not by evidence, so the traction surface built
in §4c has nothing to measure yet. That is a sequencing fact, not a blocker to
raise.

Deployment itself is gated on §7 #11 — `web/package.json:14` declares
`"argus-cloud": "file:.."`, so a Vercel project rooted at `web/` cannot see its
own dependency. There is no `vercel.json` in either root. FUTURENORMA §4 Step 1
(F1) owns this and calls for proving it with one free preview deploy.

### 4e. What the site does *not* claim — verified

Checked against the demand gate's honesty requirements:

- ✅ No `--upload`, `norma-scope upload` or `cloud login` string appears
  anywhere under `web/app/(site)` — the false claim recorded as §7 #1 in the
  last audit **is gone from the site**.
- ✅ No `$59`, price, "sign up", "log in" or "subscribe" string on `/cloud`.
- ✅ Three `/cloud#waitlist` anchors wire the early-access actions.
- ✅ Footer carries the Yutic endorsement lockup ("A product from Yutic").
- ⬜ **No terms, privacy or legal page exists** — no file matching `*terms*`,
  `*privacy*` or `*legal*` under `web/app`. FUTURENORMA §4 **Step 8** owns this
  (ToS, Privacy, subprocessors, security contact, data-flow disclosure), so it
  is scheduled, not missing. The narrower item that lands earlier: PATHWAYS'
  demand gate wants "Normascope is operated by Yutic, a sole proprietorship of
  Harsha Attray" in legal-facing copy **before the site is published**, which is
  ahead of Step 8.

The remaining demand-gate boxes (waitlist round-trip in a deployed environment,
owner notification configured, duplicate handling in production) were **not
verified this audit** — they cannot be, until the site is deployed.

---

## 5. The preview — temporary, in the portfolio repo

Live at `harshaattray.com/normascope-cloud` — **confirmed still serving 200 on
2026-08-10.** Access-gated, single-tenant on purpose.
`api/_norma/{login,runs,run,explain}.ts` behind one dispatcher, plus two
frontend routes. Committed @ `b4eeb86`, deployed.

Verified in production 2026-07-29 with a real Bose-landing run: findings
returned with `firstDriftCommit` and `recurrence`, result-cache hit was free,
2.5MB report served from R2.

> ⚠️ That run predates `b3db0c7` (§2a). Its *plumbing* evidence — enrichment,
> cache, R2 delivery — still stands; any **score** it produced does not.

Shares the portfolio's Turso DB and R2 bucket; all tables prefixed `norma_`,
objects `normascope-cloud-*`. **Still scheduled for deletion at Phase J4.**
Portfolio is at 11 of Vercel Hobby's 12 functions.

---

## 6. Measured economics

Base measurement from `calibration.md` — 22 recorded API calls, 2026-07-29.
**Measured, not estimated.**

| Figure | Intro prices | Post-intro list |
|---|---|---|
| Blended COGS per review | **$0.0115** | **$0.0164** |
| Deep review | $0.0203 | $0.0200 |
| Batched analysis | $0.0025/call | — |
| Target | ≤ $0.08 | **met ~5× over** |

**Repriced 2026-08-05 by `migrations/007_repricing.sql`.** The previous audit's
pack table (50/$3, 200/$12, 1000/$60) is superseded. Current state, read from
the products table this audit:

| Pack | Credits | Price | Active | Unit economics after Paddle (5% + $0.50), at list COGS |
|---|---:|---:|---|---|
| `pack_50` | 50 | $3.00 | **retired** | ~51% margin — the flat fee ate it |
| `pack_100` | 100 | $7.00 | ✅ | fee $0.85, COGS $1.64, keep $4.51 (64%), $0.070/credit |
| `pack_200` | 200 | $12.00 | ✅ | fee $1.10, COGS $3.28, keep $7.62 (64%), $0.060/credit |
| `pack_1000` | 1000 | $55.00 | ✅ | fee $3.25, COGS $16.40, keep $35.35 (64%), $0.055/credit |

Subscription is **$59/mo** (was $29). `pack_1000` dropped $60 → $55 so the
ladder actually rewards volume; at the old price it matched `pack_200`'s unit
rate and gave nobody a reason to size up. Floor rule unchanged: pack price ≥ 3×
measured blended COGS at post-intro list prices.

`usage.ts` records at **list** prices deliberately, so recorded spend can never
under-state reality.

⚠️ **Two expiry dates on these figures:**
1. Sonnet 5 intro pricing ends **2026-08-31** — 21 days from this audit.
2. These figures expire when artifact crops ship, because crops change the input
   token profile and therefore COGS. Re-calibrate at BuildV5 G4 before quoting
   any of this again.

Pack ids are still provisional slugs; they must be remapped to real MoR product
ids once the Paddle sandbox catalog exists, because the webhook grant path looks
products up by this id.

---

## 7. Corrections — where the plans and the code disagree

Every row re-verified against code on 2026-08-10. Status column added.

| # | The claim | The reality | Status |
|---|---|---|---|
| 1 | "Upload runs with `norma compare --upload`" | **`--upload` does not exist**, and neither does an upload command | **Half fixed.** The false claim is gone from the site (§4e); the command still does not exist |
| 2 | "Next.js web surface ✅ built" | Built as *routes* | **Reframed.** The marketing site is now real (12,314 lines); the *Cloud product* surface is still §4b |
| 3 | "Dashboard + trends: mode-aware charts" | Does not exist in any form | **Still true** |
| 4 | "MoR webhook handling ✅" | `src/webhooks.ts` is real and tested — and **no route calls it** | **Still true.** No `api/webhooks/*` directory exists |
| 5 | Paddle and Lemon Squeezy "reduce to" generic HMAC-hex | **They don't.** Paddle signs `ts:body` and sends `ts=<unix>;h1=<hmac>` | **Still true.** Adapter unwritten |
| 6 | "Upload API: … rate-limited" | `rate_per_minute` was written and selected, read by nothing | **Fixed** (§3c). Enforced per key and per org, in the database |
| 7 | Reconciliation reports gross margin | `reconcile.ts:45` counts revenue from `pack_purchase` only; allotment-funded spend lands as cost against zero revenue and can trip the <50% alert into an unjustified reprice | **Still true — and worse:** the module is also unreachable (§3) |
| 8 | Hosted explain is a paid upgrade | It is **weaker than the free CLI** — grounded in `summary.json` metadata, not image crops | **Still true.** Honestly hedged in the prompt; BuildV5 G3 fixes it |
| 9 | A customer with credits can use them | ❌ **Not from the CLI.** Org-credits mode exists only in the MCP server (`server.ts:275–276`); the CLI explain path has no `NORMASCOPE_ORG_KEY`/`NORMASCOPE_CLOUD_URL` reference at all | **Still true.** A paying customer would pay twice |
| 10 | `migrate()` runs safely | It runs on **cold start** in `web/lib/db.ts`. N concurrent cold starts race N migration runs | **Still true.** Pathway 1A |
| 11 | `web/` deploys | `web/package.json:14` declares `"argus-cloud": "file:.."` | **Still true.** No `vercel.json` anywhere |
| 12 | *(new)* The Bose example scores 79.7% | It scores **36.4%**; the old figure was a misconfiguration (§2a) | **New this audit** |

`normascope.com` being unregistered is **not** listed here. FUTURENORMA §1 and
Open Decisions #1 already say registration comes at Step 7, so the code and the
plan agree — see §4d.

---

### 7a. Doc-versus-doc reconciliation — 2026-08-10

The rows above are plan-versus-code. This pass was plan-versus-plan, prompted by
a question about tiers. Six conflicts between `FUTURENORMA.md` and `PATHWAYS.md`
(and inside FUTURENORMA) were found and closed.

| # | Conflict | Resolution |
|---|---|---|
| 1 | Doctrine 9 stated "no ladder above it, no lite tier below it" as a rule that does not bend, while §3, §5 and PATHWAYS §2 all plan a ladder after validation | Doctrine 9 reworded to **one tier *at launch***; the unbending part is the order (evidence, then a tier), not the count forever. Mirrored in `CLAUDE.md` |
| 2 | §4 said "the repo-count ladder is closed" and "plan-tier logic never needs to exist", while §5 said "the repo ladder above Team is still open — needed for the pricing page" | §4 corrected. Plan limits are **configuration read at runtime**, so a second tier is a config row, not an authorization rewrite. This was the one with real rework attached |
| 3 | §3 promised "unlimited repos and seats"; §4 and §5 operated a 10-repo fair-use line; PATHWAYS' Starter hypothesis assumed 3 — **three numbers** | **`PATHWAYS.md` §2 is now authoritative for what a plan offers** (`CLAUDE.md` carve-out). FUTURENORMA keeps the price and the economics and states no repository figure. Git history shows why: the 2026-08-05 commit that decided $59 recorded this sub-decision as *open* and left both branches in the text |
| 4 | The two documents' running orders diverge after step 3 — and PATHWAYS has no deploy, billing, or launch pathway at all | Divergence **recorded in §4 as a table** rather than silently reconciled. PATHWAYS' order still wins (`CLAUDE.md`); changing it is a strategy decision |
| 5 | PATHWAYS' Pathway 1 list carried 7 items; §10.3 described three more (1B.1–1B.3) that appeared nowhere in the list | List rewritten to 10 items with §10.3 cross-references. **This one had already bitten** — Pathway 1 read as nearly done while the provider-spend hole was open |
| 6 | §5 claimed `migrations/001`'s `DEFAULT 'trial'` "is superseded by a later migration" | **No such migration exists** (checked `001`–`009`). Corrected to an open item owed at Step 6 |

> **The one still open, and it has a customer in it:** the launch repository
> figure. Operating at 10 and later publishing a Starter of 3 would take seven
> repositories off every existing $59 customer on ladder day. Both documents now
> forbid quoting a number until it is decided, and require any published Starter
> to be no smaller than the line already in operation.

Also corrected: §4's Step 0 row demanded a pushed tag that §2 says is not a task
(§2b), and PATHWAYS §10.3 1B.2 still framed pricing around "one credit" per
analysis, which the derivation in §3e replaced.

**None of these were caught by a suite**, because no suite reads prose. The one
that mattered — #5 — was invisible precisely because each document was internally
plausible on its own.

---

## 8. Decisions that are settled

Recorded so they are not re-litigated. Each has its reasoning where cited.

| Decision | Date | Where |
|---|---|---|
| Licence: **Apache-2.0** for the client (CLI, MCP, Action); `argus-cloud` stays closed | 2026-07-29 | FUTURENORMA §5 item 11 |
| Brand: **Normascope** for both tiers; paid tier is **Normascope Cloud**, never a second brand | — | RebrandV1 |
| Payments: **merchant of record**, not Stripe (India constraint). **Paddle chosen** | 2026-08-03 | — |
| **No trial.** `plan` is `free \| team \| lapsed`; the free CLI is the trial; risk reversal is a 30-day money-back guarantee | 2026-08-03 | BuildV5 §G2c |
| **Free plans cannot upload anything** — no key, no presigned URL, no bypass flag | 2026-08-03 | BuildV5 §G2c |
| Trial deferred as a later experiment with a settled design (no card, one per GitHub org, ~15-review grant) | 2026-08-03 | BuildV5 §G2c |
| Stack: Next.js on Vercel | — | CHECKPOINT |
| Explain is **Anthropic-only** in hosted; provider flexibility belongs in BYO | — | FUTURENORMA §8 |
| Build order: **local first, deploy when demonstrable** | 2026-08-03 | BuildV5 Phase F / J |
| **One paid tier at $59/mo**, no ladder, no lite tier; packs need a live subscription | 2026-08-05 | CLAUDE.md, `migrations/007` |
| `/pitch` and `/admin` use **separate passwords** — the pitch phrase is expected to leak | 2026-08-10 | §4c, `web/lib/gate.ts` |

---

## 9. Named open risks

Carried forward per doctrine — a suite that was not run is an open risk, never
an assumed pass.

Scheduled work is **not** listed here. `normascope.com` registration (Step 7),
legal pages (Step 8), and git tags (not a task per FUTURENORMA §2) were briefly
mis-filed as risks in an earlier draft of this section and are deliberately
absent.

| Risk | Status |
|---|---|
| E1 hosted-path injection fixtures not run 1:1 | **Open.** CLI-side suite is green; the hosted path has never been proven. Widens when crops ship |
| E6 provider retention posture unverified | **Open.** Disclosure page unwritten |
| E7 live purchase loop | **Blocked** on Paddle |
| Hosted findings metadata-grounded, not crop-grounded | Known, hedged, fixed by BuildV5 G3 |
| A paying customer would pay twice (§7 #9) | **Open — launch blocker for the paid tier** |
| `reconcile.ts` margin bug (§7 #7) | **Open**, and the module is unreachable. Fix before the first paying org |
| `webhooks.ts` unreachable, Paddle adapter unwritten | **Open — launch blocker.** No revenue can be provisioned |
| No rate limiting on any request path | **Closed for authenticated API paths** (§3c): per-key and per-org ceilings counted in the database, proven across 20 separate processes. **Still open in front of auth** — no IP or endpoint limit, so the unauthenticated surface is unprotected |
| Retention sweep unbuilt | **Open.** Storage growth is bounded by nothing but goodwill |
| No provider-dollar reservation before calls | **Closed** (§3d). Reserved before every call, settled idempotently, proven across 20 separate processes |
| ~~Worst-case cost exceeds credit revenue~~ | **Closed** (§3e). Credits are derived from the hard maximum with a 50% margin floor, enforced by the suite. **Consequence needs a decision:** the 500 included credits now buy 100 analyses, not 500; analysis on Haiku 4.5 would make it 250, gated on a calibration run |
| Budget alerts at 50/75/90% | **Open.** The bands are computed and shown; nothing delivers an alert below 100% |
| Lab shares the portfolio's DB and R2 | Accepted for a test deployment; prefixes make removal clean |
| Prepaid API balance is small (~$19) | Mitigated by the daily cap. Keep it on |
| Sonnet 5 intro pricing ends 2026-08-31 | **21 days.** Post-intro COGS is already the basis for the pack floor, so no repricing is forced — but verify |
| No paying customers exist | Every economic figure here is a projection from measured COGS, never from revenue |

---

## 10. The honest one-paragraph summary

The free product is finished, published, and better than it was — 83 green
checks, `norma-scope@0.7.5` and `normascope-mcp@0.2.2` live, and three real
defects fixed by using it on real sites, one of which revealed that a
long-quoted quality score was the tool measuring its own misconfiguration. The
paid product's **engine** is still finished and good — 91 green checks covering
credits, metering, caching, budgets, breakers, enrichment and now waitlist
traction. What changed most since the last audit is the **marketing** surface,
which went from eleven lines to a twelve-thousand-line site — undeployed, which
is on plan, and blocked only by the `file:..` dependency that FUTURENORMA §4
Step 1 already owns. The **Cloud product** surface is exactly where it was: no
images in the hosted report, no upload command to feed it, no trends, no auth,
no billing route, and two backend modules — reconciliation and the MoR webhook —
that nothing calls. The distance to first revenue is still mostly UI and
integration over data that is already modelled and stored, which is what
FUTURENORMA §4 Steps 1–4 sequence.
