/**
 * The studio's motion vocabulary, on top of the tokens in `globals.css` and
 * the rules in docs/design/IMPLEMENTATION.md, "Motion": something that
 * mounts animates in, something with height folds, and nothing moves for a
 * reader who asked for less.
 *
 * Plain strings and a function, in a module with no `"use client"`, so a
 * server component (the studio page, the canvas page) can use the classes
 * too: imported from a client module they would be client references, not
 * strings. The pieces that hold state are in `motion-parts.tsx`.
 */

/** How long `Collapse` takes to fold (its `duration-300`). */
export const FOLD_MS = 300;

/** A fade and a 6px rise, for something new in a list: a message, a banner. */
export const ENTER = "animate-enter motion-reduce:animate-none";
/** Opacity only, for a swap in place. */
export const FADE_IN = "animate-fade-in motion-reduce:animate-none";
/** A fade and a slight scale, for a menu, a popover or a card that appears. */
export const POP_IN = "animate-pop-in motion-reduce:animate-none";

/** Whether the reader asked for less motion. False where there is no window to ask. */
export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
