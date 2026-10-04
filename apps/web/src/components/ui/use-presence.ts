"use client";

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "@/lib/motion";

/**
 * Keeps something mounted for one beat after it closes, so it can animate
 * out rather than vanish: a menu, a listbox, anything that mounts on open
 * and is cheap to keep for `exitMs` more.
 *
 * `mounted` says whether to render it at all, and `leaving` that it is on its
 * way out: render it `inert`, with `pointer-events-none` and an exit
 * animation (`animate-pop-out`), and do not point a control's
 * `aria-controls` at it. Opening again while it leaves takes it straight back.
 *
 * Under reduced motion (the device's or Settings', `prefersReducedMotion`)
 * there is no beat: it unmounts on the render that closes it.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [leaving, setLeaving] = useState(false);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    // Read here rather than in an effect: the choice is made once, on the
    // render that closes, and that render only ever happens in the browser.
    setLeaving(!open && exitMs > 0 && !prefersReducedMotion());
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [leaving, exitMs]);

  return { mounted: open || leaving, leaving: !open && leaving };
}
