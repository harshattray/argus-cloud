import Link from "next/link";
import { ACCOUNT_PATH } from "argus-cloud/consoleIA.js";
import styles from "../../_styles/surface.module.css";

/**
 * Who you are signed in as, and the two ways to stop being.
 *
 * ── What this replaces, and why it was wrong ────────────────────────────────
 *
 * A strip under the footer rule reading `name · Sign out · Sign out everywhere`
 * — three items in a row, on the last line of the card, with no bottom padding,
 * so the text sat directly on the card's cut edge.
 *
 * Two failures, and the second is the one that matters.
 *
 * **Two sign-outs side by side made the reader choose without telling them what
 * they were choosing between.** They are genuinely different — one ends this
 * session, the other revokes every row for the user, which is what you want
 * after losing a laptop — and presented as twin links a foot apart, the
 * difference is a guess. In a menu the second one gets a line of explanation
 * underneath it, which is all it ever needed.
 *
 * **And nobody looks at the bottom-left of a card for their account.** It is
 * the top-right, on every product anyone has used, which is where this now is.
 * That is also why the button carries a filled avatar and a chevron rather than
 * being a bare word: the avatar is the thing the eye finds without reading, and
 * the chevron is what says a menu opens.
 *
 * ── The mechanism is the explainer's, for the same three reasons ────────────
 *
 * Native `popover`, no client JavaScript, no inline styles. See
 * `explainer.tsx`, which carries the full reasoning; the third reason applies
 * with particular force here: `.card` is `overflow: hidden` and this control
 * lives in the masthead at the top of it, so an absolutely-positioned menu
 * would be clipped by its own container. A popover renders in the top layer and
 * brings light dismiss, Escape and focus handling with it.
 *
 * ── Both actions stay plain form posts ──────────────────────────────────────
 *
 * They post to a route that checks `Sec-Fetch-Site`, which is the CSRF half
 * `SameSite=Lax` does not cover, and `form-action 'self'` in the strict CSP
 * already permits exactly this. Moving them into a menu changed the chrome
 * around them and nothing about the request.
 */
const PersonIcon = () => (
  <svg className={styles.accountAvatarIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5.4" r="2.9" fill="currentColor" />
    <path d="M2.6 14.2a5.4 5.4 0 0 1 10.8 0Z" fill="currentColor" />
  </svg>
);

const ChevronIcon = () => (
  <svg className={styles.accountChevron} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 6.2 8 10.2l4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One per page. The id is fixed because a page has one signed-in person. */
const MENU_ID = "cloud-account-menu";

export function AccountMenu({ signedInAs }: { signedInAs: string }) {
  return (
    <>
      <button
        type="button"
        className={styles.accountButton}
        popoverTarget={MENU_ID}
        aria-haspopup="menu"
      >
        <span className={styles.accountAvatar} aria-hidden="true">
          <PersonIcon />
        </span>
        {/*
          The name is the button's accessible name on its own, which is thin —
          so the visually hidden word in front of it says what pressing the
          button does. "Account: ada@example.com", not "ada@example.com".
        */}
        <span className={styles.visuallyHidden}>Account:</span>
        <span className={styles.accountName}>{signedInAs}</span>
        <ChevronIcon />
      </button>

      <div id={MENU_ID} popover="auto" className={styles.accountMenu}>
        {/*
          The name again, in full and unclipped. The button truncates at 18
          characters and an email address is usually longer than that, so this
          is the only place the whole thing is legible.
        */}
        <p className={styles.accountMenuWho}>
          Signed in as
          <strong>{signedInAs}</strong>
        </p>

        {/*
          The page this menu deliberately is not. The two forms below *end*
          sessions; the account page is where they can be *seen* first — which
          browser, on what, last used when — and it is the only entry point to
          it, because the page belongs to a person rather than to one of the
          console's seven organization areas and so has no navigation item.
        */}
        <Link href={ACCOUNT_PATH} className={styles.accountMenuItem}>
          Your account
          <span className={styles.accountMenuHint}>
            Your organizations, and every browser signed in as you.
          </span>
        </Link>

        <form method="post" action="/api/auth/signout">
          <button className={styles.accountMenuItem} type="submit">
            Sign out
          </button>
        </form>

        {/*
          The one that matters after a lost laptop, so it does not depend on
          that laptop checking in: it revokes every row for the user, and the
          next request from any device resolves to nothing. The hint is here
          because that is not guessable from four words.
        */}
        <form method="post" action="/api/auth/signout">
          <input type="hidden" name="scope" value="all" />
          <button className={styles.accountMenuItem} type="submit">
            Sign out everywhere
            <span className={styles.accountMenuHint}>
              Ends this session and every other one, on every device.
            </span>
          </button>
        </form>
      </div>
    </>
  );
}
