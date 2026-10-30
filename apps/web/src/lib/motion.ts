import { readCookie, writeCookie } from "@/lib/client-cookie";
import type { MotionMode } from "@/lib/preferences";
import { parseMotionMode } from "@/lib/preferences";

/**
 * Settings' motion choice, applied the way the theme is (lib/theme-cookie.ts):
 * a cookie the root layout reads while it composes the document, so "Always
 * reduce motion" holds from the first paint, and the `reducedMotion`
 * preference row as the durable copy.
 *
 * `always` puts `data-motion="reduce"` on <html>. `globals.css` reads that
 * attribute beside `prefers-reduced-motion`: the `motion-reduce:` and
 * `motion-safe:` variants are redefined to read both, and the global rule
 * that finishes every transition and animation at once covers both too. Code
 * that decides in script whether to move (a smooth scroll, a timed exit)
 * asks `prefersReducedMotion()`, which also reads both.
 *
 * The cookie always holds a mode once one is known, `system` included, and
 * the `(app)` layout brings it in line with the row on every page
 * (`MotionSeed`): the row wins whenever the database answers. Not `httpOnly`, for the
 * same reason as the theme's: the client writes it, and it is a display
 * preference, not anything that authenticates.
 */

export const MOTION_COOKIE = "gnosia-motion";

/** The same cookie as browsers named it before the rename; read as a fallback only. */
export const LEGACY_MOTION_COOKIE = "self-learn-motion";

/** A year, as the theme cookie. */
export const MOTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The mode a cookie value names, or null when it names none (missing, or garbage). */
export function asMotionMode(value: string | undefined | null): MotionMode | null {
  if (value === undefined || value === null) return null;
  const mode = parseMotionMode(value);
  return mode === value ? mode : null;
}

/** What `data-motion` holds for a mode: `reduce` for `always`, nothing for `system`. */
export function motionAttribute(mode: MotionMode | null): "reduce" | undefined {
  return mode === "always" ? "reduce" : undefined;
}

/**
 * For a browser whose cookie does not say `always` while the stored mode
 * does: the root layout could not know, so the `(app)` layout puts this before the page in
 * the HTML, and it marks <html> while the document is still being parsed,
 * before anything under it paints or starts an entrance animation.
 */
export const MOTION_REDUCE_SCRIPT = '(function(){try{document.documentElement.dataset.motion="reduce"}catch(e){}})()';

/** Set `data-motion` on <html> for a mode, from the browser. */
export function applyMotionToDocument(mode: MotionMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (motionAttribute(mode) === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

/** Write the cookie from the browser. */
export function writeMotionCookie(mode: MotionMode): void {
  writeCookie(MOTION_COOKIE, mode, MOTION_COOKIE_MAX_AGE);
}

/** The mode the browser's cookie holds, or null when it has none. */
export function readMotionCookie(cookie?: string): MotionMode | null {
  return asMotionMode(readCookie(MOTION_COOKIE, cookie) ?? readCookie(LEGACY_MOTION_COOKIE, cookie));
}

/** The corner of `window` and `document` this reads, so a test can hand in fakes. */
export interface MotionEnvironment {
  matchMedia?: (query: string) => { matches: boolean };
  root?: { dataset: DOMStringMap } | null;
}

/**
 * Whether to keep still: the device asks for reduced motion, or Settings says
 * "Always reduce motion". For code that decides in script, such as a smooth
 * scroll or how long to keep something mounted on its way out; CSS reads the
 * same two through `motion-reduce:` and the global rule. False on the server.
 */
export function prefersReducedMotion(
  env: MotionEnvironment = typeof window === "undefined"
    ? {}
    : { matchMedia: typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined, root: document.documentElement },
): boolean {
  if (env.root?.dataset.motion === "reduce") return true;
  return env.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** `smooth`, or `auto` (an instant jump) while still (`prefersReducedMotion`): for `scrollTo` and `scrollIntoView`. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
