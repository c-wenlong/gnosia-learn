"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { habitIsStale } from "@/lib/habit-core";

/** How old the pills may get before a returning or idle tab asks again. */
const MAX_AGE_MS = 30 * 60_000;
/** How often an open, visible tab checks. */
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * Keep the top bar's streak and target from going stale.
 *
 * They are computed by the root layout, and Next keeps a layout mounted across
 * client-side navigation, so the numbers are whatever they were at the last
 * full render. `router.refresh()` re-renders the server components, the layout
 * included, without losing client state. This calls it when the tab comes back
 * into view or regains focus, and every few minutes while it is visible, but
 * only once the numbers are older than half an hour or the day has turned.
 *
 * A page that writes study events (a session step, a review grade) should call
 * `router.refresh()` itself after the write; this hook is the backstop, not
 * the mechanism.
 */
export function useHabitRefresh(asOf: string): void {
  const router = useRouter();
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && habitIsStale(asOf, new Date(), MAX_AGE_MS)) {
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, [asOf, router]);
}
