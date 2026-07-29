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
