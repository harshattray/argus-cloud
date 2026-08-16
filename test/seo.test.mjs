// SEO suite — what search engines are told about this site.
//
// Run: npm test
//
// **Why a suite for metadata.** None of this fails a build, a typecheck or a
// page render. A page can go live with no description, a canonical pointing at
// the wrong route, or missing from the sitemap, and every other check in this
// repo stays green while the page quietly does not rank. The feedback loop is
// weeks long and runs through someone else's index, so it has to be caught
// here or not at all.
//
// **The route list comes from the filesystem.** An earlier version of this
// suite iterated `NAV_LINKS`, which is the site menu rather than the set of
// pages. Two holes were reproduced before this was rewritten: a public page
// added without a nav entry passed every check while being absent from the
// sitemap entirely, and a page removed from the nav while its file stayed put
// dropped out of the sitemap with nothing failing. `public-routes.mjs` walks
// `app/(site)`, so a page that exists is a page that gets checked.
//
// It guards five things:
//
//   - every public page has a title, a description, and a canonical that
//     matches its own route;
//   - titles and descriptions survive what Google actually displays;
//   - the committed sitemap data matches the pages on disk, in both
//     directions;
//   - the sitemap's dates are real, not the build time;
//   - the private trees are noindex, and robots.txt does not undercut that.
//
// No database, no network — it reads files.

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WEB = path.join(ROOT, "web");
const SITE = path.join(WEB, "app", "(site)");

// The discovery module the generator uses, so the suite and the build agree on
// what a public page is. Importing it also proves it still runs.
const { publicRoutes, SITEMAP_EXCLUDED } = await import(path.join(ROOT, "scripts", "public-routes.mjs"));

let failures = 0;
function check(id, condition, detail) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
  if (!ok) failures++;
}

const read = (...p) => readFile(path.join(...p), "utf-8");
const exists = async (...p) => access(path.join(...p)).then(() => true, () => false);

/**
 * The `export const metadata = { … }` object, as source text.
 *
 * Both shapes are matched: the multi-line one every page here uses, and a
 * single-line one. An earlier version required a closing `\n};` and so read a
 * single-line export as no metadata at all — reporting "title missing" on a
 * page whose title was right there. The verdict happened to be useful and the
 * reason was wrong, which is worse than a plain failure.
 */
const metadataBlock = (src) =>
  src.match(/export const metadata[^=]*=\s*(?:\{[\s\S]*?\n\};|\{[^\n]*\};)/)?.[0] ?? "";

/**
 * A string value for `key`, tolerating `//` comment lines between the key and
 * its value. Several entries carry a note explaining why they are worded or
 * sized the way they are, and a pattern without this silently matched nothing
 * and reported the field as missing.
 */
const stringField = (block, key) =>
  block.match(new RegExp(`${key}:\\s*(?://[^\\n]*\\n\\s*)*"((?:[^"\\\\]|\\\\.)*)"`))?.[1];

const discovered = (await publicRoutes()).filter((r) => !SITEMAP_EXCLUDED.has(r.route));
const generatedSrc = await read(WEB, "lib", "pageDates.generated.ts");
const sitemapSrc = await read(WEB, "app", "sitemap.ts");
const robotsSrc = await read(WEB, "app", "robots.ts");
const siteLib = await read(WEB, "lib", "site.ts");

check(
  "S0.1",
  discovered.length >= 8,
  `discovered ${discovered.length} public route(s) by walking app/(site)`
);

// --- S1: every public page is described to a crawler ---------------------
{
  // Routes backed by their own `page.tsx` carry a static metadata object. The
  // legal documents come from a dynamic `[slug]` segment and are checked
  // separately below, because their metadata is computed per document.
  const staticRoutes = discovered.filter((r) => r.sources[0].endsWith("page.tsx"));

  const noTitle = [];
  const noDescription = [];
  const longDescription = [];
  const badCanonical = [];
  for (const { route, sources } of staticRoutes) {
    const block = metadataBlock(await read(sources[0]));
    const title = stringField(block, "title") ?? block.match(/absolute:\s*"([^"]+)"/)?.[1];
    if (!title) noTitle.push(route);
    const description = stringField(block, "description");
    // Under ~50 characters is a placeholder, not a description.
    if (!description || description.length < 50) noDescription.push(route);
    // Google shows roughly 155 characters. Past that is written for nobody:
    // the visitor who lands never sees it, and the person deciding whether to
    // click sees it cut mid-sentence.
    else if (description.length > 160) longDescription.push(`${route} (${description.length})`);
    const canonical = stringField(block, "canonical");
    if (canonical !== route) badCanonical.push(`${route} → ${canonical ?? "none"}`);
  }

  check("S1.1", noTitle.length === 0, `every public page sets a title${noTitle.length ? ` — missing on ${noTitle.join(", ")}` : ` (${staticRoutes.length} pages)`}`);
  check("S1.2", noDescription.length === 0, `every public page sets a real description${noDescription.length ? ` — missing or too short on ${noDescription.join(", ")}` : ""}`);
  check("S1.3", longDescription.length === 0, `no description is cut off in a search result${longDescription.length ? ` — ${longDescription.join(", ")} exceed 160 characters` : ""}`);
  // A canonical pointing somewhere else tells Google to index the other page
  // instead. Copy-pasting a page file is exactly how that happens, and nothing
  // on screen looks wrong afterwards.
  check("S1.4", badCanonical.length === 0, `every canonical points at its own route${badCanonical.length ? ` — ${badCanonical.join(", ")}` : ""}`);

  // The legal documents render through `legal/[slug]/page.tsx`, so one file
  // has to get all four right.
  const legalPage = await read(SITE, "legal", "[slug]", "page.tsx");
  check(
    "S1.5",
    /title:\s*doc\.title/.test(legalPage) &&
      /description:\s*doc\.summary/.test(legalPage) &&
      /canonical:\s*`\/legal\/\$\{doc\.slug\}`/.test(legalPage),
    "each legal document gets its own title, description and canonical"
  );
}

// --- S2: what the title actually renders as ------------------------------
// The site layout carries `template: "%s — Normascope"`, which Next applies to
// *child* segments only — so `/` keeps its title verbatim while every other
// page gets the suffix. Two things go wrong if nobody accounts for that, and
// both did: a title that reads fine in the source renders past Google's
// cutoff, and a title containing the brand renders it twice ("Normascope User
// Guide — Normascope").
{
  const layoutSrc = await read(SITE, "layout.tsx");
  const template = layoutSrc.match(/template:\s*"([^"]+)"/)?.[1] ?? null;
  check("S2.1", template !== null, `the site layout defines a title template${template ? ` (${template})` : ""}`);

  if (template) {
    const brand = template.replace("%s", "").replace(/[^A-Za-z]/g, "");
    const tooLong = [];
    const doubledBrand = [];
    for (const { route, sources } of discovered) {
      if (!sources[0].endsWith("page.tsx")) continue;
      const block = metadataBlock(await read(sources[0]));
      // `{ absolute: "…" }` opts out of the template entirely.
      const absolute = block.match(/absolute:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
      const plain = stringField(block, "title");
      const rendered = absolute ?? (route === "/" ? plain : template.replace("%s", plain ?? ""));
      if (!rendered) continue;
      if (rendered.length > 60) tooLong.push(`${route} (${rendered.length})`);
      if (rendered.split(brand).length - 1 > 1) doubledBrand.push(`${route} → "${rendered}"`);
    }
    check("S2.2", tooLong.length === 0, `every rendered title fits in ~60 characters${tooLong.length ? ` — ${tooLong.join(", ")}` : ""}`);
    check("S2.3", doubledBrand.length === 0, `no rendered title repeats "${brand}"${doubledBrand.length ? ` — ${doubledBrand.join(", ")}` : ""}`);
  }
}

// --- S3: the committed sitemap data matches the pages on disk ------------
// This is the pair of holes that prompted the rewrite, now checked in both
// directions. `npm run build` regenerates the artifact, so a mismatch here
// means someone added or removed a page and committed without building.
{
  const generatedRoutes = [...generatedSrc.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
  const discoveredRoutes = discovered.map((r) => r.route);

  const missing = discoveredRoutes.filter((r) => !generatedRoutes.includes(r));
  check(
    "S3.1",
    missing.length === 0,
    `every page on disk is in the sitemap data${missing.length ? ` — ${missing.join(", ")} added but not generated; run npm run build` : ` (${discoveredRoutes.length} routes)`}`
  );

  const stale = generatedRoutes.filter((r) => !discoveredRoutes.includes(r));
  check(
    "S3.2",
    stale.length === 0,
    `no removed page lingers in the sitemap data${stale.length ? ` — ${stale.join(", ")} no longer exist on disk` : ""}`
  );

  // Matched against the imports, not the whole file: the comment in
  // `sitemap.ts` explains why it no longer uses `NAV_LINKS`, and a naive
  // search for the name found its own explanation.
  const imports = [...sitemapSrc.matchAll(/^import[\s\S]*?;$/gm)].map((m) => m[0]).join("\n");
  check(
    "S3.3",
    /PUBLIC_ROUTES/.test(imports) && !/NAV_LINKS/.test(imports),
    "the sitemap reads the discovered route list, not the navigation menu"
  );

  const leaked = ["/r/", "/admin", "/pitch", "/api"].filter((p) => generatedRoutes.some((r) => r.startsWith(p)));
  check("S3.4", leaked.length === 0, `no private tree reached the sitemap${leaked.length ? ` — ${leaked.join(", ")}` : ""}`);

  // Every nav link must point at a page that exists, or the menu offers a 404.
  const navRoutes = [...siteLib.matchAll(/\{\s*href:\s*"(\/[^"]*)",\s*label:/g)]
    .map((m) => m[1])
    .filter((href) => !href.startsWith("/pitch"));
  const dangling = navRoutes.filter((r) => !discoveredRoutes.includes(r));
  check(
    "S3.5",
    dangling.length === 0,
    `every navigation link points at a page that exists${dangling.length ? ` — ${dangling.join(", ")}` : ` (${navRoutes.length} links)`}`
  );
}

// --- S4: the sitemap's dates are real ------------------------------------
// The original bug: `lastModified: new Date()` stamped build time on every
// route, so all of them claimed to change on every deploy. Crawlers discount a
// lastmod they can see is untrue, which loses the signal on pages where it is
// true.
{
  check(
    "S4.1",
    !/lastModified:\s*new Date\(\)/.test(sitemapSrc),
    "the sitemap does not stamp build time as lastModified"
  );
  const nulls = (generatedSrc.match(/lastModified:\s*null/g) ?? []).length;
  check(
    "S4.2",
    nulls === 0,
    nulls === 0
      ? "git supplied a date for every route"
      : `${nulls} route(s) have no git date — the sitemap omits lastModified for them, which is safe but weaker`
  );
}

// --- S5: the private trees stay out of the index -------------------------
{
  for (const dir of ["/r/", "/api/", "/admin/"]) {
    check(`S5.1 ${dir}`, robotsSrc.includes(`"${dir}"`), `robots.txt disallows ${dir}`);
  }

  // Deliberately *not* disallowed: a crawler blocked by robots.txt never
  // fetches the page, so it never reads the noindex, and the URL can still be
  // listed from an external link. Noindex is the stronger control and
  // robots.txt would undercut it. If this ever flips, it should be a decision.
  check(
    "S5.2",
    !/disallow[\s\S]{0,120}"\/pitch/.test(robotsSrc),
    "robots.txt does not disallow /pitch, which would stop crawlers reading its noindex"
  );

  const shouldBeNoindex = [
    ["app/(pitch)/pitch/layout.tsx", "the pitch tree"],
    ["app/r/[runId]/layout.tsx", "customer report pages"],
    ["app/admin/waitlist/page.tsx", "waitlist administration"],
  ];
  for (const [file, what] of shouldBeNoindex) {
    const src = await read(WEB, file);
    check(`S5.3 ${what}`, /robots:\s*\{\s*index:\s*false/.test(src), `${what} declares noindex`);
  }
}

// --- S6: ownership proof is wired but not hard-coded ---------------------
{
  const rootLayout = await read(WEB, "app", "layout.tsx");
  check(
    "S6.1",
    /NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION/.test(rootLayout) &&
      /NEXT_PUBLIC_BING_SITE_VERIFICATION/.test(rootLayout),
    "Google and Bing verification tokens are read from the environment"
  );
  // A token committed here would be wrong on every other property and every
  // preview deploy, and nothing would report it.
  check(
    "S6.2",
    !/google:\s*"[A-Za-z0-9_-]{20,}"/.test(rootLayout),
    "no verification token is hard-coded in the layout"
  );
}

console.log(failures === 0 ? "\nseo: all checks passed" : `\nseo: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
