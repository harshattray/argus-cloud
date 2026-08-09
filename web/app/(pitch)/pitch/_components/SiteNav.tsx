"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PITCH_NAV_LINKS } from "../../../../lib/site";
import { Wordmark } from "./primitives";

/** Sticky site nav with a scroll-progress rule. The waitlist CTA rides along
 *  on every public page — it is the site's only conversion (§11).
 *
 *  The link row appears at `lg`, not `md`. Seven labels plus the wordmark, the
 *  divider and the CTA need ~828px of nav; switching them on at 768px overflowed
 *  the bar on tablets and small laptop windows. The measurement is worth keeping
 *  in mind if a nav item is ever added: the collapsed menu below already lists
 *  everything, so raising the breakpoint costs nothing, while squeezing padding
 *  to fit only buys ~30px. */
export function SiteNav() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A route change with the menu open would otherwise leave it hanging.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-paper/85 backdrop-blur-md border-b border-black/8">
      <div className="h-0.5 bg-black/5">
        <div
          className="h-full bg-gradient-to-r from-clay to-pink-500 transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <nav className="max-w-6xl mx-auto px-4 md:px-8 h-14 flex items-center gap-3">
        <Link href="/pitch" className="shrink-0 flex items-center gap-2" aria-label="Normascope — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/normascope-icon.svg" alt="" className="h-6 w-6 rounded-[7px]" />
          <Wordmark size="sm" className="hidden sm:flex" />
        </Link>

        <span className="hidden lg:block w-px h-4 bg-black/10 shrink-0" />

        <div className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0">
          {PITCH_NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                  active ? "text-text bg-black/6" : "text-text/50 hover:text-text hover:bg-black/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Link
            href="/cloud#waitlist"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#111] text-white px-3.5 py-2 text-xs font-bold hover:bg-black transition-colors"
          >
            Join early access
          </Link>

          <button
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden p-2 -mr-2 text-text/60 hover:text-text"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {open ? <path d="M18 6L6 18M6 6l12 12" /> : <><path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" /></>}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div id="site-menu" className="lg:hidden border-t border-black/8 px-4 py-3 flex flex-col gap-0.5">
          {PITCH_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-2.5 rounded-md text-sm font-bold text-text/70 hover:text-text hover:bg-black/5"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/cloud#waitlist"
            className="mt-1.5 rounded-lg bg-[#111] text-white px-3 py-2.5 text-sm font-bold text-center"
          >
            Join early access
          </Link>
        </div>
      )}
    </header>
  );
}
