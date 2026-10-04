"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode, type RefObject } from "react";

import { ENTER, FOLD_MS } from "@/components/studio/motion";
import { Collapse } from "@/components/ui/Collapse";
import { revealClass, useImageReveal } from "@/components/ui/use-image-reveal";
import { usePresence } from "@/components/ui/use-presence";
import { cx } from "@/components/ui/classes";
import { prefersReducedMotion } from "@/lib/motion";

/** The studio's motion pieces that hold state; the classes are in `motion.ts`. */

/**
 * A box that animates in when it mounts, or does not, decided once, at mount.
 *
 * For a list that is drawn whole on opening and then grows: what was there on
 * opening is not new and should not move, while what arrives later is. The
 * flag is held from the first render, so a re-render that turns it on later
 * cannot start the animation on something already on screen.
 */
export function Arrive({
  animate,
  motion = ENTER,
  className,
  children,
}: {
  animate: boolean;
  /** The animation's classes: `ENTER` by default. */
  motion?: string;
  className?: string;
  children: ReactNode;
}) {
  const [on] = useState(animate);
  // `empty:hidden`: a child that draws nothing leaves no box, so no gap, behind.
  return <div className={cx(on && motion, "empty:hidden", className)}>{children}</div>;
}

/**
 * `Collapse` for content that is only drawn while it is wanted: it mounts as
 * the region opens and is dropped once the region has folded shut, so it
 * glides both ways without a closed copy left in the page (a second Draw
 * button, say, that a `querySelector` would find first).
 */
export function Reveal({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  /** Classes for `Collapse`'s inner box. */
  className?: string;
  children: ReactNode;
}) {
  // Kept for the fold's length after it shuts, and dropped at once under reduced motion.
  const { mounted } = usePresence(open, FOLD_MS);
  return (
    // `overflow: clip` with a margin in place of the fold's `hidden`: still
    // clipped while it folds, but a focus ring on a button at its edge (Draw,
    // Save) is drawn whole rather than cut off.
    <Collapse open={open} id={id} className={cx("overflow-clip! [overflow-clip-margin:6px]", className)}>
      {mounted ? children : null}
    </Collapse>
  );
}

/**
 * An `<img>` that fades in once its picture has loaded, rather than painting
 * in strips or popping in over its mat (`useImageReveal`, which also counts a
 * picture that finished loading before React was listening).
 *
 * A picture that fails is shown too (`showOnError`), so its alt text or the
 * browser's broken mark is not hidden. Unlike a cover's, this picture is held
 * transparent from the server's HTML on (`loaded`, not the hook's hydration-
 * aware class), as it always was: every studio screen needs script anyway,
 * and showing a half-loaded picture before hydration only to hide it and
 * fade it in again after would be the worse flash.
 */
export function FadeImg({ src, className, onLoad, onError, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) {
  const { attach, onLoad: revealLoad, onError: revealError, loaded } = useImageReveal(src, { showOnError: true });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- every caller's picture is a runner file or a blob behind a route, which the optimiser cannot reach.
    <img
      {...rest}
      ref={attach}
      src={src}
      alt={alt}
      data-loaded={loaded ? "" : undefined}
      onLoad={(event) => {
        revealLoad();
        onLoad?.(event);
      }}
      onError={(event) => {
        revealError();
        onError?.(event);
      }}
      className={cx(revealClass(loaded), className)}
    />
  );
}

/**
 * Fade a box in again whenever `key` changes, without remounting what is in
 * it: a view change (the layout, the kind, the grouping) redraws the grid in
 * place, and the tiles keep their pictures and focus. Not on the first render,
 * which the page's own fade covers.
 */
export function useFadeOnChange(ref: RefObject<HTMLElement | null>, key: string): void {
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    const box = ref.current;
    if (box === null || typeof box.animate !== "function" || prefersReducedMotion()) return;
    box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
  }, [ref, key]);
}
