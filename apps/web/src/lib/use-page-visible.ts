import { useSyncExternalStore } from "react";

function subscribeVisibility(change: () => void): () => void {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}

/**
 * Whether the tab is showing, kept current as it is hidden and shown again.
 * Nothing polls in a hidden tab. True on the server and while hydrating, so a
 * page drawn there starts as if seen.
 */
export function usePageVisible(): boolean {
  return !useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}
