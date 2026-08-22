import {
  ACCOUNT_PATH,
  ACCOUNT_SURFACE,
  accountActionPath,
} from "argus-cloud/consoleIA.js";
import { accountEvents, type AccountEvent } from "argus-cloud/authEvents.js";
import {
  listSessions,
  SESSION_IDLE_DAYS,
  SESSION_TTL_DAYS,
  type SessionSummary,
} from "argus-cloud/sessions.js";
import type { Membership } from "argus-cloud/users.js";
import { getDb } from "../../lib/db";
import { accountContext } from "../../lib/console";
import { type AccountNotice } from "../../lib/account";
import { AreaOutline, ConsoleShell } from "../_components/cloud/console-shell";
import styles from "./account.module.css";

/**
 * Your account — who you are here, where you belong, and every browser signed
 * in as you.
 *
 * **The session list is the reason this page exists now rather than later.**
 * The masthead menu has been able to *end* sessions since 2026-08-22 and
 * deliberately does not *show* them, so the one control somebody reaches for
 * after losing a laptop asked them to act without seeing what they were acting
 * on. §10.7 5A.8 specifies the list: device label, method, last seen, current
 * marker, per-row revoke. All five are here.
 *
 * **It is not one of the seven console areas.** It is scoped to a person, not to
 * an organization — `consoleIA.ts` explains why that is a different kind of
 * surface and declares it as one. The chrome is the console's, because a person
 * reading this page is inside the product and losing the organization row for
 * the length of one page would be a worse answer than showing it.
 *
 * **Three things it does not have, and says so.** Identity linking, leaving an
 * organization, and export/deletion are all in `ACCOUNT_SURFACE.holds` and not
 * in `built`, so the outline at the bottom lists exactly those and cannot drift
 * from what is on the page.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your account — Normascope Cloud",
  robots: { index: false, follow: false },
};

const NOTICES: Record<AccountNotice, { tone: "good" | "bad"; text: string }> = {
  "session-revoked": {
    tone: "good",
    text: "That browser is signed out. Its next request will be refused.",
  },
  "session-gone": { tone: "bad", text: "That browser was already signed out." },
};

function Notice({ code }: { code: string | undefined }) {
  const notice =
    code && Object.prototype.hasOwnProperty.call(NOTICES, code) ? NOTICES[code as AccountNotice] : null;
  if (!notice) {
    return null;
  }
  return (
    <p className={notice.tone === "good" ? styles.noticeGood : styles.noticeBad} role="status">
      {notice.text}
    </p>
  );
}

/**
 * A time somebody can act on.
 *
 * Minutes and hours near the present, because "is that me, right now" is the
 * question every row on the session table is asked; a date once it is far enough
 * away that the exact hour stops mattering.
 */
function when(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function until(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** `github` and `email` are column values. These are what they mean. */
const METHOD: Record<string, string> = {
  github: "GitHub",
  email: "Emailed link",
};

function Sessions({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Browser</th>
            <th scope="col">Signed in with</th>
            <th scope="col">Started</th>
            <th scope="col">Last used</th>
            <th scope="col">Expires</th>
            <th scope="col" className={styles.actionCol}>
              <span className={styles.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>
                <span className={styles.name}>{session.label}</span>
                {session.current ? <span className={styles.thisOne}>this browser</span> : null}
              </td>
              <td>{METHOD[session.method] ?? session.method}</td>
              <td className={styles.muted}>{when(session.createdAt)}</td>
              <td className={styles.muted}>{when(session.lastSeenAt)}</td>
              <td className={styles.muted}>{until(session.expiresAt)}</td>
              <td className={styles.actionCol}>
                <form method="post" action={accountActionPath("session-revoke")}>
                  <input type="hidden" name="id" value={session.id} />
                  {/*
                    The same visible word on every row, including your own — a
                    button reading "Sign out here" on one row and "Sign out" on
                    the others would invite the reader to work out a difference
                    that is only about which row it is on.

                    **The hidden half is not decoration.** Read aloud, this table
                    is four buttons all called "Sign out", and the row they
                    belong to is a spatial fact a screen reader does not carry
                    into the button's name. PATHWAYS §5 requires screen-reader
                    labels on core workflows, and a destructive control that
                    cannot say what it ends is exactly the case that is about.
                  */}
                  <button type="submit" className={styles.dangerButton}>
                    Sign out
                    <span className={styles.srOnly}>
                      {" "}
                      {session.label}
                      {session.current ? ", the browser you are using" : ""}
                    </span>
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The audit log in the reader's words.
 *
 * **An unrecognised kind is not rendered.** The table holds operator events too,
 * and a page that fell back to printing the raw column would show a customer
 * strings like `magic-link-refused` — worse than saying nothing, because it
 * reads like a fault. Anything new here is a line in this map away from being
 * visible; until it is, it simply is not shown.
 */
const EVENTS: Record<string, string> = {
  "magic-link-sent": "A sign-in link was sent to your address",
  "magic-link-consumed": "Signed in with an emailed link",
  "github-callback": "Signed in with GitHub",
  "dev-signin": "Signed in through the local development door",
  "signed-out": "Signed out",
  "session-revoked": "A browser was signed out from this page",
  "session-rejected": "A request was refused because the session was no longer valid",
  "invitation-accepted": "An invitation was accepted",
  "owner-claimed": "An organization was claimed",
  "role-changed": "Your role was changed",
  "member-removed": "You were removed from an organization",
};

function Activity({ events }: { events: AccountEvent[] }) {
  const known = events.filter((event) => EVENTS[event.kind] !== undefined);
  if (known.length === 0) {
    return <p className={styles.empty}>Nothing recorded yet.</p>;
  }
  return (
    <ul className={styles.events}>
      {known.map((event, index) => (
        <li key={`${event.at}-${index}`}>
          <span className={styles.eventWhen}>{when(event.at)}</span>
          <span>{EVENTS[event.kind]}</span>
          {event.outcome === "allowed" ? null : (
            <span className={styles.eventBad}>{event.outcome}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Organizations({
  memberships,
  currentOrgId,
}: {
  memberships: Membership[];
  currentOrgId: string | null;
}) {
  if (memberships.length === 0) {
    return (
      <p className={styles.empty}>
        You are not in an organization yet. An invitation link puts you in one.
      </p>
    );
  }
  return (
    <ul className={styles.orgs}>
      {memberships.map((membership) => (
        <li key={membership.orgId}>
          <span className={styles.name}>{membership.orgName}</span>
          <span className={styles.role}>{membership.role}</span>
          {membership.orgId === currentOrgId ? (
            <span className={styles.thisOne}>showing now</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await accountContext(ACCOUNT_PATH);
  const db = await getDb();
  const [sessions, events, query] = await Promise.all([
    listSessions(db, context.session.user.id, context.session.session.id),
    accountEvents(db, context.session.user.id),
    searchParams,
  ]);
  const notice = typeof query.notice === "string" ? query.notice : undefined;
  const user = context.session.user;

  return (
    <ConsoleShell
      context={context}
      title={ACCOUNT_SURFACE.label}
      meta={
        <>
          {sessions.length} {sessions.length === 1 ? "browser" : "browsers"} signed in
        </>
      }
    >
      <Notice code={notice} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>You</h2>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Name</dt>
            <dd>{user.display_name || "not set"}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd className={styles.address}>{user.email}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{new Date(user.created_at).toISOString().slice(0, 10)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Organizations</h2>
          {/*
            **The switcher sentence is only true when there is a switcher.** A
            person in no organization, and a person in exactly one, both see a
            masthead with nothing to switch between — and the first of those
            reads the next line telling them they are in none. Found by looking
            at the page as somebody with no membership, which §10.7 5A.4 makes an
            ordinary state rather than an edge case.
          */}
          <p className={styles.sectionNote}>
            {context.session.memberships.length > 1
              ? "Everything on Cloud belongs to an organization. The switcher at the top of the page chooses which of yours you are looking at."
              : "Everything on Cloud belongs to an organization."}
          </p>
        </div>
        <Organizations
          memberships={context.session.memberships}
          currentOrgId={context.membership?.orgId ?? null}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Browsers signed in</h2>
          <p className={styles.sectionNote}>
            One row per browser. Signing one out takes effect on its very next request — there is no
            cache in front of it and nothing to wait for. A browser signs itself out after{" "}
            {SESSION_IDLE_DAYS} days unused, and every browser after {SESSION_TTL_DAYS} days
            whatever it does. We do not keep the addresses these were used from.
          </p>
        </div>
        <Sessions sessions={sessions} />
        <form method="post" action="/api/auth/signout" className={styles.everywhere}>
          <input type="hidden" name="scope" value="all" />
          <button type="submit" className={styles.dangerButton}>
            Sign out everywhere
          </button>
          <span className={styles.sectionNote}>
            Ends every browser above, including this one. This is the one to use if a device is lost.
          </span>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Recent activity</h2>
          <p className={styles.sectionNote}>
            Sign-ins and sign-outs on your account. If something here was not you, sign out
            everywhere and then sign back in.
          </p>
        </div>
        <Activity events={events} />
      </section>

      <AreaOutline area={ACCOUNT_SURFACE} />
    </ConsoleShell>
  );
}
