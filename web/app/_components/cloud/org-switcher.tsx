import type { Membership } from "argus-cloud/users.js";
import styles from "./console-shell.module.css";
import surface from "../../_styles/surface.module.css";

/**
 * Which organization the console is looking at, and how to look at another.
 *
 * **One membership is not a switcher.** A control that opens a menu with one
 * item in it teaches the reader that there is a choice to make, and then does
 * not offer one — most customers own exactly one organization, so that is the
 * common case, and it renders as a plain name. The menu only exists when there
 * is somewhere to go.
 *
 * **The mechanism is the account menu's**, and for its third reason in
 * particular: this sits in the masthead, inside `.card`'s `overflow: hidden`,
 * so a positioned `<div>` would be clipped by the sheet's own top edge. Native
 * `popover` renders in the top layer and brings light dismiss, Escape and focus
 * handling with it, with no client JavaScript.
 *
 * Each row is a form post to `/api/org`, which checks the membership before it
 * writes the cookie. The page will check it again when it reads it; see the
 * route for why both.
 */

const MENU_ID = "cloud-org-switcher";

const ChevronIcon = () => (
  <svg className={surface.accountChevron} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 6.2 8 10.2l4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function OrgSwitcher({
  current,
  memberships,
  path,
}: {
  current: Membership;
  memberships: Membership[];
  /** Where to come back to after switching — the page you were on. */
  path: string;
}) {
  if (memberships.length < 2) {
    return <span className={styles.orgName}>{current.orgName}</span>;
  }

  return (
    <>
      <button type="button" className={styles.orgButton} popoverTarget={MENU_ID} aria-haspopup="menu">
        <span className={surface.visuallyHidden}>Organization:</span>
        <span className={styles.orgName}>{current.orgName}</span>
        <ChevronIcon />
      </button>

      <div id={MENU_ID} popover="auto" className={surface.accountMenu}>
        <p className={surface.accountMenuWho}>
          Switch organization
          <strong>{memberships.length} memberships</strong>
        </p>
        {memberships.map((m) => (
          <form key={m.orgId} method="post" action="/api/org">
            <input type="hidden" name="orgId" value={m.orgId} />
            <input type="hidden" name="next" value={path} />
            <button
              className={surface.accountMenuItem}
              type="submit"
              aria-current={m.orgId === current.orgId ? "true" : undefined}
            >
              {m.orgName}
              <span className={surface.accountMenuHint}>
                {m.orgId === current.orgId ? `${m.role} · currently open` : m.role}
              </span>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
