/**
 * The browser's side of the app's preference cookies (the theme, motion and
 * the sidebar's fold): written by a control so the server draws the right
 * thing on the next load, and read back where the server's answer is not
 * enough. React-free, so a layout, a component and a test can share it.
 */

/**
 * Write a cookie from the browser, for the whole site, for `maxAge` seconds:
 * `SameSite=Lax`, and `Secure` on an https page. Nothing on the server, where
 * there is no `document`.
 */
export function writeCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * A cookie's value, or undefined when there is none. Reads the browser's
 * cookies by default, nothing on the server; a test can pass a cookie string.
 */
export function readCookie(name: string, cookie: string = typeof document === "undefined" ? "" : document.cookie): string | undefined {
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}
