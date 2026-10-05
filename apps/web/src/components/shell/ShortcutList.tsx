"use client";

import { useSyncExternalStore } from "react";

import { cx, NOTE } from "@/components/ui/classes";
import { isMacPlatform, keyLabels, keyWords, type Shortcut } from "@/lib/shortcuts";

const noChange = () => () => undefined;

/**
 * Whether to draw Command or Control. The server's guess (from the request's
 * user agent, where a page has one) is what the first paint and hydration
 * use; the browser's own answer takes over straight after, so a guess that
 * was wrong is put right rather than mismatching.
 */
export function useIsMac(serverGuess = false): boolean {
  return useSyncExternalStore(noChange, isMacPlatform, () => serverGuess);
}

/** One key, as Manus draws it: a 26px cap, radius 6, a hairline, the key in 13px secondary text. */
export const KEYCAP = cx(
  "inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-md border border-hair bg-page px-1.5",
  "font-sans text-[13px] leading-none text-text2",
);

/**
 * The shortcuts table (`SHORTCUTS` in `lib/shortcuts.ts`) as rows: what it
 * does, where if not everywhere, and its keycaps at the right, each way to
 * press it separated by "or". The shortcuts sheet and the Settings card both
 * draw this, so the two cannot list different keys.
 */
export function ShortcutList({ shortcuts, mac }: { shortcuts: readonly Shortcut[]; mac: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-hair">
      {shortcuts.map((shortcut) => (
        <li key={shortcut.id} data-shortcut={shortcut.id} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 py-2">
          <div className="min-w-0 flex-1">
            <p className="font-sans text-[14px] leading-5 font-medium text-text">{shortcut.label}</p>
            {shortcut.where !== undefined && <p className={NOTE}>{shortcut.where}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {shortcut.keys.map((combo, at) => (
              <span key={at} className="flex items-center gap-1.5">
                {at > 0 && <span className={NOTE}>or</span>}
                <span className="sr-only">{keyWords(combo, mac)}</span>
                <span aria-hidden className="flex items-center gap-1" title={keyWords(combo, mac)}>
                  {keyLabels(combo, mac).map((cap, i) => (
                    <kbd key={i} className={KEYCAP}>
                      {cap}
                    </kbd>
                  ))}
                </span>
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
