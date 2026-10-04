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

const mocks = vi.hoisted(() => ({ pathname: "/home", listDrafts: vi.fn(), displayName: undefined as string | undefined }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/studio-drafts", () => ({ listDrafts: mocks.listDrafts }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/brand", () => ({ GnosiaWordmark: () => createElement("span", null, "Gnosia") }));
vi.mock("@/components/ThemeSwitch", () => ({ ThemeSwitch: () => null }));
vi.mock("@/lib/learner-context", () => ({ useLearner: () => ({ state: { displayName: mocks.displayName } }) }));

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
  mocks.displayName = undefined;
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

/** The frame without a studio, folded, mounted in one act. */
function mountFoldedForClip() {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(createElement(ShellFrame, { studio: false, initialCollapsed: true } as ComponentProps<typeof ShellFrame>, null)));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return { container };
}

describe("the sidebar", () => {
  it("lists only the four destinations, and reads no conversations, without a studio", async () => {
    const container = await mount(false);
    // The account menu's links are mounted too, inert while it is closed.
    const labels = [...nav(container).querySelectorAll("a")].filter((a) => a.closest("[inert]") === null).map((a) => a.textContent);
    expect(labels).toEqual(["Gnosia", "Home", "Courses", "Learn", "Library"]);
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

  it("shows the learner's name on the account row, and Account until there is one", async () => {
    const unnamed = await mount(false);
    expect(nav(unnamed).querySelector("button[aria-expanded]")?.textContent).toBe("Account");
    mocks.displayName = "Ada Lovelace";
    const named = await mount(false);
    expect(nav(named).querySelector("button[aria-expanded]")?.textContent).toBe("Ada Lovelace");
  });

  it("wraps Tab inside the drawer past the closed account menu, which is inert", async () => {
    const container = await mount(true);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    const account = nav(container).querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    account.focus();
    // Tab from the account row, the last stop that is not inert, wraps to the first.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement?.closest("[inert]")).toBeNull();
    expect(document.activeElement).not.toBe(account);
    expect(nav(container).contains(document.activeElement)).toBe(true);
  });

  it("does not clip the nav, so the account menu can open past the rail", () => {
    const { container } = mountFoldedForClip();
    expect(nav(container).className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/);
  });

  it("transitions the drawer's visibility only as it closes, so focus can land as it opens", async () => {
    const container = await mount(true);
    expect(nav(container).className).toContain("max-md:transition-[translate,visibility,box-shadow]");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    expect(nav(container).className).toContain("max-md:transition-[translate,box-shadow]");
    expect(nav(container).className).not.toContain("visibility");
  });

  it("closes the drawer on Back or Forward, which can change the studio's view without its path", async () => {
    const container = await mount(true);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    expect(nav(container).getAttribute("role")).toBe("dialog");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(nav(container).getAttribute("role")).toBeNull();
  });

  it("keeps the conversations mounted, hidden, while folded to the rail", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() => root.render(createElement(ShellFrame, { studio: true, initialCollapsed: true } as ComponentProps<typeof ShellFrame>, null)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    const history = [...nav(container).querySelectorAll("div")].find((div) => div.textContent?.startsWith("Chats"))!;
    expect(history.closest("[inert]")).not.toBeNull();
    // Read while folded, so it is current when it unfolds.
    expect(mocks.listDrafts).toHaveBeenCalledTimes(1);
  });
});

describe("the fold", () => {
  // Without a studio nothing is read, so the frame mounts in one act.
  function mountFolded(collapsed: boolean) {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() => root.render(createElement(ShellFrame, { studio: false, initialCollapsed: collapsed } as ComponentProps<typeof ShellFrame>, null)));
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const room = () => nav(container).parentElement!;
    return { container, button, room };
  }

  afterEach(() => {
    vi.useRealTimers();
    document.cookie = "gnosia-sidebar=; Max-Age=0; Path=/";
  });

  it("animates its width and fades its labels, and drops both under reduced motion", () => {
    const { container, room } = mountFolded(true);
    const panel = nav(container);
    expect(panel.className).toContain("md:transition-[width,box-shadow]");
    expect(panel.className).toContain("motion-reduce:transition-none");
    expect(room().className).toContain("transition-[width]");
    // Labels stay mounted on the rail and fade, so they can fade back in.
    const label = [...panel.querySelectorAll("a span")].find((span) => span.textContent === "Courses")!;
    expect(label.className).toContain("opacity-0");
    expect(label.className).toContain("transition-opacity");
  });

  it("keeps the account menu mounted, invisible and inert until opened, so it can fade", () => {
    const { container } = mountFolded(false);
    const menu = nav(container).querySelector<HTMLElement>("[id]:has(> ul)")!;
    expect(menu.hasAttribute("inert")).toBe(true);
    expect(menu.className).toContain("invisible");
    act(() => nav(container).querySelector<HTMLButtonElement>("button[aria-expanded]")!.click());
    expect(menu.hasAttribute("inert")).toBe(false);
    expect(menu.className).toContain("opacity-100");
  });

  it("carries the studio sidebar's saved fold into the cookie once", () => {
    localStorage.setItem("studio:sidebar-collapsed", "1");
    const { room } = mountFolded(false);
    expect(room().className).toContain("w-[60px]");
    expect(document.cookie).toContain("gnosia-sidebar=collapsed");
    expect(localStorage.getItem("studio:sidebar-collapsed")).toBeNull();
  });

  it("folds to a rail, keeps it in the cookie, and opens again from the rail", () => {
    const { container, button, room } = mountFolded(false);
    expect(room().className).toContain("w-[260px]");
    act(() => button("Collapse the sidebar")!.click());
    expect(document.cookie).toContain("gnosia-sidebar=collapsed");
    expect(room().className).toContain("w-[60px]");
    // The labels are for a screen reader only on the rail.
    expect(nav(container).querySelector('a[aria-label="Courses"]')).not.toBeNull();

    act(() => button("Expand the sidebar")!.click());
    expect(document.cookie).toContain("gnosia-sidebar=open");
    expect(room().className).toContain("w-[260px]");
  });

  it("slides out over the page while the pointer rests on the rail, and the fold button then keeps it open", () => {
    vi.useFakeTimers();
    const { container, button, room } = mountFolded(true);
    const over = () =>
      act(() => {
        room().dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" } as PointerEventInit));
      });
    over();
    // Not at once: a pointer passing over on its way elsewhere does nothing.
    expect(nav(container).dataset.state).not.toBe("peek");
    act(() => vi.advanceTimersByTime(150));
    expect(nav(container).dataset.state).toBe("peek");
    // The room stays the rail's: the page does not move.
    expect(room().className).toContain("w-[60px]");

    act(() => {
      room().dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body } as PointerEventInit));
    });
    act(() => vi.advanceTimersByTime(250));
    expect(nav(container).dataset.state).not.toBe("peek");

    over();
    act(() => vi.advanceTimersByTime(150));
    act(() => button("Keep the sidebar open")!.click());
    expect(document.cookie).toContain("gnosia-sidebar=open");
    expect(room().className).toContain("w-[260px]");
    expect(nav(container).dataset.state).not.toBe("peek");
  });
});
