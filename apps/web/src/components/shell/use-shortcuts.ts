"use client";

import { useEffect, useRef } from "react";

import { isImeKey } from "@/components/ui/composer-keys";
import { popoverOpen } from "@/components/ui/Popover";
import { isMacPlatform, isTypingTarget, resolveShortcut, type ShortcutAction } from "@/lib/shortcuts";

/**
 * Binds the shell's shortcuts (the bound rows of `SHORTCUTS`) on the window
 * while the shell is mounted, and calls the caller's handler for each.
 *
 * A press is left alone when something already took it (`defaultPrevented`),
 * while an input method is composing, on a key held down (a held Cmd+. would
 * fold and unfold until it was let go), while a modal dialog is open,
 * since the shell behind it is inert, and while a kit popover is open (a row's
 * menu), which Escape closes first. With focus in a field or the composer
 * only search fires (`resolveShortcut`). A press a handler acted on is
 * prevented, so the browser's own Cmd+K or Cmd+. does not run as well; a
 * handler that returns false had nothing to do there (the sidebar is hidden
 * on a focus page), and the key goes on to the browser.
 */
export function useShellShortcuts(handlers: Record<ShortcutAction, () => boolean | void>, studio: boolean): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const mac = isMacPlatform();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeKey(event) || event.repeat) return;
      const action = resolveShortcut(event, {
        mac,
        typing: isTypingTarget(event.target),
        // An open kit menu counts too: folding the sidebar under a row's
        // menu would move the menu's anchor out from under it.
        modal: document.querySelector("dialog[open]") !== null || popoverOpen(),
        studio,
      });
      if (action === null) return;
      if (latest.current[action]() !== false) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studio]);
}

/** Whether the shell is the phone's: the sidebar is a drawer below 768px. */
export function isPhoneWidth(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767.98px)").matches;
}
