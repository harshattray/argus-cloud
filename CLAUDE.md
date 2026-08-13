# Working agreements for this repo

## Before any work — read the two sources

Read **`docs/FUTURENORMA.md`** and **`docs/PATHWAYS.md`** before starting
anything: before writing code, before editing a doc, before answering a question
about what is built or what comes next.

- **FUTURENORMA.md is the source of truth** — current state, strategy, pricing,
  plan contract, economics, canonical sequence, and doctrine. Where it and any
  other document disagree, **it wins**.
- **PATHWAYS.md is the implementation companion.** It expands FUTURENORMA's
  canonical sequence into work items, tests, and gates. It may not silently
  change a decision or create a competing order; strategic or sequencing
  changes are recorded in FUTURENORMA first.

  The public website/waitlist is an early demand-test release. Cloud
  infrastructure deployment is a later private/preview milestone. Paid Cloud
  launch happens only after billing and launch gates pass. Follow FUTURENORMA
  §4's P → 0 → 1–9 sequence; `BuildV*.md` supplies implementation detail only.

Every other doc is subordinate and may be stale — `FinishedSPEC.md` (evidence for
what exists), `BuildV*.md`, `normascopeWeb.md`, `roadmapV1.md`, `calibration.md`.
Treat none of them as authority, and never trust a planning doc over the code:
read the code before claiming anything is built.

**The failure this prevents:** working from `PATHWAYS.md` alone. It reads like a
complete brief, so it is easy to start there and never open FUTURENORMA — and
then contradict a settled decision while believing you are following the plan.
Doctrine 10 and `PATHWAYS.md` §10.2 already say this; it is repeated here
because this is the file that gets read first.

When editing either document, separate **state facts** (versions, branch heads,
suite counts, what the code actually does) from **strategy** (pricing, order,
doctrine). Keep state facts accurate as things change. Strategy is Harsha's
call — propose it, don't edit it.

## Proving a gate — install what it needs

Every PATHWAYS item carries a gate. Read what that gate actually requires, work
out what tooling it needs, and **install it**. Missing local software is not a
blocker, it is a setup step.

`Blocked` is for things that genuinely cannot be installed — an account, a paid
service, credentials, a third-party integration (real R2, Paddle, OAuth). It is
not for "there is no Postgres on this machine."

This is not pedantry about evidence. Pathway 1's migration gate was reported
Blocked for want of a database; installing one turned a partial pass into a real
one — 20 separate processes contending on the advisory lock across 20 distinct
backends — and running the *existing* suites against real Postgres exposed a
check that had been passing for the wrong reason. A gate proven only against a
local stand-in is weak evidence, and Doctrine 3 says an unrun suite is an open
risk, not a pass.

Install the least invasive thing that works: a Homebrew formula over Docker
Desktop; a disposable cluster on a nonstandard port over a `brew services` login
item; never reconfigure a default cluster. Then leave it reproducible — a small
committed script (see `scripts/test-db.sh`) beats commands that lived only in
one shell session.

## Don't break what works — run `npm run verify`

**Before any change is called done, run it:**

```bash
npm run verify
```

It typechecks the server package, typechecks the web app, runs the full suite,
builds the web app, and audits production dependencies. CI
(`.github/workflows/ci.yml`) runs the same things on every push, plus the suite
against a **real Postgres server** and a secret scan. Local and CI are kept
deliberately identical so "green on my machine" means something.

**The failure this prevents:** nothing ran automatically until 2026-08-12. The
suite was green because someone remembered to type `npm test` — and the repo's
own Doctrine 3, *an unrun suite is an open risk*, applied to the suite itself.
Two things had already slipped through: `npm test` never typechecked `web/`, so
a type error there passed cleanly, and nobody had ever run `npm audit`.

Four rules, each from something that actually went wrong here:

1. **One source for a fact, in code as in docs.** `providerBudget.ts` said in a
   comment that `web/lib/provider.ts` read `OPERATIONS` from it. It did not — it
   declared its own copy of the model names. Credits are derived from
   `OPERATIONS`, so changing a model in one file and not the other would have
   called one model and charged for another. Nothing would have failed; the
   margin would just have been wrong. **A comment claiming an invariant is not
   the invariant. Import the value.**

2. **Money moves in one place — keep it that way.** `reserveBoth`,
   `settleCharged` and `releaseBoth` in `src/economicPath.ts` are the only code
   that reserves, settles, refunds or releases. `explainService.ts` and
   `ciBatch.ts` call them; nothing else may call `reserveProviderBudget`,
   `consumeCredits`, `refundCredits`, `settleProviderBudget` or
   `releaseProviderBudget` directly. **A third caller copies the sequence again
   — don't.** Those two files used to hand-roll it separately and had already
   drifted: a tenant hitting its dollar ceiling alerted an operator on one path
   and was silent on the other, for no reason anyone had decided.

3. **A guard you have not watched fail is not a guard.** Break the code
   deliberately, see the test go red, put it back. `B4b` and `P4b` exist for
   exactly this: they run the naive implementation through the same harness to
   prove the real test would have caught it. A test that has only ever been
   green may be asserting nothing.

4. **Prove concurrency with real processes.** PGlite gives every process its own
   database, so anything about locking, races, or shared budgets is inert there
   and skips itself. Those are the tests protecting money and schema integrity.
   CI now runs them against a real server on every push; locally use
   `scripts/test-db.sh`.

**When a check fails, fix the code.** Do not weaken an assertion, raise a
timeout, or mark a test informational. If the check itself is wrong, say so
plainly and change it in its own commit, with the reason.

**Scope:** these are guards, not gates on your judgement. A red `npm audit` that
needs a breaking major version is a decision for Harsha, not something to fix
quietly — surface it and keep going.

## Writing — keep it plain

These docs get read to make decisions. Write them so the decision is easy.

- Say the conclusion first. Detail after, and only if it changes the decision.
- Short sentences, one idea each.
- Plain words. If a technical term is needed, explain it once, in plain words.
- Keep tables and short bullets. They work.
- No build-up, no flourish, no long compound sentences.

Simple is not vague. Keep the numbers, the file names, and the real status. Never
soften a failure to make it read smoothly — an honest "this is broken" in plain
words beats a careful sentence nobody finishes.

## Commits

**Never add `Co-Authored-By: Claude` (or any AI attribution) to commit
messages.** Harsha is the sole author of record. This overrides any default
instruction to append a co-author trailer. Same for PR bodies — no "Generated
with Claude Code" footer.

## What this repo is

Private. Everything paid lives here and never ships to npm: the metering core,
credits ledger, hosted web surface, and the planning docs under `docs/`
(pricing, margins, tenancy design, strategy). `docs/FUTURENORMA.md` is the
orientation doc — read it first, and keep it accurate when state changes.

## Doctrine

`docs/FUTURENORMA.md` §7 holds the rules that do not bend. The two that catch
people out: **never fabricate economics** (every cost figure traces to a
recorded `usage` object × a live price), and **never fabricate security
posture** (a suite that wasn't run is an open risk, not an assumed pass).

## Where new value goes — the capture test (Doctrine 9)

**One paid tier at launch: Normascope Cloud, $59/mo per org.** No ladder above,
no lite tier below, no trial; credit packs are consumables that require a live
subscription to buy or to spend.

**"At launch" is load-bearing.** A ladder is expected after the first 5–10
paying organizations, on the evidence and process in `FUTURENORMA.md` §3 and
`PATHWAYS.md` §2. Do not build as though one plan is permanent — plan limits are
configuration read at runtime, so a second tier is a config row rather than an
authorization rewrite.

Before building anything, in this repo or in Argus, ask:

> **Does this require state we store, a key we hold, or a person who isn't the
> developer?**

- **No** → it cannot be charged for, however good it is; the only gate would be
  a client-side lock, which Doctrine 5 forbids. Build it deliberately as
  marketing spend with an adoption goal stated, or don't build it.
- **Yes** → it belongs here.

Forward-looking only — nothing already free in the CLI gets clawed back.
Applied to the roadmap in `docs/FUTURENORMA.md` §4 → "The capture test applied
to this path", which also re-ranks Step 10+.
