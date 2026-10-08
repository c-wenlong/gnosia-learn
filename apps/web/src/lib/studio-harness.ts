/**
 * The pane picker's last pick, kept in `localStorage`: a draft is made before
 * its pane exists, and `POST /api/drafts`'s `harness` is read from here so the
 * next conversation keeps the harness the last one ran on. `"claude"` is the
 * default and is never written.
 */

const KEY = "studio:harness";

export type HarnessValue = "claude" | "codex" | "byok";

const KNOWN: readonly string[] = ["claude", "codex", "byok"];

/** A read or write that throws (a private window, blocked site data) is a convenience lost, never an error. */
function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

export function storedHarness(): HarnessValue {
  const held = safely(() => (typeof window === "undefined" ? null : window.localStorage.getItem(KEY)), null);
  return held !== null && KNOWN.includes(held) ? (held as HarnessValue) : "claude";
}

export function rememberHarness(harness: HarnessValue): void {
  safely(() => {
    if (harness === "claude") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, harness);
  }, undefined);
}
