#!/usr/bin/env node
//
// The list of public routes, discovered from the filesystem.
//
// **Why this module exists.** The sitemap, the page-date generator and the SEO
// suite all need to know "what public pages does this site have?", and all
// three used to answer it from `NAV_LINKS` — which is the *menu*, not the list
// of pages. The two are not the same thing, and the gap was silent in both
// directions:
//
//   - a public page added without a nav entry got no sitemap entry, no
//     lastmod, and none of the metadata checks. It shipped live and
//     unfindable, and every suite stayed green.
//   - a page dropped from the nav while the file stayed put vanished from the
//     sitemap while remaining reachable, again with nothing failing.
//
// Both were reproduced before this was written. The fix is to ask the
// filesystem, which cannot disagree with itself about which pages exist.
//
// `app/(site)` is the whole public tree. `/pitch`, `/admin` and `/r` live in
// their own trees precisely because they are not public, so they are out of
// scope here by construction rather than by an exclusion list.

import { readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHED } from "./legal-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "web", "app", "(site)");

/**
 * Extra files whose change also means the page changed.
 *
 * Every route is dated from its own `page.tsx` by default. These are the cases
 * where the real content lives somewhere else. The shared layout is
 * deliberately absent — it holds the header and footer, so including it would
 * re-date every page whenever a nav label moved.
 */
const EXTRA_SOURCES = {
  "/": ["web/app/(site)/_components/Hero.tsx"],
  "/legal": ["scripts/legal-manifest.mjs"],
};

/**
 * Public pages that must NOT appear in the sitemap.
 *
 * Empty, and it should stay that way. If a route is ever added here it needs a
 * reason on the line and a `robots: { index: false }` on the page itself —
 * leaving a page out of the sitemap does not stop it being indexed, it only
 * stops us telling anyone about it.
 */
export const SITEMAP_EXCLUDED = new Set();

/** Every directory holding a `page.tsx`, walked from the public tree root. */
async function walk(dir, segments = []) {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });

  if (entries.some((e) => e.isFile() && e.name === "page.tsx")) {
    found.push({ segments: [...segments], file: path.join(dir, "page.tsx") });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // `_components` is a private folder by Next's own convention: an
    // underscore prefix means it is not a route.
    if (entry.name.startsWith("_")) continue;
    // A route group `(name)` contributes no URL segment.
    const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    found.push(
      ...(await walk(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]))
    );
  }
  return found;
}

/**
 * Expands a dynamic segment into its real routes.
 *
 * Only `/legal/[slug]` exists today, and it is expanded from the published
 * legal manifest. Anything else throws rather than being skipped: a new
 * dynamic public route that silently produced no sitemap entries would be the
 * exact bug this module was written to remove.
 */
function expand(segments, file) {
  const route = "/" + segments.join("/");
  if (!segments.some((s) => s.startsWith("["))) {
    return [{ route: route === "/" ? "/" : route, sources: [file] }];
  }
  if (route === "/legal/[slug]") {
    return PUBLISHED.map((doc) => ({
      route: `/legal/${doc.slug}`,
      sources: [path.join(ROOT, "docs", "legal", doc.file)],
    }));
  }
  throw new Error(
    `public-routes: no expansion rule for the dynamic route ${route}. ` +
      `Add one here, or it will be missing from the sitemap and from every SEO check.`
  );
}

/** Every public route, with the files that determine when it last changed. */
export async function publicRoutes() {
  const pages = await walk(SITE);
  const routes = [];
  for (const { segments, file } of pages) {
    for (const entry of expand(segments, file)) {
      const extras = (EXTRA_SOURCES[entry.route] ?? []).map((rel) => path.join(ROOT, rel));
      // A named extra that no longer exists means the map is stale; say so
      // rather than quietly dating the page from fewer files than intended.
      for (const extra of extras) {
        await access(extra).catch(() => {
          throw new Error(`public-routes: EXTRA_SOURCES lists a missing file — ${extra}`);
        });
      }
      routes.push({ ...entry, sources: [...entry.sources, ...extras] });
    }
  }
  // Stable order: shortest path first, then alphabetical. Keeps the generated
  // file and the sitemap from reshuffling on an unrelated change.
  return routes.sort(
    (a, b) => a.route.split("/").length - b.route.split("/").length || a.route.localeCompare(b.route)
  );
}
