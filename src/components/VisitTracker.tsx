"use client";

import { useEffect, useRef } from "react";
import { useLearner } from "@/lib/learner-context";

export function VisitTracker({
  courseSlug,
  moduleSlug,
}: {
  courseSlug: string;
  moduleSlug?: string;
}) {
  const { ready, markVisited } = useLearner();
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!ready) return;
    const key = `${courseSlug}:${moduleSlug ?? ""}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    markVisited(courseSlug, moduleSlug);
  }, [ready, courseSlug, moduleSlug, markVisited]);

  return null;
}
