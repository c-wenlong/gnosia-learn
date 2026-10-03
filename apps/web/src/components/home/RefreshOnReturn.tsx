"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { readIsStale } from "@/lib/home-core";

/** How old Home may be before a returning tab reads it again. */
const MAX_AGE_MS = 60_000;

/**
 * Read Home again when its tab comes back into view or regains focus, once
 * what it shows is more than a minute old. Another tab is where most of what
 * Home lists happens (a module opened, a video watched, a concept answered),
 * so a Home left open would otherwise go on showing the threads, the next
 * steps and the recall picks from when it was loaded.
 *
 * `router.refresh()` re-renders the server components without losing client
 * state, so a half-typed Ask box survives it. It took over this job from the
 * top bar's habit refresh, which went with the streak (H1 of
 * docs/proposals/home-page.md).
 */
export function RefreshOnReturn({ asOf }: { asOf: string }) {
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && readIsStale(asOf, new Date(), MAX_AGE_MS)) router.refresh();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [asOf, router]);
  return null;
}
