# Working agreements for this repo

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

**One paid tier: Normascope Cloud, $59/mo per org.** No ladder above, no lite
tier below, no trial; credit packs are consumables that require a live
subscription to buy or to spend.

Before building anything, in this repo or in Argus, ask:

> **Does this require state we store, a key we hold, or a person who isn't the
> developer?**

- **No** → it cannot be charged for, however good it is; the only gate would be
  a client-side lock, which Doctrine 5 forbids. Build it deliberately as
  marketing spend with an adoption goal stated, or don't build it.
- **Yes** → it belongs here.

Forward-looking only — nothing already free in the CLI gets clawed back.
Applied to the roadmap in `docs/FUTURENORMA.md` §5 → "The capture test applied
to this path", which also re-ranks Step 10+.
