import type { ReactNode } from "react";

/**
 * Report-page chrome.
 *
 * The palette used to be set here with an inline `style` on a wrapper `div`.
 * It moved into `report.module.css` with Phase H, so the page's appearance and
 * its layout come from one stylesheet — and so the strict CSP for this tree no
 * longer has to permit inline `<style>` elements. What remains inline is
 * computed geometry (a meter's width, a region's position); `middleware.ts`
 * records exactly what that costs.
 *
 * Report pages are share-token gated and must never be indexed.
 */

export const metadata = {
  title: "Run report — Normascope Cloud",
  robots: { index: false, follow: false },
};

export default function ReportLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
