import styles from "./session-controls.module.css";

/**
 * Sign out, and sign out everywhere.
 *
 * **This exists because the session layer shipped without it**, which meant a
 * signed-in person had no way to stop being signed in — the route was built and
 * tested and nothing on any page reached it. PATHWAYS §10.7 5A.8 lists both as
 * launch defaults; a session with a ninety-day life and no exit is not one of
 * them.
 *
 * **Two plain forms, no JavaScript.** They post to a route that checks
 * `Sec-Fetch-Site`, which is the CSRF half `SameSite=Lax` does not cover, and
 * `form-action 'self'` in the strict CSP already permits exactly this. The
 * theme switch on the same page works the same way and for the same reasons.
 *
 * **"Everywhere" is the one that matters after a lost laptop**, so it does not
 * depend on that laptop checking in: it revokes every row for the user, and the
 * next request from any device resolves to nothing.
 */
export function SessionControls({ signedInAs }: { signedInAs: string }) {
  return (
    <div className={styles.bar}>
      <span className={styles.who}>{signedInAs}</span>
      <form method="post" action="/api/auth/signout">
        <button className={styles.action} type="submit">
          Sign out
        </button>
      </form>
      <form method="post" action="/api/auth/signout">
        <input type="hidden" name="scope" value="all" />
        <button className={styles.action} type="submit">
          Sign out everywhere
        </button>
      </form>
    </div>
  );
}
