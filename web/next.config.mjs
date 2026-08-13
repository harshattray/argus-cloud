import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app lives in `web/` but its dependency `argus-cloud` is the repo root,
  // so tracing must start above this directory or nothing outside `web/` can
  // be collected into a function bundle.
  outputFileTracingRoot: path.join(webDir, ".."),

  // `migrate()` reads `migrations/*.sql` from disk at runtime via a computed
  // path (src/db.ts:25). Next traces `import` statements, not `readdir`, so it
  // cannot see those files — they were absent from all 34 function bundles,
  // and the first request to touch the database would have failed with ENOENT
  // on a deployed build while working perfectly on localhost. Naming them here
  // is what puts them in the bundle.
  //
  // Keep this in step with `MIGRATIONS_DIR`: if the .sql files ever move, this
  // glob moves with them or deploys break in a way no local build reproduces.
  outputFileTracingIncludes: {
    "/**": ["../migrations/**/*.sql"],
  },

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
