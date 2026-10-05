/**
 * The app's keyboard shortcuts, in one table (2026-10-05, after Manus's
 * Settings, Shortcuts pane: Cmd+. folds the sidebar, Cmd+K searches,
 * Cmd+Shift+O starts a new task). The shell's binding
 * (`components/shell/use-shortcuts.ts`) and every list of them (the sheet
 * that "?" opens, the Settings card) read this table, so what is listed is
 * what is bound.
 *
 * Pure and React-free: a `"use client"` module's exports are client
 * references (AGENTS.md), and the server page reads `isMacUserAgent` here.
 */

/** What a bound shortcut does. The shell maps each one to its handler. */
export type ShortcutAction = "toggle-sidebar" | "search" | "new-chat" | "show-shortcuts";

/**
 * One key press, platform-neutral: `mod` is Command on a Mac and Control
 * elsewhere. `key` is `KeyboardEvent.key`, compared without case.
 */
export interface KeyCombo {
  mod?: boolean;
  shift?: boolean;
  key: string;
}

export interface Shortcut {
  id: string;
  /** What it does, in sentence case: the list's row label. */
  label: string;
  /** Each way to press it; the list shows them joined by "or". */
  keys: readonly KeyCombo[];
  /**
   * The shell's handler, or null for a key some other part of the app
   * already handles (the previewer's arrows, Escape in a menu): listed so
   * the list is complete, never bound by the shell.
   */
  action: ShortcutAction | null;
  /** Where a listed key works, when it is not everywhere. */
  where?: string;
  /** Fires with focus in a field or the composer too. Only search does, as in Manus. */
  whileTyping?: boolean;
  /** Only a deployment with a studio has it (New chat is the studio). */
  needsStudio?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "new-chat", label: "New chat", keys: [{ mod: true, shift: true, key: "o" }], action: "new-chat", needsStudio: true },
  { id: "search", label: "Search recent", keys: [{ mod: true, key: "k" }], action: "search", whileTyping: true },
  { id: "toggle-sidebar", label: "Fold or unfold the sidebar", keys: [{ mod: true, key: "." }], action: "toggle-sidebar" },
  { id: "show-shortcuts", label: "Show keyboard shortcuts", keys: [{ key: "?" }, { mod: true, key: "/" }], action: "show-shortcuts" },
  { id: "close", label: "Close a dialog, a menu or the sidebar drawer", keys: [{ key: "Escape" }], action: null },
  { id: "clear-search", label: "Clear the search", keys: [{ key: "Escape" }], action: null, where: "In the search field" },
  { id: "menu-move", label: "Move through a menu", keys: [{ key: "ArrowUp" }, { key: "ArrowDown" }], action: null, where: "In an open menu" },
  { id: "preview-step", label: "Previous or next item", keys: [{ key: "ArrowLeft" }, { key: "ArrowRight" }], action: null, where: "In the Library's previewer" },
];

/** The table as a deployment sees it: New chat only with a studio. */
export function shortcutsFor(studio: boolean): readonly Shortcut[] {
  return SHORTCUTS.filter((s) => studio || s.needsStudio !== true);
}

/** Whether a user agent string is Apple's, whose shortcuts use Command. */
export function isMacUserAgent(userAgent: string | null | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(userAgent ?? "");
}

/** Whether this browser is on Apple's platforms. Server side, false. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const hinted = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return isMacUserAgent(hinted || navigator.platform || navigator.userAgent);
}

const KEY_NAMES: Record<string, string> = {
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  enter: "Enter",
  " ": "Space",
};

/**
 * The keycaps one combo is drawn as: ⌘ and ⇧ on a Mac, Ctrl and Shift
 * elsewhere, then the key itself (a letter in capitals, as printed on it).
 */
export function keyLabels(combo: KeyCombo, mac: boolean): string[] {
  const caps: string[] = [];
  if (combo.mod === true) caps.push(mac ? "⌘" : "Ctrl");
  if (combo.shift === true) caps.push(mac ? "⇧" : "Shift");
  const name = KEY_NAMES[combo.key.toLowerCase()] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  caps.push(name);
  return caps;
}

/** A combo said in words, for a screen reader and a `title`: "Command K", "Ctrl Shift O". */
export function keyWords(combo: KeyCombo, mac: boolean): string {
  const words: string[] = [];
  if (combo.mod === true) words.push(mac ? "Command" : "Ctrl");
  if (combo.shift === true) words.push("Shift");
  const named: Record<string, string> = {
    escape: "Escape",
    arrowup: "Up arrow",
    arrowdown: "Down arrow",
    arrowleft: "Left arrow",
    arrowright: "Right arrow",
    ".": "Period",
    "/": "Slash",
    "?": "Question mark",
  };
  words.push(named[combo.key.toLowerCase()] ?? combo.key.toUpperCase());
  return words.join(" ");
}

/** The parts of a `KeyboardEvent` a match reads. */
export interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Whether a press is this combo. The platform's modifier must be held when
 * the combo has one and the other must not, so Ctrl+K on a Mac and the
 * Windows key elsewhere stay the browser's. "?" is a shifted key on most
 * layouts, so its own Shift is not counted.
 */
export function matchesCombo(press: KeyPress, combo: KeyCombo, mac: boolean): boolean {
  if (press.altKey) return false;
  const mod = mac ? press.metaKey : press.ctrlKey;
  const other = mac ? press.ctrlKey : press.metaKey;
  if (other || mod !== (combo.mod === true)) return false;
  if (combo.key !== "?" && press.shiftKey !== (combo.shift === true)) return false;
  return press.key.toLowerCase() === combo.key.toLowerCase();
}

/**
 * Whether focus is somewhere a key types: a text field, a select, or an
 * editable region (the Lexical composer is a `contenteditable`). Buttons,
 * checkboxes and the like are not typing.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target.getAttribute("type") ?? "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(type);
  }
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

/** What else decides whether a bound shortcut fires. */
export interface ShortcutContext {
  mac: boolean;
  /** Focus is in a field or the composer (`isTypingTarget`). */
  typing: boolean;
  /** A modal dialog is open: the page behind it is inert, so nothing in the shell is bound. */
  modal: boolean;
  studio: boolean;
}

/** The bound action a press asks for, or null to leave the key alone. */
export function resolveShortcut(press: KeyPress, context: ShortcutContext): ShortcutAction | null {
  if (context.modal) return null;
  for (const shortcut of shortcutsFor(context.studio)) {
    if (shortcut.action === null) continue;
    if (context.typing && shortcut.whileTyping !== true) continue;
    if (shortcut.keys.some((combo) => matchesCombo(press, combo, context.mac))) return shortcut.action;
  }
  return null;
}
