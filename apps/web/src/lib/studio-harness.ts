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

/** The pick as last made this page load, for when storage cannot be read either. */
let held: HarnessValue | null = null;

export function storedHarness(): HarnessValue {
  // `undefined` marks a read that threw, distinct from a store that read back
  // empty: another tab's reset to claude lands as the empty kind, and wins.
  const stored = safely(() => (typeof window === "undefined" ? undefined : window.localStorage.getItem(KEY)), undefined);
  if (stored === undefined) return held ?? "claude";
  return KNOWN.includes(stored ?? "") ? (stored as HarnessValue) : "claude";
}

export function rememberHarness(harness: HarnessValue): void {
  // Only a write that threw leaves a memory copy standing; one that landed is
  // the store's to keep, so a reset elsewhere is not shadowed by it.
  const wrote = safely(() => {
    if (harness === "claude") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, harness);
    return true;
  }, false);
  held = wrote ? null : harness;
}
