// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sidebar's collapse (D83 of docs/STUDIO-CHAT-FIRST.md): the toggle
 * folds it to a rail and remembers that, resting the pointer on the rail
 * slides it out over the page and leaving slides it back, and the toggle
 * pressed then keeps it open. Classes are what is checked, since jsdom has
 * no layout: the `md:` ones are the desktop sidebar's.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-drafts")>()),
  listDrafts: async () => ({ ok: true, status: 200, data: { drafts: [], note: "" } }),
}));

const { StudioSidebar } = await import("./StudioSidebar");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(StudioSidebar, {
        initial: [],
        path: "/studio",
        titles: {},
        active: null,
        pending: null,
        open: false,
        onClose: () => {},
        onNewChat: () => {},
      }),
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const nav = () => container.querySelector("nav")!;
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  const room = () => nav().parentElement!;
  return { nav, button, room };
}

describe("the sidebar's collapse", () => {
  it("folds to a rail, remembers it, and opens again from the rail", () => {
    const { nav, button } = mount();
    expect(nav().className).toContain("md:flex");
    act(() => button("Close the sidebar")!.click());
    expect(localStorage.getItem("studio:sidebar-collapsed")).toBe("1");
    expect(nav().className).toContain("md:hidden");
    expect(button("Open the sidebar")).not.toBeNull();

    act(() => button("Open the sidebar")!.click());
    expect(localStorage.getItem("studio:sidebar-collapsed")).toBe("0");
    expect(nav().className).toContain("md:static");
    expect(button("Open the sidebar")).toBeNull();
  });

  it("starts collapsed when it was left collapsed", () => {
    localStorage.setItem("studio:sidebar-collapsed", "1");
    const { nav } = mount();
    expect(nav().className).toContain("md:hidden");
  });

  it("slides out over the page while the pointer rests on the rail, and the toggle then keeps it open", () => {
    localStorage.setItem("studio:sidebar-collapsed", "1");
    const { nav, button, room } = mount();
    act(() => {
      room().dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" } as PointerEventInit));
    });
    // Not at once: a pointer passing over on its way elsewhere does nothing.
    expect(nav().className).toContain("md:hidden");
    act(() => vi.advanceTimersByTime(150));
    expect(nav().className).toContain("md:absolute");

    act(() => {
      room().dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body } as PointerEventInit));
    });
    act(() => vi.advanceTimersByTime(250));
    expect(nav().className).toContain("md:hidden");

    act(() => {
      room().dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" } as PointerEventInit));
    });
    act(() => vi.advanceTimersByTime(150));
    act(() => button("Keep the sidebar open")!.click());
    expect(localStorage.getItem("studio:sidebar-collapsed")).toBe("0");
    expect(nav().className).toContain("md:static");
  });
});
