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

**Re-run 2026-08-13** on branch `pathway-1-spend-safety`, after the deployment
substrate work in §4f, the reconciliation work in §3h, the webhook work in §3i
and the retention work in §3j: `npm run verify` —
which typechecks the server package, typechecks `web/`, runs the full suite,
builds the web app and audits production dependencies — **exits 0**.

| Command | Result |
|---|---|
| `npm test` (PGlite) | **410 checks, 0 failures**, 13 suites |
| `DATABASE_URL=… npm test` (real Postgres 17) | **434 checks, 0 failures**, 13 suites |
| `npm run verify` | exits 0 |

The three `npm audit` highs are the already-signed-off
`next`/`postcss`/`sharp` rows, inside their review dates. Working tree still
dirty: `src/db.ts`, `web/next.config.mjs`, both `WaitlistForm` components,
`web/app/api/waitlist/route.ts`, plus untracked `vercel.json` and
`web/lib/waitlistEmail.ts`.

**The suite is now discovered, not listed.** `npm test` runs
`scripts/run-tests.mjs`, which picks up every `test/*.test.mjs`. It replaced a
hand-maintained chain of `&&` in `package.json` that had to be edited each time
a suite was added — a step that can be forgotten, and a suite nobody registered
is a suite nobody runs (Doctrine 3). It also runs every suite rather than
stopping at the first failure, and prints the total the docs quote instead of
leaving it to `grep -c PASS`. Order is alphabetical and deliberately arbitrary:
the suites share one database against a real server, so a suite that only
passes in a particular position is borrowing state rather than passing.

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
| Race-safe migrations (advisory lock, one transaction) | ✅ | 18 checks incl. 20 real cold starts on real Postgres — §3a |
| Storage port + filesystem and S3/R2 drivers | ✅ | 45 checks, one contract run against both drivers, S3 leg verified on **real Cloudflare R2** — §3b |
| Request rate limiting — per key **and** per org, counted in the database | ✅ | 34 checks incl. 20 separate processes sharing one ceiling on real Postgres — §3c |
| Provider-dollar reservation before every call, idempotent settlement | ✅ | 54 checks incl. 20 separate processes sharing one budget on real Postgres — §3d |
| Credit prices derived from worst-case cost, 50% margin floor enforced | ✅ | Asserted every run: no operation can be sold below cost — §3e |
| Retention sweep + run/repo/org deletion of rows **and** objects | ✅ | 55 checks incl. 20 separate processes contending for one deletion job — §3j |
| Encrypted backups + a rehearsed restore + operational alerts | ✅ logic, ✅ **production backed up and restored 2026-08-15**, ❌ not scheduled (deferred) | 91 checks; the production Neon database dumped, encrypted and restored, 32 tables compared, on 2026-08-15 — §3k. The nightly schedule is deferred to the first paying organization |
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

**Tests** — `test/migrations.test.mjs`. 12 checks on PGlite, 18 against real
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
| **M7b** | *(real Postgres)* The old code **fails** that too — 19 of 20 processes die with `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`. That is processes creating tables at the same instant, colliding inside Postgres's own catalog. |
| **M7.0 / M7b.0** | *(real Postgres)* All 20 processes were connected and waiting when the barrier opened. Without this the counts above measure boot order, not concurrency. |

**Why M7 exists when M3 already passed.** M3 runs 20 migrations at once, but they
share one connection pool. Real serverless starts are separate processes with
their own connections. M7 does that, and confirms they used 20 different Postgres
backends. It is the test PATHWAYS §10.3 1A item 4 actually asks for. It skips
itself on PGlite, where each process would get its own private in-memory database
and the result would mean nothing.

**Why M3b and M7b exist.** A test that passes both before and after a fix proves
nothing. These two re-run the old code and check it still fails. If either ever
starts passing, the test it guards has stopped testing anything.

**Why M7 and M7b wait at a barrier** (added 2026-08-13). Spawning 20 node
processes together does not make them *run* together — each takes well over
100ms to boot. When the spawns stagger far enough, the first process applies all
12 migrations before the second one reads, every later process finds the work
done, nothing collides, and M7b — which asserts the old code still collides —
goes green on the broken implementation. It did exactly that in CI: the same
commit passed on one runner and failed on another. Locally, 75ms of stagger
between spawns reproduces the failure in 14 runs out of 15.

So each worker now connects first, then waits for one shared wall-clock instant
before touching the schema — the same device `budgetAlerts` B4 already used. The
count went from a coin toss (8 to 19 of 20 colliding, run to run) to 19 every
time, which is the number the primary key forces: only one process can insert a
given migration name. M7.0 and M7b.0 fail loudly if any worker missed the
instant, because then the other counts mean nothing.

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

Migrations are now `001`–`010`. Full suite: **291 checks green** on PGlite,
**306** against real Postgres, across nine suites — run 2026-08-12. (B9 was
added by the maintainability sweep below; the CI-batch half of the alerting had
no test when it shipped.)

---

### 3g. Money moves in one place — the economic path, extracted ✅

`explainService.ts` and `ciBatch.ts` each hand-rolled the same sequence —
reserve provider dollars, reserve credits, unwind if either fails, later settle
or refund. Two implementations of one rule. `src/economicPath.ts` now holds it
once, as `reserveBoth`, `settleCharged` and `releaseBoth`; the two callers lost
174 lines and gained 123.

**This was not a tidying exercise. The duplication was already producing bugs.**

| Found | What it was |
|---|---|
| Tenant-ceiling refusals were silent on one path | An org or key pinned against its dollar ceiling alerted an operator from interactive explain and alerted nobody from a CI batch. Nobody decided that; the two copies had simply drifted. Both alert now — a **behaviour change**, guarded by B10 |
| Provider dollars held when credits ran out | Reserving dollars before credits means a customer who cannot pay leaves a reservation already taken. It was released correctly — but **nothing tested it**, and the failure is silent: the reservation is neither settled nor released, so it holds capacity against the global day for its full 15-minute TTL. One org out of credits would quietly lower the ceiling for every other org, with budget refusals nobody could account for. P9.9–P9.11 |

The second one was found by the discipline, not by reading: deleting the release
line left **every suite green**. That is what "a guard you have not watched fail
is not a guard" is for.

**What deliberately stayed duplicated.** Result-cache lookups, the per-run cap,
and the wording of refusals. They differ in shape — the batch path caps frames
as it builds a batch, the interactive path counts a run's history — and folding
them in would need a flag each, which is how a shared function becomes harder to
read than the duplication it replaced. The rule applied: **extract what is
identical and moves money, not what merely rhymes.**

**One consequence worth knowing.** `evaluateAllBudgets` moved inside
`reserveBoth`, so it cannot be added to one path and forgotten on the other. A
CI batch therefore evaluates per frame rather than once per batch, and a batch
that climbs through two marks now sends two alerts rather than one. The
per-threshold dedupe still bounds it at four per day per scope, and B9.3–B9.6
assert that no mark is ever paged twice.

---

### 3h. Reconciliation knows which pot the money came from — Pathway 1, item 7 ✅

**The bug.** `reconcile.ts` summed every provider dollar spent in a month and
divided by **pack revenue alone**. Two things were wrong and both push the same
way:

1. **Subscription revenue was invisible** — nothing in the schema recorded it.
   `plan_allotment` grants carry `price_microdollars = 0`, correctly, because
   the allowance is not sold; the subscription is. So the $59/mo, the larger
   half of the business, was worth nothing to the report.
2. **A charge did not know what funded it.** `ledger.ts` consumes
   soonest-to-expire first, so one analysis can draw credits from an allowance,
   a pack and a goodwill grant at once. That split was computed, used, returned
   — and thrown away. Every dollar of it was charged against packs.

The consequence is not an abstract accounting nicety. **The margin alert would
have fired on healthy months.** Three subscribers burning the allowance they
paid for, plus one $7 pack sold, reads as **29.2% margin** under the old
formula and **97.3%** under the fixed one. An alert that cries wolf is worse
than no alert, and this one exists to stop us selling a pack below cost.

**What was added** (`migrations/011_revenue_attribution.sql`):

| Record | Why it has to exist |
|---|---|
| `subscription_periods` | What a billing period was worth. Written only from a verified payment webhook (`source_ref` UNIQUE); Step 7 populates it from Paddle |
| `usage_credit_sources` | Which grant funded which charge, and that grant's share of the provider cost |
| `fee_microdollars` / `fee_recorded` on both | What the processor kept. A `$0` fee and an unknown fee are different numbers; a report that treats "not told yet" as "free" is fabricated economics |
| `refunded_microdollars` on both | A refund reduces revenue in place. The period stays on the record because it still cost us the provider dollars its credits bought |

**Four pots, kept apart:** allowance-funded cost against the subscription that
granted it, pack-funded cost against that pack, goodwill as pure cost, and
**spend with no funding record on its own line**. That last one matters — usage
written before this migration, or by any future path that bypasses
`economicPath.ts`, has no attribution. Folding it into a funded line would be a
guess; leaving it out would understate cost. It is reported as unexplained.

**The cost split is exact.** `attributeCost` apportions an event's cost across
its funding grants once, at settlement, giving the rounding remainder to the
largest share so the parts sum to the whole. A microdollar lost per event is a
margin report that drifts away from the meter it derives from, slowly and
invisibly. Stored per row, so the monthly report is a `SUM ... GROUP BY` and
running it twice gives the same answer.

**Evidence** — `test/reconcile.test.mjs`, 27 checks:

| Check | Proves |
|---|---|
| R1.1–R1.4 | The split sums exactly to the whole, including three-way indivisible costs |
| R2.1–R2.2 | A real `hostedExplain` call funded 3 credits from an allowance and 2 from a pack writes two rows with the right kinds, summing to the event's cost |
| R2.3 | A failed analysis refunds the credits and writes **no** attribution row — there is nothing for a refund to reverse, because a reservation has exactly one terminal transition |
| R3.1–R3.3 | Subscription revenue is visible; cost splits four ways; a healthy month stays quiet |
| **R3.4** | **The guard.** The old formula run over the same seeded month false-alarms at 29.2% where the fixed one reports 97.3% |
| R3.5–R3.8 | Goodwill on its own line; unrecorded fees flagged; storage reported as unmeasured; the report is deterministic |
| R4.1–R4.3 | Unfunded spend is reported, the four cost lines sum to the meter's total, contribution subtracts every one of them |
| R5.1–R5.4 | Recorded fees reduce net revenue; a replayed webhook records no second month; a refund reduces revenue in place and cannot exceed the price |
| R6.1–R6.4 | The alert still fires when margin is genuinely below 50%, names each pot, subtracts supplied storage cost, and says when fees are missing |

**Both guards were watched failing.** Dropping the rounding remainder turned
R1.2 and R1.4 red; removing the `recordCostAttribution` call from
`settleCharged` — the original bug, restored — turned R2.1 and R2.2 red.

**A pre-existing test defect came out with it.** `budgetAlerts.test.mjs` B2, B3,
B5, B6 and B8 reset `budget_alerts` and `provider_spend_days` between blocks but
not `provider_reservations`. Outstanding reservations count toward the day
alongside committed spend — that is the point of reserving — so on one shared
server the reservations `providerBudget.test.mjs` left behind added $0.08 to
every reading and four checks failed. Invisible on PGlite, where each suite gets
its own database. Three later blocks in the same file already cleared the table;
the earlier ones had simply never been run against a real server. Fixed in its
own commit.

**Suite:** 316 checks green on PGlite, **331 against a real Postgres server**,
across ten suites — run 2026-08-13.

**Not covered, deliberately.** Storage and serving cost is an input to
`reconcileMonth`, not a measurement: nothing in this system meters bytes yet, so
the report says `storageMeasured: false` rather than assuming zero. Subscription
revenue is attributed to the month a period **starts** in rather than pro-rated
across the two months a period usually spans — the allowance is granted and
expires with the period, so the credits and the money that bought them stay
together.

---

### 3i. The payment door exists and is reachable — Pathway 1, item 8 ✅ (sandbox `Blocked`)

`src/webhooks.ts` had existed since Phase C with **nothing able to reach it** —
no route, no HTTP path, no way for a processor to deliver anything. It also
verified a scheme Paddle does not use.

**What shipped:**

| File | What it does |
|---|---|
| `src/paddle.ts` | Paddle Billing's real signature scheme, the normalised `BillingEvent`, and the minor-unit conversion |
| `src/webhooks.ts` | Verify → parse → claim → apply, with the subscription state machine |
| `web/app/api/webhooks/paddle/route.ts` | The door. Node runtime, raw body, opaque responses |
| `migrations/012_billing_events.sql` | `billing_events`, explicit subscription states on `orgs`, `subscription_products` |

**The signature scheme was wrong before.** Paddle signs **`${ts}:${rawBody}`**,
not the body. Three things follow, and each is a way to be broken while passing
a happy-path test:

1. **The raw bytes.** `req.json()` then re-serialising gives a different string
   and the HMAC never matches. The route uses `req.text()` and hands that
   string through untouched.
2. **The timestamp is inside the MAC**, which is what makes a captured request
   expire. Verifying the signature without checking the timestamp leaves a
   valid request replayable forever — the difference between "we verify
   signatures" and "we are replay-safe". Tolerance is 5 minutes.
3. **Signature before timestamp.** The timestamp is attacker-supplied until the
   MAC says otherwise, so rejecting on it first would be answering a question
   about an unauthenticated value.

**The state machine is explicit, not a boolean.** `orgs.subscription_status` is
`none | active | past_due | lapsed | refunded`, per PATHWAYS §"Payment failure
safe state". Nothing deletes data because a payment failed.

**Out-of-order delivery is the failure that would have been silent.** Webhooks
are not ordered — a `subscription.updated` stamped 10:00 can arrive after a
`subscription.canceled` stamped 10:05. Applying by arrival order silently
revives a cancelled subscription: nothing errors, the customer simply keeps
paying nothing, and the first anyone knows is a chargeback. Every transition
compares the **processor's** timestamp against the one that set the current
status, in the application *and again in the `UPDATE`'s `WHERE`* — a
check-then-write is exactly the race that lets the older event land last.

**Two design errors the tests found, not review:**

| Found by | What it was |
|---|---|
| W3.1 | `billing_events.org_id` had a foreign key to `orgs`, so recording an event that named an org we have never heard of **threw** — rejecting precisely the row worth keeping. Renamed `claimed_org_id` with no FK: the name now says it is what the event asserted, not a verified link |
| W4.5 | A subscription id already bound to one org, arriving for another, hit the unique index and threw → 500 → Paddle redelivers every few minutes for days. It is a decision, not a transient failure, and is now answered 2xx and recorded |

**Evidence** — `test/webhooks.test.mjs`, 37 checks: signature scheme (11),
minor-unit conversion and parsing (6), entitlement created exactly once
including a redelivery and a forged body (6), events we cannot act on (4),
ordering and binding (5), pack-requires-subscription (3), refunds (2).

**Guards watched failing.** Signing the body alone → W1.2 red; removing the
replay window → W1.8; removing the idempotency claim → W2.3; removing the
ordering guard → W4.2; letting a pack be bought without a subscription → W5.1.

> One correction worth recording. The first pass at running those five breaks
> reported the ordering guard as untested. It was not — the harness ran
> `npm run build && node test/…`, the broken tree failed to typecheck, and the
> `&&` swallowed it into an empty output that read as "no failures". The same
> `&&`-hides-the-signal trap that had just been removed from `npm test`.

**Deliberately not done, and why:**

- **The Paddle sandbox loop is `Blocked`** — it needs an account, which is
  Harsha's to create (FUTURENORMA §4 Step 7). No real delivery has ever reached
  this code.
- **The field paths inside Paddle's `data` object are unverified.** They follow
  the published shape. They are isolated in `paddle.ts:parseEvent` — one small,
  pure function — precisely so a sandbox run has one place to correct.
- `subscription_products.cloud_monthly` is a provisional slug like the pack ids
  in `005`. Remapping it to the real Paddle price id is the whole of the
  catalog wiring.
- **Refunds do not claw back spent credits.** They bought provider calls that
  really happened; reversing the ledger would drive a balance negative for
  money already spent. Entitlement changes via the accompanying
  `subscription.*` event.

**New environment variable:** `PADDLE_WEBHOOK_SECRET`. Unset, the route logs
and returns 500 rather than accepting anything — without a secret every
signature check would fail anyway, and saying so plainly stops that being
diagnosed as "Paddle is sending bad signatures".

**Suite:** 353 checks green on PGlite, **368 against a real Postgres server**,
across eleven suites — run 2026-08-13.

---

### 3j. Deletion actually deletes — Pathway 1, item 9 ✅

Deleting a run used to mean deleting rows. The bytes stayed in storage forever,
because **nothing recorded which objects belonged to which run**. Keys were
derivable (`org/{orgId}/blob/{sha256}.{ext}`) but not enumerable: given a run
there was no way to ask what it had stored. A 90-day sweep built on that would
have freed rows and leaked every object, while telling the customer their data
was gone.

**What shipped:**

| File | What it does |
|---|---|
| `migrations/013_retention.sql` | `run_artifacts` (run → object) and `deletion_jobs` (resumable work, then the receipt) |
| `src/retention.ts` | `deleteRun`, `deleteRepo`, `deleteOrg`, `sweepRetention`, and the claim/batch/cursor machinery under them |
| `scripts/retention.mjs` | The operator entry point. **Dry run is the default; `--apply` is the only way past it** |

**Four rules the code is shaped by:**

1. **Objects before rows.** A `run_artifacts` row is the only pointer to an
   object. Delete the row first and a crash one line later leaves bytes nobody
   can find and nobody is billed for. Object first is the recoverable order —
   the row survives, and the retry deletes something already absent, which the
   port guarantees succeeds.
2. **A run does not own its bytes.** Blobs are content-addressed per org and
   deduplicated within it, so an unchanged frame is *one object with two rows*.
   Deleting a run deletes an object only when it is the last row in that org
   referencing the key. `T2b` runs the obvious per-row version and watches it
   destroy a live report while expiring an old run.
3. **Resumable.** Work is claimed, done in bounded batches, and the cursor
   advances only past artifacts that actually went. `T6` fails storage halfway:
   the job records what did go, keeps the rows for what did not, leaves the run
   row in place, and a retry finishes it — 4 objects total, not 6.
4. **A dry run walks the same path.** Same rows, same shared-blob question, same
   counters, minus the two mutating calls. `T3` asserts the real run removes
   exactly what the dry run predicted.

**Tests** — `test/retention.test.mjs`. 48 checks on PGlite, **55 against real
Postgres**.

| Check | What it proves |
|---|---|
| T1 | A run's objects, rows, share links and frame stats all go. |
| T2 | A blob two runs share survives the first deletion and goes with the second. |
| **T2b** | The naive per-row delete removes it while the live run still points at it. |
| T3 | A dry run changes nothing and predicts the real run's counts exactly. |
| T4 | 200 and 91 days old are swept; 89 days is kept; an org-scoped sweep leaves the neighbour alone. |
| T5 | Five artifacts, batch size one: six claims, counts accumulate, re-running a finished job changes nothing. |
| T6 | Storage fails on the third object — partial progress kept, nothing orphaned, retry completes without double-counting. |
| T7 | Org erasure takes the whole prefix (including an abandoned upload no row recorded), leaves the neighbour untouched, and the receipt outlives the org. |
| T8 | Two concurrent workers, one claim. A claim past its TTL can be taken over; a fresh one cannot. |
| **T9** | *(real Postgres)* 20 separate processes, one job, **exactly one claim**. |
| **T9b** | *(real Postgres)* Unclaimed, all 20 delete the same run and report 60 objects for 3. |

**The open question this raised: deleting an org deletes its books.**
`usage_events`, `credit_grants` and `subscription_periods` all cascade from
`orgs`, so erasing a customer silently rewrites the reconciliation history for
every month they traded in — a margin report run afterwards would quote
different numbers than the same report run the day before, with nothing saying
why. That is squarely against Doctrine 2, and it is a policy decision (erasure
versus financial records), not an implementation one.

What the code does today: `deleteOrg` snapshots the org's lifetime totals —
provider cost, credits charged and granted, pack and subscription revenue,
refunds, fees — into the job receipt **before** the cascade, so the aggregate
survives even though the per-event detail does not. `T7.5` asserts it. **The
decision still owed** is whether that is enough, or whether org deletion must
retain anonymised usage events for the accounting period. Raised for Harsha,
recorded in §9.

**Also deliberately not built:** `org_storage` byte accounting. It is Pathway 2's
quota concern (§10.4 2C), and the release belongs in the same statement path
that removes the artifact row — a comment in `retention.ts` marks the spot.

**Suite:** 401 checks green on PGlite, **425 against a real Postgres server**,
across twelve suites — run 2026-08-13.

---

### 3k. Backups, a rehearsed restore, and alerts that are not about money — Pathway 1, item 10 ✅

Everything items 1–9 built assumes the database is still there. Nothing had ever
backed it up, nobody had restored anything, and **every alert in the product was
about spend** — a failed deletion job, a breaker left tripped over a weekend, or
an alert channel that was itself broken were all silent.

**What shipped:**

| File | What it does |
|---|---|
| `migrations/014_backups.sql` | `backups` (one row per dump attempt, with its manifest), `restore_rehearsals` (the evidence a restore worked), `ops_alerts` (once-per-period claim, same shape as `budget_alerts`) |
| `src/backup.ts` | The manifest, the comparison, AES-256-GCM sealing, and the bookkeeping — plus `recoveryHealth`, which is what "are we covered?" reads |
| `src/opsAlerts.ts` | Eight operational signals, each reading a table something else already writes |
| `src/alertChannel.ts` | Where an alert actually goes: webhook and/or email, and the honest account of what `delivered_at` means |
| `scripts/backup.mjs` | `pg_dump` → seal → storage port → record |
| `scripts/restore-rehearsal.mjs` | Fetch → verify hash → decrypt → `pg_restore` into a scratch database → **compare every table's row count against the manifest** |
| `scripts/ops-check.mjs` | The scheduled check. Exits non-zero when something is wrong *or* when a send failed |
| `.github/workflows/backup.yml` | Nightly dump, monthly rehearsal, ops check. Skips with a notice until the secrets exist |
| `web/app/admin/limits/page.tsx` | The pull surface: last good backup, last passed rehearsal, and the live signal list |
| `web/lib/alerts.ts` | The two explain routes now alert through the real channel instead of `console.error` |

**Four decisions worth keeping:**

1. **The manifest is taken inside the dump's own snapshot.** The backup session
   opens a `REPEATABLE READ` transaction, exports the snapshot, hands its id to
   `pg_dump --snapshot`, and counts rows in that same transaction. Counting
   before or after would disagree with the dump by whatever traffic happened in
   between — and a rehearsal that false-alarms on ordinary traffic is an alert
   an operator learns to ignore.
2. **A rehearsal proves the data, not the exit code.** `pg_restore` returning 0
   says the file parsed. The verdict is the per-table comparison, stored as the
   list of tables that disagreed rather than a boolean, so a failure is
   diagnosable a month later. The database enforces it: `restore_rehearsals`
   cannot hold `passed` over a non-empty mismatch list (K4.5 watches that fail).
3. **Encryption happens before the storage port sees the bytes.** A bucket
   misconfiguration should expose ciphertext. A wrong key, a flipped bit or a
   truncated object all refuse rather than restoring quietly (K1.3–K1.6).
4. **`delivered_at` means handed to the channel, not received by a human** —
   `Alert` is synchronous and sits on a paid request path, so the send is
   deferred via `after()`. Three things close that gap and none is optional: the
   ops check awaits its sends and exits non-zero, the operator page shows live
   state rather than delivery history, and `alert-channel-broken` fires on any
   alert claimed but never delivered.

**The eight signals**, each from a real row: `backup-missing` (over 26h, or
never), `backup-failed`, `rehearsal-stale` (over 30 days, or never),
`rehearsal-failed`, `deletion-failed`, `breaker-unreset` (tripped over 12h),
`alert-channel-broken`, `reservation-leak`.

**Tests** — `test/backup.test.mjs` (44) and `test/opsAlerts.test.mjs` (43 on
PGlite, **47 against real Postgres**).

| Check | What it proves |
|---|---|
| K1 | Sealed dumps: right key opens, wrong key/flipped bit/truncation/foreign object all refuse. |
| K2 | The manifest compares both ways — a changed count *and* a table that did not come back. |
| **K6** | The obvious "walk the restored tables" comparison calls a lost table a pass. K2.5 has teeth. |
| K3, K4 | No `done` without bytes, no `passed` over mismatches, no rehearsal without a name — all refused by the database. |
| K5 | Never having backed up reads as stale, not unknown; the two clocks run independently. |
| P2 | Each of the eight signals fires on its own condition, with the numbers in the message. |
| **P3r** | *(real Postgres)* 20 separate processes notice one problem; **exactly one pages a human**. |
| **P3b** | *(real Postgres)* The check-then-send version pages **20 times** for the same problem. |
| P4 | A send that throws re-arms the row immediately and the next check retries. |
| P5 | The channel posts to a webhook and to Resend, and never throws into the request path when it cannot. |

**The rehearsal was actually run** — 2026-08-14, against a real Postgres 17.10
server (`scripts/test-db.sh`), not a fixture:

```
backup bk_20260814T213818_6f761c02 — snapshot 0000005F-0000000D-1,
  85,714 bytes encrypted, manifest 32 tables / 795 rows
rehearsal rh_20260814T213824_486e8436 — restored into a scratch database,
  32 tables, 795 rows compared, 0.9s — PASSED
```

Both failure paths were watched, not assumed. Flipping one byte of the stored
object stopped the rehearsal before it restored anything (`stored object hashes
to 25acdf83…, backup recorded 971ef6c5…`); overstating one table in the manifest
produced `orgs: manifest 9999, restored 46` and exit code 1. The webhook path was
proven against a real HTTP listener, which received the alert body verbatim.

**The production database has now been backed up and the backup restored** —
2026-08-15, against production Neon (Postgres 17) over the direct endpoint, not
the pooled one, because `pg_dump` reads a snapshot exported by a second
connection and a pooler does not guarantee both land on the same backend:

```
migration 014 applied to production   2026-08-15 08:05:58 UTC
backup bk_20260815T081143_1beed8fc  — 72,807 bytes encrypted, 38s,
  manifest 32 tables / 23 rows
rehearsal rh_20260815T082935_5600a89c — restored into a scratch database on a
  local Postgres 17.10 cluster, 32 tables, 23 rows compared, 0.7s — PASSED
```

The restore target was supplied explicitly with `--target-url`. Left to itself
the rehearsal creates its scratch database *beside the source*, which for a
production `DATABASE_URL` means `CREATE DATABASE` on production Neon.

**What is not proven, and is not claimed:** the schedule, and the R2 leg. The
backup above went to the filesystem driver on Harsha's laptop, so the storage
port's S3/R2 path is still untested for objects this size.
`.github/workflows/backup.yml` exists and is correct as written but has never
run: scheduling is **deferred to the first paying organization** (decision
2026-08-15), because the only data at risk today is a 2-row waitlist and hand
backups cover it. That is a decision, not a blocker — `PATHWAYS.md` Pathway 1
item 10 carries the switch-on checklist.

**Suite:** 598 checks green on PGlite, **626 against a real Postgres server**,
across twenty suites — run 2026-08-15.

---

### 3l. The artifact upload pipeline — Pathway 2, items 1–6 ✅

Declare → transfer → commit, plus entitlement, quotas, the sweeper and the
operator surface for withdrawing a key. Migrations 015–018. `norma-scope upload`
ships from the Argus side at `0.8.0`.

**Run end to end against a real capture, not fixtures.** The portfolio run in
`norma-bridge-usecase/` — three frames, 2.1 MB of genuine screenshots:

```
compare --json          3 frames, 1 flagged, references recorded beside the diffs
upload (flagged)        3 files, 0.30 MB, presigned PUTs → /api/blob
commit                  size AND content hash verified per object
report                  renders with real numbers, 5 and 8 credit prices
upload --mode all       9 files declared, 3 already stored and not re-sent
deleteOrg               9 objects, 1,083,850 bytes removed, receipt kept
```

A transfer that failed mid-run left its reservation held until
`sweep-uploads.mjs` reclaimed all 300,866 bytes — the leak control working, not
a hypothetical.

**Five things this found that the suite could not, all now closed.** Each sat
where no test reaches, which is the part worth remembering:

| Found | Why no test saw it |
|---|---|
| Entitlement checked at declare, not commit | A plan can change *between* two phases; each phase needs its own check |
| `bytes_stored` only ever rose | Deletion freed objects and not quota — two subsystems, one invariant |
| `runs.state` promised invisibility and nothing read it | The state existed; no reader filtered on it |
| The transfer phase had never executed | `/api/blob` did not exist; the suite calls `storage.put` directly |
| Uploaded runs contributed nothing to history | Only the older route wrote `frame_stats` |

**What is still not proven:** the R2 leg. Everything above is the filesystem
driver. Step 5 requires the whole G suite re-run against real R2, and that
requirement is unchanged — presigning, `Content-Length` pinning and TTL behave
differently against a real service. The local driver is now a complete
implementation of the port precisely so that difference is the only untested
thing left.

---

### 3m. The report page rendered blank in production — closed 2026-08-15

`/r/{runId}` served an **empty body** in production for as long as its CSP had
existed. `script-src 'self'` blocks the inline scripts the App Router streams
page content through. Dev mode fails differently and the suite does not render
pages, so nothing caught it.

The policy moved from `next.config.mjs` to `middleware.ts` and now carries a
per-request nonce with `strict-dynamic`, plus the `font-src 'self'` whose
absence had been blocking every self-hosted face.

**`'unsafe-inline'` was considered and refused.** It would have made the page
render by deleting the protection the page exists to provide. Hashes are not
available either: the flight payload differs per request, so nothing is stable
to hash. A nonce is the only option that renders the page without weakening it.

Verified against a real production build — a frame label carrying
`<script>` and an `onerror` image rendered as visible text, nothing executed, and
the only script holding the payload was Next's own nonced flight data with the
string escaped. An earlier devtools probe appeared to bypass it and proves
nothing: `strict-dynamic` trusts scripts inserted by an already-trusted script,
and a devtools evaluation is one.

**Open beneath it:** `style-src` keeps `'unsafe-inline'`. Removing it was tried
and leaves the page unstyled — twelve elements carry inline `style` attributes.
Phase H rebuilds that page; move it to classes and the directive can go.

**What this fix left behind, found 2026-08-16:** moving the policy out of
`next.config.mjs` removed it for *every* path, not just `/r/`. See §3n.

---

### 3n. The rest of the site had no CSP at all — closed 2026-08-16

**The gap.** §3m moved the report policy into `middleware.ts` and deleted the
static header from `next.config.mjs`. The deletion was correct for `/r/` and
too broad for everything else: from that day until 2026-08-16, **`/r/` was the
only path on the site with a Content-Security-Policy.** The public marketing
pages had none, `/pitch` had none, and `/admin` — the one tree that renders
other people's email addresses — had none either.

Nothing failed, which is why it survived. A missing policy has no symptom.

**What it looks like now.** One file issues every policy, so the "two sources"
failure §3m warns about cannot come back. Two policies, chosen by path:

| Tree | Policy | Why |
|---|---|---|
| `/r/`, `/admin` | nonce + `strict-dynamic`, no `'unsafe-inline'` | Renders untrusted content: model output, upload-supplied frame labels, waitlist addresses |
| Everything else | `'unsafe-inline'`, no nonce | Statically prerendered — see below |

**Why the marketing pages get `'unsafe-inline'`.** They are prerendered, which
is what lets them serve from the CDN with a year-long `s-maxage`. A nonce is
generated per request and cannot exist in a page rendered once at build time —
put one on a prerendered route and every script is blocked, which is §3m's blank
page again. The real choice is not "nonce or `'unsafe-inline'`"; it is
`'unsafe-inline'` or per-request rendering for every marketing page. That is a
poor trade for pages that render nothing but our own committed copy.

It is still worth having. `'unsafe-inline'` concedes the injected *inline*
script and keeps everything else: `script-src 'self'` refuses a script from
another origin, `connect-src 'self'` refuses an exfiltration fetch to one,
`base-uri 'none'` refuses a `<base>` tag that would retarget every relative URL
on the page, and `form-action 'self'` refuses a form pointed at someone else's
server. Those are the moves a compromised dependency makes.

**`'unsafe-eval'` in development, and the afternoon it cost.** The first version
of this policy had no `'unsafe-eval'`. `next dev` hands modules to the browser
to be run through `eval()` — that is how hot reload works — so React never
hydrated and **every button, tab, slider and form on every page went dead in
development**, on pages that rendered perfectly. The page looks *finished*. The
only evidence is an `EvalError` in the console.

The same hole was in the original `/r/` policy and had simply never been hit,
because `/r/` is rarely opened locally. That is what "verified against a
production build" quietly meant.

Both dev-only sources — `'unsafe-eval'` and the
`https://va.vercel-scripts.com` origin `@vercel/analytics` uses for its debug
script — now sit in one `NODE_ENV`-gated constant. Production carries neither,
and V5 asserts the gate rather than trusting the comment. Confirmed against a
real production build: no `unsafe-eval` and no external origin in either policy.

Analytics is unaffected in production. `@vercel/analytics` only reaches
`va.vercel-scripts.com` when `isDevelopment()`; a deployed build loads
`/_vercel/insights/script.js` and beacons `/_vercel/insights/event`, both
first-party and both covered by `'self'`.

**Verified by rendering, not by reading headers.** §3m's lesson was that a
policy can be perfect in a header and fatal on the page. Ten pages were loaded
from a production build with zero CSP violations; `/admin/waitlist` returned
68 KB with 30 script tags and 30 nonces, so nothing was left unnonced; the
report page's tabs were clicked through `0→2→1→3→0` and followed exactly; the
command explorer's twelve buttons all responded; the threshold slider responded.

**Also closed here:** `X-Powered-By` no longer advertises the framework, and a
deny-all `Permissions-Policy` covers camera, microphone, geolocation, payment
and USB — none of which the site uses or will ask for.

---

### 3o. The unlock routes had no rate limit — closed 2026-08-16

`ADMIN_PASSWORD` is the single credential in front of the waitlist, and until
2026-08-16 it could be guessed as fast as an attacker could open connections.
Nothing counted attempts. `/api/pitch-unlock` was the same.

A shared phrase typed into other people's laptops is exactly the credential that
needs a ceiling on guesses: it cannot be rotated per person, and nobody watches
a login log for it.

Ten attempts per five minutes per address, per gate. Deliberately generous —
the value is not in the limit being tight but in there being one at all, which
takes a single address from thousands of guesses a second to 120 an hour.

**A refusal is indistinguishable from a wrong phrase**: same redirect, same
`error=1`, same sentence. Telling an attacker they have hit a limiter tells them
to slow down or change address. The cost is an operator who fumbles ten times
reading "that phrase didn't work" when the phrase was right.

Proven end to end: the correct phrase is accepted, ten wrong guesses are
refused, and the **correct** phrase is then refused identically — while the
other gate's budget is untouched, so a pitch guesser cannot lock an operator out
of `/admin`.

**The same fix corrected a limiter that never limited.** The waitlist keyed its
per-IP bucket on `x-forwarded-for.split(",")[0]` — the leftmost entry, which the
*caller* supplies on any proxy chain that appends. Rotating one header bought a
fresh bucket every request. Both callers now share `web/lib/clientRate.ts`,
which prefers `x-vercel-forwarded-for` and `x-real-ip` — stamped by Vercel's own
proxy and unforgeable — and falls back to `x-forwarded-for` only where there is
no trusted proxy in front, which is local development.

Proven: seven requests from one client rotating `x-forwarded-for` on every
request are cut off at the fifth, and a genuinely different client still passes.

**Honest limit, unchanged:** the bucket is a `Map` in one process. On serverless
that is per instance, not global. It raises the cost of abuse and is not a
durable limiter; the durable one is `argus-cloud/rateLimit.js`, which these two
surfaces cannot use because they are reached without an API key.

---

### 3p. Screenshots were served as raw retina PNGs — closed 2026-08-16

`/how-it-works` shipped 2.5 MB of PNG, roughly **ninety times** the JavaScript
for the same page. Every `<img>` on the site was also written without `width` or
`height`, so each screenshot landed by shoving the text below it down the page.

The JavaScript was never the problem. Measured on a production build: 102 kB
shared, 117 kB on the heaviest page — essentially the React 19 + Next 15 floor.
CSS is 88 kB + 12 kB before compression. There was nothing to win there and a
great deal to win in the images.

**Resolution was not reduced.** These are screenshots of a product UI with small
text; downscaling is the one change a reader would notice. Re-encoding at full
size already takes `report-fidelity-frame.png` from 1.33 MB to 111 KB. Halving
the width saves a further 47 KB and costs legibility on every caption. The
format change is where the win is, so it is the only change made.

**Two encoders, smaller file wins.** A flat UI screenshot compresses better
losslessly than lossy — `report-explain-findings.png` is 105 KB lossless against
184 KB at q82 — while a shot containing photography goes the other way by a
factor of eight. Encoding both and keeping the smaller means every flat
screenshot is pixel-identical to its PNG *and* smaller than lossy would have
been, with no per-file judgement and no table of exceptions.

Result: **9.01 MB of PNG becomes 1.40 MB of WebP** across 24 images. On
`/how-it-works`, 2.52 MB becomes 389 KB with identical pixel dimensions.

**Not `next/image`, deliberately.** It would put `sharp` in the request path for
every screenshot, and §9's allowlist accepts three high advisories in `sharp` on
the recorded grounds that we do not serve images through the optimiser. Making
that note false to save bytes a build-time re-encode saves anyway is not a trade
worth taking, and it would bill per optimised image for screenshots that do not
change between deploys.

**The PNG is still the source of truth.** `<picture>` offers the WebP and falls
back to the PNG, so nothing depends on WebP support. Deleting every `.webp` is
safe and self-healing: `embed-image-sizes.mjs` reads the directory on each build
and would simply record `webp: false`.

**Dimensions are generated, never typed.** `embed-image-sizes.mjs` reads the
real pixel size out of the PNG headers at build time, for the same reason
`embed-page-dates.mjs` reads git — a wrong number becomes impossible rather than
unlikely. `h-auto` alongside the attributes is load-bearing: without it the
attributes distort every screenshot at any viewport but one. It is skipped when
the caller sets its own height, because two height utilities on one element are
resolved by stylesheet order rather than class order — the cropped `tall`
figure on `/pitch/proof` would otherwise stretch instead of crop.

**Five copies, not three.** The first pass found the raw `<img>` tags with a
grep for `"<img "` — which requires the tag and a space on one line, and so
silently skipped every multi-line JSX tag. Two more were sitting in
`ReportVariants` and `editorial`'s `Figure`, between them rendering four
screenshots including the 1.28 MB `report-target-frame.png`. They were found by
the browser reporting an image with no `width` attribute, not by re-reading the
code. The two remaining `<img>` tags are wordmark SVGs at fixed CSS sizes, which
need neither treatment.

**Two files left `public/`.** `twins.png` (736 KB) and `videos/N1.mp4` (2.5 MB)
were referenced by nothing and served to anyone who guessed the path. They are
source material for the traced vector twins and now live in `assets/twins/`,
which is not served. `twins.tsx` had claimed the still was "deliberately not in
the repo", which had stopped being true.

**The core tool is untouched by all of this.** No `.png` changed by a byte;
`src/` and `migrations/` have zero changes; the 31 compiled core modules are
byte-for-byte identical to a clean `HEAD` build; `test-run/`, `public/run/` and
the generated `cases/*/report.html` are unchanged. `public/run/` is deliberately
excluded from the converter — that HTML references `.png` directly, so a sibling
`.webp` would never be requested.

---

### 3q. Nothing secret reaches the provider — Pathway 2, item 8 ✅ (2026-08-19)

A credential in a run's data is now blocked before any provider call, on both
hosted paths, and being blocked costs the customer nothing.

**Where the guard is, and why there.** `src/promptAssembly.ts` — the one
function the interactive path and the batch path both call. A payload that has
not been scanned cannot be assembled, so a caller added later inherits the guard
instead of having to remember it. The rules are S1–S8 from SECURITY-LLM.md, in
`src/secretScan.ts`.

| Path | What happens | Cost to the customer |
|---|---|---|
| Interactive explain | Assembly throws; `explainService.ts` returns `secret_blocked`, releases both reservations | Nothing — credits and provider dollars both returned |
| CI batch | The frame is skipped before it reserves anything; clean frames in the same batch still run | Nothing, and CI stays green |

**A hit blocks and names the field. It never redacts** — a redaction that misses
is an exfiltration, and nothing can promise it caught every copy of a value
inside a JSON blob.

**The scan reads the source fields, not the assembled string.** The stats blob
is capped, so a secret far enough in is cut before the request goes out.
Scanning the output would have called that safe — correct for that payload,
wrong for the same payload 100KB shorter. SS4 pins both halves: the block still
fires, and the capped output really does drop the secret, which is exactly why
the weaker version would have looked fine.

**Two things this found:**

- **An ordinary file path scored as a secret.** With `/` in S8's entropy
  alphabet, `artifacts/build/marketing-hero-desktop-1440x900` is one 47-char
  token at 4.52 bits — over the 4.5 threshold, because entropy there measures
  the variety of several ordinary words and their separators, not the randomness
  of any value. A false positive refuses a paying customer's analysis for naming
  a file. `/` is now a separator on this side. Found by the clean corpus, which
  is why the suite has one.
- **The same false positive exists in Argus's copy** (`src/explain/scanner.ts`),
  which scans DOM and code context — where paths are far more common than in
  summary metadata. Not fixed here: it is a CLI change with a publish attached.
  Recorded in `PATHWAYS.md` Pathway 2, carried forward.

**Evidence:** `test/secretScan.test.mjs`, 42 checks. SS1 plants one payload per
rule; SS2 is the clean corpus (commit SHAs, UUIDs, blob keys, paths, Figma
labels, `apiKey: process.env.X`) and pins the one known gap; SS5 and SS6 assert
no provider call, no charge, a released reservation and a metered
`blocked_no_charge` event; **SS7 runs the pre-item-8 assembly through the same
harness and asserts the secret reaches the wire**, so the rest is known to have
teeth. Deleting the throw turns 13 checks red, including the two that watch the
money.

**What this is not.** Uploads are not scanned — the server is out of the byte
path for artifacts by design, and the enforcement the item asks for is at
submission. Crop grounding (G3) will add image and DOM context to the outbound
request; it goes through the same function, so it inherits the scan.

---

### 3r. Crop-grounded hosted explain — BuildV5 G3 ✅ (2026-08-19)

Hosted explain now reasons over image crops of the flagged regions, not only
over diff metadata. Proven against the real portfolio capture with a real key,
not fixtures.

**The mechanism changed from what BuildV5 G3 describes, and the change is the
point.** G3 has the server fetch the uploaded PNGs and cut the regions itself.
That was written before the 2026-08-19 decision that customer bytes never reach
`sharp` — a decision whose whole reason is that uploaded images are hostile
input. Decoding them inside our own function is that hazard with a worse blast
radius than the `next/image` case that was already refused. **So the crops are
cut in the CLI, where the pixels are already decoded, by the same `cropRegion`
the local `explain` uses**, and arrive as one JSON sidecar per frame.

| Piece | Where |
|---|---|
| Regions recorded when found | `Argus/src/compare.ts` → `.bridge/diff/{frame}-regions.json` |
| Crops cut and uploaded | `Argus/src/cloud/upload.ts`, kind `crops` |
| Sidecar validated and bounded | `src/cropGrounding.ts` |
| Images added to the turn | `src/promptAssembly.ts`, `buildUserBlocks` |
| Migration | `020_crop_artifacts.sql` |

**Crops cost exactly one credit.** Vision is billed on area, so the pixel budget
*is* the price: an analysis is 3 credits without crops and 4 with them, at any
budget worth having. The 1.5M-pixel budget is sized by the **deep** pass, which
binds first — opus input is 2.5× sonnet's, and 1.59M is the largest budget that
still holds deep at 8 credits rather than 9.

> An earlier version of this section said crop grounding changed no price. That
> was computed against a Sonnet 5 list price of $3/$15 per MTok which Anthropic
> has since confirmed will never take effect; at the real $2/$10 the analysis
> price is 4, not 5, and one of those four credits is the crops. Corrected the
> same day, by §3s below.

**The server measures every image from its own header.** Twenty-four bytes of
PNG IHDR, or a walk to the JPEG SOF marker — no pixel decompression anywhere. A
sidecar declaring `10x10` while attaching `4000x4000` is measured at 4000x4000
and dropped. Without that, the client would decide what an analysis costs us and
the pre-call reservation would stop being a maximum: eight images at the largest
size the provider bills is $0.1571 against an $0.0844 reservation, an 11% margin
against a 50% floor.

#### What the real run showed

The portfolio capture — three frames, one flagged — compared, uploaded through
the real CLI, and explained through the real `/api/explain` route:

| | Metadata-only | Crop-grounded |
|---|---|---|
| Region reported | `0,0,0,0` | `960,400 336×48` — the rectangle `compare` recorded |
| What it said | "No pixel coordinates or bounding box were provided… the exact location cannot be determined" | "the reference shows a faint teal/green horizontal line below the pink block that is missing in the build" |
| Output tokens | 1,367 | 940 |
| Measured cost | **$0.02444** | **$0.01999** |

**Crop grounding cost less, not more** — a grounded model stops hedging, and the
output tokens it saves are worth more than the image tokens it adds. One sample,
on one frame; it is a reason to run G4, not a substitute for it.

The crop-grounded run also flagged text rendered *inside the image* as
`injection-suspected`, which is the untrusted-pixels rule doing its job on image
content rather than on text.

#### G3.3 — CLI versus hosted, same frame

| | CLI `explain` (BYO key) | Hosted, crop-grounded |
|---|---|---|
| Region | `960,400 336×48` | `960,400 336×48` |
| Finding | build background flat white/grey where the reference has a green-tinted gradient | reference has a teal/green line below the pink block, missing in the build |
| Injection | flagged the overlay text | flagged the same text |
| Cost | $0.0155 | $0.0200 |

Both land on the same rectangle and the same missing green element, which is the
parity G3.3 asks for. **One half of its pass condition is untested:** it also
asks that both name a *selector*, and neither did, because selectors come from
DOM context and this fixture has none — it is an offline capture with no
`.bridge/context/`. That is a gap in the evidence, not a pass.

#### Found by running it

- **A silent fallback with no way to see it.** Staging the run put the sidecar
  in `.storage` while the dev server resolves that path relative to `web/`, so
  the first crop-grounded call quietly produced a metadata answer. Nothing
  errored. In production the same silence covers a missing object or a corrupt
  sidecar, and "why was my paid explanation so vague?" would have no answer.
  `cropsForFrame` now returns a reason and it is recorded on the usage event
  beside `crops=0`.
- **Crops must be dropped in pairs.** A build crop whose reference did not
  survive validation is one picture, not a comparison, and the model would be
  judging it against nothing.

**Evidence:** `test/cropGrounding.test.mjs` (29 checks) and
`test/cropExplain.test.mjs` (21 checks) here; `cloud` C19–C23 (12 checks) in
Argus. Two teeth checks: CG5.4/5.5 price the same request with the budget
removed and show the reservation exceeded, and CE3.4 shows that with a fixed
prompt version the metadata answer would have been served to every crop request
forever — silently, which is how this feature would have been absent rather than
broken.

**Not proven:** the presigned transfer leg for this kind specifically was
exercised against Argus's own HTTP test server, not against a deployed Cloud
(the local dev server's presigned URLs point at a port another process held).
Every other kind's transfer was proven on 2026-08-15 and the code path is shared.
And R2 remains untouched — §3l's caveat stands unchanged.

---

### 3s. The hosted path, calibrated after crops — BuildV5 G4 ✅ (2026-08-19)

`scripts/calibrate-hosted.mjs` makes real, billed calls through the real
`hostedExplain` service and reads every figure back out of `usage_events`.
`docs/calibration.md` carries the full table; the three findings are here.

**1. Crops made the hosted analysis 2.3× cheaper.** G4 exists on the assumption
that crops raise COGS — "crops change the input token profile, which changes
COGS, which is the floor under every pack price". They do add ~600 input tokens.
They also cut output from ~1,700 tokens to ~519, because a model that can see the
difference stops writing paragraphs about what it cannot determine, and output
costs 5× input.

| | Calls | Cost/call | Avg output |
|---|---:|---:|---:|
| Analysis, crop-grounded | 3 | **$0.0083** | 519 |
| Analysis, metadata-only | 4 | $0.0194 | 1,700 |
| Deep, crop-grounded | 1 | $0.0351 | 758 |

**2. Our price table had never been checked against the source, and was wrong.**
`usage.ts` priced Sonnet 5 at $3/$15 per MTok. The live page says $2/$10 — and
says explicitly that the $3/$15 increase scheduled for 2026-09-01 **will not
occur**. Every recorded cost for Sonnet was 50% high: safe in direction, since
spend was over-stated and no budget ever ran loose, but wrong since the table was
written. The harness refuses to calibrate while the two disagree, which is how it
surfaced. Consequences, all favourable:

- The `$0.0164` "post-intro" figure quoted throughout `FUTURENORMA.md` was a
  forecast of a cancelled event. Withdrawn.
- Credits are derived from cost, so a sonnet analysis fell from 5 to 3 — and the
  crop budget put one back, landing at **4**. 500 included credits now buy **125
  analyses a month, up from 100**, which closes `PATHWAYS.md` carried-forward
  item 4 without a model change.
- Packs were seeded against the higher figure, so they clear their floors by more
  than intended.

**3. Every pack clears its 3× floor with room to spare — no reprice.**

| Pack | COGS | 3× floor | Price | Headroom |
|---|---:|---:|---:|---:|
| pack_100 | $0.21 | $0.62 | $7 | 11.3× |
| pack_200 | $0.41 | $1.24 | $12 | 9.7× |
| pack_1000 | $2.07 | $6.21 | $55 | 8.9× |

Priced at the *metadata* cost instead — the expensive shape — pack_1000's floor
is $14.52 against $55. The gate's condition ("pack prices still ≥ 3× blended
COGS, or the reprice is recorded") passes without a reprice.

**What the sample does not settle:** nine calls on four fixtures, no batch
measurement on this path, and a cold prompt-cache mix. Real traffic will read the
cache more often and cost less than these figures, not more. Full caveats in
`calibration.md`.

### 3t. The hosted report page — BuildV5 Phase H ✅ (2026-08-19)

The page a customer looks at was 131 lines and no images. It now shows the
three captures, the findings, and the history — the last of which is the only
thing on it a local run structurally cannot produce.

**H1 — the images.** Build / reference / diff per frame, in the CLI report's
visual language, copied deliberately from `Argus/src/report.ts` (5d311fb) rather
than re-derived, with its three fixes intact: panes size to the capture's own
aspect, captures past 2.2:1 scroll at natural size with the three panes locked
together, and the lightbox is bounded by the viewport. Verified in a browser
against a **production build** on 2026-08-19: a 6:1 capture gave three panes of
458px client height over 1844px of content, scrolling one moved all three to the
same offset, and a 400×2400 image in the lightbox measured 153×920 against a
1400×1000 viewport with no page overflow.

Images are plain `<img>` from short-lived presigned GETs, never `next/image` —
the 2026-08-19 decision, and the stated ground for the `sharp` entry in
`security/audit-allowlist.json`.

**H2 — the findings.** Category, confidence badge, observation, hypothesis,
selector, code pointer, the "generated — verify before applying" label, and the
flagged regions drawn on the diff as percentage boxes. `injection-suspected`
renders as a warning with its own border and a leading explanation, not as an
ordinary finding. E3's corpus was re-run against the rebuilt page: a seeded
finding carrying `<img src=x onerror=alert(1)>`, `<script>alert('xss')</script>`,
`"><svg onload=alert(2)>` and `javascript:alert(3)` produced **zero** injected
`script`, `img` or `svg` nodes and rendered as visible text.

**H3 — the history.** First drift, times flagged, prior-run count, a sparkline
against the threshold line, and the previous finding. Computed by
`frameHistory()` in `enrichment.ts` — **the same function the prompt uses**, and
the one Phase I's chart will use, because BuildV5's I2.1 gate says two
implementations of "first drift" that disagree is a bug in one of them.

**H4 — share links.** `/api/share` gained `GET` (list) and `DELETE` (revoke)
beside its `POST`, and an interface. The whole lifecycle was exercised against a
production build with `NORMA_DEV_OPEN` off: no token → not found; create → the
report renders; the share viewer sees **no Explain button and no share panel**;
revoke → not found again.

**Evidence.** `test/reportPage.test.mjs`, 41 checks, plus 5 added to
`uploadPipeline`. Four guards were watched failing before being trusted
(CLAUDE.md rule 3): dropping the current run from its own history, bounding a
presigned TTL by the share link's remaining life, the tenant scope on the
artifact query, and the server-side cap on rendered regions.

**One of the new guards was vacuous when written, and only breaking the code
found it.** The CSP checks in `uploadPipeline` V5 read `middleware.ts` as text,
and `middleware.ts` explains each directive in prose directly above it — so a
regex looking for `style-src-elem` matched the *comment* discussing
`style-src-elem`, found no `'unsafe-inline'` after it, and passed regardless of
the policy. Every extraction in V5 now strips comments first. This is the whole
argument for rule 3 in one incident: the check was green, correct-looking, and
asserting nothing.

**Two real bugs found only by looking at the page, after the suite was green:**

- **`onLoad` never fired.** The `<img>` is server-rendered, so the browser
  finishes fetching it before React hydrates, and a handler attached afterwards
  never runs. The page therefore never learned the capture's aspect and a 6:1
  export rendered letterboxed into the default box — the exact sliver the CLI
  fixed in `5d311fb`, reintroduced by a lifecycle detail rather than by the CSS.
  The ref now checks `complete` on attach as well.
- **`npm run seed:dev` wrote to a database that did not exist.** `createDb()`
  falls back to in-memory PGlite without `PGLITE_DATA_DIR`, which is set in
  `web/.env.local` — a file Next loads and a repo-root script does not. The seed
  printed run URLs the whole time and every one of them 404'd.

**The CSP was tightened, not closed.** `style-src-elem` on `/r/` and `/admin`
no longer permits inline styles in production, because the page's styling moved
from `style={{…}}` attributes into `report.module.css`. Verified against a
production build: 2 stylesheet links, **0 inline `<style>` tags**, 31 scripts
and 31 nonces, no console errors. `style-src-attr` still permits inline styles
and will keep having to: the meter's fill width, a region overlay's position and
the pane's aspect ratio are computed per frame and have no stylesheet to live in.
`style-src` is kept as the fallback for browsers implementing neither, which
would otherwise fall through to `default-src 'none'` and load no CSS at all.

**`img-src` now names the storage origin**, derived in `src/storage/origin.ts`
from the same environment the driver is built from rather than configured
separately, and asserted against a URL a real driver signed. **The R2 shape is
unproven** — virtual-hosted addressing against a custom endpoint is exactly what
a local stub gets right and a real service does differently. That is Step 5's
J2, and until it runs this is a claim, not a fact.

---

### 3u. Trends — BuildV5 Phase I ✅ built (2026-08-20)

Until now there was **no page above `/r/{runId}`**: a run could only be found by
already holding its URL. There is now a repository view, a frame trend chart,
and an API that serves one frame's trend and nothing else.

**I1 — the repository view.** `/repos/{repoId}`. Committed runs, newest first,
with commit, branch, date, frames compared and frames flagged, paginated at 20;
then every tracked frame with its last 12 runs as a sparkline, worst first.
Pending runs are absent, which is migration 017's promise kept in the second
place it can be broken.

A page of forty runs costs **four queries**, whatever the size of the
repository: resolve the repo, count the runs, read the page, read every frame's
sparkline. `test/trends.test.mjs` T1.1a asserts the number by counting through
the `Db` seam, and T1.1b runs the per-row version through the same harness — 21
queries for the same answer.

The empty state names the next action (`npx norma-scope upload`) rather than
saying "no runs yet", because a repository row with nothing in it almost always
means a key was set up and nothing was uploaded.

**I2 — the frame trend.** `/repos/{repoId}/trend?frame=…`. Aligned mismatch over
commits, oldest first, with four things that the obvious version of this chart
would get wrong:

- **Gaps, not zeros.** A run that recorded no measurement breaks the line and
  gets a band. Plotting it at 0 draws a pass that never happened.
- **A stepped threshold line.** The threshold comes from each run's own uploaded
  summary and can change. One flat line at today's value would put runs that
  were flagged underneath it.
- **The line breaks where the measurement changed.** `fidelity` and `baseline`
  are different quantities against different references. Marking the boundary
  and still drawing a stroke across it says two things at once; I2.2 asks for the
  two segments to be visually distinguished, so they are.
- **First drift is placed, not computed.** The commit comes from
  `frameHistory()` in `enrichment.ts` — the same function the prompt and the
  report page use — and this code only finds where that commit sits among the
  points on screen.

**The gate is that agreement, and the counter-test is the argument for it.**
T2.1b runs the naive version — scan the visible points for the first flagged one
— through the same harness. On a full window it agrees. On a 3-run window it
answers `r11kkkkkkk` where `enrichment.ts` says `r07ggggggg`: it is a different
query over a truncated window, and it would have shipped looking correct. When
first drift is older than the window the marker is absent and the page *says so*,
because an absent marker otherwise reads as "never drifted", which is the
opposite of the truth.

**I3 — the trends API.** `GET /api/trends?repo&frame&limit`, bearer key, rate
limited. Verified against a production build:

| Probe | Answer |
|---|---|
| No key | 401 |
| No `frame` / no `repo` | 400, naming the missing one |
| Another tenant's **real** repo id | `404 {"error":"not found"}` |
| A repo id that never existed | the same 404, byte for byte |
| `limit=100000` | served at the 200-point ceiling, with `limit: 200` in the body |
| `limit=3` on an 11-run frame | 3 points, `truncated: true`, `firstDriftIndex: null`, `firstDriftCommit` still named |

The response body's top-level keys are `frame`, `points`, `firstDriftCommit`,
`firstDriftIndex`, `recurrence`, `transitions`, `skipped`, `truncated`, `limit`
— no repository list, no run totals, no plan or credit state. `frame` is
required rather than optional for that reason: an omitted frame would have to
mean "tell me what you have".

**Access, stated plainly: these pages 404 in production.** A share token is a
capability for exactly one run, so honouring it on a repository-wide view would
widen every share link ever issued into a tenant-wide read. There is no session
layer until Step 6, so `/repos/` answers only behind `NORMA_DEV_OPEN` — the same
local door the report page uses — and the run report links up to its repository
**for owners only**. This is Step 6's work, not a gap in Phase I.

**One source for the palette.** The report page's tokens moved into
`web/app/_styles/surface.module.css` and both stylesheets `composes` from it.
Copying the block into a second file with a comment asking the next person to
keep them in step is the exact shape CLAUDE.md rule 1 forbids: a colour changed
in one and not the other fails nothing, and the product just looks like two
products.

**Evidence.** `test/trends.test.mjs`, 71 checks. Suite totals at the time: **846
on PGlite, 874 against real Postgres**, across 27 suites (they moved again with
§3v). Guards watched failing before
being trusted (CLAUDE.md rule 3), each by breaking the built code and re-running:

| Break | Went red |
|---|---|
| First drift placed by scanning for the first flagged point | T2.10, T5.3 |
| A skipped measurement coerced to 0 | T2.7, T2.8, T2.3b |
| The transition marker on the last old point instead of the first new one | T3.2 |
| The `org_id` predicate dropped from `resolveRepo` | T1.14, T1.15 |
| An unusable uploaded threshold read as a number | T3.5, T3.6 |
| The sparkline's break at a mode change removed | T3.4a |
| The frame cap moved out of the database into JavaScript | T6.3a |
| The page-offset clamp removed | T6.6 |

**Two bounds were open until the code was re-read, and both are now asserted.**
A `?page=999999999` became a nine-billion-row `OFFSET`, and the frame list was
capped in JavaScript *after* reading every frame in the repository. The second
is the more interesting one: it was four queries either way, so the query count
T1.1a asserts could not see it. `test/trends.test.mjs` now counts **rows** as
well as statements, with a ceiling tight enough that removing the database-side
cap fails it — a loose ceiling would have passed with the cap gone, which is the
whole thing being checked.

The frame cap therefore binds **by name, in the database**, and the page says so
rather than claiming "the 60 worst": working out which frames are worst is
exactly what reading all of them is for.

**Found by looking at the page, after the suite was green:**

- **The line ran straight through a mode change.** The marker was there; the
  stroke crossing it said the two numbers were comparable. Fixed by breaking the
  line — on the large chart and on the repository view's sparkline, because a
  small chart that lies where the large one does not is still a lie.
- **`seed:dev` was not seeding the case its own comment claimed.** The "skipped
  run" was seeded as *no `frame_stats` row at all*, which is a run where the
  frame is absent — it does not appear on a chart, so nothing was drawing the gap
  the comment described. It now seeds a row with a null measurement, which is
  what a compared-but-unmeasured frame actually looks like. Phase I is where the
  difference became visible.
- **Two stat labels were wrong.** "Flagged on latest run" counted frames flagged
  on *their own* latest run, and the frame-list note quoted the longest history
  across all frames as though it applied to each.

**CSP.** `/repos/*` joins `/r/` and `/admin` on the strict per-request-nonce
policy, verified against a production build: `default-src 'none'`, 35 scripts,
38 nonce attributes, one nonce value per response and a different one on each
request. Every chart is server-rendered inert SVG — no client component on
either page, so there is nothing to hydrate and nothing to nonce beyond Next's
own bundle.

**What this does not prove.** Everything above is seeded data on a laptop. The
Phase I gate is I1–I3 green and the annotation agreeing with `enrichment.ts`,
which is met; the *sales* claim under it — a months-deep dogfood repository
rendering a real trend — needs Step 5 and a repository nobody seeded. Treat
Step 4 as **built and not yet validated**, the same standing Step 3 has.

---

### 3v. Cloud app chrome, the theme switch, and a demo tenant ✅ (2026-08-20)

Four things, from Harsha's review of the trend pages.

**One shell across every Cloud page.** `/r/`, `/repos/{id}` and the trend page
share a masthead — product wordmark, breadcrumb, theme switch — and a footer.
The run report also gained a **jump-to list** for its frames, worst-first,
with each frame's pass/flag state on the chip so a twenty-frame run is
navigable before you scroll. Anchor ids are positional (`frame-0`, `frame-1`),
never slugged from the label: a label is upload-supplied, so slugging it makes
ids that collide silently and builds a fragment out of hostile text.

**The breadcrumb is owner-only, and it does a second job.** A share token names
one run, so a trail up to the repository would name it and offer a link the
holder cannot open. For owners it reads *organization / repository / commit* —
and naming the organization is what makes the demo tenant below announce itself.

**The theme is a cookie, and it has three states.** Light and dark are explicit
choices; absent means "follow the device", which is the default and what the
pages did before. `POST /api/theme` sets it and 303s back.

- **POST, not a link.** A side-effecting `GET` would be flipped by any link
  prefetcher, crawler or speculative load.
- **Same-origin only**, on `Sec-Fetch-Site` with `Origin` as the fallback.
- **The redirect target is validated as a same-site path** — `//evil.example`
  is a protocol-relative URL and a browser treats it as another origin, so
  without that check this route is an open redirect. Verified: it answers `/`.
- **No JavaScript anywhere on these pages.** Read server-side before the first
  byte, so no flash of the wrong theme, no hydration, and nothing new to nonce
  under the strict CSP.

The cascade is the part that quietly breaks. `@media (prefers-color-scheme:
dark)` is guarded by `:not([data-theme="light"])` and the explicit
`[data-theme="dark"]` block is declared after it. Drop either and the switch
works in one direction only — the shape of bug that reads as "the toggle is
broken sometimes". S1.4b evaluates the unguarded cascade against all four
device × choice cases and shows a viewer on a dark device who picks light
staying dark.

**Logos.** The Normascope Cloud wordmark in the masthead, the Yutic endorsement
in the footer, on every Cloud page. Both ship as a light-ground and a
dark-ground file, and in the *auto* theme state the server cannot know which the
viewer will get — so both are rendered and one is `display: none`, which also
keeps it out of the accessibility tree. Verified: one wordmark and one
endorsement in `innerText`, and the dark-ground Yutic file is the brand book's
own approved reversal, which §01 names as the only sanctioned recolour.

> **This overrode a rule in `yutic-brand-rules.txt`.** §09 read "never in
> product headers or app UI", and `YuticEndorsement.tsx` had excluded `/r/`
> deliberately for that reason. Harsha decided on 2026-08-20 that the
> endorsement belongs on every surface; the rules file was updated in the same
> change so the book and the code agree, and it records that this also puts the
> endorsement in front of anyone holding a share link. **Still open, and not
> ours to settle:** the rules file says the line reads *"A lab from Yutic"* and
> the component renders *"A product from"*. Both have shipped.

**The x-axis, which Harsha was right to question.** Positions were correct;
two things were not.

| Defect | Fix |
|---|---|
| Labels were a fixed `slice(0, 7)`. A fixture whose commits shared a seven-character prefix rendered six distinct runs as one repeated string | The prefix length is chosen from the data — never below 7, so real shas keep git's familiar form, never above 12. Two runs on the same commit still share a label, because they share a commit |
| The threshold riser sat *on* a run; the measurement-changed marker sat *between* two runs. Same event, two positions, half a slot apart | Both on the boundary. A threshold is a rule that applied to a stretch of runs, so it changes between them, not at one of them |

Spacing is by run index rather than by time, which is deliberate and unchanged —
the axis says "over commits".

**A third chart was lying, and only opening the page found it.** The run
report's history strip drew straight through a `baseline` → `fidelity` change
while the trend chart and the repository sparkline broke their lines there. The
same data read as a sudden regression on one page and a marked transition two
pages over. All three now take the rule from one `segments()` helper.

**`npm run seed:demo` — a demo tenant that cannot be mistaken for evidence.**
Three repositories, twelve weekly runs each, six frames, chosen so each page has
something worth looking at: a regression that appears and is fixed, a frame that
regresses twice, a repository whose measurement changed mid-history, a quiet
frame, and a frame whose capture failed twice. Real `credit_grants` and real
`usage_events`, so the balance is a number something moved rather than a
display.

Every figure in it is invented, and the surfaces say so: the organization is
`DEMO — Northwind Retail (sample data)`, repositories are `demo-`prefixed, the
seeded finding opens "SAMPLE FINDING (demo data, not a real analysis)", and the
model column records `demo-sample-not-a-real-model-call`. The script refuses to
run against a hosted database on a hostname match rather than a prompt somebody
clicks through — it writes to the two ledgers every customer-facing figure
traces to.

**The honest limit, stated where it is used:** share views carry no breadcrumb
by design, so a report opened from a share link shows **no demo label**. The
script prints that caveat every run.

> **The first cut of the demo data contradicted itself**, and it is worth
> recording why. A run carries **one** `summary.threshold` for all its frames.
> Putting the mode-changing frame in with the storefront's meant the
> storefront's threshold jumped 0.1% → 5% at week 6, which silently un-flagged
> `home.png`'s regression halfway through its own story. Frames measured
> differently belong to different runs; the schema said so and the first cut did
> not listen. `search-results` and `nav-bar` now live in `demo-design-system`,
> where the threshold moves with the measurement for every frame in the run.

**Evidence.** `test/cloudShell.test.mjs`, 32 checks. Suite totals: **878 on
PGlite, 906 against real Postgres**, across 28 suites. Guards watched failing
before being trusted:

| Break | Went red |
|---|---|
| `:not([data-theme="light"])` dropped from the media block | S1.2 |
| The explicit `[data-theme="dark"]` block renamed | S1.3 |
| The protocol-relative check removed from the redirect target | S2.3 |
| The breadcrumb handed to share viewers as well as owners | S4.4 |
| The demo organization renamed to a plausible company | S5.1 |
| Commit labels returned to a fixed 7-character slice | S3.2b (counter-test) |

Checked in a browser against a production build: the switch flips a dark-device
page to light and back, `data-theme` is stamped on the surface, the cookie POST
returns 303 with `HttpOnly; SameSite=Lax; Secure`, a cross-site POST is 403, an
open-redirect attempt lands on `/`, both logo variants are present with one
hidden, and every jump link has a matching anchor.

**What this does not prove.** Same standing as §3u: seeded data on a laptop, and
`/repos/` still 404s in production until Step 6. The demo tenant is a testing
and walkthrough surface, not the sales asset — that remains Argus's own
dogfooded history on a deployed instance, per FUTURENORMA §4.

---

### 3w. Explainers, a real tenant, and a screenshot set ✅ (2026-08-20)

Three things, from Harsha's review of the Cloud pages. A fourth — a "generated
by *username*" line in the report header — was **deferred to Step 6 by decision
on the same day**; the reasoning and the settled policy are in `PATHWAYS.md`
Pathway 5.

**Every number on a Cloud page can now explain itself.** A defined term — the
word itself, under a dotted underline — opens a plain-language definition:
26 on a seven-frame report, covering the stat strip, each frame's aligned
mismatch / SSIM / mode, the history facts, both charts and their legends, the
findings' confidence, hosted-AI credits, the share panel, and every column header
on both tables.

> **The first cut put a circled "?" beside each label, and Harsha rejected it.**
> It came to **103** question marks on that same report — a page speckled with
> query glyphs reads as a page unsure of itself, and the count scaled with the
> number of *frames* rather than with the number of ideas. Wrapping the word adds
> no glyph at all, and it fixed an alignment problem that kept recurring: a
> separate icon is its own flex item, so in a wrapping row it broke onto the next
> line away from the thing it explained. A trigger that *is* the text cannot come
> apart from it. The count fell to 26 in the same pass, because per-frame
> repetition was most of the noise — the badge, the meter legend, the region
> button and both Explain buttons lost theirs, and none of them was the word a
> reader was stuck on.

The text is not written in the pages. It comes from `web/lib/glossary.ts`, which
the public `/report` page already prints as a list — so the definition a prospect
reads before signing up is the one they read afterwards. Cloud-only words
(history, first drift, recurrence, credits, share links) live in a second export,
because `/report` documents the *local* HTML report and a local run has none of
those things.

Three constraints shaped the implementation, in this order:

| Constraint | What it ruled out | What it left |
|---|---|---|
| No client JavaScript on `/repos/` — §3v claims exactly that | a `useState` tooltip, which would put a hydration boundary around a chart that currently arrives in the first byte | the native HTML popover: `popovertarget` on a plain `<button>`. The browser supplies the top layer, light dismiss, Escape and focus handling, and ships nothing to do it |
| No new inline styles — `style-src-attr 'unsafe-inline'` is a carried-forward item, not an invitation | positioning from a `style` attribute; also `anchor-name`, which would need to be unique per instance and so could only come from one | CSS anchor positioning off the popover's *implicit* anchor, behind `@supports`, with the UA's centred popover as the fallback |
| `.card` is `overflow: hidden` and `.tableWrap` scrolls | a positioned `<div>`, which would be clipped in a card and drag a scrollbar in a table header | the top layer, which escapes both |

The typography has to work in both directions and the two are opposites: the
**trigger** inherits everything (it is a word inside a stat label, a table header
or body text) and the **bubble** resets everything (it is a paragraph in the top
layer). Getting the second wrong shipped once — the definitions rendered in
capitals, because a popover inherits down the *DOM* and every trigger hangs off a
label styled `text-transform: uppercase`; the `font` shorthand resets size,
weight and family and touches neither `text-transform` nor `letter-spacing`.

The Explain row also gained a **"Hosted AI"** heading, because it previously
opened with an unlabelled password field — and because the credits definition
needed somewhere to hang that was not a button. A trigger *is* its own text now,
and those words already belong to a click that spends money.

**Hovering a point on either chart says which run it is.** "Which run is that
spike?" is a question about a *point*, and answering it by asking someone to
match an x-position against the table below is not answering it. The trend chart
draws a card — commit, measurement, the threshold that run was judged at, the
verdict, the mode pair and the date — from a 13px transparent hit circle under
the 3.5px dot, revealed by plain `:hover` on the group. Still no JavaScript.

The two sparklines cannot do that, and the reason is one attribute:
`preserveAspectRatio="none"`. They are 200 units wide and stretch to whatever the
row gives them, so anything drawn in their coordinate system arrives horizontally
smeared. They use `<title>`, which the browser renders outside the SVG's
coordinate system entirely.

Two things the card had to be told, both of which are one-word bugs:

- **`fill: transparent`, never `fill: none`.** `none` does not paint and
  therefore takes no pointer events, so the tooltip would open only on the 3.5px
  dot — invisible *and* untouchable.
- **`pointer-events: none` on the card.** It overlaps its neighbours' hit
  circles, and a card that could be hovered would hold itself open while
  stealing the point the reader was moving towards.

Hover does not exist on a touch screen, so this is an enhancement and not the
only route: every point is also a row in the Runs table, with the same facts and
a link.

**`npm run seed:real` — a second tenant, and every number in it is a
measurement.** Ten runs that actually happened, read out of the summaries
`norma-scope` wrote at the time: the portfolio capture in `norma-bridge-usecase/`
and cases 01, 02 (six scenarios), 03 and 05 in `test-run/`. 59 frame rows, 151
images, 22.3 MB, and the 11 real Sonnet 5 findings from case 03 — including the
two that turned out wrong and the `injection-suspected` one.

It is a **separate organization** from the demo tenant, and it is the same rule
that names that one. `DEMO — … (sample data)` exists so nobody mistakes an
invented figure for a measurement; `REAL — Normascope's own runs (measured)`
exists so nobody stamps "(sample data)" on a figure that is one. `seed-demo`
builds both, so a walkthrough has invented history deep enough to show what
trends do and real runs to show that any of it is true.

Four things it deliberately does not do:

- **No `usage_events`.** Case 03 was a real billed call — 3,753/409 on Haiku
  4.5 and 6/3,772/2,696 on Sonnet 5 — but that spend went through the CLI
  against a personal key, before the hosted meter existed. There is no per-frame
  breakdown and the printed estimate used the Sonnet price since corrected
  (§3s). A hosted usage row would claim this system metered that call. The
  balance sits at a full 500 and the ledger is empty.
- **No invented provenance.** One run carries a branch — case 05, whose README
  records `demo/normascope-visual-verification` — and no run carries a commit
  SHA, because none of them recorded one. An earlier draft put `main` on three
  runs and a different, plausible branch on case 05, contradicting the README
  two directories away.
- **Nothing computed.** `flagged`, the percentages, SSIM, mode and source are
  copied from the summary, never recomputed. V2.2 re-reads all 59 rows against
  their source files.
- **Case 02's scenarios are their own repository.** Each is an independent
  one-line change measured against the same baseline and reverted — six
  experiments, not six commits. Joined into one history the trend line climbs to
  87% and falls back to 0.4%, which reads as "it broke and somebody fixed it"
  and is a story about a codebase that never existed.

> **Real data found two real bugs in pages that had shipped.**
>
> **The diff overlay's region keys.** Keyed on `x,y,w,h` — unique until two
> findings name the same rectangle, which case 03's `norma-hero.png` does: an
> `injection-suspected` finding and a `layout` finding on the identical box.
> React saw duplicate keys and reserved the right to drop one of the overlays.
> Keyed on position now, which is also what the highlight compares against.
>
> **"First drifted at" said "never exceeded the threshold" beside "Times flagged:
> 4 runs".** `firstDriftCommit` was one field carrying two facts, and a null
> meant both "it never drifted" and "we have no commit for the run where it
> did" — the second being *every* run uploaded from a laptop, since `upload`
> reads the SHA from `GITHUB_SHA`. Split into `firstDriftAt` (whether) and
> `firstDriftCommit` (where), and the pages print the three states apart. The
> same change moved the chart's marker from matching on a commit to matching on
> a **run id**: a commit is ambiguous when two runs share it, and useless when
> every run's is empty — which is why no marker appeared on those charts at all.
> `test/trends.test.mjs` T5.5, T5.5b, T5.6 and the T5.6b counter-test, which runs
> the one-field reading over both histories and shows it calling them the same
> thing.

**`npm run capture:cloud` — the pages, both themes, one command.** 24 shots into
`docs/screenshots/cloud/` with a generated manifest: repository view, frame
trend, a point hovered on the trend chart, a flagged run report, a clean one, a
definition open, and the share view, each in light and dark. Playwright driving
the Chrome already on the machine — `playwright-core`, no 150 MB browser
download.

The two interaction shots exist because the ordinary full-page capture can never
contain them: a popover is closed and a hover card does not exist until a pointer
is over a dot. The script opens one and hovers the other — picking the *middle
flagged* point rather than the first, because hovering point zero puts the card
over the y-axis and photographs the least informative run in the history.

They go to `docs/`, **not** `web/public/`: anything under `public/` is served by
the deployed site at a guessable URL, and these are pictures of a surface that
404s in production. Moving a chosen one into `web/public/screens/` is a
deliberate act for a page that will display it.

Four things the first version got wrong, each fixed and each recorded because
they are the ways an automated screenshot lies:

| It did this | Why | Now |
|---|---|---|
| Wrote sixteen screenshots of "Not found" without complaining | File-backed PGlite is one writer. Seeding while the dev server holds `.pgdata` leaves the script reading new ids off disk and the server serving old ones | Reads the `<h1>` and exits 1 with the cause. A file named `real-run-report-light.png` containing "Not found" is worse than no file |
| Photographed a lone "Difference" pane | "Most images" picked case 03 — seven diff overlays, no captures — over a run with all three kinds | Distinct kinds decide it; volume only breaks the tie |
| Named a file `-flagged` showing zero flagged frames | The best run was chosen for completeness and named for intent | The name says what the picture contains |
| Charted `cart.png`, the frame seeded deliberately flat | Every demo frame has twelve runs, so alphabetical order broke the tie | Longest history, then the one that has actually moved |

**The demo tenant's hero run moved, for the same reason.** Its images, findings
and share link were attached to the *newest* storefront run — week 12, where the
regression has been fixed and `home.png` reads 0.02%. So the one fully-furnished
demo report showed a frame marked "pass" carrying a high-confidence finding about
a missing background, and no Explain buttons, because the page only offers those
on a flagged frame. They now hang off the last run where `home.png` is over its
threshold, inside the regression the series was written to tell.

**Evidence.** `test/explainers.test.mjs` (52 checks) and
`test/realSeed.test.mjs` (21), plus 4 new checks in `trends`. Suite totals:
**955 on PGlite, 983 against a real Postgres server**, across 30 suites.
Guards watched failing before being trusted:

| Break | Went red |
|---|---|
| `text-transform: none` and `letter-spacing: normal` dropped from the bubble | X3.1, X3.2, X3.1b |
| One term misspelled in a page | X2.2, naming the file |
| A per-frame explainer's `scope` removed | X2.4 |
| A `?` glyph put back inside the trigger | X2b.1, X2b.2 |
| `fill: none` on the chart's hover target | X6.4, X6.4b |
| `pointer-events: all` on the hover card | X6.5 |
| Points drawn before the trend line | X6.7 |
| `branch: "main"` invented on runs that recorded none | V2.4 |
| `flagged` recomputed as `pct > threshold` instead of copied | V2.5b |
| A capture directory renamed | V1.1 |

Checked in a browser in both themes: 26 triggers and 26 popovers on the real
seven-frame report, no duplicate ids, no unresolved targets, anchor positioning
active, a bubble opening flush under its trigger, and a hover card opening beside
its point and flipping to the left half of the chart past the middle.

**What this does not prove.** Same standing as §3u and §3v — seeded data on a
laptop, `/repos/` still 404s in production. Two limits specific to this work:

- **The suite cannot render React.** It checks the glossary, the ids, the CSS
  reset, the `@supports` split and the absence of client components; it cannot
  show a bubble appearing in the right place. That was a browser check and is
  recorded as one.
- **X2.2's scan is static.** Two terms are reached through a ternary and are
  listed by hand in the suite; the image captions are extracted. A third
  expression form would not be covered — X2.6 fails if the count grows, which
  converts a silent gap into a failing check.
- **Hover cannot be sized on the server.** SVG text has no measurable width
  there, so the tooltip is a fixed box and every line has to fit the widest value
  it can ever carry. The first cut put the verdict, the mode pair and the date on
  one line, which fitted `flagged · baseline/baseline` and ran straight out
  through the edge on `under threshold · fidelity/baseline · 2026-08-13`. The
  budget is written out above `TIP`; adding a field means redoing that sum.
- **V2.5b is a counter-test that does not bite, and says so.** Recomputing
  `flagged` instead of copying it agrees on all 59 rows, because no recorded
  value sits exactly on its threshold. The check asserts the code rather than
  the data, and the output states which half is real.

---

### 3x. Two-level history: an overview, a brush, and a bound on the DOM ✅ (2026-08-20)

**The trend chart could not show a customer's history, and said so in a sentence
nobody could act on.** It drew the newest 30 runs. First drift and recurrence are
computed over *everything* the organization holds — so the page routinely stated
"first drifted at `ee6813323c`" above a chart with no marker on it, and offered
as remedy a note about editing a URL parameter.

Measured before designing, on a 200-run frame. The numbers are the reason this
is a defect report rather than a preference:

| Runs drawn | Gap between marks | Dots merge? | Hover hits the right run? |
|---|---|---|---|
| 20 | 27px | no | yes |
| **30 — the old default** | 17.8px | no | **marginal** |
| 60 | 8.8px | no | no |
| 90 | 5.8px | yes | no |
| 200 | 2.6px | yes | **off by three** |

A tooltip that names the wrong commit is worse than no tooltip, and it was
already imprecise at the default window on a narrow card.

**The model Harsha settled on**, after two rounds of it: **time is the primary
axis of history, run count is a secondary detail control.**

| | Overview | Detail |
|---|---|---|
| Axis | **time** | run index |
| Range | 7d / 30d / … / retention | what the brush selected |
| Resolution | bucketed, spike-preserving | every run, exact |
| Interaction | drag to select | hover for the run |

Reading them in that order is the answer to "when did this start": the overview
shows ninety days, you drag the fortnight it happened in, and the detail chart
gives you the individual commits with their cards.

**Why the overview is a different chart and not a smaller one.** The detail chart
is spaced by run index — correct when reading commits in order, and it means two
hundred runs in an afternoon and two hundred across a quarter draw *identically*.
Over ninety days that is not a rendering choice, it is a false picture, and the
one question the overview exists to answer is exactly the one that spacing
cannot. This was a latent flaw in the existing chart, not a new requirement.

**Nothing is averaged, and that is doctrine rather than taste.** Each bucket
keeps five facts, every one a value some run recorded: lowest, highest, first,
last, and whether runs inside it disagreed about crossing the threshold. An
average is a sixth number that no run measured. `test/overview.test.mjs` carries
both counter-tests and prints what the reader would have seen:

| Instead of min/max | What it draws |
|---|---|
| mean of the bucket (O2.4b) | **24.36%** for a bucket whose real peak is 97.4% |
| every nth run (O2.5b) | the spike is visible at stride 2 and invisible at 3, 4, 5 and 7 — the picture depends on the stride, not on the site |

**The ladder's largest step is the tenant's retention, read rather than
written.** `plan_limits.retention_days` is 90 for every plan today and the sweep
cascades `frame_stats`, so 90 days genuinely *is* all this organization has —
and "all retained" is therefore an **annotation on that step, not a fourth
option**. A separate "All" beside a 90 that means the same thing is a control
where one choice does nothing, and it would imply storage the plan does not
sell. `overviewRanges(365)` returns four real steps, so a later tier needs no
code change.

**The DOM is bounded; the data is not.** Every run stays in the line geometry and
in the export. What is bounded is how many *interactive* elements exist:

| Size | What it gives |
|---|---|
| 200 runs | fully interactive — marks and hover cards |
| 1k, 5k, All | the exact line; select a range to inspect it |
| Runs table | 25 rows a page |
| Export | the complete span, exact, as CSV |

**The ladder is built from the real count, and its top step is *all of them*.**
The first cut keyed off `truncated`, which offered "200 / 1k / 5k" to a
forty-seven-run frame — three buttons returning the same forty-seven points.
Harsha caught it by asking what happens below 200. The count is free: the runs
table already does a `COUNT(*)` for its pager. So sizes are offered only where
they would show something different, the last step is every run in scope rather
than an implementation number, and a frame whose whole history fits in one view
gets **"Showing all 12 runs · fully interactive"** instead of a control. That is
every real tenant today.

`MAX_TREND_POINTS` is 20,000, sized above what retention can produce — 200 runs
a day for 90 days is 18,000 — so "All" is the truth for every plan that exists,
and the cap still bounds the one query whose cost would otherwise be a
customer's choice.

5,000 interactive points would be ~40,000 DOM nodes in the first byte, aimed at
0.14-unit targets. Bounding a view is only honest while the whole dataset stays
reachable — hence the export, and hence pagination on the *table*, which has no
shape to break, and never on the chart, which does.

> **`FinishedSPEC.md` §3v's "zero client JavaScript on `/repos/`" is no longer
> true, by decision.** Harsha chose a real drag over the zero-JS approximation
> (clickable buckets) on 2026-08-20. The valuable half survives and is now what
> the suite guards: **both charts are still inert server-rendered SVG**, complete
> in the first byte, and with JavaScript off the pages read correctly and the
> range links work — only the drag is missing. `brush.tsx` is the one client
> component on the tree, it holds no history, and it converts a drag into a URL
> for the server to answer. X4.1 was rewritten rather than deleted.

**Three defects found by rendering it rather than by reasoning about it:**

- **The hit target was a circle.** Fixed radius means the targets overlap once
  runs are closer than the diameter, and the last one drawn wins — aiming at run
  80 opened run 83. Now a full-height column exactly one slot wide: they tile the
  plot, so they cannot overlap at any density, and the reader aims at an
  x-position rather than at a dot they may not be able to see.
- **The overview sized its bars by `buckets.length`.** Only buckets holding runs
  come back, so with sparse history the array is far shorter than the division of
  time — six real runs from one afternoon drew as a block covering a quarter of a
  90-day chart. Correct data, a picture claiming three weeks of drift.
- **The interactivity label read the size requested, not the size drawn.** A 5k
  selection narrowed by the brush to 32 runs still said "line only, select a
  range to inspect" while showing 32 dots and their cards.

**The export defuses formula injection.** A CSV field beginning `=`, `+`, `-` or
`@` is executed by Excel and Sheets on open, and frame labels and commit
messages are upload-supplied — the same argument that made `contentType` an
allowlist in `artifactUploads.ts`. Fields are quoted and such values prefixed.

### The waiting indicator, and a brand rule it had to work around

Harsha asked for the Yutic logo as an animated loading symbol. The brand book
forbids precisely that, in one sentence:

> `yutic-brand-rules.txt` §01 — *"A fan of five peacock feathers, each with an
> eye. **Never rotated, reordered, stretched, recoloured or given effects.**
> Clearspace = one eye diameter. Minimum 28px wide."*

A spinning mark is a rotation *and* an effect. **So the mark holds still and a
ring turns around it** — the identity is the logo, the motion is not applied to
it. It renders at the 28px floor (the rule says to drop the quill and base below
that, and there is no reduced asset, so it is never smaller), keeps one eye
diameter of clearspace, and is served as-is with no recolour.

`prefers-reduced-motion` stops the rotation and leaves a ring that still reads as
waiting, because it is visibly incomplete. The label is real text inside
`role="status"`, so the wait is announced rather than drawn.

**This is an overridable rule and §09 is the precedent for how**: it read "never
in product headers or app UI" until Harsha decided otherwise on 2026-08-20, and
the rules file was edited in the same change. S6.6 is the check that would need
deleting, deliberately, alongside that edit.

Loading states are on the three routes where a wait is visible — the repository
view, the trend page and the run report. All three are `force-dynamic`, every
control on the trend page is a navigation, and the brush pushes a URL on every
drag. The report's wait is not the database: it presigns a URL per artifact, so a
twenty-frame run is sixty signatures before the first byte. Explain and the share
panel show the same indicator inline, beside the controls rather than inside a
button label — swapping a label to "Explaining…" resized the button mid-click and
left the other one still offering its price during a call that had already
reserved credits.

**Evidence.** `test/overview.test.mjs` (42 checks), 14 in `cloudShell` for the
brand rule and the loading routes, plus additions to `explainers` and `trends`.
Suite totals: **1,028 on PGlite, 1,056 against a real Postgres server**, across
31 suites. Guards watched failing before being trusted:

| Break | Went red |
|---|---|
| Hit target back to a fixed-radius circle | X6.3, X6.3b |
| Dots thinned by value rather than by density | X6.13 |
| `pointer-events: all` on the hover card | X6.5 |
| Points drawn before the trend line | X6.7 |
| The whole detail ladder shown regardless of what exists | T5b.1, T5b.3, T5b.5 |
| A second client component added to `/repos/` | X4.1 |
| The Yutic mark animated instead of the ring | S6.5 |
| The reduced-motion guard removed | S6.9 |
| The ladder keyed off truncation rather than the count | T5b.1, T5b.9 |

**What this does not prove.** The brush was driven with a synthetic pointer in
one browser at one width; touch has not been tried, and `touch-action: pan-y` is
reasoning rather than evidence. The 200-run stress frame was seeded locally and
deleted afterwards — **no real tenant has more than ten runs of one frame**, so
every density figure above is a measurement of a fixture, not of a customer.

---

### 3y. Storage against real R2, and checks that outlive go-live day — BuildV5 Phase J, partial ✅ (2026-08-21)

**R2 exists and the suite has run against it.** Bucket `normascope-cloud`,
private, Eastern North America to sit beside the Neon database in `us-east-1`
and the Vercel functions in `iad1`. An Object Read & Write account token scoped
to that one bucket; five variables in Vercel Production.

**Suite: 1085 checks across 32 suites against real R2**, 1055 on the filesystem
driver. The two numbers differ because 30 checks only exist when a real S3 API
is present.

| Phase J check | Result |
|---|---|
| J1.1 fresh production database migrated | ✅ already true — Neon, 20 migrations, 2026-08-13 |
| J2.1 full G suite against real R2 | ✅ storage 66, uploadPipeline 50 |
| J2.2 unsigned bucket read denied | ✅ `golive-check` L7 — 400 on a listing and on an object |
| J3.1 no private route serves data anonymously | ✅ L4 — `/admin` → `/admin/unlock`, the rest 404 — **but see the deployment note below** |
| J3.2 HSTS, nosniff, frame-ancestors | ✅ L2, L3 — nonce present on `/r/`, different per request — **same caveat** |
| J3.3 no credential in any bundle, header or response | ✅ `bundleSecrets` 7 checks + L5 |
| J3.4 upload from the private-preview org as a real `team` org | ✅ org provisioned, `canUpload=true` through the real entitlement path, 5 files uploaded |
| J4 preview code retired | ✅ branch merged and **deployed**, 1131 lines deleted, 11 → 10 functions |
| J2.3 delete a run then an org, prefixes empty **in the bucket** | ✅ proven against production R2 — see below |
| J4 `norma_*` tables and `normascope-cloud-*` objects | ⊘ **left in place by decision, 2026-08-21** — see below |

**J2.3, in two halves, because deletion has two ways to be wrong.**

The first is deleting too much. `norma-scope@0.8.1` from npm re-uploaded the same
run into the preview org: **5 files already stored, 0 re-sent** — content
addressing, so a second run of identical artifacts costs no transfer and no
storage. Two runs, ten artifact rows, **five distinct objects**, `bytes_stored`
unchanged at 357,971. Deleting that second run removed 6 rows and **0 objects**,
because every blob was still referenced by the run that stayed, and all five
survived.

The second is deleting too little — the expensive one, since bytes nobody can
reach are bytes we keep paying for. A throwaway org uploaded a synthetic run of
**random pixels**, deliberately unique so nothing could deduplicate onto blobs
the preview org owns. Deleting it removed **3 objects, 4 rows, 336,714 bytes**;
a re-check found 0 of 3 present, and a `deletePrefix` sweep over the whole org
prefix returned **0** — the claim is that the bucket holds nothing under it, not
that the keys we happened to record are gone. The org delete then took its row,
and the preview org's five objects were untouched throughout.

**The private preview uploaded a real run, and it is Harsha's own.** The
portfolio's `.bridge/` holds a genuine comparison from 2026-07-31 — three frames,
one flagged. `norma-scope upload` sent it to `https://www.normascope.com` through
the presigned path: **5 files, 0.36MB, run `a52bdc55`**, and the artifact mix is
what Pathway 2 item 7 promised — build, reference and diff for the one flagged
frame, a thumbnail each for the two clean ones. All five objects are in
`normascope-cloud` with sizes matching the database byte for byte, and
`frame_stats` carries the three frames at 0.26%, 0.03% and 0%.

`scripts/provision-preview-org.mjs` makes the org reproducible. It is a real
`team` org with an active subscription, because the entitlement check that
refuses uploads from unpaid plans is the one control between "free" and the
thing we charge for, and granting the preview an exception is the easiest way to
stop testing it.

**The deployment was ninety commits behind, and finding that out is what the
upload was worth.** Before the merge, `main` was still at `e42810d` — the
website merge — so the rebuilt report page, trends, the Cloud shell and the
storage origin in the CSP had never been released. The shared report rendered
the real numbers and served `img-src 'self' data:`, no R2 origin, because
`src/storage/origin.ts` did not exist on `main`: every uploaded screenshot would
have been blocked. That is precisely the failure S5.7 was written to catch,
arriving by the one route S5.7 cannot see — the check was right, the code was
right, and the deployment was old.

**Merged and deployed 2026-08-21 (PR #16), and re-verified after.** The live CSP
now carries `https://normascope-cloud.<account>.r2.cloudflarestorage.com`, which
also settles the case S5.7 had never exercised: **virtual-hosted addressing is
what R2 signs, and it is what we declare.**

| Re-run against the new deployment | Result |
|---|---|
| `golive-check` L1–L8 | all pass, including the bucket probe |
| `/repos/{unknown}` anonymously | the not-found state, no data |
| The five presigned image URLs on the shared report | **all five serve** — 106426, 107017 and 87991 as `image/png`, 30833 and 25704 as `image/jpeg`, matching the database byte for byte |

**Steps 3 and 4 are validated.** Their gates ask what a prospect can see; a
prospect can now open a share link and see a real run of Harsha's own project,
with its three captures, its numbers and its history, served from R2.

**The timing is the evidence that it was R2 and not the local stand-in.** The
storage suite takes 4.6s against MinIO on `localhost` and **71.3s** against
Cloudflare; `uploadPipeline` goes from 2.2s to 28.2s. Those are round trips.

**Three of these were plans to grep something once.** J2.1, J3.3 and J2.2 are
written in `BuildV5.md` as go-live-day actions, and each checks a property that
can break afterwards without anything going red — a header dropped in a config
edit, a route that stops being gated when auth lands, a bucket opened at 1am to
debug something. Doing them by hand proves the deployment was correct on the day
it was done.

- **The upload protocol was proven only against local disk.** `commitUpload`
  accepts or refuses a run on what `head()` and `get()` report, and those are
  the *driver's* answer: a local file always has the size the filesystem states,
  while S3 reports what the client declared at PUT time and signals a missing
  object by error name rather than by null. The suite now takes whichever driver
  the environment selects. Against a real S3 API the counter-tests still fire —
  U6b watches the naive commit accept 5000 stored bytes declared as 9.
- **CI gained a third suite job on a real S3 API**, so the checks that skipped
  themselves on every push now run: unauthenticated PUT, an upload exceeding the
  pinned `Content-Length`, an expired URL, `deletePrefix` past the 1000-key
  boundary.
- **`test/bundleSecrets.test.mjs`** replaces J3.3's one-off grep: credential
  shapes, server-only variables read or assigned, an allowlist of the
  `NEXT_PUBLIC_` names, no `.env` inside `.next`.
- **`scripts/golive-check.mjs <url>`** reads what the server returns over the
  wire — the headers no build artifact contains, the nonce, the private routes,
  the bucket's answer to an unsigned read. Production passes all of it.

**Two of these checks were wrong first, and both failures are the useful part.**

| Check | What it did | Why it mattered |
|---|---|---|
| `golive-check` L4 | Pointed at the apex domain, which 308s to `www`. Every request came back 308 and the gate checks read that as "not served anonymously" | **Six passes that never reached the application.** A check a redirect satisfies proves nothing |
| `golive-check` L3 | Looked for a CSP nonce on `/`, which is served the inline policy by design | Reported a correct deployment as broken. Two policies exist; asking the wrong one is how this goes green while meaning nothing |
| `bundleSecrets` B3 | Plain name matching flagged `ANTHROPIC_API_KEY` on `/commands`, which *explains* that the CLI needs one | A check that cries wolf is one people learn to ignore. B3 now needs a value beside the name, and B7 proves the loosening did not break it |

**One claim that had never been checked against the service.** `storageImageOrigin`
builds the artifact host by prefixing the bucket onto the endpoint, and the only
test used a made-up endpoint — it proved the function agrees with itself. Get it
wrong and nothing fails: the suite stays green, the deploy succeeds, and report
images silently do not render, blocked by a policy naming a host that was never
used. S5.7 signs a real GET and compares origins. Proven against MinIO's
path-style URLs; **virtual-hosted addressing, which is what R2 uses, is
unconfirmed** — the check exists but that run has not been reported back.

**A number in the plan was wrong.** `BuildV5.md` J4.1 expects the portfolio's
function count to fall from 11 to 7. Vercel does not turn underscore-prefixed
paths into functions, so `api/_norma/*` never counted; the real drop is 11 → 10.

**The published CLI is the one that was tested, not the local build.**
`norma-scope@0.8.1` went to npm on 2026-08-21 and was installed fresh into an
empty project — 5 packages, no `@anthropic-ai/sdk`, so the optional peer stays
optional. Its `--dry-run` reported exactly what `COMMANDS.md` now claims: three
files for the flagged frame, one thumbnail each for the two that passed. That
release also fixed docs which had described the pre-thumbnail behaviour since
`773ac3d` — the wrong thing to be stale about, since it is a statement of what
leaves a user's machine.

**The preview's data outlives its code, and that is the decision.** The `norma_*`
tables stay in the portfolio's shared Turso database and the
`normascope-cloud-*` objects in its shared bucket — **Harsha's call,
2026-08-21**. Both stores also hold the articles, claps and admin data; a wrong
`DROP` or a wrong prefix there costs more than the few megabytes it reclaims.
Recorded as closed, not as a deferred task, so nothing re-opens it later.

---

### 3z. `next` 15 → 16, and the guard the audit allowlist used to hold ✅ (2026-08-21)

**`npm audit` is 0.** `web/package.json` moved from `next@^15.5.0` to
`^16.3.1`, and the three accepted high-severity advisories — `next`, `postcss`,
`sharp`, all reached through next's bundled copies — are gone with it. This is
the change decided on 2026-08-19 (`FUTURENORMA.md` §4 open decision 3b) and
gated in `PATHWAYS.md` §7, taken before launch and on its own.

| Check | Result |
|---|---|
| `npm run verify` | ✅ **1058 checks across 32 suites**, typecheck both packages, web build, audit clean |
| Suite against real Postgres | ✅ **1086 checks** (`scripts/test-db.sh`) |
| `npm audit`, production deps | ✅ **0** — 0 critical, 0 high, 0 moderate, 0 low |
| Every route keeps its rendering mode | ✅ diffed against the 15.5.23 table — identical, one cosmetic reflow of the `/legal/[slug]` SSG group |
| The nonce CSP still stamps every script | ✅ **11 of 11 scripts nonced, 0 unnonced, 0 violations** on `/r/` against a production `next start` |
| `golive-check` against that build | ✅ L1–L8 pass except L1.2, which only says `http://localhost` is not `https` |
| Hydration | ✅ a client component on `/` ran its handler after the click |

**The nonce check is the one that mattered.** A blank `/r/` in production is
this repo's most expensive shipped bug, and its cause was a CSP a build
silently stopped satisfying. Route modes and header text can both look right
while the page renders nothing, so the evidence here is a browser against a
production build, not a passing suite.

**`middleware.ts` is deprecated in 16, and the rename is not cosmetic.** The
2026-08-16 trial recorded "Middleware" → "Proxy" as a relabel in build output.
It is more than that: Next 16's own source says *"Proxy always runs on Node.js
runtime"* and refuses route segment config in the file. Built both ways to check
rather than trusting the sentence — `middleware.ts` still compiles to
`server/edge/chunks/…` and a `middleware-manifest` entry, while `proxy.ts`
compiles to `server/middleware.js` with `require()` and `setup-node-env`, and
the manifest entry disappears. **So the rename moves the CSP and gate layer from
Edge to Node**, on a matcher that covers every document including the statically
prerendered marketing pages. Left on `middleware.ts` deliberately: the
deprecation is a warning and not an error, nothing in the file needs Node (it
uses Web Crypto on purpose), and moving every page view onto a Node function in
one region is a latency and cost decision, not a rename. **Open, and named in
§9.**

**Two other Next 16 deprecations, both live.** `export const runtime = "edge"`
on `/api/pitch-unlock` and `/api/admin-unlock` prints "The Edge Runtime is
deprecated" on every build. Same shape of decision as the proxy one, and it
belongs with it.

**Deleting the allowlist entries had to move a rule first.** `audit-check.mjs`
fails on a stale entry, so the three had to go — the check itself reported
`STALE next`, `STALE postcss`, `STALE sharp` and refused to pass, which is the
file's anti-rot rule working. But the `sharp` entry was not only bookkeeping: it
carried the standing rule that **uploaded images never go through `next/image`**,
and `audit-check.mjs` re-read that sentence on every run. Deleting it would have
left the rule on a source comment alone — CLAUDE.md rule 1.

The rule is now `test/reportPage.test.mjs` **R8**, scanning `web/app/r` and
`web/app/repos` for the import. **R8.2b is the counter-test** — a scan whose
passing state is "found nothing" is indistinguishable from a scan that cannot
find anything, so the same pattern is run over source that does import
`next/image` and has to report it. And the guard was watched failing: an import
added to `frame-view.tsx` turned R8.2 red naming the file, then was removed
(CLAUDE.md rule 3). `security/audit-allowlist.json` is now empty, with a note
saying that is the goal state and that a claim inside an entry moves before the
entry is deleted.

**`jsx` moved from `preserve` to `react-jsx` and `next-env.d.ts` switched from a
`/// <reference path>` to imports.** Both were written by Next, not by hand.
Checked that `tsc --noEmit` still passes with **no `.next` present**, because
`verify` and CI typecheck the web app before building it and a fresh clone has
nothing there to import.

**CI needed one edit.** The audit job carried a comment saying raw `npm audit`
"would stay red until the next 15 → 16 decision is taken". It is green now.

#### The upgrade had been proven on the wrong runtime

Checking whether CI could run Next 16 turned up something worse than a version
bump. The pipeline held **three different Node versions**, none of them the one
that runs the product:

| Where | Was | Is |
|---|---|---|
| Vercel — the functions that actually serve customers | **24.x** (and Vercel's maximum) | 24.x, unchanged |
| CI | 20 | **reads `engines.node`** |
| A laptop | 22 | 24, nudged by `EBADENGINE` |
| `@types/node`, both packages | **26.1.1** | `^24.13.3` |

**So every check that had ever passed, including this upgrade, was green on a
runtime production does not execute** — and the type checker was describing a
Node two majors newer still, which accepts APIs that are not there and stays
silent until something calls one.

**`ci.yml` did carry a rationale, and reading it is what found the bug.** It
said *"Match the deployment target, not the newest release"* and then named 20,
citing the ERESOLVE defect in `norma-scope 8e96b5e` that bit only on an older
runtime. The rule is right; the number belonged to a different artifact. That
concern is about **strangers installing the published CLI**, which is Argus.
Nobody installs argus-cloud — it is private and never published — so the only
runtime that matters here is Vercel's.

**Fixed as one source rather than four numbers.** `engines.node` in the root
`package.json` is now the only place the version is written. Vercel reads that
field to choose the runtime, and all four CI jobs read the same field through
`setup-node`'s `node-version-file: package.json` — verified against the action's
source, which falls through `volta.node` and `devEngines.runtime` (neither
present here) to `engines.node`. Raising it in one place raises the deployment
and CI together.

A `.nvmrc` was written and then deleted: a second file saying "24" is precisely
the drift this change exists to remove. A laptop on the wrong Node now gets
`npm warn EBADENGINE ... required: { node: '24.x' }` on install instead.

| Run | Result |
|---|---|
| `npm run verify` on **Node 24.19.0**, with Node 24 types | ✅ 1058 checks, audit clean |
| Suite against real Postgres on Node 24 | ✅ **1086 checks** |
| `npm run verify` on Node 20.20.2 | ✅ green — recorded because it is what CI *was* running, not because it still matters |

#### The Vercel Toolbar cannot work here, and Next 16 is what said so

**The first preview deployment failed**, and nothing local could have predicted
it:

> `Cannot patch preview comments when immutable static file upload is enabled.
> Upgrade to next@v16.3.0-canary.32 or newer to resolve this.`

**The suggested upgrade was impossible.** `16.3.1` is newer than
`16.3.0-canary.32` and is the newest release published. Taking the error's
advice was not an available move, which is the first sign the error is about a
setting rather than a dependency.

**The real finding: the Vercel Toolbar has never worked on this site.** It wants
`https://vercel.live` in `script-src`, `img-src`, `frame-src` and `font-src`,
`wss://ws-us3.pusher.com` in `connect-src`, and `'unsafe-inline'` in
`style-src`. `middleware.ts` grants none of it in either policy, and
`vercel.live` appears nowhere in the repository. So it has been blocked on every
deployment since the CSP landed — invisibly, because a blocked script logs to a
console nobody reads.

Next 16 changed the failure mode, not the fact. Static files now upload
immutable, so Vercel can no longer patch the toolbar in after the build, and a
silent block became a red build.

**Fixed by turning it off, in both environments explicitly** (2026-08-21):
Project → Settings → General → Vercel Toolbar → Pre-Production **Off**,
Production **Off**. Production was on "Default (controlled at the team level)",
which resolves somewhere nobody can see from the project and can change without
anyone touching this repo — the same inherited-value drift this session removed
from the Node version and the audit allowlist. The preview build went green and
the uploaded images render on it.

**Nothing was lost.** Turning off a feature the CSP already blocks costs
nothing. Widening the policies to recover it would put a third-party script and
inline styles on `/r/` and `/admin` — the two trees rendering model output,
upload-supplied labels and other people's email addresses — in exchange for a
comment widget on a private preview. `middleware.ts` carries that instruction so
the next person to meet this error does not spend an afternoon on the version
number.

**The process lesson is the sequencing, not the checking.** Every local check
was run and green: the suite on two runtimes, real Postgres, route modes, the
nonce CSP in a browser against a production build. None of them can see a
platform interaction — only a deployment can. The upgrade should have been
pushed for a preview build as soon as `verify` went green, with the
documentation written while it ran, instead of five commits later. This repo's
own most expensive recent bug was a correct build and a stale deployment; the
same shape nearly repeated.

### 3aa. The session layer: both sign-in methods, and the budget behind the email one ✅ (2026-08-21)

**Step 6's identity spine is built, and the outbound-email ceilings are part of
it rather than a hardening pass after it** — FUTURENORMA §4 Step 6, PATHWAYS
Pathway 5 and §10.7 5A.1–5A.13. Harsha closed Open decision 4 the same day:
**GitHub OAuth and magic links ship together.**

| Check | Result |
|---|---|
| `npm run verify` | ✅ **1222 checks across 34 suites**, both typechecks, web build, audit clean |
| Suite against real Postgres | ✅ **1254 checks** (`scripts/test-db.sh`) |
| `npm audit`, production deps | ✅ **0** |
| New suites | `auth` (101 checks) and `authAbuse` (63 on PGlite, **67** on real Postgres — the four extra are the 20-process budget test and its counter-test, which PGlite cannot run) |
| Migration range | `001`–`021`; `021_auth_sessions.sql` adds sessions, identities, login tokens, invitations, owner claims, the throttle and the auth audit log, plus `orgs.owner_user_id` |
| The whole loop in a browser | ✅ unclaimed organization → link requested → link clicked → owner claimed → `/repos` renders the tenant, cookie invisible to page script, replayed link refused |

**The claim that needed real processes.** A global daily email budget held in
process memory is not a global anything — the platform decides how many
instances exist, and each would get its own. `authAbuse` B9 spawns **20
separate processes against one Postgres at a budget of 5, and exactly 5 are
authorised**. B9b runs the naive module-scope counter through the same harness:
**all 20 pass**, so a 50-a-day budget would really be 1,000. That pair is the
gate item, and it is the reason the number in FUTURENORMA can be quoted.

**The ladder, and the one design decision inside it worth knowing.** The
ceilings are taken in **two phases**, not one. Per-IP and per-subnet are paid by
every request whatever address it names; the global daily budget and the two
per-recipient ceilings are paid only once an email is genuinely going out. With
a single combined reservation, a script naming ten thousand strangers would
consume the day's budget for mail that was never sent — the ceiling meant to
stop abuse would itself be the outage. B5.3 holds it: five requests for unknown
addresses consume **no** send budget.

**What bounds the abuse surface most is not a ceiling at all.** The set of
addresses anyone can make this service mail is not "the internet" — it is
members, live invitations, and the purchaser of an unclaimed organization
(`signInEligibility`). Everything else gets the identical response and no mail.
That follows from having no trial and no self-serve signup, and it is the single
largest reduction available to a magic-link system.

**Responses say nothing about who has an account.** B8 compares what an attacker
can observe — status, retry hint, challenge — across a registered address, an
unknown one, a malformed one and one inside its cooldown, and finds them
identical. The cooldown case is the subtle one: answering "too many requests"
there would confirm the address recently received a link, and therefore has an
account. The service still knows which was which; `internal` carries it to the
audit log and never to the browser.

**The challenge is first-party.** A hosted CAPTCHA needs `script-src` and
`frame-src` for someone else's origin on the sign-in page, and `middleware.ts`
refuses third-party origins — the Vercel Toolbar was given up rather than widen
that policy. A 16-bit proof of work costs a person tens of milliseconds and an
attacker CPU per attempt, is signed, expires, is bound to the caller, and is
single-use. Its solver runs in the browser and cannot import the verifier, so
**B6b solves a challenge with the browser algorithm and verifies it with the
server's** — if those two ever disagree, nobody past the failure threshold can
sign in and nothing else would catch it. Whether this is enough or Turnstile is
worth the CSP widening stays open (FUTURENORMA §4 Open decisions 4).

**No silent account merge.** A GitHub account we have never seen, whose verified
address matches an existing member, is **refused** (A8.9) — §10.7 5A.7 makes a
matching address evidence for a link flow, not permission. The sanctioned path
is an invitation or an owner claim on that address; an *unverified* GitHub
address claims nothing (A8.13), which is what stands between us and takeover by
typing someone's address into GitHub's settings page. Identity is keyed on the
immutable numeric subject, so a rename keeps working (A8.14).

**Ownership is an invariant, not a fourth role.** `orgs.owner_user_id` is
nullable — an organization exists unclaimed between the purchase webhook and the
purchaser's first sign-in — and claiming it is one conditional update, so two
devices produce one owner (A4.6). The owner cannot be removed and the last admin
cannot be removed; ownership is transferred instead, transactionally, by the
current owner to an existing member (A6.1–A6.7).

**Sessions are rows, and every failure reads the same.** Not a JWT: revoking a
session, removing a membership or deleting an account has to take effect on the
next request rather than whenever a token would have expired. 90-day absolute
lifetime, 30-day idle, rotation that replaces the token **without** moving the
expiry (A2.4), and `reauthenticated_at` that ordinary browsing does not refresh
(A2.7) — otherwise a tab left open would permanently satisfy the recent-auth
requirement destructive actions are meant to have.

**A signed-in person with no membership still gets a session** and sees nothing
(A9.10, §10.7 5A.4). Authorization is the membership list; the session only says
who is asking.

**Tenant isolation now holds at the session layer, with its own counter-test.**
`reportData.authorize` takes the org list from the session and never from the
request. A7.2 shows a member of one organization refused another's run; **A7.3
runs the naive version — trusting a caller-supplied org id — and watches it
open** (§10.7 5A.13: "an organization ID in a URL, form, cookie or JSON body is
not authorization"). `/repos/{repoId}` is gated the same way, and `/repos` — the
repository list Pathway 6 carried as open item 2 because it needed a session to
know whose organization was asking — exists.

**Two things the audit log will not hold.** No address and no IP: both are keyed
hashes, keyed *per purpose*, so a leaked throttle table and a leaked audit table
cannot be joined into a picture of a person (A10.2–A10.4). The throttle table is
the same — it needs to tell subjects apart, not name them.

**Token leakage is closed at the surfaces, not only in the token.** Redemption
is an API route that consumes server-side and redirects to a clean URL with no
token; `/login` and both callbacks carry `Referrer-Policy: no-referrer` and
`no-store`; verified against a production build — strict nonce CSP, 14 of 14
scripts nonced, and the session cookie invisible to page JavaScript.

**Not done, and not claimed:**

- **The GitHub round trip has never touched github.com.** The exchange, the
  state check and the account matching are proven against an injected `fetch`.
  A registered OAuth app is Harsha's to provide — `Blocked` in the sense
  CLAUDE.md means, an account rather than missing local software.
- **No invitation email is sent.** `scripts/grant-access.mjs` prints the link.
  The send belongs with the organization console's invite form and will use the
  `invite_org_day` / `invite_address_day` ceilings, which are built and tested.
- **Neither console is built.** This is the identity spine; the organization and
  operator consoles, the account pages, deletion UI and privacy controls are the
  rest of Step 6.
- **Timing is mitigated, not equalised.** The provider call runs after the
  response via `after()`, which removes the measurable difference; the remaining
  gap is a few indexed reads.

---

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

### 4d. The site was built but not deployed — resolved, see §4g

**Registered 2026-08-13.** `normascope.com` is Harsha's — Spaceship, Inc.,
created `2026-08-13T06:29:56Z`, nameservers still the registrar's parking pair
(`LAUNCH1/LAUNCH2.SPACESHIP.NET`), so **DNS is not yet delegated to Vercel and
nothing resolves to the app**. `web/lib/site.ts:4` already defaults `SITE_URL`
to it, so `sitemap.ts`, `robots.ts`, the canonical tags and the OG image now
build absolute URLs from a hostname we own. No code change was needed for the
purchase; `NEXT_PUBLIC_SITE_URL` still overrides it for a preview deployment.

*Previously (checked 2026-08-10): unregistered, `whois` returning `No match` —
recorded then as fact, not as a problem, for the reason below.*

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

**Update 2026-08-13 — the deployment blockers are closed, and the recorded one
was the wrong one.** See §4f.

### 4e. What the site does *not* claim — verified

Checked against the demand gate's honesty requirements:

- ✅ No `--upload`, `norma-scope upload` or `cloud login` string appears
  anywhere under `web/app/(site)` — the false claim recorded as §7 #1 in the
  last audit **is gone from the site**.
- ✅ No `$59`, price, "sign up", "log in" or "subscribe" string on `/cloud`.
- ✅ Three `/cloud#waitlist` anchors wire the early-access actions.
- ✅ Footer carries the Yutic endorsement lockup ("A product from Yutic").
- ✅ **Terms, Privacy, Cookie Notice and AI Disclosure are published** as of
  2026-08-13 — `/legal` plus four pages, linked from the public footer. See
  §4h. This closes the demand gate's legal-copy item early; the *paid* Cloud
  set (subscription terms, refund policy, subprocessors, data-flow disclosure)
  remains FUTURENORMA §4 **Step 8**.

The remaining demand-gate boxes (waitlist round-trip in a deployed environment,
owner notification configured, duplicate handling in production) were **not
verified this audit** — they cannot be, until the site is deployed. *Closed
later the same day: see §4g.*

> **Superseded, same day.** The owner-notification box no longer exists as
> written: the route now sends a branded confirmation to the person who signed
> up instead of a notification to the operator. See PATHWAYS' public-site
> demand gate, where that item is unchecked with the reasoning.

---

### 4g. The site is live — normascope.com, 2026-08-13 ✅

`normascope.com` serves the public marketing site and waitlist from Vercel.
Domain registered at Spaceship the same morning, DNS `A` records pointing at
Vercel, TLS issued for the apex and `www`.

| Thing | State |
|---|---|
| Vercel project | `normascope`, root directory `.`, `npm run build:web` → `web/.next` |
| Domains | `normascope.com` **308 →** `www.normascope.com`, both certificated |
| DNS | `A` records at Spaceship; nameservers stay Spaceship's so the free email forwarding keeps its MX and SPF |
| Env | `DATABASE_URL`, `ADMIN_PASSWORD`, `PITCH_PASSWORD`, `RESEND_API_KEY` — production and preview |
| `/pitch`, `/admin` | 307 to their unlock screens; before the passwords were set they 404'd, which is the default-deny behaviour working in production |
| Waitlist | Signup round-trips to Neon from the deployed path, and a duplicate in different case returns the identical response |

**The deploy immediately found a defect that 400+ green checks could not.**
The first database request on the live site failed:

```
waitlist insert failed: ENOENT: no such file or directory, scandir '/vercel/path0/migrations'
```

`migrate()` read `migrations/*.sql` from a path computed off `import.meta.url`
at runtime. Across the workspace symlink (`web/node_modules/argus-cloud` → repo
root) that resolves to a different directory inside a Vercel function bundle
than it does anywhere else. **§4f had already fixed one version of this** by
naming the files in `outputFileTracingIncludes` — the trace manifests do list
all 13 — so the files were shipped; the *lookup* was wrong.

**The fix removes the filesystem from the production path entirely.**
`scripts/embed-migrations.mjs` generates `src/migrations.generated.ts` from the
`.sql` files, `npm run build` runs it, and `migrate()` uses the embedded SQL.
Passing an explicit `dir` still reads disk, which is what `M5` needs to feed in
deliberately broken SQL. There is no longer a path for a bundler, a symlink or a
host's working directory to get wrong.

The new risk that creates — a stale generated copy — is guarded by **M8**: it
asserts the embedded list is the directory, in order, and byte-identical. Watched
it fail: editing one comment in the generated copy turns M8.2 red.

**Two silent failures fixed alongside.** `web/app/api/waitlist/route.ts` caught
both the database error and the notification error with bare `catch {}`. The
first meant the signup path was down in production with no trace anywhere — the
only evidence was the visitor's error message. Both now log the error (never the
address). That is how the `ENOENT` above was found at all.

**Suite:** 403 checks green on PGlite, **427 against a real Postgres server**,
across twelve suites — run 2026-08-13.

**Still open:** confirm the owner-notification mail actually arrives at the
forwarded `waitlist@normascope.com`, and decide whether `www` or the apex is
primary — the code's `SITE_URL`, canonical tags, sitemap and OG URLs all say
`normascope.com`, while the deployment currently redirects the apex to `www`.

---

### 4h. The legal pages are published — 2026-08-13 ✅

`/legal` plus four documents, linked from the public footer and live:
**Terms of Use**, **Privacy Policy**, **Cookie Notice**, **AI and Cloud
Disclosure**.

**`docs/legal/*.md` stays the source of truth.** `scripts/embed-legal.mjs`
generates `web/lib/legal.generated.ts` at build time and the pages render that,
so the committed document *is* the published document. A hand-converted TSX copy
would have been a second version of a legal text, and the two would diverge the
first time a clause changed — with the published one, the one people rely on,
being the copy nobody remembered to update. Embedding rather than reading at
request time is the §4g lesson applied before it could bite twice.

| File | What it does |
|---|---|
| `scripts/legal-manifest.mjs` | The allowlist: which documents publish, their slugs, titles and summaries |
| `scripts/embed-legal.mjs` | Generates the embedded copy; throws if a listed document is missing |
| `web/lib/markdown.tsx` | ~140-line renderer for the subset those documents use. Builds React elements — no `dangerouslySetInnerHTML`, no parser dependency |
| `web/app/(site)/legal/` | The index and the `[slug]` pages, all four statically prerendered |

**The refund policy is deliberately not published.** Its own first line says not
to publish it or link it from a checkout until the final terms are reviewed and
Paddle is configured — and there is nothing to buy. Publication is an allowlist,
never the directory listing, so adding a file to `docs/legal/` does not put it
on the site. The `/legal` index says plainly that the paid-Cloud documents come
before checkout is enabled, rather than quietly omitting them.

**Tests** — `test/legal.test.mjs`, 7 checks:

| Check | What it proves |
|---|---|
| L1 | Every published page is byte-identical to its document, and every listed document exists |
| L2 | The draft refund policy is held back, and none of its text reached the bundle |
| L3 | Every published document names Yutic as operator and carries a "Last updated" date |
| L4 | No published document links to an unpublished one — a dead link inside a privacy policy |

L1 was watched failing: change one word in the generated copy and L1.1 goes red.
The first version of the suite could **not** have caught it — it imported the
allowlist from the generator, which *ran* the generator and silently rewrote the
artifact it was about to inspect. Splitting the manifest out is what made the
guard real.

**Suite:** 410 checks green on PGlite, **434 against a real Postgres server**, across thirteen suites — run 2026-08-13.

**A false claim removed from the footer, same day.** Both footers read
"Screenshots never leave your machines." That is true of the local CLI and
false of Cloud, whose purpose is uploading them — under a page selling Cloud.
`docs/pitch.md` had always carried the qualifier ("unless you opt into Cloud…
on the free tier — that's architecture, not policy"); the footer had dropped it,
and the public footer inherited the shortened version when the operator line was
added.

**Both footers now carry the copyright only.** The first fix re-added the
qualifier; Harsha's call was to drop the claim entirely, and it is the better
one — a footer is where a product claim cannot be qualified, cannot be kept in
step with what the product does, and gets copied to the next surface with its
conditions stripped, which is exactly what happened here. Caught by reading the
live page, not by any check: §4e verifies what the site *doesn't* claim and has
no equivalent for a claim that holds on one tier and not the other.

> **Superseded in part, 2026-08-13.** Round-trip, deduplication and
> source/referrer/timestamp capture are now verified against the **real
> production Neon database** over HTTP, though still from localhost rather than
> from a deployment. Owner notification remains unverified — `RESEND_API_KEY`
> is unset. See §4f.

### 4f. Deployment substrate — closed 2026-08-13

Three separate things were done. Only one of them was the blocker anybody had
written down.

**1. The recorded blocker was already stale.** §7 #11 and FUTURENORMA §4 Step 1
(F1) both said a Vercel project cannot resolve `"argus-cloud": "file:.."`. That
stopped being true when npm workspaces were added: root `package.json` declares
`"workspaces": ["web"]` and `node_modules/argus-cloud -> ..` resolves. What was
actually missing was a build contract — `dist/` is gitignored, so a fresh
checkout has none of the 17 modules `web/` imports, and `next build` alone
fails. `vercel.json` now pins root-directory build, `npm run build:web`
(which runs `tsc` first), and `web/.next` as output.

Proven against a **clean checkout** — no `node_modules`, no `dist/`, no env
files, exactly what Vercel clones: `npm install && npm run build:web` succeeds.

**2. The real trap, which nothing had recorded.** `migrate()` reads
`migrations/*.sql` from disk at runtime through a computed path
(`src/db.ts:25`). Next traces `import` statements, not `readdir`. Inspecting
the build's trace manifests found **0 of 34 function bundles carried a single
`.sql` file** — every local build passes, every localhost test passes, and the
first request touching the database on Vercel dies with `ENOENT`. This surfaces
only on a real deployment, i.e. after DNS is pointed.

Fixed with `outputFileTracingRoot` + `outputFileTracingIncludes` in
`web/next.config.mjs`. Now **34 of 34** bundles carry all ten migrations, in the
clean-checkout build as well.

**3. A missing-database deploy no longer fails silently.** `createDb()` fell
back to in-process PGlite whenever `DATABASE_URL` was unset — on Vercel that
means each serverless instance gets its own empty database, accepts signups,
returns success, and discards them, with nothing in any log. `src/db.ts:61` now
refuses to start when `process.env.VERCEL` is set and the variable is absent.
Tested both directions: refuses on Vercel, PGlite fallback intact for local dev,
tests and CI.

**Database provisioned.** Neon, `us-east-1`, **Postgres 17.10**, pooled
endpoint (`-pooler` host). Pooling is safe here because the migration lock is
`pg_advisory_xact_lock`, transaction-scoped by deliberate choice
(`src/db.ts:98`) — a session lock from a pooled connection would wedge every
future boot. All ten migrations applied cold through the pooler; 23 tables.

Verified end to end against that database, not against a stand-in:

| Check | Result |
|---|---|
| `migrate()` cold through the pooler | 10 migrations, 23 tables |
| New signup via HTTP `POST /api/waitlist` | Row read back from a **separate process** |
| Same address, different case | No second row — `UNIQUE` dedupe holds |
| Honeypot submission | `200` returned, nothing stored |
| Malformed / empty / whitespace / non-string address | `400`, rejected |
| Referrer carrying `?id=99` | Query string stripped before storage |
| `/admin/waitlist` | Renders "Total 1", address visible |

The test row was deleted afterwards; the table is empty.

**Still not proven, and only a deployment can prove it:** how Vercel's own
Next.js builder behaves with `outputDirectory` pointing into a subdirectory.
That is exactly the risk F1's "one free preview deploy" exists to retire.

**Also landed:** `web/lib/waitlistEmail.ts` — one definition of a usable
address, imported by `api/waitlist/route.ts` and both `WaitlistForm`
components. Both forms carry `noValidate` (so errors render in site markup
rather than browser bubbles), which made `required` and `type="email"` inert —
an empty box posted to the server. Client-side checks now share the server's
rules *and its wording*, so the message cannot differ depending on whether
JavaScript ran. Twelve cases pass; there is **no automated regression test**,
because `web/lib/` is not compiled into `dist/` where `test/*.mjs` imports from.

### 4i. Audience measurement — 2026-08-16 ✅

**Vercel Web Analytics runs on the public pages and nowhere else.** It is
mounted in `web/app/(site)/layout.tsx`, not the root layout — the root wraps
`/pitch`, `/admin` and `/r/{runId}` as well, and measuring those would mean
recording paths and referrers for investor material, for other people's email
addresses, and for customers' own reports. `/r/*` would refuse the script
anyway under its nonce CSP, but that is a backstop, not the control.

**What it closes.** PATHWAYS asks for "unique signups and signup rate by
source". `/admin/waitlist` supplied the signups; nothing supplied a visitor
count, so the *rate* had never been computable. Two limits on the figure, both
deliberate: visitors are counted by a hash recomputed daily, so a returning
visitor counts twice — it is visits, not people; and nothing links a page view
to a signup row, so the rate is signups over visits for a period, not a tracked
conversion.

**The legal copy shipped in the same commit, because the Cookie Notice
required it.** It already promised that any analytics would be documented
*before* activation. `docs/legal/COOKIE-NOTICE.md` gained an "Audience
measurement" section and `PRIVACY.md` names Vercel Inc. as the provider.
Verified in a real browser: no cookie is set and `localStorage` stays empty.
`test/siteAnalytics.test.mjs` (12 checks) fails if a tracker is mounted without
the documents naming it, or outside `app/(site)/`.

**Open:** analytics must still be enabled once in the Vercel project; until
then the script 404s and nothing is collected. And **no consent banner was
added** — the reasoning is that consent under ePrivacy attaches to storing or
reading data on the device and this stores nothing, but GDPR still governs the
processing and some EU regulators read cookieless analytics more strictly. That
is a decision for Harsha, recorded here rather than assumed settled.

### 4j. Search visibility — 2026-08-16

**normascope.com was not in Google's index at all.** Checked 2026-08-16: a
`site:` query returned nothing from the domain. Not a technical fault — titles,
descriptions, canonicals, `robots.txt`, `sitemap.xml`, the social card and
`SoftwareApplication` JSON-LD were all already in place. The domain was three
days old with no inbound links, and nobody had told Google it exists.

**The one action that matters is not code.** Google Search Console and Bing
Webmaster Tools need a person with the account to verify ownership and submit
the sitemap. `web/app/layout.tsx` reads `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
and `NEXT_PUBLIC_BING_SITE_VERIFICATION` and emits the meta tag only when a
token exists; the tokens are per-property, so hard-coding one would be silently
wrong on every preview deploy.

**Four defects found and fixed.**

1. **The sitemap lied about dates.** `lastModified: new Date()` stamped build
   time on every route, so each deploy claimed all seven pages changed at once.
   Crawlers discount a `lastmod` they can see is untrue, which cost the signal
   on pages where it was real. `scripts/embed-page-dates.mjs` now reads each
   page's last commit from git and omits the date where git cannot say, rather
   than substituting the build time.
2. **The legal pages were missing from the sitemap** despite being public and
   linked from every footer.
3. **`robots.txt` disallowed `/normascope-cloud`**, a path this domain has
   never served — it is the legacy preview in the portfolio repo. A Disallow
   for a path the site does not serve protects nothing while reading as though
   it does. Removed. `/pitch` remains deliberately *absent* from the disallow
   list: blocking it would stop crawlers fetching those pages and therefore
   reading their `noindex`, which is the stronger control.
4. **Titles and descriptions were being truncated.** `/guide` rendered
   "Normascope User Guide — Normascope" because the layout template appends the
   brand; three descriptions ran past the ~155 characters Google displays, the
   longest at 228.

**The route list keyed off the navigation menu, and that was the real bug.**
The sitemap, the date generator and the SEO suite all answered "what pages does
this site have?" from `NAV_LINKS` — which is the menu, not the set of pages.
Both directions failed silently and both were reproduced before the fix: a
public page added without a nav entry got no sitemap entry, no date and none of
the metadata checks while every suite stayed green; a page dropped from the nav
while its file stayed put vanished from the sitemap while remaining reachable.
`scripts/public-routes.mjs` now walks `app/(site)` — the filesystem cannot
disagree with itself about which pages exist — and a new dynamic route without
an expansion rule throws at build rather than producing an empty section.

`test/seo.test.mjs` (24 checks) covers all of it, including both add/remove
cases, rendered title length against the template, and description length.

**Copy changed, with Harsha choosing the option.** The home description now
carries the category terms ("visual regression testing and design QA") while
the title keeps the site's own voice; five page titles were replaced ("The
report" → "The visual diff report explained"); and the home `h1`, which was the
wordmark image plus screen-reader text reading only "Normascope", now reads
"Normascope — compare your running UI to any reference". Nothing moved on
screen.

**Figma was considered and deliberately rejected as the lead.** It is a real
first-class source (`migrations/001_foundation.sql`: `figma | images | url |
baseline`) and unmentioned on the public site, and "compare Figma to live
website" is a busy query. Harsha's call was that leading with it would
misrepresent a product where all four sources are equal. Recorded because the
search-volume argument will come back.

### 4k. The 404 page — 2026-08-16 ✅

`web/app/not-found.tsx`, at the root so it catches URLs matching no route at
all, rendering the real `SiteLayout` around itself so the header, footer, Cloud
lockup and analytics mount all arrive from one source. Returns a genuine 404
status and carries its own title; before this a mistyped URL got the
framework's bare default with no navigation and no way onward.

It is **counted like any other page** — a spike of 404s is how a wrong link
gets found, and a 404 page that excludes itself from measurement is a broken
link nobody reports.

**The twin is a new pose, `empty`.** The set's rule is eight placements, eight
poses, no pose twice, and a new placement takes a new pose rather than
borrowing one (`normascopeWeb.md` §5). `shrug` was the tempting shortcut and
belongs to `/agents`. `empty` holds up a frame with nothing in it: the set is
two figures each reading their own copy of the same page, and this is the one
whose copy is blank. It carries no `get cloud` sticker and is not a link —
selling the paid tier to someone who has just hit a dead end competes with the
one thing the page owes them, which is a way back.

---

## 5. The preview — retired 2026-08-21

**Gone.** It lived at `harshaattray.com/normascope-cloud`: access-gated,
single-tenant on purpose, `api/_norma/{login,runs,run,explain}.ts` behind one
dispatcher plus two frontend routes, committed @ `b4eeb86`. The retirement
branch is merged and deployed — 1131 lines removed, portfolio functions 11 → 10,
the route 404s. What follows is what it proved while it ran.

Verified in production 2026-07-29 with a real Bose-landing run: findings
returned with `firstDriftCommit` and `recurrence`, result-cache hit was free,
2.5MB report served from R2.

> ⚠️ That run predates `b3db0c7` (§2a). Its *plumbing* evidence — enrichment,
> cache, R2 delivery — still stands; any **score** it produced does not.

It shared the portfolio's Turso DB and R2 bucket; all tables prefixed `norma_`,
objects `normascope-cloud-*`. **Those rows and objects stay — decided
2026-08-21** (§3y): the stores are shared with the articles, claps and admin
data, and reaching into them for a few megabytes is the worse trade. Portfolio
is at 10 of Vercel Hobby's 12 functions.

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
| 11 | `web/` deploys | `web/package.json:14` declares `"argus-cloud": "file:.."` | **Fixed 2026-08-13** (§4f) — and the stated cause was already stale. npm workspaces resolved the linking; the real blocker was that no `vercel.json` existed and `migrations/*.sql` reached **0 of 34** function bundles |
| 12 | *(new)* The Bose example scores 79.7% | It scores **36.4%**; the old figure was a misconfiguration (§2a) | **New this audit** |

`normascope.com` was never listed here as a defect, and is now **registered
(2026-08-13)** — earlier than the plan required. FUTURENORMA §1 and Open
Decisions #1 put registration at Step 7; DNS delegation is still outstanding.
See §4d.

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
| **No trial.** The free CLI is the trial; risk reversal is a 30-day money-back guarantee | 2026-08-03 | PATHWAYS §2 |
| **`plan` is `free \| team`** — the commercial tier. `lapsed` was moved to `subscription_status` on 2026-08-15; see the row below | 2026-08-15 | `migrations/019` |
| **Free plans cannot upload anything** — no key, no presigned URL, no bypass flag | 2026-08-03 | BuildV5 §G2c |
| Trial deferred as a later experiment with a settled design (no card, one per GitHub org, ~15-review grant) | 2026-08-03 | BuildV5 §G2c |
| Stack: Next.js on Vercel | — | CHECKPOINT |
| Explain is **Anthropic-only** in hosted; provider flexibility belongs in BYO | — | FUTURENORMA §8 |
| Build order: **local first, deploy when demonstrable** | 2026-08-03 | BuildV5 Phase F / J |
| **One paid tier at $59/mo**, no ladder, no lite tier; packs need a live subscription | 2026-08-05 | CLAUDE.md, `migrations/007` |
| `/pitch` and `/admin` use **separate passwords** — the pitch phrase is expected to leak | 2026-08-10 | §4c, `web/lib/gate.ts` |
| **The nightly backup schedule is deferred to the first paying organization**, not blocked. Hand backups cover the waitlist until then | 2026-08-15 | `PATHWAYS.md` Pathway 1 item 10 |
| **`plan` is the commercial tier (`free \| team`); `subscription_status` owns the lifecycle.** Entitlement is both: an entitled tier and a status that permits work. `past_due` and `none` do not block — grace is not a lockout | 2026-08-15 | `migrations/019`, `src/plans.ts` |
| **Quota values are launch assumptions pending traffic data**, deployed deliberately. They live in a table so changing one is an UPDATE | 2026-08-15 | `migrations/016` seed, `migrations/019` comment |
| **Credits stay at 5 per analysis / 8 deep.** Lowering them needs either a validated cheaper model or a deliberate margin decision; 3 credits on Sonnet 5 is 26% at worst case, under the 50% floor | 2026-08-15 | FUTURENORMA §3, `providerBudget.ts` |
| **Local, staging and production are separate.** `web/.env.local` holds no production credential; production lives in Vercel; staging is a Neon branch behind Preview deploys | 2026-08-15 | `scripts/schema-drift.mjs`, `scripts/seed-dev.mjs` |
| **The `/r/` CSP uses a per-request nonce.** `'unsafe-inline'` is refused permanently — that tree renders model output; hashes are impossible because the flight payload is per-request | 2026-08-15 | §3m, `web/middleware.ts` |
| **Two CSPs, split by what a tree renders, both issued only in `middleware.ts`.** `/r/` and `/admin` get the nonce because they render untrusted content; the prerendered marketing pages get `'unsafe-inline'` because a nonce cannot exist in a page rendered once at build time, and forcing them dynamic would cost the CDN cache | 2026-08-16 | §3n, `web/middleware.ts` |
| **`'unsafe-eval'` is allowed in development and gated on `NODE_ENV`.** `next dev` runs modules through `eval()`; without it nothing on the site hydrates. Production carries neither it nor any external origin, and the suite asserts the gate | 2026-08-16 | §3n, V5 in `test/uploadPipeline.test.mjs` |
| **A throttled unlock is indistinguishable from a wrong phrase.** Same redirect, same message. Naming the limiter tells an attacker to slow down or rotate address | 2026-08-16 | §3o, `web/lib/gate.ts` |
| **Screenshots are re-encoded at build time, not served through `next/image`.** The optimiser would put `sharp` in the request path and falsify §9's allowlist reasoning to save bytes a build-time encode saves anyway | 2026-08-16 | §3p, `web/app/_components/Screenshot.tsx` |
| **Credit prices are derived, never chosen.** Analysis 5, deep 8, from worst-case model cost with a 50% margin floor. Any figure shown to a customer is rendered from that derivation, never typed | 2026-08-10 | FUTURENORMA §3, §3m |

---

## 9. Named open risks

Carried forward per doctrine — a suite that was not run is an open risk, never
an assumed pass.

Scheduled work is **not** listed here. `normascope.com` registration (done
2026-08-13, ahead of its Step 7 need), legal pages (Step 8), and git tags (not a
task per FUTURENORMA §2) were briefly mis-filed as risks in an earlier draft of
this section and are deliberately absent.

| Risk | Status |
|---|---|
| E1 hosted-path injection fixtures not run 1:1 | **Open.** CLI-side suite is green; the hosted path has never been proven. Widens when crops ship |
| E6 provider retention posture unverified | **Open.** Disclosure page unwritten |
| E7 live purchase loop | **Blocked** on Paddle |
| Hosted findings metadata-grounded, not crop-grounded | Known, hedged, fixed by BuildV5 G3 |
| A paying customer would pay twice (§7 #9) | **Open — launch blocker for the paid tier** |
| `reconcile.ts` margin bug (§7 #7) | **Open**, and the module is unreachable. Fix before the first paying org |
| `webhooks.ts` unreachable, Paddle adapter unwritten | **Open — launch blocker.** No revenue can be provisioned |
| No rate limiting on any request path | **Closed for authenticated API paths** (§3c): per-key and per-org ceilings counted in the database, proven across 20 separate processes. **Closed for the two unauthenticated surfaces that had a credential or a table behind them** (§3o): both gate unlocks and the waitlist, on an unforgeable client address. **Still open in the honest sense** — those buckets are per process, not global, so they raise the cost of abuse rather than bounding it. A durable limiter in front of auth is still unbuilt |
| The public site had no CSP at all | **Closed 2026-08-16** (§3n). From §3m until then, `/r/` was the only path with a policy — the marketing pages, `/pitch` and `/admin` had none. Nothing failed, which is why it survived a day short of a month |
| The R2 leg has never carried a real artifact | **Open.** The whole upload pipeline is proven against the filesystem driver only. Step 5 requires the G suite re-run against real R2 — §3l |
| `sweep-uploads.mjs` is built and unscheduled | **Open.** Without it an abandoned declaration holds a byte reservation nothing else releases. Must run before customers upload — §3l |
| `style-src` still allows `'unsafe-inline'` on the report tree | **Open, and measured.** Removing it leaves the page unstyled: twelve elements carry inline `style` attributes. Closes when Phase H rebuilds that page with classes — §3m |
| ~~`plan` and `subscription_status` can both say `lapsed`~~ | **Closed 2026-08-15** (migration 019). `plan` is the tier, `subscription_status` the lifecycle. Closing it also fixed a live gap: nothing outside `webhooks.ts` read `subscription_status`, so a lapsed organization kept uploading |
| 500 included credits buy 100 analyses, not 500 | **Open — needs Harsha's decision.** A consequence of the 2026-08-10 derived pricing. The lever is the model, and §8's substitution process governs any cutover |
| Per-plan quota values are unbacked by any authoritative doc | **Open — needs Harsha's decision.** `plan_limits` is seeded with 200 runs/day, 600 artifacts/run, 250 MB per run, 50 GB stored, taken from `BuildV5.md` §G2c — implementation detail, not authority. PATHWAYS settles the *dimensions* and FUTURENORMA §3 owns the plan contract; neither states these values. They are a table row, changeable with an UPDATE |
| API keys can be withdrawn but not rotated | **Open.** `/admin/keys` revokes with an actor and a reason; issuing a replacement is still a script |
| Retention sweep unbuilt | **Closed** (§3j). Run, repo and org deletion remove objects as well as rows; the 90-day sweep runs dry by default; deletion is claimed, batched and resumable, proven across 20 separate processes |
| Deleting an org deletes its books | **Open — needs a decision, not code.** `usage_events`, `credit_grants` and `subscription_periods` cascade from `orgs`, so an erasure rewrites the reconciliation history for every month that customer traded in. The receipt now keeps the aggregate totals (§3j); whether anonymised per-event records must also be retained for the accounting period is Harsha's call |
| No provider-dollar reservation before calls | **Closed** (§3d). Reserved before every call, settled idempotently, proven across 20 separate processes |
| ~~Worst-case cost exceeds credit revenue~~ | **Closed** (§3e). Credits are derived from the hard maximum with a 50% margin floor, enforced by the suite. **Consequence needs a decision:** the 500 included credits now buy 100 analyses, not 500; analysis on Haiku 4.5 would make it 250, gated on a calibration run |
| Budget alerts at 50/75/90% | **Closed** (§3f). All four thresholds deliver, once per period, proven across 20 separate processes. The breaker reset is audited |
| No backups, and no restore ever rehearsed | **Closed** (§3k). A real dump was restored and compared table by table, both failure paths were watched, and on 2026-08-15 the **production** Neon database was dumped, encrypted, restored and compared — 32 tables. **Open by choice:** the nightly schedule is deferred to the first paying organization, so production is covered by hand backups and today's snapshot goes stale as signups arrive |
| Alerts only ever reached a log line | **Closed** (§3k). The explain routes alert through a real webhook/email channel, the ops check awaits its sends, and an alert claimed but never delivered is itself an alert. Note the honest limit: `delivered_at` means handed to the channel, not received by a person |
| Nothing ran automatically — no CI | **Closed 2026-08-12.** `.github/workflows/ci.yml` runs types, both suites (PGlite **and** real Postgres), the web build, the dependency audit and a secret scan on every push. `npm run verify` is the identical local command. Before this, the suite was green because someone remembered to type it — Doctrine 3 applied to the suite itself |
| `npm test` never typechecked `web/` | **Closed 2026-08-12.** A type error in the web app used to pass a green `npm test`; `verify` and CI typecheck both packages |
| ~~3 high-severity dependency advisories~~ | **Closed 2026-08-21** (§3z). `next` 16.3.1 landed and `npm audit` reports **0** in production dependencies. `security/audit-allowlist.json` is empty. The `sharp` entry carried a rule as well as an acceptance — uploaded images never through `next/image` — and that rule moved to `test/reportPage.test.mjs` R8 with a counter-test before the entry was deleted |
| ~~The next 16 upgrade is untried~~ | **Done 2026-08-21** (§3z). `web/package.json` is on `^16.3.1`: verify green at **1058 checks**, **1086** against real Postgres, audit 0, every route keeping its rendering mode, and 11 of 11 scripts nonced with zero violations on a production build in a browser. The trial's one claim that did not survive contact: "Middleware → Proxy" is not cosmetic — the rename moves that layer to the Node runtime, so it was left for its own decision (below) |
| **`middleware.ts` is deprecated, and moving off it changes runtime** | **Open, named 2026-08-21** (§3z). Next 16 warns on every build; the replacement `proxy.ts` **always runs on Node**, verified by building both ways — `middleware.ts` produces edge chunks, `proxy.ts` produces `server/middleware.js` with `require()`. The matcher covers every document on the site, so the move puts every marketing page view through a Node function in one region. Nothing in the file needs Node. Same decision covers `runtime = "edge"` on `/api/pitch-unlock` and `/api/admin-unlock`, also deprecated. Not urgent — a warning, not an error — but it is a Next 17 deadline, and three comments claiming "this runs on the Edge runtime" change with it |
| The economic path is implemented twice | **Closed** (§3g). One module, `economicPath.ts`; no other file may move money. The extraction found two live defects — see below |
| Provider dollars held when credits run out | **Closed** (§3g, P9.9–P9.11). Was real and untested: an org refused for credits left its provider reservation held for the full TTL, quietly reducing the global ceiling for every other org |
| Lab shares the portfolio's DB and R2 | Accepted for a test deployment; prefixes make removal clean |
| Prepaid API balance is small (~$19) | Mitigated by the daily cap. Keep it on |
| Sonnet 5 intro pricing ends 2026-08-31 | **21 days.** Post-intro COGS is already the basis for the pack floor, so no repricing is forced — but verify |
| No paying customers exist | Every economic figure here is a projection from measured COGS, never from revenue |
| `migrations` failed one check once, against real Postgres, and has not repeated | **Open, unexplained.** On 2026-08-20 a full real-Postgres run reported `1 suite(s) failed: migrations — 1 failing check(s)`. The output was filtered before the `FAIL` line was captured, so **which check failed is not known.** Five subsequent runs — three of the full 27 suites and three of `migrations` alone — were green at 874 and 20. It happened immediately after a 27-suite PGlite run finished, so the machine was loaded, and M7/M7b spawn 20 processes against one barrier; a timing flake is the obvious guess and a guess is all it is. Nothing in the trends work touches migrations or spawns a process. **Recorded rather than dismissed**: a suite that fails once and passes six times is still a suite that failed, and the next person to see it should know it is the second sighting, not the first |

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
