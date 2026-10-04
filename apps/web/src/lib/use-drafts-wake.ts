import { useEffect } from "react";

import { DRAFT_CHANGED_EVENT } from "@/lib/studio-draft-list";

/** How long a burst of draft changes rests before one read covers them. */
export const DRAFTS_WAKE_SETTLE_MS = 400;

/**
 * Read the studio's conversations again when they may have moved: when the
 * window takes the focus back (another tab may have changed them), and when a
 * conversation on this page says it changed (`DRAFT_CHANGED_EVENT`). A turn
 * streams several changes in a breath, so those wait until they have rested
 * for `DRAFTS_WAKE_SETTLE_MS` and one read covers them; the focus reads at once.
 *
 * Listens only while `enabled`. `wake` should be stable (a `useCallback`):
 * a new one each render would take the listeners down and put them back.
 */
export function useDraftsWake(wake: () => unknown, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const now = () => void wake();
    let soon: ReturnType<typeof setTimeout> | null = null;
    const changed = () => {
      if (soon !== null) clearTimeout(soon);
      soon = setTimeout(now, DRAFTS_WAKE_SETTLE_MS);
    };
    window.addEventListener("focus", now);
    window.addEventListener(DRAFT_CHANGED_EVENT, changed);
    return () => {
      window.removeEventListener("focus", now);
      window.removeEventListener(DRAFT_CHANGED_EVENT, changed);
      if (soon !== null) clearTimeout(soon);
    };
  }, [wake, enabled]);
}
