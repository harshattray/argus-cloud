# normascopeWeb.md — the Normascope website

**Status: requirements, agreed before any code.** This document is the contract
for what we build. It describes one website at **normascope.com** that carries
two surfaces: a public marketing site for the free CLI, and the gated
Normascope Cloud surface that today lives as a temporary preview in the
portfolio repo.

Companion docs: `normascope101.md` (feature truth), `FinishedSPEC.md` (what is
actually built), `pitch.md` (positioning), `FUTURENORMA.md` (source of truth: §5 what comes
next, §10 what we sell).

Written 2026-08-04. Nothing here is marked done — it is all yet to be built.

---

## 1. The decision, in one paragraph

Normascope gets its own website. It replaces the two things currently standing
in for it: the `/@norma` product page in the portfolio (public, good, but a
single page inside a personal site) and `/normascope-cloud` in the portfolio
(gated, functional, deliberately temporary — `FinishedSPEC.md` §5 has it
scheduled for deletion at Phase J4). Both move into `argus-cloud`, become one
Next.js application, and eventually answer on **normascope.com**. The public
half is a full product site — deeper, more interactive, and grounded in real
runs rather than mockups. The private half stays access-code gated exactly as
it is today, because the real auth (GitHub OAuth, magic links) does not exist
yet and pretending otherwise would violate the repo's own doctrine.

---

## 2. Why one app and not two

The obvious alternative was a standalone marketing app beside `web/`. We are
not doing that, because users will log in and cross from marketing into Cloud
within the same domain, and a split would mean two deploys, two layouts, and a
cross-app redirect on the single most important click on the site.

One Next.js app, split by **route group**, gives each half its own layout and
rendering strategy while staying one deploy:

```
web/app/
  (marketing)/            public, light "paper" aesthetic, static/ISR
    layout.tsx
    page.tsx              home
    engine/page.tsx       how the diff engine works
    modes/page.tsx        the three modes
    commands/page.tsx     the command reference
    agents/page.tsx       MCP / AI agents
    cloud/page.tsx        Cloud tease + waitlist
  normascope-cloud/       GATED — the argus-cloud product surface
    layout.tsx
    page.tsx              gate → runs index
    run/[runId]/page.tsx
  r/[runId]/              existing share-link report page (unchanged)
  api/
    waitlist/route.ts     new
    norma/…               gated preview endpoints (ported from portfolio)
    upload|explain|ci-explain|share/route.ts   existing
```

### 2.1 The blocker this creates, and the fix

`web/package.json` declares `"argus-cloud": "file:.."`. A Vercel project rooted
at `web/` cannot see its own parent, so it cannot build — this is
`FinishedSPEC.md` §7 #11 / BuildV5 F1, already a known launch blocker. The
moment `web/` is the real website, this must be fixed first.

**Fix:** make the repo an npm workspace — root `package.json` gets
`"workspaces": ["web"]`, Vercel roots at the repo **root** with build command
`npm run build -w web`. `serverExternalPackages` in `next.config.mjs` already
lists `argus-cloud`, so the runtime side is already correct.

This is step zero. Nothing else ships until `web/` builds from a clean clone.

---

## 3. The two surfaces, and the line between them

| | Public marketing | Normascope Cloud |
|---|---|---|
| Routes | `/`, `/engine`, `/modes`, `/commands`, `/agents`, `/cloud` | `/normascope-cloud/*` |
| Who sees it | Everyone, indexed | Harsha, via access code |
| Aesthetic | Light `paper`, clay + pink | **Undecided — designed from scratch, later** (§4.1) |
| Subject | The **free CLI** — finished, published, provable | The **hosted tier** — real engine, unfinished surface |
| Rendering | Static / ISR | Dynamic, `noindex` |
| Purpose | Explain, convince, capture interest | Harsha's own testing |

**The line:** the public site sells and explains the free product, and *teases*
Cloud without demonstrating it. The gated surface is where Cloud is actually
exercised. No public page ever links to `/normascope-cloud`.

---

## 4. The gate — unchanged in substance, redesigned in appearance

The portfolio's mechanism works and is being ported as-is, because it is honest
about what it is: one shared credential for one person's testing.

**Ported from `api/_lib/norma.ts`:**
- `NORMASCOPE_CLOUD_PASSWORD` compared with `timingSafeEqual`, never `===`.
- Success mints a 30-day JWT with role `normascope-cloud`, signed HS256 from
  `JWT_SECRET`. Separate from any admin role so it rotates independently.
- Every gated endpoint calls a `requireCloud()` equivalent before doing work.
- Client holds the token; 401 clears it and returns to the gate.

**Dropped in the port:** the `norma-lab` / `NORMA_LAB_PASSWORD` fallbacks. They
exist in the portfolio only to avoid invalidating sessions across the rename —
a fresh deployment has no legacy sessions to protect.

**Added:**
- `noindex, nofollow` on every gated route, plus `robots.txt` disallow.
- A per-IP throttle on the login endpoint. There is **no rate limiting anywhere
  in this codebase today** (`FinishedSPEC.md` §7 #6) and a public
  password-checking endpoint is the wrong place to continue that streak.

**Explicitly not built:** GitHub OAuth, magic links, orgs, invites, seats. Those
are real Cloud auth and belong to BuildV5, not to this website. The gate is a
door for one person, and the doc must never call it more than that.

### 4.1 The visual brief for the gated surface — deferred, deliberately

**This is not part of the current build.** It is recorded here so the intent is
not lost, and so nobody assumes the existing look carries over.

The current `/normascope-cloud` page is a functional dark shell — a header, an
upload form, a list of rows. It works, and it is being **discarded visually**.
The replacement is designed from scratch as a product interface in its own
right, to the standard the engine behind it deserves. Specifically:

- **Not a dark reskin of the marketing site.** The public site is a brochure;
  this is a tool someone uses repeatedly. Different job, different design.
  The palette is an open question and will be decided during that pass — it is
  not inherited from the current page and not assumed to be dark.
- **Not a port of the current layout.** Upload-form-then-list is the shape of a
  prototype, not of a product.

What it has to do well, whatever it ends up looking like: make a run's verdict
readable at a glance, lead with the visual evidence rather than a table of
numbers, make history legible over time, and render findings as hypotheses with
their confidence badge and "verify before applying" label intact.

Design work starts when the public site is done. Until then this section is a
placeholder, not a specification.

---

## 5. Design system

Ported from `frontend/src/pages/Norma.tsx` in the portfolio, which is the
agreed aesthetic. Tailwind v4, tokens declared in `@theme`.

| Token | Value | Use |
|---|---|---|
| `paper` | `#eee7e4` | Public page background |
| `text` | `#111` | Body text |
| `clay` | `#A8736E` | Primary brand — wordmark, accents, rules |
| `sand` | `#ece6e0` | Alternating light band |
| `ink` | `#0f0f0f` | Dark band background |
| accent | pink-500 / pink-400 | Section labels, the `Spark` glyph |

These tokens are the **public site's**. The gated surface does not inherit them
— see §4.1.

**Semantic colours are fixed and must stay consistent everywhere**, including
inside mockups, because they encode meaning: emerald = reference / clean /
passing, rose = build / failing, amber = flagged / above threshold, sky = MCP
and agents, violet = CLI.

**Carried-over patterns:** the `Spark` four-point star as the section-label
glyph; `text-[10px] font-black tracking-[0.25em] uppercase` labels; alternating
paper → ink → sand bands down the page; `font-black` display headings with tight
leading; the `norma` / `s c o p e` stacked wordmark; sticky section nav with a
scroll-progress bar; hand-built SVG/CSS mockups.

**The marks are SVG** (2026-08-06). `web/app/(site)/_components/marks.tsx` holds
the three drawings — `WordmarkSVG`, `CloudLockupSVG`, `IconSVG` — and
`/public/normascope-{wordmark,cloud,icon}.svg` are the same geometry as files,
for the favicon, social cards and anything off-site. `-light` variants exist for
the ink band. They were CSS lockups until now, which meant the logo could not be
exported and every size needed its own row in a scale table; a size is now just
a width.

Every word carries `textLength` + `lengthAdjust="spacing"`. The wordmark is set
in the system grotesque, which is a **different typeface per platform** — SF on
macOS, Arial on Windows — so without pinning, the mark would be a different
width on every machine. The glyphs are whatever the platform has; the box each
word occupies is fixed. Numbers were measured off the live CSS lockup.

**The Cloud lockup never redraws the wordmark.** `cloud` joins `norma` on the
top line in the same size at a lighter weight, and the tracked `scope` runs
beneath — no separator, no third line, no second shape. An earlier lockup set
`normascope` on one line in a different weight, which read as a neighbouring
product rather than the same one with more behind it; a later one badged the
mark with a plate, which could not shrink to nav size. This one stays two lines
tall, so one drawing serves the nav, a masthead and a social card.

**Watch the viewBox when editing.** `norma` and `scope` are all x-height
letters, but `cloud` has an `l` and a `d`. The lockup's viewBox therefore starts
at `-11`, not `0` — the first cut sheared the ascenders off and rendered as
"cıoua" in every placement on the site.

**Type:** Poppins for UI (as the portfolio does), a mono for all terminal and
code surfaces.

**Motion:** every animation respects `prefers-reduced-motion`. The existing page
does this correctly and the pattern carries over.

**Responsive:** every interactive piece must work on a phone. The threshold
slider, the alignment toggle and the config builder are all designed
touch-first; horizontally-scrolling strips get the same fade cue the portfolio
nav uses.

**Accessibility:** interactive demos are keyboard-operable, carry real ARIA
state, and never encode meaning in colour alone — the ✓ / ⚠ glyphs and text
labels ride along with every score.

---

## 6. Content sources and the honesty rule

Content derives from `normascope101.md` (behaviour), `FinishedSPEC.md` (what is
real), and `pitch.md` (framing). Where they disagree, **FinishedSPEC wins** —
it was written by reading code.

Three rules, taken from the repo's own doctrine:

1. **Never describe an unbuilt feature in the present tense.** The Cloud surface
   is largely unbuilt; the page says "in private preview", never "you can".
2. **Never fabricate a number.** Every figure on the site traces to a recorded
   run or a published package. No invented benchmarks, no invented customers,
   no invented logos.
3. **Findings are hypotheses.** Any explain output shown on the site carries its
   confidence badge and its "verify before applying" label, exactly as the
   product renders it.

4. **AI output is guidance only.** Every user-facing explanation must make
   clear that it may be inaccurate, incomplete, or unsuitable for the user's
   context. Users may use it, edit it, ignore it, or discard it entirely; the
   decision whether to act is theirs alone. Normascope/Yutic does not make the
   decision for them or guarantee the result of acting on an explanation.

This disclaimer must appear beside AI findings and in the Terms/AI disclosure,
with final legal wording reviewed before paid launch. The deterministic visual
comparison is separate: it remains the source of truth for the score and the
build gate, and AI cannot change either one.

Also carried over from the CLI's own guarantees, because they are the strongest
part of the pitch: it never blocks, the score is maths and not AI, it works
offline, and the AI layer can never change a score or fail a build.

---

## 7. The real assets — proof, not mockups

The single biggest upgrade over the portfolio page. `norma-bridge-usecase/`
holds a **real run** of Normascope against the portfolio, 2026-07-31:

| Frame | Aligned | Unaligned | SSIM | Drifted | Regions | Flagged |
|---|---|---|---|---|---|---|
| Norma — Product Page | **0.26%** | **5.63%** | 98.7 | 2 | 3 | ⚠ yes |
| Lab — Index | 0.03% | 0.37% | 97.6 | 2 | 0 | ✓ |
| Articles — Index | 0.00% | 0.00% | 100 | 0 | 0 | ✓ |

Threshold 0.1%, baseline mode, images source, 1440×1000. Available as
`baseline/`, `screenshots/`, `diff/` PNGs, `summary.json`, and a 1.4MB
self-contained `report.html`.

**That first row is the whole trust argument in one line:** 5.63% naive versus
0.26% honest, on the very page a visitor may have just come from. Nothing else
on the site has to work as hard.

Also available, from `frontend/public/norma/screens/` in the portfolio — 16 real
captures, verbatim CLI stdout and real report renders in light and dark:
`cli-doctor`, `cli-auto`, `cli-baseline`, `cli-compare`,
`report-{overview,summary,flagged,clean}-{light,dark}`,
`report-explain-findings`, `report-fullpage-frames`, `report-lightbox`.

All of it moves to `web/public/`. PNGs get converted to WebP with PNG
fallbacks, and everything below the fold lazy-loads — the report overview
captures alone are ~900KB each and cannot ship as-is.

**Rule: where a real asset exists, it is used. Mockups are only for things that
cannot be photographed** — the agent loop, the PR comment, the abstract diff
explainer.

---

## 8. Interactive components

The brief is an interactive site, so these are the substance of it, not
decoration. Each teaches one idea that is genuinely hard to convey in prose.

### 8.1 The alignment explainer — the centrepiece
**Teaches:** why the aligned number is the honest one.
Real `baseline` / `screenshots` / `diff` images for *Norma — Product Page*, with
one toggle: **naive** shows 5.63% and paints the shifted band red; **aligned**
slides the band into place and drops it to 0.26%. Real numbers, real images,
animated transition between the two states. A one-line caption states what
happened: two sections moved, nothing actually broke.

### 8.2 Threshold slider
**Teaches:** what `threshold` means and why it is yours to choose.
Drag 0 → 5%. The three real frames flip between ✓ and ⚠ live, the flagged
counter updates, and the config snippet beneath shows `"threshold": n` changing
with it. At 0.1% one frame is flagged; at 1% none are. That is the concept,
learned in about three seconds.

### 8.3 Config builder
**Teaches:** what setup actually costs — and is genuinely useful.
Three questions: where is your reference (Figma / images / another URL), do you
have a designer (fidelity vs baseline), does your app run locally (auto-capture
vs manual). It emits a real, valid `.bridge/config.json` plus the exact command
sequence to run, both copyable. Output must be a config that actually works.

### 8.4 Command explorer
**Teaches:** the surface area of the CLI.
The portfolio's grouped-chip explorer, carried over with all 11 commands and
their flags — but backed by the four **real** CLI captures where they exist,
instead of retyped terminal text.

### 8.5 Region hotspots
**Teaches:** "3 significant regions" beats "4.2% of pixels differ".
The real diff overlay with its clustered regions marked; hover or tap one to see
its coordinates and what clustering did. Uses the actual 3 regions from the run.

### 8.6 The agent loop
**Teaches:** why an agent needs eyes.
Build → capture → score → read → fix → repeat, animated, with the score falling
across iterations. Carried over from the portfolio page, which already does this
well. Paired with the five MCP tools and the SSRF refusal story — five hostile
URLs, five refusals, every attempt logged.

### 8.7 The pipeline walk
**Teaches:** what actually happens on `explain`, and where the guardrails are.
The seven steps from `normascope101.md` §9 — context capture, triage, assembly,
**secret scan**, analysis, validation, render — as a stepper. The secret scanner
step is the one to dwell on: it *blocks and names the file*, it does not
silently redact.

### 8.8 The real report
**Teaches:** that the deliverable is real.
The 1.4MB `report.html` served as a static asset and opened in a new tab. Not
iframed into a marketing page — linked, honestly, as the artifact it is.

---

## 9. Page-by-page

### `/` — home
Hero with the stacked `norma` / `scope` wordmark, the one-liner, the copyable
`npx norma-scope init`, live npm version badge. Then: the three modes at a
glance → the alignment explainer (§8.1) → the terminal demo → the threshold
slider (§8.2) → the PR comment mockup → the agent loop (§8.6) → the Cloud tease
strip with waitlist → what it deliberately will not do → footer.

The fold must show the breadth of the tool, not one line about it.

### `/engine` — how the diff works
The trust page. AA-aware pixelmatch, band alignment with its ±120px search and
≥0.85 confidence threshold, SSIM as second opinion, region clustering. Carries
the alignment explainer in its deepest form, plus the region hotspots. This is
where a sceptical staff engineer is either won or lost.

### `/modes` — fidelity, baseline, agents
The three doors, each with its own real example, its config snippet, and the
question it answers. Includes the four reference sources and the degradation
ladder (fresh → version-keyed cache → org cache → stale → committed snapshot →
skip), which is a genuine differentiator: a Figma outage cannot break CI.

### `/commands` — the reference
All 11 commands, the flags table, the "which command do I want?" decision list
from `normascope101.md` §6, and the config builder (§8.3).

**Amended 2026-08-06.** When the lean public site was split out, `/commands` and
`/report` were rewritten as short prose summaries and the versions matching this
section stayed behind the `/pitch` gate. That was backwards — the long versions
are the better pages, and nothing in either is investor-only. The public
`/commands` and `/report` now carry them: the config builder, the command
explorer, the reads/writes table, both annotated screenshots, the four report
shapes, the published-wrong explain finding and the measured limits.

They **import** the interactive components from the pitch tree rather than
copying them, and `lib/commands.ts` / `lib/glossary.ts` stay the single source
both surfaces read. Two transcriptions of the same CLI would drift, and drift
between the site and the product is exactly what §6 forbids. The one thing that
had to change is links: a public page may not link into the gated tree, so
`ReportVariants` takes an `evidenceHref` the public page passes as `null`.

**Licence and "open source" wording is off the public site** (2026-08-06). The
repo link stays; the Apache-2.0 line, the "open source" footer column and the
"fork it, keep running it whatever happens to us" sentence are gone. A visitor
deciding whether to try a tool is not reading a licence, and a line inviting
them to plan for our disappearance sells against us.

### `/agents` — MCP
The five tools, the agent loop, the safety model — default-deny origins, path
containment, page content as data and never as instructions.

### `/cloud` — the tease
See §10.

**Rebuilt 2026-08-06.** The first cut was six blocks of prose with no visual
argument and nothing to do but read, which is not a page anyone signs up from.
It now carries: the frame card as the hosted page will present it, with the
history strip; the trend chart; a drawn PR comment; the budget meter; a
free-vs-Cloud table with honest ticks; a built-vs-being-built split; and the
price. **Every visual is a drawing and says so in its own caption** — §10 forbids
screenshots of an unbuilt surface, but the shape of what is coming is exactly
what a waitlist page has to show.

The "private preview" chip is gone from the hero. It told a visitor to come back
later and gave them nothing to do; the honest status now lives in a whole
section ("The engine is finished. The surface is next.") that says more and
hides less. The waitlist form is the hero's primary action.

### Gated: `/normascope-cloud`, `/normascope-cloud/run/[runId]`
Per §4.1.

---

## 10. The Cloud tease — what may and may not be said

Cloud is in private preview. Its engine is finished and good — 63 green checks
over credits, metering, caching, budgets, breakers, history enrichment. Its
**surface** barely exists. The page must be enticing without lying.

**May be said** (all true, all built at the engine level):
- Hosted reports as shareable, revocable, expiring links.
- Per-frame history and trends, with a "first exceeded threshold" marker.
- History-aware findings — `firstDriftCommit` and `recurrence`.
- CI auto-explain in batch, at half the rate.
- Prepaid credits. Balance is the cap; cache hits are free; failed analyses cost
  nothing; a daily breaker pauses explain and never the product.
- Agent keys with per-key budgets, so an agent cannot run up a bill and
  exhaustion never reddens CI.
- Strict org isolation — org id inside the cache key hash *and* on the row.

**The argument to lead with:** history is the moat. A BYO-key user can call the
same model with the same prompt, but cannot know this region drifted in three
earlier commits, because that history lives in a database. That gap widens with
every uploaded run, and no client-side lock could ever do that job.

**The price stays off the public site. Reverted 2026-08-06 (Harsha's call), and
this is the standing rule.** An earlier amendment the same day opened the door to
publishing the figure on the grounds that it was settled and withholding it
wasted a qualified visitor's time. Overruled: signup is not open, so the number
is one a visitor cannot act on, and putting it up invites them to shop the price
instead of the product before they have seen what it buys. **The internal price
is unchanged** — one tier, per organization, no ladder, no lite tier, no trial —
and `FUTURENORMA.md` §3 remains where it is recorded. It goes public when signup
does.

The shape of the pricing may still be described, with no figure attached:

- One tier, one bill, described as covering the whole organization.
- Not per seat, not per screenshot, not per repository — with the reason for each.
- AI analysis on prepaid credit packs, with no overage code path.
- That there is no trial, and why.

**Plan names are still forbidden**, because there is only one plan and naming it
invents a ladder. Launch dates are still forbidden.

**Must not be said:** plan names; launch dates; anything implying you can sign
up, log in, or upload today; screenshots of an unbuilt dashboard; tenancy
internals; any economics figure beyond the list price — margins, COGS, credit
unit costs and the measured numbers in `FinishedSPEC.md` §6 stay internal.

**Every Cloud capability claim is written in the future or preview tense.**

**Roadmap features may be sold, in future tense, tagged. Amended 2026-08-06
(Harsha's call).** The page previously carried only what was built or nearly
built, and the result was a Cloud page a visitor could read as thinner than the
free CLI — which is the wrong conclusion and loses the signup. Things we have
specified and intend to build are a reason to join a waitlist, so the page names
them: designer sign-in without a code host, hosted design-token compliance,
Bedrock/Vertex, email rendering QA (`FUTURENORMA.md` §4 Step 6 and Step 10+).

The line that does **not** move: each one is tagged with where it sits — *being
built* or *on the roadmap* — and none is written in the present tense. Doctrine 3
forbids claiming an unbuilt thing exists; it does not forbid saying what we are
going to build. Anything that cannot be tagged honestly stays off the page.

**No licence, no "open source", no repository link anywhere on the public site.**
The npm package is how you install it and stays; everything that framed the
product as a codebase to go and read is gone.

### Brand, operator, and payment identity

The customer-facing hierarchy is:

- **Yutic** — umbrella brand and business identity;
- **Normascope** — the product;
- **Normascope Cloud** — the hosted product tier.

The public site should make the relationship clear without making Yutic compete
with the product brand. Use **“A product by Yutic”** in the footer and other
appropriate brand surfaces. Legal-facing copy must state:

> Normascope is operated by Yutic, a sole proprietorship of Harsha Attray.

Before paid Cloud signup, factor in the legal seller and payment flow:

- Paddle onboarding uses the actual proprietor/legal information;
- the product name remains recognizable as Normascope at checkout and, where
  Paddle permits, on the statement descriptor;
- Terms, Privacy Policy, invoices, refund policy, and customer support details
  identify the operating entity consistently;
- the final wording is reviewed with the accountant/lawyer and confirmed with
  Paddle before production billing.

This separates brand, product, and legal/payment identity cleanly and leaves a
path for Yutic to become a company later without renaming Normascope.

---

## 11. Waitlist

The only conversion mechanism on the site, so it must work and it must be
prevalent without being obnoxious.

**Placement:** a persistent header button on every public page; an inline form
in the home Cloud strip; the primary action on `/cloud`; a footer form. All four
post to one endpoint and share one component.

**Storage:** Postgres, `migrations/006_waitlist.sql`. New migrations are picked
up automatically — `migrate()` reads `migrations/*.sql` in filename order and
tracks them in `schema_migrations`.

```sql
CREATE TABLE waitlist (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  source      TEXT,             -- which surface it came from
  referrer    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`POST /api/waitlist` requirements:**
- Validate shape and length; normalise case; reject obvious disposables.
- Dedupe on the unique constraint — a repeat signup returns success, never an
  error, and never reveals whether the address was already present.
- Honeypot field plus a minimum time-to-submit.
- Per-IP throttle. Same reasoning as §4: this is a public write endpoint in a
  codebase with no rate limiting.
- No email address in any URL, query string, or log line.
- Return the same response shape on success and on duplicate.

**Notification — added 2026-08-06.** A signup that inserts a *new* row also
sends one plain-text message to `WAITLIST_NOTIFY_TO` (default
`waitlist@normascope.com`) via Resend over HTTPS, no SDK. Three properties make
this safe to leave on:

- It fires on `RETURNING id` coming back non-empty, so a repeat signup mails
  nothing and the endpoint cannot be used to flood the inbox.
- It is best-effort and its failure is swallowed. The row is already committed,
  so a provider outage must never read to a visitor as "try again".
- With `RESEND_API_KEY` unset — local dev, previews — it is a no-op, which is
  why it can never decide whether the caller sees success.

**Still deliberately not built:** double opt-in, any mail *to the signup*, any
ESP list or audience integration. Addresses are collected and stored. Exporting
them is a `SELECT`.

---

## 12. SEO and metadata

Domain **normascope.com**, canonical base in `NEXT_PUBLIC_SITE_URL` so it can
change without a code edit. Per-page title and description via Next's Metadata
API. Open Graph and Twitter cards with generated images — the portfolio's
`api/og/norma.tsx` is the reference. `SoftwareApplication` JSON-LD carrying the
npm package as `downloadUrl` and price 0, as the portfolio page already does.
`sitemap.ts` and `robots.ts` covering the public routes only; everything under
`/normascope-cloud` and `/r/` is `noindex` and disallowed.

---

## 13. What happens to the portfolio

Nothing, yet. The portfolio's `/@norma` and `/normascope-cloud` keep working
until this site is live on its own domain. Then:

1. `/@norma` becomes a short case-study card linking out to normascope.com —
   the project still belongs in the portfolio, the 1,600-line product page does
   not.
2. `/normascope-cloud` and its four API endpoints are deleted, per
   `FinishedSPEC.md` §5. That frees Vercel functions on a Hobby project sitting
   at 11 of 12, and ends the arrangement where Cloud shares the portfolio's
   Turso DB and R2 bucket. All rows are prefixed `norma_` and all objects
   `normascope-cloud-*`, so removal is clean.

Not part of this build. Listed so the end state is unambiguous.

---

## 14. Build sequence

| Phase | What | Done when |
|---|---|---|
| **0** | npm workspace fix; Vercel roots at repo root | `web/` builds from a clean clone |
| **1** | Tailwind v4, tokens, marketing layout, shared primitives, assets moved and optimised | A styled empty shell renders |
| **2** | Home page, full-length | Renders top to bottom, responsive, reduced-motion clean |
| **3** | Alignment explainer, threshold slider, region hotspots | The three real-data pieces work on desktop and phone |
| **4** | `/engine`, `/modes`, `/commands`, `/agents` + config builder | All public routes complete |
| **5** | Waitlist — migration, API, component, all four placements | An address round-trips and dedupes |
| **6** | `/cloud` tease | Reviewed against §10 line by line |
| **7** | SEO, OG images, sitemap, robots, Lighthouse, axe pass | Ready to point a domain at |

**Phases 0–7 are the current build, and they are the public site.** It ships on
its own.

The gated surface is a **separate effort that starts afterwards**, beginning
with a design pass (§4.1) rather than with code. It carries the access-code
port from §4 and whatever answer §15 #1 gets, and it is out of scope until the
public site is done.

---

## 15. Open decisions

These need answers, and phase 7 is blocked on the first one.

1. **Where does uploaded `report.html` live?** The portfolio preview puts it in
   R2. In `argus-cloud`, artifact storage is ❌ unbuilt (`FinishedSPEC.md` §4)
   and `/api/upload` accepts summary JSON only. Either wire R2 properly, or —
   recommended for a single-tenant preview — store the HTML in a Postgres text
   column with a hard size cap, and leave R2 to BuildV5 when it is needed for
   real tenants and image artifacts.
2. **Does the site's Postgres share the product database?** Recommended yes, one
   database, `waitlist` alongside everything else — it is one product.
3. **Does `/` need a docs section, or is `normascope101.md` published as-is?**
   The 101 is genuinely good and largely site-ready. Recommend publishing it as
   a rendered `/docs` page in phase 4 rather than rewriting it.
4. **Analytics.** The public marketing site should use no invasive third-party
   tracker. Waitlist conversion can be measured from the first-party waitlist
   table using source and referrer origin. Any future marketing analytics must
   be privacy-preserving and must not undermine the claim that screenshots stay
   on the user's machine. Product usage telemetry belongs in the opt-in free
   CLI and authenticated Cloud event ledger described in `PATHWAYS.md`, not in
   a silent browser tracker.

---

## 16. Non-goals

Stated so they do not creep in:

- Real Cloud auth — OAuth, magic links, orgs, seats, invites.
- Billing, checkout, pricing pages, Paddle integration.
- A trends or dashboard UI beyond what the gated preview needs.
- The `upload` CLI command (BuildV5 G1) — this is a website, not a CLI change.
- A blog or changelog.
- Any fix to the known bugs in `FinishedSPEC.md` §7 beyond #11, which is a hard
  prerequisite. #7 and #9 are real and are not this build's job.
