# Normascope Cloud — User Handbook

This is the guide to using Normascope Cloud. It covers everything that is on the
dashboard today: how to get in, how your work gets there, and what every part of
the screen does.

**It only describes things that exist.** Where an area of the dashboard is not
finished, this says so plainly rather than promising a date. We add to this
handbook as we build, so if something is on your screen and not in here, tell us
— that is a gap in the handbook, not in your reading.

**How to read it.** Sections 1 to 4 are worth reading once, in order. After that,
jump to the part you need.

---

## Contents

1. [What Normascope Cloud is](#1-what-normascope-cloud-is)
2. [Signing in](#2-signing-in)
3. [Getting into an organization](#3-getting-into-an-organization)
4. [The dashboard at a glance](#4-the-dashboard-at-a-glance)
5. [Roles: who can do what](#5-roles-who-can-do-what)
6. [Getting your work into Cloud](#6-getting-your-work-into-cloud)
7. [Runs and reports](#7-runs-and-reports)
8. [Trends](#8-trends)
9. [Organization](#9-organization)
10. [Your account](#10-your-account)
11. [Overview, Explain and automation, Billing and usage, Privacy and data](#11-the-four-areas-that-are-not-built-yet)
12. [Sharing a report with someone outside your organization](#12-sharing-a-report-with-someone-outside-your-organization)
13. [What we keep, and for how long](#13-what-we-keep-and-for-how-long)
14. [When something goes wrong](#14-when-something-goes-wrong)
15. [Not built yet — the honest list](#15-not-built-yet--the-honest-list)

---

## 1. What Normascope Cloud is

Normascope is a command-line tool that compares how your interface looks now
against how it looked before, and tells you what changed.

Normascope Cloud is where those comparisons go to live. The command-line tool
runs on your machine or in your build pipeline and does the comparing. Cloud
keeps the results: the pictures, the differences it found, and — the part a
single run on your laptop cannot give you — **the history**. When a frame first
drifted. How often it has drifted since. Whether the thing you fixed last month
has quietly come back.

You do not have to use Cloud to use Normascope. The command-line tool is complete
on its own. Cloud is for when you want the results kept, compared over time, and
shared with people who are not going to run a terminal command.

### The three things Cloud does that a local run cannot

- **It remembers.** A run on your laptop knows about that run. Cloud knows about
  every run you have ever sent it.
- **It has a link.** A report has a URL. You can send it to a designer, a
  product manager, or a client, and they do not need to install anything.
- **It can look at the pictures for you.** Cloud can ask an AI model to describe
  what changed in a frame, in words, with the region marked on the image.

---

## 2. Signing in

Go to the sign-in page. There are two ways in, side by side, and neither is the
"proper" one — pick whichever suits you.

### Sign in with GitHub

Click the GitHub button. GitHub asks you to approve, then sends you back and you
are in.

Use this if you already have a GitHub account. Your GitHub account is matched to
you by its account identity, not by your username — so if you rename your GitHub
account, you keep working.

### Sign in with an emailed link

Type your email address and press the button. If that address can sign in, we
send you a link. Click it and you are in.

Use this if you do not have a GitHub account and do not want one. Designers,
product managers and anyone else can have a full seat this way — a GitHub account
is not a requirement for using Normascope Cloud.

**Things worth knowing about the link:**

- It works **once**. Clicking it a second time does nothing, and neither does
  forwarding it to a colleague.
- It expires after **15 minutes**. If you are too slow, ask for another.
- The page always says the same thing whether or not the address is known to us.
  That is deliberate: it means nobody can use the sign-in box to find out who has
  an account.
- If you asked for a link and one does not arrive, wait a few minutes and ask
  again. There is a short cooldown per address.

### There is no "sign up" button, and that is on purpose

You cannot create an account by turning up. There is no free tier to sign up to.
An account exists because somebody bought a subscription, or because somebody
already inside an organization invited you. Section 3 covers both.

### Staying signed in

- You stay signed in for **30 days** of not using it, and for **90 days** in
  total, after which you sign in again.
- You can be signed in on **several browsers and devices at once**. Signing in on
  your laptop does not sign you out on your phone.
- **Sign out** ends the session on the device you are using.
- **Sign out everywhere** ends every session you have, on every device. Use it if
  you have lost a laptop or think someone else has your browser.

Both are in the account menu — the button with your name in the top-right corner
of every page. The same menu has **Your account**, which lists every browser
signed in as you and lets you end one of them on its own. Section 10.

---

## 3. Getting into an organization

Everything in Normascope Cloud belongs to an **organization**. Repositories,
runs, reports, credits and keys all belong to one, and you see something only
because you are in the organization that owns it.

There are two ways to be in one.

### Way 1: you bought the subscription

When a subscription is purchased, an organization is created for it and you are
recorded as the person entitled to claim it. Sign in with the address you bought
with, and the organization becomes yours. You become its **owner** and its first
**admin**.

The address matters. If you buy with `you@company.com` and then sign in with a
GitHub account whose verified address is `you@personal.com`, we will not quietly
attach the subscription to it — we cannot tell those two people apart, and
guessing would be the wrong thing to guess. Sign in with the address you bought
with, or contact us and we will sort it out.

### Way 2: somebody invited you

An admin of an organization invites your email address and picks your role. You
get an email that says which organization, who invited you, what role you are
being given, and how long the link lasts.

Click the link and you are in. Then:

- The link works **once**, and only for the address it was sent to. Forwarding it
  to somebody else does not give them access.
- It lasts **14 days**. After that, ask the admin to send another.
- If you already have a Normascope Cloud account, accepting adds this
  organization to the ones you already have — it does not create a second
  account for you.
- If you do not have an account, accepting creates one.

### You can be in more than one organization

If you work with two clients, or you have your own organization and are a
designer in somebody else's, you hold one account and switch between them. See
the organization switcher in section 4.

### "You're signed in, but not in an organization yet"

If you see this page, your sign-in worked and you are simply not a member of
anything. That is not an error. Either an invitation is waiting in your inbox, or
you signed in with a different address from the one that was invited. If you
bought a subscription and this is unexpected, reply to your receipt.

---

## 4. The dashboard at a glance

Every signed-in page has the same three rows at the top.

### The top row

- **The wordmark**, on the left. It is also the way back to the main site.
- **The theme switch**: Light, Dark, or Auto. Auto follows whatever your device
  is set to. Your choice is remembered and applies on every page.
- **Your account menu**, on the right, with your name on it. It holds *Sign out*
  and *Sign out everywhere*.

### The context row

This row answers "whose data am I looking at, and what am I allowed to do with
it" without you having to think about it.

- **The organization name.** If you belong to more than one, this is a menu —
  click it to switch. Switching changes what every page shows.
- **Your role** in that organization: admin, member or designer.
- **The subscription state**, but only when there is something to say. An
  account in good standing shows nothing here. If a payment has failed or a
  subscription has ended, you will see it on every page rather than finding out
  when something is refused.
- **Which environment you are on.** On the real service this is a quiet
  "Production" label. On a test or preview copy it is a louder one, so you never
  act on the wrong data because two tabs looked alike.

### The navigation

Seven areas. You only see the ones your role can open — see section 5.

| Area | What it is for |
|---|---|
| **Overview** | What is happening right now and what needs attention |
| **Runs and reports** | Every repository, run, frame and finding you have uploaded |
| **Trends** | How quality moved over time |
| **Explain and automation** | What the AI explanations did, what they cost, what stopped them |
| **Organization** | Who is in the organization, what they may do, and which keys act for it |
| **Billing and usage** | What is being paid, what is left, and where it went |
| **Privacy and data** | What we hold for you, and how to get it out or delete it |

Four of those seven are still being built. The area itself will tell you so, and
list what is coming. Section 11 has the details.

### Words with a dotted underline

Throughout the reports you will see words with a dotted underline — *threshold*,
*recurrence*, *credits*, and so on. Click one and it explains itself, on the
spot. You never have to leave the page to look up a term.

---

## 5. Roles: who can do what

There are three roles, and one extra thing that is not a role.

- **Admin** — can do everything, including inviting people, changing roles,
  creating and revoking keys.
- **Member** — can read everything about the work: repositories, runs, reports,
  findings and trends.
- **Designer** — the same product access as a member. The role exists so an
  admin can tell at a glance who is a developer and who is not, and because a
  designer seat never needs a GitHub account.
- **Owner** is not a role. It is a single person per organization — whoever
  claimed the subscription. The owner is always also an admin. Ownership matters
  for two things only: transferring the organization to somebody else, and
  deleting it.

### The area-by-area matrix

| Area | Admin | Member | Designer |
|---|---|---|---|
| Overview | yes | yes | yes |
| Runs and reports | yes | yes | yes |
| Trends | yes | yes | yes |
| Explain and automation | yes | yes | yes |
| Organization | yes | no | no |
| Billing and usage | yes | no | no |
| Privacy and data | yes | no | no |

If you open one of the last three without the role for it, the page says so and
names the role that can — so your next move is a message to a colleague rather
than a support ticket.

Hiding a menu item is not the same as refusing a request, and we do both. Typing
the URL directly gets you exactly the same answer as clicking the link would
have.

### Two rules that protect the organization

- **An organization must always keep at least one admin.** The last admin cannot
  step down or be removed. Promote somebody else first.
- **The owner is always an admin.** The owner cannot be demoted or removed;
  ownership is transferred instead.

---

## 6. Getting your work into Cloud

Nothing appears in Cloud by itself. You send it, either from your machine or
from your build pipeline.

### Step 1 — create an upload key

Go to **Organization → Keys**, type a short description of what the key is for
("CI for the marketing site"), leave the kind as **upload**, and press *Create
key*.

**The key is shown once.** We keep only a scrambled form of it, so we cannot show
it to you again and cannot recover it if you lose it. Copy it straight into
wherever it needs to live. If you do lose it, revoke it and make another — that
takes ten seconds and is the normal thing to do.

**Keys belong to the organization, not to you.** They keep working when you
leave. That is why the list shows who created each one: so the answer to "what is
this key for" is not a mystery six months later.

**Use one key per pipeline or project.** Then revoking one stops one thing rather
than everything.

**Never put a key in a place a browser session belongs, or the other way round.**
A key is for machines. Your sign-in is for you.

### Step 2 — tell the command-line tool about it

Set the key in the environment where the tool runs, as `NORMASCOPE_ORG_KEY`. In
CI, that means a secret; on your own machine, your shell profile or a local env
file.

### Step 3 — upload

Run the upload command in the project you want to send:

```bash
npx norma-scope upload
```

The first upload from a project **creates the repository** in Cloud and starts
its history. You do not create repositories by hand.

**What gets sent.** By default, full images for the frames that were flagged, and
one small preview image for each frame that was clean. That keeps uploads quick
without losing the frames you did not need to look at.

**Nothing is uploaded by accident.** The ordinary comparison commands never
upload. Only the upload command does.

### The limits you might meet

| Limit | Value |
|---|---|
| Runs uploaded per day | 200 |
| Images per run | 600 |
| Size of one run | 250 MB |
| Total stored | 50 GB |
| How long runs are kept | 90 days |

If a subscription lapses, uploads stop. What you have already uploaded is not
deleted for that reason.

---

## 7. Runs and reports

This is where the work is. The area's front door is the repository list.

### The repository list

Every repository you have uploaded from, with:

- how many runs it has,
- how many frames were flagged in the most recent run,
- when the last run happened.

If it is empty, nothing has been uploaded yet — the page tells you the command
that ends that.

Click a repository to open it.

### A repository

- **The runs**, newest first, paginated. Each row is a run: its commit, when it
  happened, and how it did.
- **A sparkline per frame** — a tiny chart showing how that one frame has moved
  across recent runs. Click a sparkline to open that frame's full trend
  (section 8).

### A run report

This is the page you send people. It has four parts.

**1. The pictures.** For each frame: what it looks like now, what it looked like
before, and the difference between them, side by side. Click any image to open it
large.

**2. The findings.** For each thing Normascope thinks changed: what it thinks
happened, how confident it is, which element it believes is involved, and where
in your code to look. The affected region is drawn on the difference image, so
you are not hunting for it.

Findings that came from an AI model are labelled as generated and ask you to
verify them. That label is not a formality — treat a finding as a lead, not a
fact.

**3. The history.** Above the images, because it is the part a local run cannot
give you:

- **First drift** — the run where this frame first moved away from its
  reference.
- **Recurrence** — how many times it has drifted since.
- **A sparkline** across previous runs.

**4. Sharing.** Covered in section 11.

### Asking for an explanation

Under each frame there are two buttons:

- **Explain** — 4 credits. The model looks at the marked region and describes
  what changed.
- **Deep explain** — 8 credits. A closer look, for when the ordinary one is not
  enough.

Both spend credits from your organization's shared balance. The button states
its price before you press it.

**A note on how these work today.** The two Explain buttons and the sharing panel
each ask you to paste an organization key into a small box on the page. That is
left over from before sign-in existed, and it is on the list to remove — being
signed in ought to be enough. Until then, an upload or agent key pasted there is
what makes those two controls work.

**Cache hits are free.** If the same frame in the same state has been explained
before, you get the previous answer and it costs nothing.

**If a run contains something that looks like a password or a key**, the request
is stopped before anything is sent to the model, and you are told which field
looked wrong. Being stopped costs you nothing.

---

## 8. Trends

Trends is about movement over time rather than any single run.

The way in is a **sparkline** on a repository page: click one and you get that
frame's full trend. (The Trends area's own front door — trends across the whole
organization — is not built yet.)

### The trend page

**Two charts, one above the other.**

The **top chart** covers the whole history we hold for that frame. It is bucketed
by time so that it fits, and **nothing is averaged**: each bucket keeps the
lowest, the highest, the first and the last value actually recorded in it, plus
whether the runs inside it disagreed about crossing your threshold. A quiet week
looks like a quiet week; a wild week looks wild.

**Drag across the top chart** to select a period. The bottom chart and the table
then show exactly the runs in it.

The **bottom chart** draws the individual runs. Hover a point and it names that
run: the commit, the measurement, the threshold it was judged against, the
verdict, and the date.

**Under the charts, a table** of the exact runs, twenty-five to a page.

**Export everything as CSV** with the button. The CSV is not paginated and is not
capped the way the chart is — a spreadsheet does not need pages. The charts are
bounded so your browser stays usable; the data behind them is not.

### The page tells you what it does not know

This matters more than it sounds. Four different situations look like "an empty
chart", and they are not interchangeable, so each has its own sentence:

- the frame has never drifted;
- the first drift is older than the window you are looking at;
- the runs in this window measured nothing;
- the way the measurement is defined changed part-way through the history.

A chart that quietly skipped any of those would read as more certain than the
data actually is.

### Window sizes

You can look at the most recent 200, 1,000 or 5,000 runs, or everything we hold.
The options offered are the ones that exist for your data — you will not be
shown a window that has nothing in it.

---

## 9. Organization

**Admins only.** Three things live here.

### Members

Everyone in the organization, with their email address, their role, when they
joined, and when they last signed in. Admins are listed first.

Your own row is marked **you**. The owner's row is marked **owner**.

**To change somebody's role**, pick the new role in their row and press
*Change*. It takes effect on their very next request — there is nothing to wait
for and no cache in front of it.

**To remove somebody**, press *Remove* in their row. Their access to this
organization ends on their next request. It does not delete their account, and
it does not touch any other organization they belong to.

The owner's row has no controls, because both things you might do to it are
refused anyway: the owner is always an admin, and the owner cannot be removed.
Transfer ownership first. (Transferring ownership is not built yet — contact us
and we will do it.)

You will be stopped from removing or demoting the last admin. That is the rule
that stops an organization ending up with nobody who can run it.

### Invitations

**To invite somebody:** type their email address, pick a role, press *Send
invitation*. They get an email with a link.

**Inviting the same address twice replaces the old link** rather than adding a
second one. So "resend the invite" is the same button, and the previous link
stops working the moment you press it. There is never more than one live link per
person per organization.

The table shows who has been invited, at what role, when, and how long is left.
Press *Revoke* to kill a link before it is used.

Below the live ones, a short list of recently accepted, revoked and expired
invitations, so you can see what happened without asking anybody.

**If somebody is already in the organization**, inviting them does nothing and
the page tells you so — change their role instead.

**If the email does not go out**, the page says exactly that rather than claiming
it was sent. Press the button again; that replaces the link and tries again.

There is a daily limit on how many invitations one organization can send. It is
generous for real use and exists so that nobody can turn the invite box into a
way of mailing strangers.

### Keys

Every key the organization holds: what it is for, whether it is an upload key or
an agent key, when it was made, and who made it.

- **Create key** — covered in section 6.
- **Revoke** — the key stops working on the very next request. There is no delay
  and nothing cached.

One thing worth knowing during an incident: upload links already handed out to a
key stay valid for up to two minutes after you revoke it. Nothing useful can come
of that — finishing an upload requires the key, which no longer works, so the
bytes are never published and are cleaned up — but it is better to know than to
discover.

### Still to come in this area

Notification routing and upload policy. The page lists this at the bottom so you
can see what is coming.

---

## 10. Your account

Everything above is about an organization. This page is about **you**: the same
page whichever organization you are looking at, and it works even if you are in
none.

Open it from the account menu — the button with your name in the top-right
corner of every page — and choose **Your account**.

### You

Your name, the address you sign in with, and the date you joined. Nothing here
can be edited yet.

### Organizations

Every organization you belong to and your role in each. If you are in more than
one, the one you are currently looking at is marked, and the switcher at the top
of the page is what changes it.

### Browsers signed in

One row for every browser that is signed in as you, newest use first:

| Column | What it means |
|---|---|
| Browser | Which browser and which kind of device — "Chrome on macOS", "Safari on iPhone". The one you are reading this on is marked **this browser** |
| Signed in with | GitHub, or an emailed link |
| Started | When that browser signed in |
| Last used | When it last loaded a page |
| Expires | How long it has left before it has to sign in again |

**Sign out** on a row ends that one browser. It stops working on its very next
request — there is no delay and nothing to wait for. Signing out the row marked
*this browser* is allowed: it signs you out here and returns you to the sign-in
page.

**Sign out everywhere**, below the table, ends every row including this one. That
is the one to use if a device is lost.

Two things this page deliberately does not show. We do not keep the addresses
these browsers connected from, so there is no location column and there never
will be. And two rows can carry the same name — the same browser on the same
laptop, signed in twice — in which case the **Started** and **Last used** times
are what tell them apart. If you are not sure, sign out everywhere and sign back
in; nothing is lost by doing that.

### Recent activity

The last few sign-ins and sign-outs on your account, in plain words. If something
here was not you, sign out everywhere and then sign back in.

### Still to come on this page

Linking a GitHub account and an email address to one login, pending invitations,
leaving an organization, notification and interface preferences, and exporting or
deleting your personal data. The page lists these at the bottom so you can see
what is coming.

---

## 11. The four areas that are not built yet

They are in the navigation because they are part of the structure, and each one
tells you what will be in it. Opening one is not a broken link — there is simply
nothing there yet.

### Overview

Will hold: current status and recent activity; unresolved findings and things
needing attention; credits remaining and storage used; failed, paused and skipped
work.

### Explain and automation

Will hold: what the hosted explanations did and what the ones in your build
pipeline did; the policy for explaining automatically and its caps; work that was
skipped and why; what happens when credits run out.

### Billing and usage

Will hold: your subscription, renewal date and invoices; this month's credit
allowance and when it expires, kept separate from any credit packs you have
bought; the usage ledger with cache hits shown as free; storage used against your
limit.

This one is last on purpose. Everything on it needs real billing data behind it,
and a page that invented a renewal date would be worse than a page that says
what is coming.

### Privacy and data

Will hold: what gets uploaded and the notice you see before it does; exclusions
and retention; exports and deletion, with a receipt confirming it is done; how
long an image link stays valid.

---

## 12. Sharing a report with someone outside your organization

Open the run report and use the sharing panel.

- Choose how many days the link should last, and create it.
- **The link is shown once.** Only a scrambled form is stored, so it cannot be
  shown again — only revoked. Copy it when you make it.
- Anyone with the link can read **that one run**, and nothing else. No account
  needed. They cannot browse to other runs, cannot see your repository list,
  cannot see your trends, and cannot press Explain.
- The panel lists your existing links with their age and state, and revokes any
  of them. **Revoking is immediate and permanent** — the link stops working on
  the next load.
- A link can last up to a year. Shorter is better: an unexpiring link is a key
  left in a door.

Somebody holding a share link cannot create more of them, and cannot see the
other links to that run.

**Today the panel asks for an organization key**, as noted in section 7. That is
being removed.

---

## 13. What we keep, and for how long

| Thing | How long |
|---|---|
| Runs, images and findings | 90 days |
| An invitation link | 14 days, or until used or revoked |
| A sign-in link | 15 minutes, once |
| Your signed-in session | 30 days idle, 90 days maximum |
| A share link | Whatever you set, up to a year |

Deleting a run removes its images from storage as well as its rows.

**Images are served through short-lived links.** A link to an image expires
quickly, which is why saving one and coming back to it later will not work — open
the report instead.

---

## 14. When something goes wrong

### "Not found"

You will see the same "Not found" page for a report that does not exist, one
whose share link has been revoked or has expired, and one belonging to a
different organization. They are deliberately identical — telling them apart
would let somebody work out what exists by trying URLs.

If you expect to see it: check the organization switcher (you may be looking at
the wrong one), and check whether the share link you were sent has expired.

### The sign-in link did not arrive

Wait a couple of minutes, then ask again — there is a short cooldown per address.
Check spam. If you are sure the address is right and nothing arrives, GitHub
sign-in is unaffected and worth trying.

### "Something went wrong"

A page failed on our side. Nothing you uploaded has changed and no credits were
spent. Press *Try again* — it retries in place. If it keeps happening, tell us
and include the address of the page.

Note the difference between this and an empty result: this card means something
broke. An empty page with an explanation means we looked and there was nothing
there. We keep those two apart on purpose, because "your data is gone" and
"nothing has arrived yet" should never look alike.

### A role change or removal does not seem to have taken

It takes effect on that person's next request. If they have a page already open,
it will apply the moment they click anything.

### A key leaked

Revoke it in **Organization → Keys**, immediately. Then create a new one and
update wherever the old one was used. Do it in that order — a revoked key is dead
on the very next request, so there is no reason to wait.

---

## 15. Not built yet — the honest list

So you know where the edges are:

- **Four of the seven areas** — Overview, Explain and automation, Billing and
  usage, Privacy and data. Section 11.
- **Changing your name or address**, and **preferences** — notification routing,
  timezone, interface settings. The account page shows what it holds; it does not
  let you edit any of it yet. Section 10.
- **A trends front door.** Trends across the whole organization. Per-frame trends
  work today, reached from a sparkline.
- **Transferring ownership** and **deleting an organization** from the
  dashboard. Contact us.
- **Self-serve export and deletion.** Contact us.
- **Sign-in replacing the key box** on the Explain and sharing controls.
- **Linking a GitHub account and an email address to one login.** The account
  page names this as coming; today the two are separate ways in.
- **Leaving an organization yourself**, and **seeing an invitation you have not
  accepted** on your account page. Ask an admin, or use the link in your inbox.

---

*This handbook describes Normascope Cloud as it is today. We update it as we
build. If something on your screen is not explained here, that is our gap — tell
us and we will fix it.*
