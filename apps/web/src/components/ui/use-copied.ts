"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a button says "Copied" after a copy. */
export const COPIED_MS = 1500;

/**
 * Copy text to the clipboard and say "Copied" on the button that did it for a
 * moment: `copied` is the key of the last copy for `ms`, then null.
 *
 * One timer, cleared before each copy and when the component goes away. The
 * agent session and the recap card each had their own copy of this with a
 * timer per press, so a second copy within the beat was cut short by the
 * first one's timer, and a third button's "Copied" could vanish at once.
 *
 * `copy` resolves true once the text is on the clipboard and false when the
 * browser refused it (no permission, an insecure origin); what to say then is
 * the caller's.
 */
export function useCopied<K extends string = string>(ms: number = COPIED_MS): {
  copied: K | null;
  copy: (text: string, key: K) => Promise<boolean>;
} {
  const [copied, setCopied] = useState<K | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const copy = useCallback(
    async (text: string, key: K) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        stop();
        setCopied(null);
        return false;
      }
      stop();
      setCopied(key);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setCopied(null);
      }, ms);
      return true;
    },
    [ms, stop],
  );

  return { copied, copy };
}
