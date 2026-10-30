// @vitest-environment jsdom
import { act, createElement, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Disclosure } from "./Disclosure";

type Props = ComponentProps<typeof Disclosure>;

/**
 * The kit's toggle and fold: the button names the region it controls and
 * says whether it is open, the region is `inert` while shut, and a caller
 * can hold the open state itself.
 */

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

async function mount(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const toggle = (host: HTMLElement) => host.querySelector("button")!;
const region = (host: HTMLElement) => document.getElementById(toggle(host).getAttribute("aria-controls")!)!;

describe("Disclosure", () => {
  it("opens and shuts by itself, wiring the toggle to the fold it controls", async () => {
    const host = await mount(
      createElement(Disclosure, { summary: (open: boolean) => (open ? "Hide" : "Show"), className: "toggle" } as Props, "The content"),
    );
    expect(toggle(host).getAttribute("type")).toBe("button");
    expect(toggle(host).className).toBe("toggle");
    expect(toggle(host).getAttribute("aria-expanded")).toBe("false");
    expect(toggle(host).textContent).toBe("Show");
    expect(region(host).textContent).toBe("The content");
    expect(region(host).hasAttribute("inert")).toBe(true);
    await act(async () => toggle(host).click());
    expect(toggle(host).getAttribute("aria-expanded")).toBe("true");
    expect(toggle(host).textContent).toBe("Hide");
    expect(region(host).hasAttribute("inert")).toBe(false);
  });

  it("starts open when asked", async () => {
    const host = await mount(createElement(Disclosure, { summary: "Log", defaultOpen: true } as Props, "lines"));
    expect(toggle(host).getAttribute("aria-expanded")).toBe("true");
  });

  it("follows the caller's state when the caller holds it, and tells it of a press", async () => {
    const told = vi.fn();
    function Held() {
      const [open, setOpen] = useState(true);
      return createElement(
        Disclosure,
        {
          summary: "Raw log",
          open,
          onOpenChange: (next: boolean) => {
            told(next);
            setOpen(next);
          },
        } as Props,
        "lines",
      );
    }
    const host = await mount(createElement(Held));
    expect(toggle(host).getAttribute("aria-expanded")).toBe("true");
    await act(async () => toggle(host).click());
    expect(told).toHaveBeenCalledWith(false);
    expect(toggle(host).getAttribute("aria-expanded")).toBe("false");
  });

  it("stays as the caller holds it when the caller does not move", async () => {
    const pinned: Omit<Props, "children"> = { summary: "Pinned", open: false, onOpenChange: vi.fn() };
    const host = await mount(createElement(Disclosure, pinned as Props, "x"));
    await act(async () => toggle(host).click());
    expect(toggle(host).getAttribute("aria-expanded")).toBe("false");
  });
});
