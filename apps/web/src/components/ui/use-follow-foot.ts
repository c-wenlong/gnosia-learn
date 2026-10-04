"use client";

import { useEffect, useRef, type RefObject } from "react";

import { scrollBehavior } from "@/lib/motion";

/** How far above the foot still counts as reading it: about two lines of a log. */
export const NEAR_FOOT_PX = 40;

/**
 * Keep a scrolling box (a thread, a log) at its foot as it grows: each time
 * `trigger` changes, the box scrolls to its end. Only the box scrolls, never
 * the page.
 *
 * `trigger` is compared as an effect's dependency is, by identity; a caller
 * with several things to watch passes them as one memoised array.
 *
 * A box seen for the first time (opening, or a box swapped for another) jumps
 * straight to its foot, since gliding through a whole conversation on
 * opening would be a wait. After that, `glide` makes each move a smooth
 * scroll, which `scrollBehavior()` turns back into a jump for a reader who
 * asked for less motion.
 *
 * `onlyNearFoot` is for a box that changes without the reader doing anything,
 * such as a log polled every few seconds: it follows only while the reader is
 * at the foot, so someone who scrolled up to read stays where they are until
 * they scroll back down. Whether they are is decided by their scrolling, not
 * by measuring after the box has grown (by then the new lines are between
 * them and the foot): scrolling up away from the foot stops the following,
 * reaching the foot again (within `NEAR_FOOT_PX`) starts it, and a glide on
 * its way down changes neither.
 */
export function useFollowFoot(
  ref: RefObject<HTMLElement | null>,
  trigger: unknown,
  { glide = false, onlyNearFoot = false }: { glide?: boolean; onlyNearFoot?: boolean } = {},
): void {
  /** The box the last move was made in. */
  const followed = useRef<HTMLElement | null>(null);
  /** Whether the reader is at the foot, for `onlyNearFoot`. */
  const atFoot = useRef(true);

  useEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const fresh = followed.current !== box;
    followed.current = box;
    if (fresh) atFoot.current = true;

    if (!onlyNearFoot || atFoot.current) {
      if (glide && !fresh && typeof box.scrollTo === "function") box.scrollTo({ top: box.scrollHeight, behavior: scrollBehavior() });
      else box.scrollTop = box.scrollHeight;
    }
    if (!onlyNearFoot) return;

    let lastTop = box.scrollTop;
    const onScroll = () => {
      const top = box.scrollTop;
      if (box.scrollHeight - top - box.clientHeight <= NEAR_FOOT_PX) atFoot.current = true;
      else if (top < lastTop) atFoot.current = false;
      lastTop = top;
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [ref, trigger, glide, onlyNearFoot]);
}
