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
 * The current state is marked with `aria-pressed` and a filled chip, so it is
 * legible to a screen reader and not only to the eye.
 */
export function ThemeSwitch({ current, next }: { current: Theme | null; next: string }) {
  const options: { value: string; label: string; active: boolean }[] = [
    { value: "system", label: "Auto", active: current === null },
    { value: "light", label: "Light", active: current === "light" },
    { value: "dark", label: "Dark", active: current === "dark" },
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
          >
            {option.label}
          </button>
        </form>
      ))}
    </div>
  );
}
