# Identity Decision V1 — Keep Normascope (Repositioning Only)

*Companion to BuildHorizons.md. This document records the final identity decision and what Stage 0 now consists of. It supersedes the earlier rebrand plan that lived in this file: after evaluating a full rename and a free/paid brand split, the decision is to **keep the Normascope name for everything** — the rename is cancelled; only the positioning changes.*

---

## The decision

- **Brand:** Normascope, unchanged, for free and paid alike. It is a **product of the parent company** (alongside Norma-Voice) — the Norma family is a deliberate umbrella, not a collision.
- **Tier naming:** free CLI = **Normascope**; paid hosted product = **Normascope Cloud** (final wording — reads better than "Teams" next to "Normascope"). Never a second brand for the paid tier: the funnel converts on the shared name, search follows developer vocabulary, one trademark covers both. Internal planning vocabulary (Horizons, H1/H2/H3, stage numbers) never appears in product naming.
- **Names, concretely:** npm package `norma-scope` (already matches the brand), bin `norma`, GitHub Action `normascope-action`, MCP package `normascope-mcp`, private cloud repo `github.com/harshattray/argus-cloud`, domain `normascope.dev` / `.com` (register at Stage 0).
- **Trademark:** Stage 4 files **"Normascope"** (word mark, software classes 9/42, India first, US/EU as budget allows).

## Why keeping the name is sound

The "Figma tool" association lives in the *positioning*, not the word — "Normascope" says nothing about Figma. What the earlier rebrand analysis got right survives intact: one brand across tiers, no internal codenames in product names, no client-visible split between free and paid identities. What it got wrong was assuming the identity itself had to change; with a parent company owning the family, Norma-branded products are a portfolio, not confusion. And the strongest practical argument: a rename spent a day plus naming risk to buy distance from an association we're deleting anyway by rewriting the README.

## Stage 0 is now: Reposition (half a day, at Stage 1 start)

1. **Rewrite the README** around the three-door positioning — this is the real work:
   - **Headline:** *Verify that what you shipped matches what you intended.*
   - **Sub:** the intent can be a design file, yesterday's approved build, or the mock your AI agent was handed. Normascope captures your running UI, compares honestly, explains the difference in CSS terms, and posts the result where your team works.
   - **Doors, in order:** visual regression ("catch unintended UI changes in every PR") → design fidelity ("ship what was designed"; Figma listed as one source alongside image folders and URLs) → agent verification ("give your coding agent eyes").
   - **Figma's place:** an integration logo among sources — never in the headline or tagline. The Bose case study is retitled as a *fidelity-mode* story.
2. Register the domain; park a one-page site until Stage 4.
3. Note the parent-company relationship in the footer/about line (portfolio credibility, and it keeps Norma-Voice's branding consistent).

Everything else the old plan listed as "carries over" still does — trivially, since nothing is renamed: codebase, `.bridge/` config, npm package, env vars (`NORMA_*` stays, no aliases needed), Build docs, doctrines.

## Definition of Done

1. README/positioning leads with the three doors; Figma appears only as a source integration.
2. Tier naming appears consistently: Normascope (free) / Normascope Cloud (paid) — in README, pricing copy drafts, and Build docs.
3. Domain registered and parked.
4. BuildHorizons and BuildV3.5 reference "Normascope"/"Normascope Cloud" concretely (no more `<name>` placeholders); the Stage 4 trademark task says "Normascope".
