"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { shouldRefresh } from "@/lib/home-core";

/** How old Home may be before a returning tab reads it again. */
const MAX_AGE_MS = 60_000;
/** How long one refresh is waited for before a return may ask again. */
const PENDING_MS = 10_000;

/**
 * Read Home again when its tab comes back into view or regains focus, once
 * what it shows is more than a minute old. Another tab is where most of what
 * Home lists happens (a module opened, a video watched, a concept answered),
 * so a Home left open would otherwise go on showing the threads, the next
 * steps and the recall picks from when it was loaded.
 *
 * The age is the browser's own count from when this read was drawn (`asOf`
 * only marks a new one), so a server clock that disagrees with the browser's
 * cannot shift it, and one refresh at a time is asked for, since a return can
 * fire both events. `router.refresh()` re-renders the server components
 * without losing client state, so a half-typed Ask box survives it. It took
 * over this job from the top bar's habit refresh, which went with the streak
 * (H1 of docs/proposals/home-page.md).
 */
export function RefreshOnReturn({ asOf }: { asOf: string }) {
  const router = useRouter();
  const drawnAt = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    // A new read arrived: start its clock, and let the next return ask again.
    drawnAt.current = Date.now();
    pending.current = false;
  }, [asOf]);

  useEffect(() => {
    const check = () => {
      const go = shouldRefresh({
        visible: document.visibilityState === "visible",
        pending: pending.current,
        drawnAt: drawnAt.current,
        now: Date.now(),
        maxAgeMs: MAX_AGE_MS,
      });
      if (!go) return;
      pending.current = true;
      router.refresh();
      // A refresh that never lands (the network dropped) must not block the
      // next return for good; one that lands resets this through `asOf`.
      window.setTimeout(() => {
        pending.current = false;
      }, PENDING_MS);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router]);
  return null;
}
