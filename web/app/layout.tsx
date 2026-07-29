import type { ReactNode } from "react";

export const metadata = {
  title: "Normascope Cloud",
  description: "Hosted visual-diff reports, trends, and explain",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          background: "#101014",
          color: "#e8e6e1",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
