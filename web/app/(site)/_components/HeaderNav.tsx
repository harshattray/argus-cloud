"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The header's navigation strip.
 *
 * A client component for one reason: the bar had no active state, so nothing
 * told a visitor which of five sections they were reading.
 *
 * Below `md` the strip moves to its own row and scrolls horizontally rather
 * than collapsing behind a menu button. Five short labels fit in a swipe or
 * two, and a hamburger would hide the site's entire structure behind a tap on
 * exactly the screens where a visitor is least likely to go looking for it.
 * Sharing the top row with the brand and the waitlist badge was tried first and
 * left the strip about 120px wide, clipped mid-word — unusable. `Cloud` joins
 * the strip at that size, because the lockup it normally links from is hidden
 * below `md`.
 */
export const HeaderNav = ({
  links,
  className = "",
}: {
  links: readonly { href: string; label: string }[];
  className?: string;
}) => {
  const pathname = usePathname();
  const strip = useRef<HTMLDivElement>(null);

  /* Bring the current page's chip into view on arrival. The strip is wider than
     a phone, so on `/guide` or `/cloud` the one label that tells you where you
     are starts off-screen — the bar looks like it begins at "The report" and
     ends mid-word. Scrolling the strip, not the page, so nothing else moves. */
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !strip.current) return;

    const { offsetLeft, offsetWidth } = el;
    const { clientWidth } = strip.current;
    strip.current.scrollLeft = Math.max(0, offsetLeft + offsetWidth / 2 - clientWidth / 2);
  }, [pathname]);

  return (
    <div
      ref={strip}
      className={`scrollbar-none flex min-w-0 items-center overflow-x-auto ${className}`}
    >
      {links.map((link) => {
        const active = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors sm:px-2.5 ${
              active ? "text-text" : "text-text/50 hover:bg-black/5 hover:text-text"
            } ${link.href === "/cloud" ? "md:hidden" : ""}`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
};

/**
 * The Cloud lockup's link.
 *
 * It is the only header destination not represented by a text link at `md` and
 * up, so without this it would have been the one page in the site that gave no
 * indication you were on it. Active state here is opacity rather than colour —
 * the lockup carries its own colours and must not be recoloured.
 */
export const CloudLink = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  const active = usePathname() === "/cloud";

  return (
    <Link
      href="/cloud"
      aria-current={active ? "page" : undefined}
      className={`shrink-0 items-center transition-opacity ${
        active ? "opacity-100" : "opacity-70 hover:opacity-100"
      } ${className}`}
    >
      {children}
    </Link>
  );
};
