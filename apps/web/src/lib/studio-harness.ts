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

/** The pick as last made this page load, for when storage cannot keep it. */
let held: HarnessValue | null = null;

export function storedHarness(): HarnessValue {
  const stored = safely(() => (typeof window === "undefined" ? null : window.localStorage.getItem(KEY)), null);
  if (stored !== null && KNOWN.includes(stored)) return stored as HarnessValue;
  return held ?? "claude";
}

export function rememberHarness(harness: HarnessValue): void {
  held = harness;
  safely(() => {
    if (harness === "claude") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, harness);
  }, undefined);
}
