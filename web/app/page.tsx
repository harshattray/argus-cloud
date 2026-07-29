export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 28 }}>Normascope Cloud</h1>
      <p style={{ opacity: 0.8, lineHeight: 1.6 }}>
        Hosted visual-diff reports, trends, and metered explain. Upload runs with{" "}
        <code>norma compare --upload</code> using your org API key; reports live at <code>/r/&lt;runId&gt;</code>.
      </p>
    </main>
  );
}
