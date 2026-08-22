import type { Theme } from "../../../lib/theme";
import styles from "../../_styles/surface.module.css";

/**
 * System / Light / Dark, as three form buttons.
 *
 * **No JavaScript.** Each button is a submit in its own tiny form posting to
 * `/api/theme`, which sets the cookie and 303s back to `next`. The pages this
 * sits on render as inert HTML under a strict CSP; adding a client component
 * for a colour preference would mean hydration, a flash of the wrong theme on
 * every load, and a nonce for the one script on the page.
 *
 * `next` is the path the viewer is on, so the redirect returns them to it —
 * including the query string, or a share-token report would bounce to a
 * "not found" the moment somebody changed the theme. The route validates it as
 * a same-site path rather than trusting this.
 *
 * ── Icons, and one label (2026-08-22) ───────────────────────────────────────
 *
 * It was three uppercase words in equal-weight chips, and it was the loudest
 * object on a masthead whose job is a wordmark and a title: roughly 190px of
 * tracked capitals, with a rule between each pair, to set a colour preference.
 *
 * Now each option is an icon, and **only the selected one is captioned**. That
 * is the whole idea — a segmented control where the filled chip is also the one
 * carrying a word reads as "this is the state, and here are the alternatives",
 * which is what the control actually means. It also halves the width.
 *
 * **The unselected labels are not dropped, they are `visuallyHidden`.** A
 * sun and a moon are universal and "auto" as a half-filled disc is the platform
 * convention, but none of that reaches a screen reader, and an icon-only button
 * whose accessible name is its `title` is a name a lot of assistive technology
 * will not read. The text is in the DOM for all three; the eye sees one.
 *
 * `title` stays on top of that, for the pointer: it is the tooltip that names
 * an unfamiliar glyph, and with real text inside the button it is never used
 * for the accessible name.
 *
 * The current state is marked with `aria-pressed` and a filled chip, so it is
 * legible to a screen reader and not only to the eye.
 */

/**
 * Three 16-unit glyphs, drawn in `currentColor` so they invert with the chip.
 *
 * Sized by `.themeIcon` rather than by a `.themeSwitch svg` descendant rule —
 * a type-and-class selector outranks a bare class, and that is exactly how the
 * wordmark's two files both ended up rendering. Nothing here is theme-switched
 * today, but the habit is cheap and the failure is silent.
 */
const SunIcon = () => (
  <svg className={styles.themeIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.15 1.15M11.55 11.55l1.15 1.15M12.7 3.3l-1.15 1.15M4.45 11.55L3.3 12.7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg className={styles.themeIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {/* One closed crescent rather than a disc with a disc punched out of it: a
        cut-out needs a mask or an even-odd fill, and on the filled chip the
        punched hole would show the clay through the glyph. */}
    <path
      d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

/* The platform glyph for "follow the device": one disc, half of it filled. The
   fill is the *left* half, matching macOS and GitHub — mirrored, it reads as a
   waxing moon and collides with the option next to it. */
const AutoIcon = () => (
  <svg className={styles.themeIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="5.9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 2.1a5.9 5.9 0 0 0 0 11.8Z" fill="currentColor" />
  </svg>
);

export function ThemeSwitch({ current, next }: { current: Theme | null; next: string }) {
  const options: { value: string; label: string; active: boolean; icon: React.ReactNode }[] = [
    { value: "system", label: "Auto", active: current === null, icon: <AutoIcon /> },
    { value: "light", label: "Light", active: current === "light", icon: <SunIcon /> },
    { value: "dark", label: "Dark", active: current === "dark", icon: <MoonIcon /> },
  ];
  return (
    <div className={styles.themeSwitch} role="group" aria-label="Colour theme">
      {options.map((option) => (
        <form key={option.value} method="POST" action="/api/theme">
          <input type="hidden" name="theme" value={option.value} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className={option.active ? `${styles.themeOption} ${styles.themeOn}` : styles.themeOption}
            aria-pressed={option.active}
            title={option.label}
          >
            {option.icon}
            <span className={option.active ? styles.themeLabel : styles.visuallyHidden}>
              {option.label}
            </span>
          </button>
        </form>
      ))}
    </div>
  );
}
