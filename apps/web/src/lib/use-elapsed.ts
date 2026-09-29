import { useEffect, useState, useSyncExternalStore } from "react";

import { elapsedMs, type Job } from "@/lib/studio-jobs";

const subscribeNever = () => () => {};

/**
 * Whether this render is the browser's, and the hydrating one is not.
 *
 * `false` on the server and on the browser's first pass over the server's
 * HTML (React hydrates with the server snapshot), `true` on every render after
 * that, and on a component mounted later by a client-side update, where there
 * is no server HTML to match.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * The wall clock, a second at a time, once the page has hydrated.
 *
 * `null` while the server's HTML is being matched: reading `Date.now()` during
 * render puts the server's second in the markup and the browser's second in the
 * first client render, and React logs a hydration mismatch for the text. A
 * caller shows nothing (and keeps the room for it) until this is a number.
 *
 * Ticks only while `ticking`, so a finished job's clock is not running for
 * nothing.
 */
export function useNow(ticking: boolean = true): number | null {
  const hydrated = useHydrated();
  // Read at mount, not per render, so it is one moment and not a moving one.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return hydrated ? now : null;
}

/**
 * How long a job has been going, in milliseconds.
 *
 * A finished job's figure comes from the record's own two timestamps, so it is
 * the same on the server and in the browser and is returned at once. A running
 * job's needs the browser's clock: `null` until the page has hydrated, then
 * counting up every second.
 */
export function useElapsed(job: Job): number | null {
  const now = useNow(job.finished === null);
  if (job.finished !== null) return elapsedMs(job, 0);
  return now === null ? null : elapsedMs(job, now);
}
