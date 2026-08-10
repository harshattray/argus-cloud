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
