import type { ReactNode } from "react";
import Link from "next/link";
import type { Theme } from "../../../lib/theme";
import { YuticEndorsement } from "../YuticEndorsement";
import { ThemeSwitch } from "./theme-switch";
import styles from "../../_styles/surface.module.css";

/**
 * The chrome every signed-in Cloud page carries: a masthead with the product
 * wordmark, a breadcrumb, the theme switch — and a footer with the Yutic
 * endorsement.
 *
 * **Two assets are rendered twice each, and CSS hides one.** The wordmark and
 * the endorsement both have a light-ground and a dark-ground file, and the
 * theme has three states — light, dark, and "follow the device", where the
 * server cannot know which the viewer will get. Rendering both and hiding one
 * with `display: none` is what makes the *auto* case work without JavaScript.
 * `display: none` also removes the hidden copy from the accessibility tree, so
 * a screen reader reads one wordmark and one endorsement, not two.
 *
 * The dark-ground Yutic file is the brand book's own approved reversal, which
 * §01 names as the only sanctioned recolour of the mark — swapping files is
 * exactly what it asks for, and dimming or filtering one would not be.
 *
 * **The breadcrumb is owner-only.** A share token is a capability for one run;
 * a trail leading up to the repository would name it and offer a link the
 * holder cannot open. Callers pass an empty `crumbs` for share views, and get
 * a wordmark and nothing else.
 *
 * **`account` is a slot, and it is empty by default.** The masthead is on the
 * share-token report too, where there is no session to name and no session to
 * end — so the account menu is something a page passes in when it has resolved
 * one, not something this component reaches for. Same rule as the breadcrumb,
 * one level up: the chrome does not decide who the reader is.
 */

export interface Crumb {
  label: string;
  /** Omitted for the current page, which is not a link to itself. */
  href?: string;
}

export function CloudMasthead({
  title,
  crumbs = [],
  meta,
  theme,
  path,
  account,
  context,
}: {
  title: string;
  crumbs?: Crumb[];
  /** The line under the title — run metadata, counts, whatever the page owns. */
  meta?: ReactNode;
  theme: Theme | null;
  /** Where the theme switch should send the viewer back to. */
  path: string;
  /**
   * The account menu, for pages that resolved a session. Omitted on the
   * share-token report, which has a reader but not a user.
   */
  account?: ReactNode;
  /**
   * The organization context row and the console navigation, for pages inside
   * the console. A second slot for the same reason as `account`: the report
   * page has a reader, one run, and no organization to name — so what goes here
   * is passed in by whoever resolved one, not reached for from here.
   */
  context?: ReactNode;
}) {
  return (
    <header className={styles.masthead}>
      <div className={styles.mastheadTop}>
        <span className={styles.wordmark}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.onLight} src="/normascope-cloud.svg" alt="Normascope Cloud" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.onDark} src="/normascope-cloud-light.svg" alt="Normascope Cloud" />
        </span>
        <div className={styles.mastheadTools}>
          <ThemeSwitch current={theme} next={path} />
          {account}
        </div>
      </div>

      {context}

      {crumbs.length > 0 && (
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <ol>
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`}>
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <h1 className={styles.title}>{title}</h1>
      {meta && <p className={styles.runmeta}>{meta}</p>}
    </header>
  );
}

/**
 * The footer, and the one place on a Cloud page the parent brand appears.
 *
 * `yutic-brand-rules.txt` §09 previously read "never in product headers or app
 * UI"; Harsha decided on 2026-08-20 that the endorsement belongs on every
 * surface, and the rules file was updated in the same change so the book and
 * the code say the same thing. It stays out of the *header* either way — once
 * per surface, at the bottom, which is the half of §09 that did not change.
 */
export function CloudFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className={styles.footer}>
      {children && <p className={styles.footerLine}>{children}</p>}
      <div className={styles.endorsement}>
        <span className={styles.onLight}>
          <YuticEndorsement tone="light" />
        </span>
        <span className={styles.onDark}>
          <YuticEndorsement tone="dark" />
        </span>
      </div>
    </footer>
  );
}
