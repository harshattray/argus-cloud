import type { ReactNode } from "react";
import type { Metadata } from "next";

/**
 * `/pitch` root — metadata only, no chrome.
 *
 * The chrome (nav, footer) belongs to `(deep)/layout.tsx` so that the unlock
 * screen can render without it. A door should not display the nav of the rooms
 * behind it.
 *
 * `noindex` is declared here so it applies to every page in the tree including
 * the unlock screen, and is set again as a response header in `middleware.ts` —
 * a crawler that somehow reaches this material should be told twice.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PitchRootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
