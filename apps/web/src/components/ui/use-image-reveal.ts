"use client";

import { useCallback, useState } from "react";

import { useHydrated } from "@/lib/use-hydrated";

/**
 * A picture that fades in once its bytes arrive, instead of painting in
 * stripes or popping into an empty box.
 *
 * Returns `attach`, a ref callback, and an `onLoad` for the `<img>`, and the class that
 * holds it at `opacity-0` until it has loaded. A picture already complete
 * when its element is attached (the browser's cache, or one that loaded
 * before React hydrated and so before `onLoad` was listening) counts as
 * loaded at once, so it never fades in a second time or stays hidden.
 *
 * Nothing is hidden in the server's HTML or during hydration: until the page
 * is hydrated there is no script to show the picture again, and a picture
 * hidden for want of script is worse than one that arrives abruptly. The
 * fade is `motion-reduce:` aware, so a reader who asked for less sees it
 * appear at once.
 *
 * Tied to one `src`: a new one hides until it has loaded in turn.
 */
export function useImageReveal(src: string | null | undefined): {
  attach: (img: HTMLImageElement | null) => void;
  onLoad: () => void;
  className: string;
} {
  const hydrated = useHydrated();
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = src ?? null;

  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (img !== null && img.complete && img.naturalWidth > 0) setLoaded(key);
    },
    [key],
  );
  const onLoad = useCallback(() => setLoaded(key), [key]);

  const hidden = hydrated && key !== null && loaded !== key;
  return {
    attach,
    onLoad,
    className: `transition-opacity duration-200 ease-out motion-reduce:transition-none ${hidden ? "opacity-0" : "opacity-100"}`,
  };
}
