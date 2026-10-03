"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Asks the server for the page again once the runner has renewed its lists.
 *
 * The runner answers the grid's lists from memory (`services/studio/src/listings.ts`),
 * and a list older than its lifetime is served while a fresh read runs behind
 * it, so the visit does not wait. The page draws this only when one of its
 * lists said so (`cache.renewing`), and it refreshes after about as long as the
 * runner's reads take together, so a diagram or a video that landed outside the
 * studio appears a moment after the grid does. The refreshed page no longer
 * draws it once the lists are current, which ends the loop; three tries is the
 * ceiling for a runner that is very slow.
 */

const RENEW_WAIT_MS = 2_500;
const TRIES = 3;

export function RenewLists() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    let timer: number;
    const tick = () => {
      router.refresh();
      tries += 1;
      if (tries < TRIES) timer = window.setTimeout(tick, RENEW_WAIT_MS);
    };
    timer = window.setTimeout(tick, RENEW_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [router]);
  return null;
}
