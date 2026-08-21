import { redirect } from "next/navigation";
import { githubConfigured } from "argus-cloud/githubOauth.js";
import { readTheme } from "../../lib/theme";
import { currentSession, safeNext } from "../../lib/session";
import { AFTER_SIGN_IN } from "../../lib/authRoutes";
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

  return (
    <div className={styles.page} data-theme={theme ?? undefined}>
      <main className={styles.card}>
        <span className={styles.mark}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.onLight} src="/normascope-cloud.svg" alt="Normascope Cloud" width={140} height={44} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.onDark} src="/normascope-cloud-light.svg" alt="" aria-hidden="true" width={140} height={44} />
        </span>

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
      </main>
    </div>
  );
}
