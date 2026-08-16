import Link from "next/link";
import SiteLayout from "./(site)/layout";
import { Twin } from "./(site)/_components/twins";
import { NAV_LINKS } from "../lib/site";

/**
 * The 404.
 *
 * **Why it lives at the root and borrows the site's chrome.** Next only treats
 * `app/not-found.tsx` as the handler for a URL that matches no route at all; a
 * copy inside the `(site)` group would cover that group's own segments and
 * leave a typo'd top-level URL on the framework's bare default. But bare is
 * exactly the wrong thing to serve here — someone who mistypes a URL, or
 * follows a link to a page that has moved, arrives with no navigation, no
 * footer and no way onward. So the file sits at the root where it catches
 * everything, and renders the real `SiteLayout` around itself.
 *
 * Importing the layout rather than rebuilding a header keeps one source for
 * the chrome: the nav, the footer, the Cloud lockup and the analytics mount
 * all arrive with it, so a change to any of them reaches this page too.
 *
 * **It is deliberately counted.** Because the layout comes with it, a 404 is a
 * page view like any other — which is the point. A spike of them is how you
 * find out a link somewhere is wrong, and a 404 page that quietly excludes
 * itself from measurement is a broken link nobody reports.
 *
 * **No metadata export.** Next does not apply one from this file, and it does
 * not need it: the response carries a real 404 status, which is what tells a
 * crawler to drop the URL. A `noindex` tag would be belt on a belt.
 *
 * **The twin is the `empty` pose, and it is new.** The set's rule is eight
 * placements, eight poses, no pose twice, and a new placement takes a new pose
 * rather than borrowing one (`docs/normascopeWeb.md` §5). `shrug` was the
 * tempting shortcut and it already belongs to `/agents`. The new pose holds up
 * a frame with nothing in it — the whole set is two figures each reading their
 * own copy of the same page, and this is the one whose copy is blank. The
 * drawing carries the joke, so the words underneath do not have to.
 *
 * It is a plain `Twin`, not a `TwinLink`. Every other figure on the site wears
 * a `get cloud` sticker and goes to `/cloud`; selling the paid tier to someone
 * who has just hit a dead end is the wrong moment, and it would compete with
 * the one thing this page owes them, which is a way back.
 */
export const metadata = { title: "Page not found — Normascope" };

export default function NotFound() {
  return (
    <SiteLayout>
      <section className="w-full bg-paper px-4 text-text md:px-8">
        <div className="mx-auto max-w-2xl py-20 md:py-28">
          <div className="sm:flex sm:items-end sm:justify-between sm:gap-10">
            <div className="min-w-0">
              <p className="eyebrow text-clay">Error 404</p>
              <h1 className="mt-3 mb-4 text-[32px] leading-tight font-semibold md:text-[40px]">
                Nothing here to compare
              </h1>
              <p className="max-w-md text-[15px] leading-relaxed text-text/60">
                This page does not exist — it may have moved, or the address may have a typo in it.
                Everything on the site is one link away below.
              </p>
            </div>
            {/* Not a `TwinLink`: see the note above. `w-32` clears the floor
                for a legible frame, and it carries no sticker, so the rule
                about `w-20` does not apply. */}
            <Twin
              pose="empty"
              className="mt-8 ml-auto block w-32 shrink-0 sm:mt-0 sm:w-36"
            />
          </div>

          <nav aria-label="All pages" className="mt-12 border-t border-black/8 pt-8">
            <p className="eyebrow mb-4 text-text/35">Every page</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {/* Built from the same `NAV_LINKS` the header and footer use, so
                  a page added or renamed cannot leave this list stale — which
                  would be a dead end inside a dead end. */}
              {[{ href: "/", label: "Home" }, ...NAV_LINKS].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-xl border border-black/8 px-5 py-3.5 text-[15px] font-semibold transition-colors hover:border-black/20"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="mt-8 text-[13.5px] leading-relaxed text-text/45">
            Looking for something that used to be here? Email{" "}
            <a href="mailto:waitlist@normascope.com" className="underline underline-offset-2 hover:text-text/70">
              waitlist@normascope.com
            </a>
            .
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}
