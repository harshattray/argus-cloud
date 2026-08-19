import { cookies } from "next/headers";

/**
 * The Cloud surface's theme preference.
 *
 * **Three states, not two.** `light` and `dark` are explicit choices; *absent*
 * means "whatever this device says", which is `prefers-color-scheme` and is the
 * default. A two-state toggle would have no way back to the system setting
 * once touched, and a viewer who switches their laptop to dark at sunset would
 * be stuck on whatever they clicked once in the morning.
 *
 * **It is a cookie read on the server, not JavaScript.** The alternative —
 * `localStorage` plus a client component — repaints after hydration, so every
 * load flashes the wrong theme first. It would also need a nonce'd inline
 * script to avoid that flash, on the two page trees whose whole point is a
 * strict CSP. A cookie is read before the first byte is written, so the page
 * arrives already correct.
 *
 * The resolved value is stamped on the surface element as `data-theme`;
 * `_styles/surface.module.css` holds the three-state rules that read it.
 */

export type Theme = "light" | "dark";

/** Name is deliberately unprefixed with anything secret-looking: this is a display preference. */
export const THEME_COOKIE = "norma-theme";

/** A year. A theme choice is not a session. */
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * The viewer's explicit choice, or `null` for "follow the device".
 *
 * Anything unrecognised in the cookie is `null` rather than an error: a stale
 * or hand-edited value should fall back to the system default, not break a page.
 */
export async function readTheme(): Promise<Theme | null> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : null;
}
