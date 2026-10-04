// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftSummary } from "@/lib/studio-drafts";

/**
 * The app's one sidebar: New chat and the conversations only when the
 * deployment has a studio, the conversations read here off the studio and
 * taken from the page on it, and a row or New chat served in the browser
 * when the studio page published a way to.
 */

const mocks = vi.hoisted(() => ({ pathname: "/home", listDrafts: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/studio-drafts", () => ({ listDrafts: mocks.listDrafts }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/brand", () => ({ GnosiaWordmark: () => createElement("span", null, "Gnosia") }));
vi.mock("@/components/ThemeSwitch", () => ({ ThemeSwitch: () => null }));

const { ShellFrame } = await import("./ShellFrame");
const { usePublishStudioChats } = await import("./shell-context");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const DRAFT: DraftSummary = {
  draftId: "d1",
  kind: "diagram",
  state: "open",
  title: "TCP vs UDP",
  source: null,
  turns: 2,
  costUsd: null,
  updated: new Date().toISOString(),
  jobId: null,
};

beforeEach(() => {
  mocks.pathname = "/home";
  mocks.listDrafts.mockReset().mockResolvedValue({ ok: true, data: { drafts: [DRAFT], note: "" } });
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

async function mount(studio: boolean, page: () => null = () => null) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    // Children as an argument, as the lint rule wants; the props type
    // requires them, hence the cast.
    root.render(createElement(ShellFrame, { studio, initialCollapsed: false } as ComponentProps<typeof ShellFrame>, createElement(page)));
  });
  // The sidebar's first read waits a task for a page's list.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

const nav = (container: HTMLElement) => container.querySelector<HTMLElement>('nav[aria-label="Primary"]')!;

describe("the sidebar", () => {
  it("lists only the five destinations, and reads no conversations, without a studio", async () => {
    const container = await mount(false);
    const labels = [...nav(container).querySelectorAll("a")].map((a) => a.textContent);
    expect(labels).toEqual(["Gnosia", "Home", "Courses", "Learn", "Library", "Review"]);
    expect(mocks.listDrafts).not.toHaveBeenCalled();
    expect(nav(container).textContent).not.toContain("Chats");
  });

  it("opens with New chat and lists the conversations, linked to the studio, off the studio", async () => {
    const container = await mount(true);
    expect(nav(container).querySelector("[data-studio-new]")?.getAttribute("href")).toBe("/studio");
    expect(mocks.listDrafts).toHaveBeenCalledTimes(1);
    const row = [...nav(container).querySelectorAll("a")].find((a) => a.textContent?.startsWith("TCP vs UDP"));
    expect(row?.getAttribute("href")).toBe("/studio?draft=d1");
    expect(nav(container).querySelector('a[aria-current="page"]')?.textContent).toBe("Home");
  });

  it("takes the studio page's list, its open conversation and its New chat", async () => {
    mocks.pathname = "/studio";
    const newChat = vi.fn();
    const navigate = vi.fn(() => true);
    function Studio() {
      usePublishStudioChats({ active: "d1", pending: null, newChat, navigate, path: "/studio?topic=x", initial: [DRAFT], titles: {} });
      return null;
    }
    const container = await mount(true, Studio as () => null);
    // The page's list stands; nothing is read here.
    expect(mocks.listDrafts).not.toHaveBeenCalled();
    const row = nav(container).querySelector<HTMLAnchorElement>('a[aria-current="page"]')!;
    expect(row.textContent).toContain("TCP vs UDP");
    expect(row.getAttribute("href")).toBe("/studio?topic=x&draft=d1");

    act(() => row.click());
    expect(navigate).toHaveBeenCalledWith("/studio?topic=x&draft=d1");

    act(() => nav(container).querySelector<HTMLAnchorElement>("[data-studio-new]")!.click());
    expect(newChat).toHaveBeenCalledTimes(1);
  });

  it("is a drawer on a phone, opened from the header and closed by Escape", async () => {
    const container = await mount(true);
    expect(nav(container).getAttribute("role")).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    expect(nav(container).getAttribute("role")).toBe("dialog");
    expect(container.querySelector("[inert]")).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(nav(container).getAttribute("role")).toBeNull();
  });
});
