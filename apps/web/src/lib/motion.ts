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
 * The cookie always holds a mode once one is known, `system` included, so a
 * missing cookie means a browser that has never been told, and the `(app)`
 * layout fills it in from the row (`MotionSeed`). Not `httpOnly`, for the
 * same reason as the theme's: the client writes it, and it is a display
 * preference, not anything that authenticates.
 */

export const MOTION_COOKIE = "self-learn-motion";

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

/** Set `data-motion` on <html> for a mode, from the browser. */
export function applyMotionToDocument(mode: MotionMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (motionAttribute(mode) === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

/** Write the cookie from the browser. */
export function writeMotionCookie(mode: MotionMode): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${MOTION_COOKIE}=${mode}; Path=/; Max-Age=${MOTION_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/** The mode the browser's cookie holds, or null when it has none. */
export function readMotionCookie(cookie: string = typeof document === "undefined" ? "" : document.cookie): MotionMode | null {
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${MOTION_COOKIE}=`));
  return asMotionMode(entry?.slice(MOTION_COOKIE.length + 1));
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
