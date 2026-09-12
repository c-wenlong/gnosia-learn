import type { ThemeMode } from "@/lib/types";

/**
 * The theme is the one piece of learner state that is also a cookie.
 *
 * It has to be readable *before* the page renders, or a dark-mode reload
 * flashes white. That used to be an inline script in the root layout reading
 * `localStorage`, which cannot survive localStorage going away — and reading
 * the database for it would put a query on the critical path of every render
 * for one bit.
 *
 * So: a cookie the server reads while composing the document, and a
 * `preference` row as the durable copy. The cookie is written by the client
 * when the toggle is used, and the layout falls back to the row when the
 * cookie is missing (a new browser, or cleared site data) and reseeds it.
 *
 * Not `httpOnly`: the client writes it, and it is a display preference rather
 * than anything that authenticates. `SameSite=Lax` because nothing
 * cross-site should be setting it.
 */

export const THEME_COOKIE = "self-learn-theme";

/** A year. Long enough that it outlives the browser sessions that matter. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function asThemeMode(value: string | undefined | null): ThemeMode | null {
  return value === "dark" || value === "light" ? value : null;
}

/** Write the cookie from the browser. Called by the theme toggle. */
export function writeThemeCookie(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
