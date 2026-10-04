import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * Whether this render is the browser's, and the hydrating one is not.
 *
 * `false` on the server and on the browser's first pass over the server's
 * HTML (React hydrates with the server snapshot), `true` on every render after
 * that, and on a component mounted later by a client-side update, where there
 * is no server HTML to match. For anything the server cannot know (the clock,
 * storage) or that only script can make work, so the first client render
 * matches the HTML it hydrates.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
