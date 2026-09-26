import {
  appearanceOf,
  asThemeMode,
  paletteOf,
  THEME_APPEARANCES,
  THEME_MODES,
  THEME_PALETTES,
  themeModeFor,
  type ThemeAppearance,
  type ThemeMode,
  type ThemePalette,
} from "@self-learn/schema/shared";

export { appearanceOf, asThemeMode, paletteOf, THEME_APPEARANCES, THEME_MODES, THEME_PALETTES, themeModeFor };

/**
 * The theme is the one piece of learner state that is also a cookie.
 *
 * It has to be readable *before* the page renders, or a dark-mode reload
 * flashes white. That used to be an inline script in the root layout reading
 * `localStorage`, which cannot survive localStorage going away, and reading
 * the database for it would put a query on the critical path of every render
 * for one bit.
 *
 * So: a cookie the server reads while composing the document, and a
 * `preference` row as the durable copy. The cookie is written by the client
 * when the mode is chosen, and `LearnerProvider` reseeds it from the row when
 * it is missing (a new browser, or cleared site data).
 *
 * Not `httpOnly`: the client writes it, and it is a display preference rather
 * than anything that authenticates. `SameSite=Lax` because nothing
 * cross-site should be setting it.
 *
 * **Six modes, two axes, two classes.** A mode is a palette (classic or
 * gnosia) and an appearance (light, dark or system); `paletteOf`,
 * `appearanceOf` and `themeModeFor` in the schema convert. `<html>` carries
 * `gnosia` for the brand palette and `dark` for a dark appearance, both
 * together for Gnosia dark; classic light is the absence of both. A system
 * appearance is the one the server cannot resolve, since only the browser
 * knows `prefers-color-scheme`: the server renders it as light with
 * `data-theme` naming the mode, and `SYSTEM_THEME_SCRIPT`, inlined at the top
 * of `<body>`, adds `dark` before anything paints when the device is dark.
 * `applyThemeToDocument` is the same decision made again on the client
 * whenever the mode or the device setting changes.
 */

export const THEME_COOKIE = "self-learn-theme";

/** A year. Long enough that it outlives the browser sessions that matter. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const PALETTE_LABELS: Record<ThemePalette, string> = {
  classic: "Classic",
  gnosia: "Gnosia",
};

export const APPEARANCE_LABELS: Record<ThemeAppearance, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export type ThemeClass = "gnosia" | "dark";

/**
 * The classes a mode puts on `<html>`, given what the device prefers:
 * `gnosia` for the brand palette, `dark` for a dark appearance, in that order.
 */
export function themeClass(theme: ThemeMode, prefersDark: boolean): ThemeClass[] {
  const classes: ThemeClass[] = [];
  if (paletteOf(theme) === "gnosia") classes.push("gnosia");
  const appearance = appearanceOf(theme);
  if (appearance === "dark" || (appearance === "system" && prefersDark)) classes.push("dark");
  return classes;
}

/**
 * Runs before the body paints. Reads the mode the server stamped on `<html>`
 * and adds `dark` when the mode is one of the two system modes and the device
 * is dark; `gnosia` and every fixed appearance were already resolved on the
 * server. Kept tiny and dependency free because it is a string, not a module,
 * so it names the two modes rather than importing `appearanceOf`.
 */
export const SYSTEM_THEME_SCRIPT =
  '(function(){try{var d=document.documentElement,t=d.dataset.theme;if((t==="system"||t==="gnosia-system")&&window.matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark")}catch(e){}})()';

/** Set the classes on `<html>` for a mode, from the browser. */
export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const classes = themeClass(theme, prefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", classes.includes("dark"));
  root.classList.toggle("gnosia", classes.includes("gnosia"));
  root.dataset.theme = theme;
}

/**
 * Apply a mode and, under either system mode, keep following the device until
 * the returned function is called. The other four modes are applied once and
 * the cleanup is a no-op, so an effect can return this directly. Pure over
 * the `window` it is handed, which is what lets a test drive it without a
 * browser.
 */
interface SchemeQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/** The one corner of `window` this module reads, so a test can hand in a fake. */
export interface SchemeWindow {
  matchMedia(query: string): SchemeQuery;
}

export function followTheme(
  theme: ThemeMode,
  win: SchemeWindow | undefined = typeof window === "undefined" ? undefined : window,
): () => void {
  applyThemeToDocument(theme);
  if (appearanceOf(theme) !== "system" || typeof win?.matchMedia !== "function") return () => undefined;
  const query = win.matchMedia("(prefers-color-scheme: dark)");
  const follow = () => applyThemeToDocument(theme);
  query.addEventListener("change", follow);
  return () => query.removeEventListener("change", follow);
}

/** Write the cookie from the browser. Called by the theme control. */
export function writeThemeCookie(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
