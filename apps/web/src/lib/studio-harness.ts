/**
 * The pane picker's last pick, kept in `localStorage`: a draft is made before
 * its pane is, so the harness it should run on has to outlive the picker that
 * named it. `POST /api/drafts` reads this when the caller does not name one.
 *
 * The values are the picker's rows: `"claude"` (the runner's default),
 * `"codex"` (a placeholder the runner refuses until it is wired) and `"byok"`
 * (Qwen Code on the key `byok.json` holds, set through the picker's dialog).
 */

const KEY = "self-learn:studio-harness";

export const HARNESS_VALUES = ["claude", "codex", "byok"] as const;
export type HarnessValue = (typeof HARNESS_VALUES)[number];

/** The last pick, or `"claude"` when none was ever made or storage is gone. */
export function storedHarness(): HarnessValue {
  if (typeof window === "undefined") return "claude";
  const held = window.localStorage.getItem(KEY);
  return (HARNESS_VALUES as readonly string[]).includes(held ?? "") ? (held as HarnessValue) : "claude";
}

/** The picker's write: the next `POST /api/drafts` runs on it. */
export function rememberHarness(harness: HarnessValue): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, harness);
}
