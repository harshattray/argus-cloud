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

  // Next advertises itself in `X-Powered-By` on every response. It tells an
  // attacker which framework's advisories to read against us and tells a
  // visitor nothing, so it is turned off.
  poweredByHeader: false,

  async headers() {
    return [
      // **No `Content-Security-Policy` here, deliberately.** Every policy this
      // site serves is issued in `middleware.ts`, because the strict one
      // carries a per-request nonce and a nonce cannot exist in a static
      // header — that is what rendered /r/ blank in production. A second policy
      // set here would not replace the one from middleware; a browser given two
      // CSP headers enforces both at once, and the intersection is a policy
      // nobody wrote or tested. One source, and it is the middleware.
      //
      // The headers below are all constants, so they belong in a static
      // config — and unlike the middleware matcher this reaches every response
      // including static assets.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Nothing on this site uses a camera, a microphone, or a location,
          // and nothing is expected to. Denying them outright means an injected
          // tag or a compromised dependency cannot prompt a visitor for a
          // permission we would never ask for — a prompt that carries our
          // domain name and so our credibility.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
