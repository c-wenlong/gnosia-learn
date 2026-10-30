"use client";

import { useEffect } from "react";

import { applyMotionToDocument, readMotionCookie, writeMotionCookie } from "@/lib/motion";
import type { MotionMode } from "@/lib/preferences";

/**
 * Brings the motion cookie in line with the stored preference the `(app)`
 * layout read, on every page, and applies it at once: "Always reduce motion"
 * chosen in another browser holds here from the next frame and from the
 * first paint of every page after, and a cookie left over from a choice the
 * database never took gives way to the row, as the theme's does (the
 * `LearnerProvider` effect that rewrites its cookie). Rendered only when the
 * row could be read.
 */
export function MotionSeed({ mode }: { mode: MotionMode }) {
  useEffect(() => {
    if (readMotionCookie() === mode) return;
    writeMotionCookie(mode);
    applyMotionToDocument(mode);
  }, [mode]);
  return null;
}
