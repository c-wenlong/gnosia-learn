/**
 * Whether the sidebar is folded to its icon rail on a desktop, kept in a
 * cookie so the server draws the right width on the first paint. A value in
 * `localStorage` would only be known after hydration, and the whole page
 * would jump sideways by 200px on every load.
 *
 * React-free so the `(app)` layout, the shell and a test can share it.
 */

export const SIDEBAR_COOKIE = "gnosia-sidebar";

/** A year, as the theme cookie. */
const MAX_AGE = 60 * 60 * 24 * 365;

/** The cookie's value read as a fold: only `collapsed` folds it. */
export function sidebarCollapsed(value: string | undefined): boolean {
  return value === "collapsed";
}

/** Write the fold from the browser. Called by the sidebar's toggle. */
export function writeSidebarCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "collapsed" : "open"}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}
