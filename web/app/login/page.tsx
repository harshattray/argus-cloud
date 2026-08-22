import Link from "next/link";
import { redirect } from "next/navigation";
import { githubConfigured } from "argus-cloud/githubOauth.js";
import { readTheme } from "../../lib/theme";
import { currentSession, safeNext } from "../../lib/session";
import { devSignInEmail } from "../../lib/devSignIn";
import { AFTER_SIGN_IN } from "../../lib/authRoutes";
import { YuticEndorsement } from "../_components/YuticEndorsement";
import { CloudTwin } from "../_components/cloud/empty-state";
import { ThemeSwitch } from "../_components/cloud/theme-switch";
import { SignInForm } from "./sign-in-form";
import styles from "./login.module.css";

/**
 * Sign in — FUTURENORMA §4 Step 6.
 *
 * **Both methods, side by side, and neither is the "other" one.** GitHub is the
 * developer path; the emailed link is how a designer or a PM gets in without a
 * GitHub account, which §4 Step 6 calls a real differentiator rather than a
 * detail. Presenting the link as a fallback under "trouble signing in?" would
 * quietly make the differentiator into an apology.
 *
 * **Nothing here reveals who has an account.** The form's response is the same
 * sentence whatever is typed into it, and the page renders no list, no count and
 * no organization name. The only strings on it are ones we wrote.
 *
 * Dynamically rendered because it reads the session cookie — someone who is
 * already signed in is sent on rather than shown a form they do not need.
 *
 * ── The page around the card (2026-08-22) ───────────────────────────────────
 *
 * This was a card alone on a colour, and it had two holes in it. There was **no
 * way back to the site**: the wordmark was an `<img>`, so somebody who reached
 * `/login` from an old bookmark or a spent link had the browser's Back button
 * and nothing else. And there was **no theme switch**, which the person only
 * discovered existed after signing in — the one page a new customer meets
 * before anything else was the one page whose colours they could not set.
 *
 * So the card now sits inside the same three parts every other Cloud page has:
 * a masthead row, the body, a footer. It is not `CloudMasthead` / `CloudFooter`
 * — those two draw the *edges of a sheet*, with the borders and the inset
 * padding to match, and this surface has no sheet. What is shared is what
 * matters: the wordmark pair, the theme switch, the endorsement, and the
 * three-state cascade in `surface.module.css` that picks the right file for the
 * ground.
 *
 * **The wordmark is the way home**, which is the convention every site header
 * already uses, so nothing has to be labelled. The footer repeats it in words
 * for anyone who does not read a logo as a link.
 *
 * **The figure is `key`, a new pose.** A placement takes a pose of its own
 * (`normascopeWeb.md` §5). It is a plain `CloudTwin` and carries no `get cloud`
 * sticker: the sign-in page is for people who already have an account, and the
 * one line here aimed at anyone else is the footnote at the bottom of the card.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — Normascope Cloud",
  robots: { index: false, follow: false },
};

/**
 * The refusals worth naming, and what each one tells the person to do.
 *
 * None of them says anything about another account. "link" is the one that
 * needed thought: a GitHub account nobody has connected is a dead end unless the
 * page says how to get out of it, and the way out is the email form directly
 * above the message.
 */
const ERRORS: Record<string, string> = {
  link: "That GitHub account isn't connected to a Normascope account yet. Sign in with your work email first, then connect GitHub from your account settings.",
  // One sentence for every way a link can fail — spent, expired, unknown, no
  // longer eligible. Saying which would confirm that the token was once real.
  "link-expired": "That sign-in link has already been used or has expired. Ask for a new one below.",
  invitation: "That invitation link has already been used, been withdrawn, or expired. Ask whoever invited you to send another.",
  cancelled: "GitHub sign-in was cancelled.",
  github: "GitHub sign-in didn't complete. Try again, or use a link by email.",
  throttled: "Too many sign-in attempts from here. Wait a few minutes and try again.",
  session: "You've been signed out. Sign in again to continue.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const theme = await readTheme();
  const destination = safeNext(next, AFTER_SIGN_IN);

  const session = await currentSession();
  const message = error ? (ERRORS[error] ?? null) : null;

  // Signed in and nothing to say: they do not need a sign-in form.
  //
  // **Signed in *with* something to say: say it.** Redirecting unconditionally
  // swallowed the one case that matters — a GitHub link refused for an
  // already-signed-in person bounced through here and landed back on /repos
  // looking exactly like success. The refusal is correct and the silence was
  // not: somebody would click it three times and never learn why.
  if (session && !message) {
    redirect(destination);
  }
  const githubHref = `/api/auth/github/start?next=${encodeURIComponent(destination)}`;

  /* Where the theme switch sends the viewer back to. `destination` rather than
     the raw `next`, because `safeNext` has already refused anything that is not
     a same-site path — the theme route checks its own redirect target too, and
     this is the second of the two. The error code is dropped on purpose: it
     described the last attempt, and a colour change is not another one. */
  const themeNext = next ? `/login?next=${encodeURIComponent(destination)}` : "/login";

  /* Null on every deployment. `lib/devSignIn.ts` carries the locks. */
  const devEmail = devSignInEmail();

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <header className={styles.topbar}>
        {/* The wordmark is the way back to the public site — the convention a
            header already carries, so it needs no label beyond the alt text. */}
        <Link className={styles.home} href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.onLight} src="/normascope-cloud.svg" alt="Normascope Cloud" width={140} height={44} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.onDark} src="/normascope-cloud-light.svg" alt="Normascope Cloud" width={140} height={44} />
        </Link>
        <ThemeSwitch current={theme} next={themeNext} />
      </header>

      <div className={styles.middle}>
        <CloudTwin pose="key" className={styles.beside} />

        <main className={styles.card}>
          <h1 className={styles.title}>{session ? "That didn't work" : "Sign in"}</h1>
          <p className={styles.lede}>
            {session
              ? "You're still signed in — nothing has changed about your session."
              : "Normascope Cloud is for organizations with a subscription. If you were invited, use the address the invitation was sent to."}
          </p>

          {message && (
            <p className={styles.problem} role="status">
              {message}
            </p>
          )}

          {/* No sign-in form for someone who is already signed in; the only thing
              they need is the message above and the way back. */}
          {session ? (
            <a className={styles.secondary} href={destination}>
              Back to your organization
            </a>
          ) : (
            <SignInForm />
          )}

          {!session && githubConfigured() && (
            <>
              <div className={styles.divider}>or</div>
              {/* A link, not a form: the start route is a GET that only issues a
                  redirect and a state cookie, and it changes nothing that a
                  prefetch could damage. */}
              <a className={styles.secondary} href={githubHref} rel="nofollow">
                Continue with GitHub
              </a>
            </>
          )}

          {!session && (
          <p className={styles.footnote}>
            No account? Normascope Cloud is invitation and subscription only —{" "}
            <a href="/cloud">read what it does</a> or ask the person who set up your organization.
          </p>
          )}

          {/*
            The local door. Rendered only when `devSignInEmail()` returns an
            address, which it cannot do on a deployment — see `lib/devSignIn.ts`
            for the three locks.

            **It says the address, and it says it is local.** A nameless "skip
            sign-in" button is the kind of thing that gets screenshotted into a
            deck and then asked about; naming the account it signs you in as
            makes it obviously a development affordance rather than a hole
            somebody left open.
          */}
          {!session && devEmail && (
            <form method="post" action="/api/auth/dev-signin" className={styles.devDoor}>
              <input type="hidden" name="next" value={destination} />
              <p className={styles.devDoorNote}>Local development only — this door does not exist on a deployment.</p>
              <button className={styles.secondary} type="submit">
                Sign in as {devEmail}
              </button>
            </form>
          )}
        </main>
      </div>

      {/*
        The abridged footer: the way back in words, and the endorsement.

        Four links, not the site's full directory. A footer on a sign-in page is
        an exit, not a map — and the site's own footer is one link away through
        any of them. `/legal` is the index rather than the individual documents,
        so this list does not have to change when one is added.

        The endorsement appears once per surface, at the bottom, which is the
        half of the Yutic rules that has not changed — see `cloud-shell.tsx`.
      */}
      <footer className={styles.footer}>
        <nav className={styles.footerNav} aria-label="Normascope">
          <Link href="/">Home</Link>
          <Link href="/cloud">What Cloud does</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/legal">Legal</Link>
        </nav>
        <div className={styles.endorsement}>
          <span className={styles.onLight}>
            <YuticEndorsement tone="light" />
          </span>
          <span className={styles.onDark}>
            <YuticEndorsement tone="dark" />
          </span>
        </div>
      </footer>
    </div>
  );
}
