"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { focusIsStill } from "@/components/studio/dialog-focus";

/** About two seconds of frames: how long a lazy composer is waited for. */
const FRAMES = 120;

/**
 * Call `take` with the handle once `ref` holds one, trying each frame for
 * `FRAMES` frames: the composer loads lazily, and is not rendered while the
 * panel shows a job, so one try may find nothing. `now` makes the first try
 * at once rather than on the next frame. Returns the cancel.
 */
function whenReady<T>(ref: RefObject<T | null>, take: (handle: T) => void, now: boolean): () => void {
  let frames = 0;
  let handle = 0;
  const attempt = () => {
    if (ref.current !== null) {
      take(ref.current);
      return;
    }
    if ((frames += 1) < FRAMES) handle = requestAnimationFrame(attempt);
  };
  if (now) attempt();
  else handle = requestAnimationFrame(attempt);
  return () => cancelAnimationFrame(handle);
}

/**
 * Focus for a composer that loads lazily, in its two uses.
 *
 * Opening focuses the composer once `open` is true and the composer exists.
 * It loads lazily, so the first try may find nothing, and the next frames try
 * again. By then the person may have clicked somewhere else, such as the
 * sidebar's search, and typing there must not land in the composer: it is
 * focused only while focus is still where it was when the panel mounted (the
 * panel is keyed by its draft, so mounting is opening), and only once.
 *
 * The returned `focusSoon` focuses the composer once it is on screen, for a
 * press that has just put something in it (an opener, a suggestion).
 */
export function useFocusWhenReady(ref: RefObject<{ focus: () => void } | null>, open: boolean): () => void {
  // Where focus was when the panel opened.
  const openedWith = useRef<Element | null>(null);
  useEffect(() => {
    openedWith.current = document.activeElement;
  }, []);

  const focused = useRef(false);
  useEffect(() => {
    if (!open || focused.current) return;
    return whenReady(
      ref,
      (handle) => {
        focused.current = true;
        if (focusIsStill(document.activeElement, openedWith.current)) handle.focus();
      },
      true,
    );
  }, [open, ref]);

  return useCallback(() => {
    whenReady(ref, (handle) => handle.focus(), false);
  }, [ref]);
}
