"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the studio's sidebar is collapsed to its rail, from 768px up: a
 * per-browser preference, so it is `localStorage` and not the URL. Read
 * through `useSyncExternalStore`, which draws the server's answer (open)
 * first and the stored one straight after, without a mismatch, and keeps
 * every tab's sidebar in step through the `storage` event.
 */
const KEY = "studio:sidebar-collapsed";
const CHANGED = "studio:sidebar-collapsed";
/** The last press in this tab, for a browser whose storage refuses writes. */
let pressed: boolean | null = null;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // A private window or blocked storage: this tab's last press, else open.
  }
  return pressed ?? false;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    pressed = next;
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Not kept, but this tab still follows the press.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [collapsed, set];
}
