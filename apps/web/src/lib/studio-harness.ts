import { safely } from "@/lib/storage-safe";

/**
 * The pane picker's last pick, kept in `localStorage`: a draft is made before
 * its pane exists, and `POST /api/drafts`'s `harness` is read from here so the
 * next conversation keeps the harness the last one ran on. `"claude"` is the
 * default and is never written.
 */

const KEY = "studio:harness";

export type HarnessValue = "claude" | "codex" | "byok";

const KNOWN: readonly string[] = ["claude", "codex", "byok"];

/** The pick as last made this page load, for when storage cannot be read either. */
let held: HarnessValue | null = null;

/**
 * The pick as a subscribed store: every `rememberHarness` notifies, so the
 * picker in a pane and the composer's model row cannot disagree, and a
 * storage event carries another tab's pick the same way.
 */
const listeners = new Set<() => void>();

export function subscribeHarness(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== "undefined") window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onChange);
  };
}

export function storedHarness(): HarnessValue {
  // Three cases, kept distinct: a read that threw is storage blocked outright
  // (`undefined`); a read that came back a known value is shared truth, the
  // latest write from any tab; null is "no write ever landed" — since claude
  // is written rather than removed, an empty slot cannot be a reset, so the
  // in-memory pick a failed write left still stands.
  const stored = safely(() => (typeof window === "undefined" ? undefined : window.localStorage.getItem(KEY)), undefined);
  if (stored !== undefined && stored !== null && KNOWN.includes(stored)) return stored as HarnessValue;
  return held ?? "claude";
}

export function rememberHarness(harness: HarnessValue): void {
  // Write "claude" rather than remove the key: a readable null then means
  // only "this write failed", which is what the memory fallback is for. Only
  // a write that threw leaves a copy standing; one that landed is the store's
  // to keep, so a pick elsewhere is not shadowed by it.
  const wrote = safely(() => {
    window.localStorage.setItem(KEY, harness);
    return true;
  }, false);
  held = wrote ? null : harness;
  for (const listener of listeners) listener();
}
