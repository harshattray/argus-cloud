# Normascope Cloud — Master Handbook

**Internal. For Yutic.** This is the operator's guide: how to get into the
operator surfaces, what each one shows, and the exact command for every job that
does not have a screen yet.

**It only describes what exists.** Where the operator console is not built, this
says so and gives you the command or the runbook that does the job instead. We
add to it as we build.

**This is the first place to look when you do not know how to do something.** If
the answer is not here and you had to work it out, put it here.

> **Not a strategy document.** Pricing, margins, sequencing and doctrine live in
> `FUTURENORMA.md`, which wins over this file on every point where they touch.
> `PATHWAYS.md` holds the work items and gates. This one is operational only.

---

## Contents

1. [Getting into the operator surfaces](#1-getting-into-the-operator-surfaces)
2. [What exists today](#2-what-exists-today)
3. [Waitlist](#3-waitlist--adminwaitlist)
4. [Limits and spend](#4-limits-and-spend--adminlimits)
5. [API keys](#5-api-keys--adminkeys)
6. [Giving somebody an organization](#6-giving-somebody-an-organization)
7. [Backups and recovery](#7-backups-and-recovery)
8. [Routine operations](#8-routine-operations)
9. [Checking a deployment](#9-checking-a-deployment)
10. [Demo and test data](#10-demo-and-test-data)
11. [Incidents](#11-incidents)
12. [The rules that do not bend](#12-the-rules-that-do-not-bend)
13. [Not built yet](#13-not-built-yet)

---

## 1. Getting into the operator surfaces

Everything operator-facing lives under `/admin`. It is default-deny at the edge,
behind its own password — separate from the `/pitch` password, because `/admin`
renders other people's email addresses and `/pitch` is expected to leak.

- Password: `ADMIN_PASSWORD` in the deployment environment.
- Unlock at `/admin/unlock`.
- **The cookie lasts 12 hours**, not thirty days like `/pitch`. A laptop left
  open in a café stops being a standing key by the next morning.
- Attempts are rate limited.
- `/admin` itself redirects to the waitlist, which is the only landing page it
  has today. When the real operator console is built, `/admin` becomes its index.

There is no operator *account* yet. There is a password, and it is shared. Every
action that needs attribution asks you to type your name — see the note under
each one.

---

## 2. What exists today

| Surface | Where | What it does |
|---|---|---|
| Waitlist | `/admin/waitlist` | Signups, over time, by source and referrer; CSV export |
| Limits and spend | `/admin/limits` | Rate limiting, AI provider spend, circuit breaker and its reset, backup and recovery health, open operational signals |
| API keys | `/admin/keys` | Every key across every tenant; revoke any of them |

Everything else an operator needs is a command. Sections 6 to 10.

**The customer-facing console is a separate thing** and shares nothing with
this. Being an operator does not put you in anybody's organization, and a
customer's admin role never reaches `/admin`. That separation is deliberate and
must stay: `UserHandbook.md` describes their side.

---

## 3. Waitlist — `/admin/waitlist`

The demand test. Unique signups only.

- **Four counters**: total, today, last 7 days, this calendar month. All times
  UTC.
- **A 30-day bar chart.** Days with no signups are drawn as an empty column
  rather than skipped, so a quiet week reads as a quiet week rather than
  disappearing.
- **Two breakdowns**: by surface (which page they signed up from) and by
  referrer.
- **The signup table**, newest first, capped. Past the cap, use the CSV.
- **Download CSV** for the full list.

**Read it honestly.** This is interest, not willingness to pay. The page says so
on its own face, and that sentence is there to be read before anybody quotes a
number in a deck.

**It is personal data.** That is why the whole tree is password-gated, why the
cookie is short, and why no `/admin` page is ever cached or indexed.

---

## 4. Limits and spend — `/admin/limits`

The operational page. Five things, in the order you will want them during an
incident.

### Rate limiting

Allowed and rejected request counts over the last hour, in total and broken down
by subject — per key and per organization.

Deliberately aggregate: no request bodies, no repository names, no frames, no key
material. A rejected request is an operational event, not customer content, and
this tree must not become a casual window onto either.

**Reading it:** `rejected` is not by itself a fault. A CI fleet briefly over its
ceiling is the limiter working. What deserves attention is a subject rejecting
*continuously*, or an `allowed` volume with no plausible workload behind it.

### Provider spend

Today's AI provider spend against the daily cap: spent, reserved and in flight,
remaining, and the percentage. Alerts fire at 50 / 75 / 90 / 100 percent, and the
page shows which thresholds have been crossed.

It also shows the **provider account balance** where we have it, and a count of
**undelivered alerts** — an alert we believed we sent and could not deliver is
itself something to look at.

### Circuit breaker

Whether the breaker is tripped, and its recent history.

**Resetting it is an audited human action.** The form asks for your name and a
reason, and refuses without them. That is not bureaucracy: a breaker reset with
no name against it is not evidence, and the first question a review asks is who
decided and why.

### Recovery and operations

- Last good backup.
- Last passed restore rehearsal.
- Open operational signals — anything wrong that the product wrote down
  itself: stale backups, stuck deletion jobs, reservations that never settled.

"Nothing wrong" here means the checks ran and found nothing, not that nothing was
checked.

### Recent alerts

The last dozen budget and operational alerts, so you can see what a human was
already told before you start telling them again.

---

## 5. API keys — `/admin/keys`

Every key in the system, across every tenant: label, kind, which organization,
and age. Live keys and revoked keys are listed separately.

**Revoke** takes effect on the very next request. The key is re-read from the
database every time with nothing cached in front of it, so there is no window in
which a withdrawn key still works.

**The form asks for your name and a reason.** Same reasoning as the breaker
reset: this is the operator surface and there is no session behind the password
to read an identity from, so you type it. It records who *says* they pulled the
key, which is what an incident review needs first, and it is not authentication.

**Revoking twice keeps the first answer** — the original time, actor and reason
stand. A second click cannot overwrite the true account of what happened.

**No key material is on this page**, and the query behind it does not even select
the stored hash. The plaintext is shown exactly once at creation and never again.

**One thing to know during an incident:** upload links already issued to a key
stay valid for up to two minutes after revocation. They are signed by storage and
nothing we hold can withdraw them. The bytes they can still write are harmless —
committing a run needs the key, which no longer works, so the objects are never
published and the sweeper deletes them.

> **Customers can now revoke their own keys** from their Organization area, and
> that revocation is attributed to their signed-in admin automatically. This page
> is for reaching across tenants, which is a thing only we can do and should do
> rarely.

---

## 6. Giving somebody an organization

Until the purchase webhook is live, an organization gets its first human by hand
— and by hand means **through this script**, never through a SQL client. Writing
those rows directly is how an organization ends up with two owners, or an owner
who is not an admin.

```bash
node scripts/grant-access.mjs --list
```

```bash
node scripts/grant-access.mjs --org <orgId> --claim someone@company.com
```

**A claim is not access.** It says: when the person who controls that address
signs in, they become the owner. They still have to sign in, which means they
still have to control the address. Nothing here mints a session or a password.

To invite somebody into an existing organization as an operator:

```bash
node scripts/grant-access.mjs --org <orgId> --invite them@company.com --role designer
```

`DATABASE_URL` is required and deliberately has no default — this is not a
fixture generator. For fixtures, see section 10.

### Provisioning a preview organization

```bash
DATABASE_URL=… node scripts/provision-preview-org.mjs --key-file .env.preview
```

It creates a **real paid organization**, not an exempt one. The entitlement check
that refuses uploads from unpaid plans is the single control between free and
paid, and the easiest way to break it is to grant the preview an exception. There
is none.

Idempotent — run it twice and the second run finds the org and says so. A second
key is minted only when you ask.

**Use `--key-file` when the terminal is being read by anybody else, including an
agent.** The key is printed once and only its hash reaches the database.

---

## 7. Backups and recovery

### Take a backup

```bash
DATABASE_URL=… NORMA_BACKUP_KEY=… node scripts/backup.mjs --actor harsha --note "before the 015 migration"
```

Encrypted. Needs `pg_dump` on the machine (`PG_BIN` overrides where to look).

### Rehearse a restore

```bash
DATABASE_URL=… NORMA_BACKUP_KEY=… node scripts/restore-rehearsal.mjs --actor harsha
```

It restores into a scratch database and compares table by table, refusing to
continue at the first thing that fails. A backup nobody has restored is not a
backup.

### The state of the schedule

**Backups are rehearsed, not scheduled.** The nightly workflow exists and is
inert; switching it on is deferred to the first paying organization. Until then
production is covered by hand backups — which means somebody has to run the
command above.

**This is a decision, not an oversight**, and it has a switch-on checklist in
`PATHWAYS.md` Pathway 1 item 10. It must be on before there are customers.

---

## 8. Routine operations

### The scheduled health check

```bash
DATABASE_URL=… node scripts/ops-check.mjs
node scripts/ops-check.mjs --quiet     # print only what is wrong
```

Reads the tables the product writes — backups, restore rehearsals, deletion jobs,
the breaker, budget alerts, provider reservations — and announces anything wrong
once per period through the alert channel.

Exit codes are the second delivery path, on purpose, because a webhook can be
down and a cron job that exits non-zero gets noticed:

- `0` nothing wrong
- `1` something is wrong, or an alert could not be sent
- `2` the check itself could not run

### Sweep abandoned uploads

```bash
DATABASE_URL=… node scripts/sweep-uploads.mjs
node scripts/sweep-uploads.mjs --older-than 60 --limit 500 --quiet
```

Deletes declared uploads that never transferred and releases their storage
reservation.

### Compare two databases

```bash
PROD_URL=… STAGING_URL=… node scripts/schema-drift.mjs
```

How far staging is ahead of production, and whether either has something the
other has never seen. Run it before a deploy that carries migrations.

### Before anything is called done

```bash
npm run verify
```

Typechecks both packages, runs the full suite, builds the web app, audits
production dependencies. CI runs the same things plus the suite against a real
Postgres server and a secret scan.

For anything about locking, concurrency or shared budgets, run the suite against
a real server — those checks skip themselves otherwise:

```bash
DATABASE_URL="$(scripts/test-db.sh start)" npm test
```

---

## 9. Checking a deployment

Two scripts prove things the suite cannot, because each needs a build, a server
and a real database at once.

### The live site

```bash
node scripts/golive-check.mjs https://normascope.com
```

Checks what the *deployment* actually returns: headers, gated routes, the sign-in
surface, storage access. The suite proves what the code does; this proves what
the server does, and they are not the same claim.

Run it after every deploy that touches routing, headers or auth.

### Tenant isolation and roles

```bash
scripts/test-db.sh start
DATABASE_URL="$(scripts/test-db.sh url)" npm run build:web
(cd web && DATABASE_URL="$(../scripts/test-db.sh url)" NORMA_DEV_OPEN=0 npx next start -p 3200)
DATABASE_URL="$(scripts/test-db.sh url)" GATE_BASE=http://127.0.0.1:3200 node scripts/tenant-gate-check.mjs
```

41 checks over HTTP against a production build: the repository trend view and its
export, the console's role matrix by direct URL, every write the Organization
area offers — each refused for no session, for the wrong role, from another
origin, and from another organization's admin holding a real row id — and the
account page's session sign-out, where the same question is asked about a person
rather than a tenant: two colleagues in one organization cannot sign each other
out.

**Do not override `GATE_COOKIE_NAME`.** A production build uses the `__Host-`
prefixed cookie and the script's default already matches. Overriding it wrongly
makes every session-holding check fail with a confusing 401.

---

## 10. Demo and test data

```bash
npm run seed:demo      # an invented tenant AND a tenant of real measured runs
npm run seed:real      # just the real one
npm run seed:dev       # organizations on each plan state, a key, a repo, some runs
```

`seed:demo` also makes the local sign-in address an owner of what it creates, so
signing in lands on real data rather than on "No organization yet".

### The rule about demo data

**The invented tenant is named `DEMO — … (sample data)` and that name is the top
breadcrumb on every page of it.** The label is on screen throughout a walkthrough
for a reason: none of it is a measurement, a customer, or evidence that anything
works.

**A share link is the exception** — share views carry no breadcrumb by design, so
a report opened from one shows no demo label. Say it out loud if you send one.

The measured tenant is named `REAL — …` and contains runs that actually happened.
It carries no usage records, because that spend went through the CLI and a hosted
usage row would claim otherwise.

### Screenshots

```bash
npm run seed:demo -- --reset     # first
npm run dev:web                  # then, in one terminal
npm run capture:cloud            # then, in another
```

Writes every Cloud page in both themes. It refuses to write a screenshot of a
page that did not load.

### A trap worth knowing

A stale `next-server` process holds the local database directory and the seeds
die inside it with an unhelpful error. If a seed fails strangely, check for
leftover dev servers first.

---

## 11. Incidents

### A key has leaked

1. `/admin/keys` → revoke it, with your name and the reason. Dead on the next
   request.
2. Tell the customer, and tell them which key by its label.
3. Remember the two-minute window on already-issued upload links (section 5).
   Nothing useful comes of it, but say so before somebody else finds it.

### Provider spend is climbing

1. `/admin/limits` → provider spend. Check reserved-in-flight as well as spent;
   a spike in reservations is the earlier signal.
2. Check rate limiting on the same page for a subject with implausible volume.
3. The breaker trips on its own at the ceiling. If you trip or reset it, the form
   records who and why.

### The breaker is tripped

Find out why before resetting. The history is on the same page, and the recent
alerts below it usually say what happened. Reset with a real reason — "resetting"
is not a reason.

### The email budget is exhausted

Sign-in links and invitations both draw on one daily budget, and it alerts on the
way up and pauses at 100 percent. When paused:

- Sign-in by emailed link stops. **GitHub sign-in is unaffected** — that is the
  message to give a stuck customer.
- The pause is a control, not a provider limit: our ceiling is deliberately below
  the provider's, so the first thing that happens in an attack is our own alert
  rather than a rejection from outside.
- An attack costs no money. What it costs is sending reputation and somebody's
  inbox, both harder to recover than a bill.

### A customer cannot sign in

Work through it in this order:

1. **Are they in an organization?** "Signed in but not in an organization" is a
   correct page, not a failure. Check for a membership.
2. **Which address?** A GitHub account whose verified address differs from the
   one that was invited or that bought the subscription will not be matched, on
   purpose. That is the no-silent-merge rule.
3. **Has the invitation expired or been used?** 14 days, once.
4. **Is the email budget paused?** Point them at GitHub sign-in.

### A customer thinks somebody else is signed in as them

They can answer most of this themselves now, and telling them how is faster than
querying it: **account menu → Your account** lists every browser signed in as
them, with the device, the sign-in method, when it started and when it was last
used, and a per-row sign-out. **Sign out everywhere** is the safe move if
anything on that list is unexplained.

What to do on our side, in order:

1. **Revoke the sessions** if they cannot reach the page:

   ```sql
   UPDATE sessions SET revoked_at = now(), revoked_reason = 'support: suspected compromise'
    WHERE user_id = (SELECT id FROM users WHERE email = 'them@company.com')
      AND revoked_at IS NULL;
   ```

   It takes effect on the next request from every device — there is no cache.

2. **Read the audit trail** for that user. `auth_events` holds the sign-ins,
   sign-outs and revocations; addresses and IPs are keyed hashes, so compare them
   to each other rather than trying to read them.

   ```sql
   SELECT at, kind, outcome, reason, ip_hash FROM auth_events
    WHERE user_id = (SELECT id FROM users WHERE email = 'them@company.com')
    ORDER BY at DESC LIMIT 50;
   ```

3. **Check the organization's keys** if the account is an admin's — a session is
   not the only credential they hold. Section 5.

Note what a revoked session is *not*: it does not revoke API keys, and it does
not undo anything already done. Treat both separately.

### A customer says a report is "Not found"

The same page is returned for missing, revoked, expired, and belonging to another
organization — deliberately, so probing URLs maps nothing. Check which
organization they are signed in as, and whether the share link they were sent is
still live.

---

## 12. The rules that do not bend

Short versions. `FUTURENORMA.md` §7 is the authority.

- **Never fabricate economics.** Every cost figure traces to a recorded usage
  record times a live price. No estimates presented as measurements.
- **Never fabricate security posture.** A suite that was not run is an open risk,
  not an assumed pass.
- **Demo data is labelled, always.** Section 10.
- **Never present the waitlist as demand for the paid product.** It is interest.
- **The operator tree is not a window onto customer content.** Aggregates,
  operational events and account state — never request bodies, frames or
  findings. If a future page needs content access, it is break-glass: scoped,
  reasoned and audited.
- **Every destructive operator action carries a name and a reason.** The forms
  enforce it; do not work around them.
- **Never put a production database URL in a local env file.** It used to be
  there, and every local command was a production session. Production credentials
  live in the deployment environment and nowhere else.

---

## 13. Not built yet

The operator console proper does not exist. What we have is three pages and a set
of commands. The full information architecture is in `FUTURENORMA.md` §4 Step 6
and `PATHWAYS.md` §5; this is what is missing in practice, so you know when to
reach for a command instead of a screen:

- **Operations overview** — service health, incidents, queues, provider status,
  deletion sweeps in one place. Today: `/admin/limits` plus `ops-check.mjs`.
- **Organizations** — a searchable tenant inventory with account state, activity,
  storage, credits and support context. Today: `grant-access.mjs --list` and a
  SQL client.
- **Revenue and reconciliation** — subscriptions, packs, webhooks, refunds,
  credit movements, provider cost, margin, discrepancies. Today: the
  reconciliation job and its alerts.
- **Usage and spend per tenant** — revenue minus cost per customer. The data is
  already recorded per call; the query is not written.
- **Security and abuse** — suspicious sign-ins, upload abuse, cross-tenant probe
  failures, key events. The audit log is written today and there is no operator
  view of it; the only thing that reads it back is the customer's own account
  page, which shows that one person their own sign-ins. Ours is a SQL client —
  section 11.
- **Controls** — scoped pauses for AI, uploads, sharing, providers, individual
  organizations. Today: the breaker, and that is all.
- **Audit and support** — immutable operator actions, break-glass access,
  incident notes.
- **Issuing goodwill credits.** The mechanism exists in the ledger; there is no
  screen and no command wrapping it.
- **Ownership transfer and organization deletion** from a screen. The functions
  exist and are tested; nothing calls them.

Two known limits inside what *is* built:

- **Operator actions are self-declared.** There is no operator identity behind
  the `/admin` password, so attribution is a typed name. Real operator roles
  arrive with the operator console.
- **Backups are not scheduled.** Section 7.

---

*This handbook describes the operator side as it is today. Keep it accurate: if
you had to work something out, it belongs in here.*
