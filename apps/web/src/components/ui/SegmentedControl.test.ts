// @vitest-environment jsdom
import { act, createElement, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SegmentedControl, type SegmentItem } from "./SegmentedControl";

/**
 * The kit's segmented control: as the server draws it (the face already
 * under the chosen segment, the two modes' roles), and in a browser, where a
 * radio group moves and chooses on every arrow.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

type Look = "light" | "dark" | "system";
const ITEMS: SegmentItem<Look>[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const thumbOf = (html: string) => html.match(/<span aria-hidden="true" data-segment-thumb=""[^>]*>/)?.[0] ?? "";

describe("SegmentedControl, as the server draws it", () => {
  it("is a radio group whose chosen radio alone is in the tab order", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<Look>, { label: "Appearance", items: ITEMS, value: "dark", onChange: () => {} }),
    );
    expect(html).toContain('role="radiogroup" aria-label="Appearance"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/aria-checked="true" tabindex="0"[^>]*data-option="dark"/);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  });

  it("puts the face under the chosen segment, a third of the track wide, and slides it only with motion", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<Look>, { label: "Appearance", items: ITEMS, value: "system", onChange: () => {} }),
    );
    const thumb = thumbOf(html);
    expect(thumb).toContain("width:calc((100% - 4px - 4px) / 3)");
    expect(thumb).toContain("translate:calc(2 * (100% + 2px)) 0");
    expect(thumb).toContain("transition-[translate]");
    expect(thumb).toContain("motion-reduce:transition-none");
  });

  it("is named by a visible caption when given one", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<Look>, {
        label: "Appearance",
        labelledBy: "cap",
        items: ITEMS,
        value: "light",
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-labelledby="cap"');
    expect(html).not.toContain('aria-label="Appearance"');
  });

  it("in links mode is a group of links, each in the tab order, the current one marked", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<"grid" | "list">, {
        mode: "links",
        label: "Layout",
        iconOnly: true,
        value: "list",
        items: [
          { id: "grid", label: "Grid", icon: "assets", href: "/library" },
          { id: "list", label: "List", icon: "topics", href: "/library?view=list" },
        ],
      }),
    );
    expect(html).toContain('role="group" aria-label="Layout"');
    expect(html).not.toContain("radio");
    expect(html).not.toContain("tabindex");
    const links = [...html.matchAll(/<a ([^>]*)>/g)].map(([, attrs]) => attrs);
    expect(links).toHaveLength(2);
    const [grid, list] = links;
    expect(list).toContain('href="/library?view=list"');
    expect(list).toContain('aria-current="page"');
    expect(list).toContain('aria-label="List" title="List"');
    expect(grid).toContain('href="/library"');
    expect(grid).not.toContain("aria-current");
    expect(grid).toContain('aria-label="Grid"');
    // Icons only: the names are the labels, not words on the face.
    expect(html).not.toMatch(/>Grid</);
    expect(thumbOf(html)).toContain("translate:calc(1 * (100% + 2px)) 0");
  });

  it("draws no face while no link is current", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<string>, {
        mode: "links",
        label: "Kind",
        value: "none",
        items: [{ id: "a", label: "A", href: "/a" }],
      }),
    );
    expect(thumbOf(html)).toBe("");
    expect(html).not.toContain("aria-current");
  });
});

describe("SegmentedControl, with the keyboard", () => {
  function Controlled({ onChange }: { onChange: (next: Look) => void }) {
    const [value, setValue] = useState<Look>("light");
    return createElement(SegmentedControl<Look>, {
      label: "Appearance",
      items: ITEMS,
      value,
      onChange: (next: Look) => {
        onChange(next);
        setValue(next);
      },
    });
  }

  const press = (key: string) =>
    act(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

  it("moves and chooses on every arrow, wrapping, and leaves Home and End alone", () => {
    const changes = vi.fn();
    const container = mount(createElement(Controlled, { onChange: changes }));
    const radios = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    act(() => radios()[0].focus());

    press("ArrowRight");
    expect(changes).toHaveBeenLastCalledWith("dark");
    expect(document.activeElement).toBe(radios()[1]);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);

    press("ArrowDown");
    expect(document.activeElement).toBe(radios()[2]);
    press("ArrowDown");
    expect(changes).toHaveBeenLastCalledWith("light");
    press("ArrowUp");
    expect(changes).toHaveBeenLastCalledWith("system");
    press("ArrowLeft");
    expect(changes).toHaveBeenLastCalledWith("dark");

    changes.mockClear();
    press("Home");
    press("End");
    expect(changes).not.toHaveBeenCalled();
    expect(radios()[1].getAttribute("aria-checked")).toBe("true");
  });

  it("slides the face to the new segment", () => {
    const container = mount(createElement(Controlled, { onChange: () => {} }));
    const thumb = () => container.querySelector<HTMLElement>("[data-segment-thumb]")!;
    expect(thumb().style.translate).toBe("calc(0 * (100% + 2px)) 0");
    act(() => container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[2].click());
    expect(thumb().style.translate).toBe("calc(2 * (100% + 2px)) 0");
  });

  it("does nothing while disabled", () => {
    const changes = vi.fn();
    const container = mount(
      createElement(SegmentedControl<Look>, { label: "Appearance", items: ITEMS, value: "light", onChange: changes, disabled: true }),
    );
    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.every((r) => r.disabled)).toBe(true);
    act(() => radios[1].click());
    expect(changes).not.toHaveBeenCalled();
  });
});
