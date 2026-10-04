// @vitest-environment jsdom
import { act, createElement, useId, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { tabIds } from "./roving";
import { TabList, type TabListOrientation } from "./TabList";

/**
 * The kit's tab row: the tabs pattern's roles and ids as the server draws
 * them, and the keys in a browser, for a row and for the row that becomes a
 * column at 1280px (Settings').
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
});

const ITEMS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta", count: 3 },
  { id: "c", label: "Gamma", glyph: "sliders" as const },
];

function Row({ orientation, onChange }: { orientation?: TabListOrientation; onChange?: (id: string) => void }) {
  const base = useId();
  const [value, setValue] = useState("a");
  return createElement(TabList<string>, {
    label: "Sections",
    items: ITEMS,
    value,
    idBase: base,
    orientation,
    onChange: (id: string) => {
      onChange?.(id);
      setValue(id);
    },
  });
}

function mount(orientation?: TabListOrientation) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const changes = vi.fn();
  act(() => root.render(createElement(Row, { orientation, onChange: changes })));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  return { container, tabs, changes };
}

const press = (key: string) =>
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

describe("TabList, as the server draws it", () => {
  it("is a named tablist whose chosen tab alone is in the tab order and points at its panel", () => {
    const html = renderToStaticMarkup(
      createElement(TabList<string>, { label: "Sections", items: ITEMS, value: "b", idBase: "t", onChange: () => {} }),
    );
    expect(html).toContain('role="tablist" aria-label="Sections" aria-orientation="horizontal"');
    const ids = tabIds("t", "b");
    expect(html).toContain(`id="${ids.tab}" aria-selected="true" aria-controls="${ids.panel}" tabindex="0"`);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    // The count and the glyph ride along with the label.
    expect(html).toMatch(/Beta<span[^>]*>3<\/span>/);
    expect(html).toContain("<svg");
  });

  it("draws the rail's look only for a responsive row", () => {
    const row = renderToStaticMarkup(createElement(TabList<string>, { label: "S", items: ITEMS, value: "a", idBase: "t", onChange: () => {} }));
    const rail = renderToStaticMarkup(
      createElement(TabList<string>, { label: "S", items: ITEMS, value: "a", idBase: "t", onChange: () => {}, orientation: "responsive" }),
    );
    expect(row).not.toContain("xl:flex-col");
    expect(rail).toContain("xl:flex-col");
    expect(rail).toContain("xl:bg-surface2");
  });
});

describe("TabList, with the keyboard", () => {
  it("moves along a row with Left, Right, Home and End, choosing as it goes, and leaves Up and Down to the page", () => {
    const { tabs, changes } = mount();
    act(() => tabs()[0].focus());
    press("ArrowRight");
    expect(changes).toHaveBeenLastCalledWith("b");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    press("End");
    expect(document.activeElement).toBe(tabs()[2]);
    press("ArrowRight");
    expect(changes).toHaveBeenLastCalledWith("a");
    press("ArrowLeft");
    expect(changes).toHaveBeenLastCalledWith("c");
    press("Home");
    expect(changes).toHaveBeenLastCalledWith("a");
    changes.mockClear();
    press("ArrowDown");
    press("ArrowUp");
    expect(changes).not.toHaveBeenCalled();
  });

  it("takes either pair of arrows on a responsive row, and says it is a column from 1280px", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1280px)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { tabs, changes, container } = mount("responsive");
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe("vertical");
    act(() => tabs()[0].focus());
    press("ArrowDown");
    expect(changes).toHaveBeenLastCalledWith("b");
    press("ArrowRight");
    expect(changes).toHaveBeenLastCalledWith("c");
    press("ArrowUp");
    expect(changes).toHaveBeenLastCalledWith("b");
  });

  it("chooses on a press", () => {
    const { tabs, changes } = mount();
    act(() => tabs()[2].click());
    expect(changes).toHaveBeenLastCalledWith("c");
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
  });
});
