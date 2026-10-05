// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { SHORTCUTS } from "@/lib/shortcuts";

import { ShortcutsCard } from "./ShortcutsCard";

/**
 * Settings' Shortcuts card: every row of the table but New chat (no studio
 * outside the shell), with ⌘ from the server's guess on the first paint and
 * the browser's own answer after.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("the Shortcuts card", () => {
  it("draws the server's guess on the first paint: ⌘ for a Mac", () => {
    const html = renderToString(createElement(ShortcutsCard, { macGuess: true }));
    expect(html).toContain("Shortcuts");
    expect(html).toContain("⌘");
    expect(html).not.toContain(">Ctrl<");
  });

  it("lists the table, without New chat outside a shell with a studio, in the browser's keys", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(createElement(ShortcutsCard, { macGuess: true })));
    const rows = [...container.querySelectorAll("[data-shortcut]")].map((row) => row.getAttribute("data-shortcut"));
    expect(rows).toEqual(SHORTCUTS.filter((s) => s.id !== "new-chat").map((s) => s.id));
    // jsdom is not a Mac, and the browser's answer wins once mounted.
    expect([...container.querySelectorAll('[data-shortcut="toggle-sidebar"] kbd')].map((k) => k.textContent)).toEqual(["Ctrl", "."]);
    act(() => root.unmount());
    container.remove();
  });
});
