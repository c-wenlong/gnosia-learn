"use client";

import { useEffect } from "react";

import { applyMotionToDocument, readMotionCookie, writeMotionCookie } from "@/lib/motion";
import type { MotionMode } from "@/lib/preferences";

/**
 * Writes the motion cookie in a browser that has none, from the stored
 * preference the `(app)` layout read for it, and applies it at once, so
 * "Always reduce motion" chosen in another browser holds here from the next
 * frame and from the first paint of every page after. The theme's equivalent
 * is the `LearnerProvider` effect that reseeds its cookie.
 */
export function MotionSeed({ mode }: { mode: MotionMode }) {
  useEffect(() => {
    if (readMotionCookie() !== null) return;
    writeMotionCookie(mode);
    applyMotionToDocument(mode);
  }, [mode]);
  return null;
}
