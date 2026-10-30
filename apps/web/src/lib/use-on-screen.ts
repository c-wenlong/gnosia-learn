"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether the element is on screen, or within a screen's margin of it: what a
 * grid tile asks before it polls for a picture. False until the observer
 * answers, and false where there is no `IntersectionObserver`.
 */
export function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setOn(entries.some((entry) => entry.isIntersecting)), {
      rootMargin: "200px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return on;
}
