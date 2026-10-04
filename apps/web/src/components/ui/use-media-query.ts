import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as it changes: for a layout
 * that has to differ in script, not only in CSS (an `aria-orientation`, which
 * panels are mounted).
 *
 * `serverValue` on the server and while hydrating, since the server has no
 * screen to ask, so the first client render matches its HTML; the browser's
 * answer follows at once. Where `matchMedia` is missing (an old browser, a
 * test's DOM) the answer stays `serverValue`.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}
