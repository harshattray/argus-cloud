"use client";

import "./globals.css";
import { CloudErrorState } from "./_components/cloud/error-state";

/**
 * The failure that takes the root layout with it.
 *
 * `error.tsx` wraps a segment's pages and nested layouts, but never the layout
 * *above* it — so a throw inside `app/layout.tsx` itself, or in the framework
 * before any segment renders, escapes every boundary in the tree. This file is
 * the only thing between that and the browser's own blank page.
 *
 * **It is also the only boundary some routes have.** `/repos` and `/r/` each
 * carry their own `error.tsx`; `/login` and the marketing site do not, so a
 * throw there arrives here. That is deliberate rather than an omission — those
 * surfaces have no data to re-fetch and nothing to recover in place, so a
 * segment boundary would show the same card with a retry that reloads the same
 * page. Adding one is worth doing the day either of them starts loading
 * something that can fail on its own.
 *
 * **It replaces the root layout, so it renders its own document.** Three
 * consequences, each of which had to be handled rather than assumed:
 *
 * 1. **Global styles do not arrive.** Next says so plainly: `global-error`
 *    renders its own document and does not include them. Hence the explicit
 *    `import "./globals.css"` — without it this page is unstyled HTML at the
 *    worst possible moment. It is a stylesheet served from our own origin, so
 *    `style-src-elem 'self'` in `middleware.ts` allows it. An inline `<style>`
 *    block would **not** be allowed, which rules out the usual shortcut.
 *
 * 2. **The theme cookie cannot reach it.** The root layout is gone and this is
 *    a Client Component, so there is no `readTheme()` and no `data-theme` to
 *    stamp. Without that attribute `surface.module.css` falls through to its
 *    `prefers-color-scheme` branch — the "follow the device" state, which is
 *    the default anyway. A viewer who chose light and is on a dark laptop sees
 *    dark here. That is a deliberate trade: honouring the choice would need
 *    `document.cookie` read after mount, which repaints the page a second time
 *    in front of somebody who is already looking at a failure.
 *
 * 3. **The fonts do not arrive either.** `next/font` cannot be called from a
 *    Client Component, so the `--font-*` variables the root layout sets are
 *    absent. `.surface` names a real system stack in its own `font` shorthand
 *    rather than relying on those variables, so the page still sets type
 *    deliberately instead of falling back to the browser's serif default.
 *
 * **No `metadata` export**, which Next does not support here. The `<title>` is
 * rendered as an element instead — React hoists it into the head.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong — Normascope</title>
        <CloudErrorState retry={retry} />
      </body>
    </html>
  );
}
