"use client";

import { useCallback, useState } from "react";

import { useHydrated } from "@/lib/use-hydrated";

/**
 * The fade a revealed picture takes: transparent until `shown`, then in over
 * 200ms, at once for a reader who asked for less motion.
 */
export function revealClass(shown: boolean): string {
  return `transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`;
}

/**
 * A picture that fades in once its bytes arrive, instead of painting in
 * stripes or popping into an empty box.
 *
 * Returns `attach`, a ref callback, and `onLoad` and `onError` for the
 * `<img>`; `loaded`, whether this `src` has arrived; and `className`, which
 * holds the picture at `opacity-0` until it has. A picture already complete
 * when its element is attached (the browser's cache, or one that loaded
 * before React hydrated and so before `onLoad` was listening) counts as
 * loaded at once, so it never fades in a second time or stays hidden. That
 * check lives here and nowhere else (`use-image-reveal.test.ts`).
 *
 * A picture that fails stays hidden, so a cover's frame shows rather than the
 * browser's broken mark. `showOnError` shows it instead, for a picture whose
 * alt text is worth reading when it fails (the studio's `FadeImg`); a failure
 * before React was listening counts too, since a failed picture is complete.
 *
 * `className` hides nothing in the server's HTML or during hydration: until
 * the page is hydrated there is no script to show the picture again, and a
 * picture hidden for want of script is worse than one that arrives abruptly.
 * `loaded` is the plain fact, for a caller with a class of its own (the
 * studio's tiles, `FadeImg`), which then decides that for itself. The fade is
 * `motion-reduce:` aware.
 *
 * Tied to one `src`: a new one hides until it has loaded in turn. A `null`
 * src is never loaded.
 *
 * Destructure what it returns: React's lint reads an object whose `attach`
 * is passed as a ref as a ref itself, and refuses `loaded` read off it in
 * render.
 */
export function useImageReveal(
  src: string | null | undefined,
  { showOnError = false }: { showOnError?: boolean } = {},
): {
  attach: (img: HTMLImageElement | null) => void;
  onLoad: () => void;
  onError: () => void;
  loaded: boolean;
  className: string;
} {
  const hydrated = useHydrated();
  const [arrived, setArrived] = useState<string | null>(null);
  const key = src ?? null;

  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (img !== null && img.complete && (showOnError || img.naturalWidth > 0)) setArrived(key);
    },
    [key, showOnError],
  );
  const onLoad = useCallback(() => setArrived(key), [key]);
  const onError = useCallback(() => {
    if (showOnError) setArrived(key);
  }, [key, showOnError]);

  const loaded = key !== null && arrived === key;
  return {
    attach,
    onLoad,
    onError,
    loaded,
    className: revealClass(!hydrated || key === null || loaded),
  };
}
