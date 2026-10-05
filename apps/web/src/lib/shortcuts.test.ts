// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  isMacUserAgent,
  isTypingTarget,
  keyLabels,
  keyWords,
  matchesCombo,
  resolveShortcut,
  SHORTCUTS,
  shortcutsFor,
  type KeyPress,
  type ShortcutContext,
} from "./shortcuts";

/**
 * The shortcuts table: one row per shortcut, the bound ones named by their
 * action, drawn as ⌘ on a Mac and Ctrl elsewhere, and kept from firing while
 * someone types, except search.
 */

const press = (over: Partial<KeyPress>): KeyPress => ({ key: "", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over });
const ctx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({ mac: true, typing: false, modal: false, studio: true, ...over });

describe("the table", () => {
  it("has unique ids, a sentence-case label and at least one key on every row", () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    for (const s of SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.label[0]).toBe(s.label[0]?.toUpperCase());
      expect(s.label.slice(1)).not.toMatch(/[A-Z]{2,}/);
    }
  });

  it("binds Manus's three and the sheet, each once, and lists the keys other parts handle as read only", () => {
    const bound = SHORTCUTS.filter((s) => s.action !== null).map((s) => s.action);
    expect(bound.sort()).toEqual(["new-chat", "search", "show-shortcuts", "toggle-sidebar"]);
    const fixed = SHORTCUTS.filter((s) => s.action === null).map((s) => s.id);
    expect(fixed).toEqual(expect.arrayContaining(["close", "preview-step", "menu-move"]));
  });

  it("leaves New chat out of a deployment with no studio", () => {
    expect(shortcutsFor(false).map((s) => s.id)).not.toContain("new-chat");
    expect(shortcutsFor(true).map((s) => s.id)).toContain("new-chat");
  });
});

describe("the platform", () => {
  it("reads a Mac, an iPad and an iPhone from the user agent, and nothing else", () => {
    expect(isMacUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true);
    expect(isMacUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isMacUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(isMacUserAgent(null)).toBe(false);
  });

  it("draws the modifier as ⌘ and ⇧ on a Mac and Ctrl and Shift elsewhere, a letter in capitals", () => {
    const newChat = { mod: true, shift: true, key: "o" };
    expect(keyLabels(newChat, true)).toEqual(["⌘", "⇧", "O"]);
    expect(keyLabels(newChat, false)).toEqual(["Ctrl", "Shift", "O"]);
    expect(keyLabels({ mod: true, key: "." }, true)).toEqual(["⌘", "."]);
    expect(keyLabels({ key: "Escape" }, false)).toEqual(["Esc"]);
    expect(keyLabels({ key: "ArrowLeft" }, true)).toEqual(["←"]);
  });

  it("says each combo in words for a screen reader", () => {
    expect(keyWords({ mod: true, key: "k" }, true)).toBe("Command K");
    expect(keyWords({ mod: true, key: "." }, false)).toBe("Ctrl Period");
  });

  it("matches the platform's modifier only, so Ctrl+K on a Mac stays the browser's", () => {
    const k = { mod: true, key: "k" };
    expect(matchesCombo(press({ key: "k", metaKey: true }), k, true)).toBe(true);
    expect(matchesCombo(press({ key: "k", ctrlKey: true }), k, true)).toBe(false);
    expect(matchesCombo(press({ key: "k", ctrlKey: true }), k, false)).toBe(true);
    expect(matchesCombo(press({ key: "k", metaKey: true }), k, false)).toBe(false);
    expect(matchesCombo(press({ key: "k", metaKey: true, altKey: true }), k, true)).toBe(false);
  });

  it("takes Shift as part of Cmd+Shift+O, in either case, and not as part of ?", () => {
    expect(matchesCombo(press({ key: "O", metaKey: true, shiftKey: true }), { mod: true, shift: true, key: "o" }, true)).toBe(true);
    expect(matchesCombo(press({ key: "o", metaKey: true }), { mod: true, shift: true, key: "o" }, true)).toBe(false);
    expect(matchesCombo(press({ key: "?", shiftKey: true }), { key: "?" }, true)).toBe(true);
  });
});

describe("not while typing", () => {
  it("counts a text field, a textarea, a select and an editable region as typing, and a button or checkbox not", () => {
    const make = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      return host.firstElementChild!;
    };
    expect(isTypingTarget(make("<input>"))).toBe(true);
    expect(isTypingTarget(make('<input type="search">'))).toBe(true);
    expect(isTypingTarget(make("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(make("<select></select>"))).toBe(true);
    const editor = make('<div contenteditable="true"><p><span>hi</span></p></div>');
    expect(isTypingTarget(editor.querySelector("span"))).toBe(true);
    expect(isTypingTarget(make('<div contenteditable="false"><span></span></div>').firstElementChild)).toBe(false);
    expect(isTypingTarget(make('<input type="checkbox">'))).toBe(false);
    expect(isTypingTarget(make("<button></button>"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("fires only search while typing, as Manus does", () => {
    expect(resolveShortcut(press({ key: "k", metaKey: true }), ctx({ typing: true }))).toBe("search");
    expect(resolveShortcut(press({ key: ".", metaKey: true }), ctx({ typing: true }))).toBeNull();
    expect(resolveShortcut(press({ key: "?", shiftKey: true }), ctx({ typing: true }))).toBeNull();
    expect(resolveShortcut(press({ key: "O", metaKey: true, shiftKey: true }), ctx({ typing: true }))).toBeNull();
  });

  it("resolves each bound press outside a field, and nothing while a modal dialog is open", () => {
    expect(resolveShortcut(press({ key: ".", metaKey: true }), ctx())).toBe("toggle-sidebar");
    expect(resolveShortcut(press({ key: "O", metaKey: true, shiftKey: true }), ctx())).toBe("new-chat");
    expect(resolveShortcut(press({ key: "?", shiftKey: true }), ctx())).toBe("show-shortcuts");
    expect(resolveShortcut(press({ key: "/", ctrlKey: true }), ctx({ mac: false }))).toBe("show-shortcuts");
    expect(resolveShortcut(press({ key: "k", metaKey: true }), ctx({ modal: true }))).toBeNull();
    expect(resolveShortcut(press({ key: "O", metaKey: true, shiftKey: true }), ctx({ studio: false }))).toBeNull();
  });

  it("never binds a read-only row: Escape and the arrows stay where they are", () => {
    for (const key of ["Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(resolveShortcut(press({ key }), ctx())).toBeNull();
    }
  });
});
