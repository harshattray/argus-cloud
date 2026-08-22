import { listApiKeys, type ApiKeySummary } from "argus-cloud/apiKeys.js";
import { listInvitations, INVITE_TTL_DAYS, type Invitation } from "argus-cloud/invitations.js";
import { membersOf, ROLES, type OrgMember, type Role } from "argus-cloud/users.js";
import { getDb } from "../../lib/db";
import { consoleContext } from "../../lib/console";
import { orgActionPath } from "argus-cloud/consoleIA.js";
import { type OrgNotice } from "../../lib/orgAdmin";
import { readKeyReveal } from "../../lib/keyReveal";
import { AreaOutline, ConsoleGate, ConsoleShell } from "../_components/cloud/console-shell";
import styles from "./organization.module.css";

/**
 * Organization — who is in it, what they may do, and which keys act for it.
 *
 * **The first area of the console with workflows in it**, and the reason it is
 * first is that its whole data layer was already written and unreachable:
 * `invitations.ts`, `users.ts` and `apiKeys.ts` had create, accept, revoke, list
 * and expire, with hashed single-use tokens and the ownership invariant, and no
 * HTTP route or page anywhere. An admin could not invite a colleague or mint an
 * upload key without a database client.
 *
 * **Every control here posts a form to `/api/organization/{action}` and gets a
 * 303 back.** No client JavaScript, for the reason the rest of this surface has
 * none: these pages run under a strict nonce policy, and a control that needs
 * scripting is a control that breaks the first time the policy tightens.
 *
 * **The page renders what the reader may act on, and the routes decide.** This
 * is a role-gated area, so a member never sees it — but hiding is a courtesy,
 * and `requireOrgAdmin` makes the same decision again for every write, from the
 * same `CONSOLE_AREAS` list this page guards from.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Organization — Normascope Cloud",
  robots: { index: false, follow: false },
};

/**
 * What just happened, in our words.
 *
 * **The query string chooses a sentence; it never supplies one.** An
 * unrecognised code renders nothing. The tenant-gate check has already been
 * green for the wrong reason once because a page reflected the requester's own
 * query string back at them — a message a stranger can write is a message that
 * can say anything.
 */
const NOTICES: Record<OrgNotice, { tone: "good" | "bad"; text: string }> = {
  invited: { tone: "good", text: "Invitation sent. The link works once and expires in two weeks." },
  "invite-budget": {
    tone: "bad",
    text: "Not sent — this organization has reached its invitation limit for today. Try again tomorrow.",
  },
  "invite-unsent": {
    tone: "bad",
    text: "The invitation exists but the email did not go out. Send it again — that replaces the old link.",
  },
  "invite-revoked": { tone: "good", text: "Invitation revoked. That link no longer works." },
  "invite-gone": { tone: "bad", text: "That invitation was already accepted, revoked or expired." },
  "role-changed": { tone: "good", text: "Role changed. It applies on their next request." },
  "member-removed": { tone: "good", text: "Removed. Their access ends on their next request." },
  "member-gone": { tone: "bad", text: "That person is no longer in this organization." },
  "last-admin": { tone: "bad", text: "An organization must keep at least one admin." },
  "is-owner": { tone: "bad", text: "The owner is always an admin. Transfer ownership first." },
  "key-created": { tone: "good", text: "Key created. It is shown once, below." },
  "key-revoked": { tone: "good", text: "Key revoked. It stops working on the very next request." },
  "key-gone": { tone: "bad", text: "That key was already revoked." },
  "not-entitled": { tone: "bad", text: "This plan cannot hold an upload key." },
  "bad-email": { tone: "bad", text: "That does not look like an email address." },
  "bad-role": { tone: "bad", text: "Pick a role: admin, member or designer." },
  "already-member": { tone: "bad", text: "They are already in this organization — change their role instead." },
};

function Notice({ code }: { code: string | undefined }) {
  const notice = code && Object.prototype.hasOwnProperty.call(NOTICES, code) ? NOTICES[code as OrgNotice] : null;
  if (!notice) {
    return null;
  }
  return (
    <p className={notice.tone === "good" ? styles.noticeGood : styles.noticeBad} role="status">
      {notice.text}
    </p>
  );
}

function relative(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expired";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** A role picker that submits itself, so the row needs no scripting to work. */
function RoleForm({ member, canChange }: { member: OrgMember; canChange: boolean }) {
  if (!canChange) {
    return <span className={styles.roleFixed}>{member.role}</span>;
  }
  return (
    <form method="post" action={orgActionPath("member-role")} className={styles.inlineForm}>
      <input type="hidden" name="userId" value={member.userId} />
      <label className={styles.srOnly} htmlFor={`role-${member.userId}`}>
        Role for {member.displayName}
      </label>
      <select id={`role-${member.userId}`} name="role" defaultValue={member.role} className={styles.select}>
        {ROLES.map((role: Role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <button type="submit" className={styles.quietButton}>
        Change
      </button>
    </form>
  );
}

/**
 * The members table.
 *
 * **The owner's row has no controls**, because both of the things you could do
 * to it are refused by the database anyway (§10.7 5A.5: the owner is always an
 * admin, and cannot be removed). Drawing a select and a button that always fail
 * would be an interface that lies about what it can do; the row says *owner* and
 * points at the one flow that changes it.
 *
 * **Your own row keeps its controls.** An admin stepping down or leaving is a
 * real thing to want, and the last-admin refusal already stops the version of it
 * that would strand the organization.
 */
function Members({ members, signedInUserId }: { members: OrgMember[]; signedInUserId: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Role</th>
            <th scope="col">Joined</th>
            <th scope="col">Last signed in</th>
            <th scope="col" className={styles.actionCol}>
              <span className={styles.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.userId}>
              <td>
                <span className={styles.name}>{member.displayName}</span>
                {member.userId === signedInUserId ? <span className={styles.you}>you</span> : null}
                {member.isOwner ? <span className={styles.ownerTag}>owner</span> : null}
                <span className={styles.address}>{member.email}</span>
              </td>
              <td>
                <RoleForm member={member} canChange={!member.isOwner} />
              </td>
              <td className={styles.muted}>{relative(member.joinedAt)}</td>
              <td className={styles.muted}>{relative(member.lastLoginAt)}</td>
              <td className={styles.actionCol}>
                {member.isOwner ? (
                  <span className={styles.muted}>—</span>
                ) : (
                  <form method="post" action={orgActionPath("member-remove")}>
                    <input type="hidden" name="userId" value={member.userId} />
                    <button type="submit" className={styles.dangerButton}>
                      Remove
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Invitations({ invitations }: { invitations: Invitation[] }) {
  const live = invitations.filter((i) => i.state === "pending");
  const resolved = invitations.filter((i) => i.state !== "pending").slice(0, 10);
  return (
    <>
      {live.length === 0 ? (
        <p className={styles.empty}>No invitations are waiting to be accepted.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Invited</th>
                <th scope="col">Role</th>
                <th scope="col">Sent</th>
                <th scope="col">Expires</th>
                <th scope="col" className={styles.actionCol}>
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {live.map((invite) => (
                <tr key={invite.id}>
                  <td className={styles.address}>{invite.email}</td>
                  <td>{invite.role}</td>
                  <td className={styles.muted}>{relative(invite.createdAt)}</td>
                  <td className={styles.muted}>{daysUntil(invite.expiresAt)}</td>
                  <td className={styles.actionCol}>
                    <form method="post" action={orgActionPath("invite-revoke")}>
                      <input type="hidden" name="id" value={invite.id} />
                      <button type="submit" className={styles.dangerButton}>
                        Revoke
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolved.length > 0 ? (
        <ul className={styles.history}>
          {resolved.map((invite) => (
            <li key={invite.id}>
              <span className={styles.address}>{invite.email}</span> — {invite.state}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/**
 * The one render in which a key's plaintext exists on our side of the wire.
 *
 * It is not stored, not recoverable and not shown again — `createApiKey` keeps
 * only a sha256 of it. `keyReveal.ts` explains what carries it across the
 * redirect and what that costs.
 */
function RevealedKey({ plaintext }: { plaintext: string }) {
  return (
    <div className={styles.reveal}>
      <p className={styles.revealTitle}>Copy this key now. It will not be shown again.</p>
      <code className={styles.revealValue}>{plaintext}</code>
      <p className={styles.revealBody}>
        We keep only a hash of it, so we cannot show it to you later and cannot recover it if it is
        lost. If that happens, revoke it and create another.
      </p>
      <form method="post" action={orgActionPath("key-hide")}>
        <button type="submit" className={styles.quietButton}>
          I&apos;ve saved it
        </button>
      </form>
    </div>
  );
}

function Keys({ keys }: { keys: ApiKeySummary[] }) {
  if (keys.length === 0) {
    return <p className={styles.empty}>No keys. Uploading from a project or from CI needs one.</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">Kind</th>
            <th scope="col">Created</th>
            <th scope="col">By</th>
            <th scope="col" className={styles.actionCol}>
              <span className={styles.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td className={styles.name}>{key.label || "(no label)"}</td>
              <td>{key.kind}</td>
              <td className={styles.muted}>{relative(key.created_at)}</td>
              <td className={styles.muted}>{key.created_by_name ?? "not recorded"}</td>
              <td className={styles.actionCol}>
                <form method="post" action={orgActionPath("key-revoke")}>
                  <input type="hidden" name="id" value={key.id} />
                  <button type="submit" className={styles.dangerButton}>
                    Revoke
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

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await consoleContext("organization", "/organization");
  if (context.kind !== "ok") {
    return <ConsoleGate context={context} />;
  }

  const db = await getDb();
  const orgId = context.membership.orgId;
  const [members, invitations, keys, reveal, query] = await Promise.all([
    membersOf(db, orgId),
    listInvitations(db, orgId),
    listApiKeys(db, { orgId }),
    readKeyReveal(),
    searchParams,
  ]);
  const notice = typeof query.notice === "string" ? query.notice : undefined;

  return (
    <ConsoleShell
      context={context}
      title={context.area.label}
      meta={
        <>
          {members.length} {members.length === 1 ? "person" : "people"}
        </>
      }
    >
      <Notice code={notice} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Members</h2>
          <p className={styles.sectionNote}>
            A role change or a removal takes effect on that person&apos;s next request — there is no
            cache in front of it and nothing to wait for.
          </p>
        </div>
        <Members members={members} signedInUserId={context.session.user.id} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Invitations</h2>
          <p className={styles.sectionNote}>
            A link works once, only for the address it was sent to, and expires after{" "}
            {INVITE_TTL_DAYS} days. Inviting the same address again replaces the old link rather than
            adding a second one. A designer does not need a GitHub account.
          </p>
        </div>
        <form method="post" action={orgActionPath("invite")} className={styles.inviteForm}>
          <label className={styles.srOnly} htmlFor="invite-email">
            Email address to invite
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="colleague@company.com"
            className={styles.input}
          />
          <label className={styles.srOnly} htmlFor="invite-role">
            Role
          </label>
          <select id="invite-role" name="role" defaultValue="member" className={styles.select}>
            {ROLES.map((role: Role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.button}>
            Send invitation
          </button>
        </form>
        <Invitations invitations={invitations} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Keys</h2>
          <p className={styles.sectionNote}>
            Keys belong to the organization, not to the person who made one, and they keep working
            when that person leaves. Prefer one key per pipeline or agent, so revoking one stops one
            thing. Never put a key where a browser session belongs, or the other way round.
          </p>
        </div>
        {reveal ? <RevealedKey plaintext={reveal.plaintext} /> : null}
        <form method="post" action={orgActionPath("key-create")} className={styles.inviteForm}>
          <label className={styles.srOnly} htmlFor="key-label">
            What this key is for
          </label>
          <input
            id="key-label"
            name="label"
            required
            maxLength={80}
            autoComplete="off"
            placeholder="CI for the marketing site"
            className={styles.input}
          />
          <label className={styles.srOnly} htmlFor="key-kind">
            Kind
          </label>
          <select id="key-kind" name="kind" defaultValue="upload" className={styles.select}>
            <option value="upload">upload</option>
            <option value="agent">agent</option>
          </select>
          <button type="submit" className={styles.button}>
            Create key
          </button>
        </form>
        <Keys keys={keys} />
      </section>

      {/* No section wrapper: `AreaOutline` brings its own padding and rule, and
          nesting it inside one indented it a second time. */}
      <AreaOutline area={context.area} />
    </ConsoleShell>
  );
}
