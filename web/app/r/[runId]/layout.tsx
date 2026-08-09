import type { ReactNode } from "react";

/**
 * Report-page chrome. These styles used to live on the root `<body>`; they
 * moved here when the marketing site landed, so the two surfaces stop sharing
 * a palette. Visually identical to what this page rendered before.
 *
 * Report pages are share-token gated and must never be indexed.
 */

export const metadata = {
  title: "Run report — Normascope Cloud",
  robots: { index: false, follow: false },
};

export default function ReportLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "#101014",
        color: "#e8e6e1",
        minHeight: "100vh",
      }}
    >
      {children}
    </div>
  );
}
