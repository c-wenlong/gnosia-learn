import { asThemeMode, THEME_MODES, type ThemeMode } from "@self-learn/schema/shared";

export { asThemeMode, THEME_MODES };

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
 * **Four modes, two classes.** `<html>` carries `dark` for the dark palette
 * and `gnosia` for the brand palette; the original light palette is the
 * absence of both. `system` is the one mode the server cannot resolve, since
 * only the browser knows `prefers-color-scheme`: the server renders it as
 * light with `data-theme="system"`, and `SYSTEM_THEME_SCRIPT`, inlined at the
 * top of `<body>`, adds `dark` before anything paints when the device is
 * dark. `applyThemeToDocument` is the same decision made again on the client
 * whenever the mode or the device setting changes.
 */

export const THEME_COOKIE = "self-learn-theme";

/** A year. Long enough that it outlives the browser sessions that matter. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  gnosia: "Gnosia",
  dark: "Dark",
  system: "System",
};

/** The `<html>` class a mode selects, given what the device prefers. */
export function themeClass(theme: ThemeMode, prefersDark: boolean): "dark" | "gnosia" | "" {
  switch (theme) {
    case "dark":
      return "dark";
    case "gnosia":
      return "gnosia";
    case "system":
      return prefersDark ? "dark" : "";
    default:
      return "";
  }
}

/**
 * Runs before the body paints. Reads the mode the server stamped on `<html>`
 * and adds `dark` when the mode is `system` and the device is dark; the other
 * three modes were already resolved on the server. Kept tiny and dependency
 * free because it is a string, not a module.
 */
export const SYSTEM_THEME_SCRIPT =
  '(function(){try{var d=document.documentElement;if(d.dataset.theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark")}catch(e){}})()';

/** Set the classes on `<html>` for a mode, from the browser. */
export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const cls = themeClass(theme, prefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", cls === "dark");
  root.classList.toggle("gnosia", cls === "gnosia");
  root.dataset.theme = theme;
}

/**
 * Apply a mode and, under `system`, keep following the device until the
 * returned function is called. The other three modes are applied once and
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
  if (theme !== "system" || typeof win?.matchMedia !== "function") return () => undefined;
  const query = win.matchMedia("(prefers-color-scheme: dark)");
  const follow = () => applyThemeToDocument("system");
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
