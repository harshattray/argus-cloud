/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build run without fighting a live `next dev` over
  // `.next` — the two clobber each other's chunks and the build fails with a
  // missing vendor-chunk. Unset in normal use, so deploys are unaffected.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  // Native/WASM database drivers must not be bundled by webpack/turbopack.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "argus-cloud"],
  async headers() {
    return [
      {
        // Report pages render model output (escaped) — sandbox them hard
        // (Stage 4 item 3: sandboxing CSP; Phase E3 surface).
        source: "/r/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
