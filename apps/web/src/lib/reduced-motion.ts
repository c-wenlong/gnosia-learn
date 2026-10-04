/**
 * Motion a script starts itself (a smooth scroll, a scroll into view) is not
 * covered by the `motion-reduce:` classes or the global rule in `globals.css`,
 * which only reach CSS transitions and animations. These read the same media
 * query, so a reader who asked for less movement gets the jump instead of the
 * glide (docs/design/IMPLEMENTATION.md, "Motion").
 */

/** Whether the reader asked for less movement. False where there is no window to ask. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** `smooth`, or `auto` (an instant jump) under reduced motion: for `scrollTo` and `scrollIntoView`. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
