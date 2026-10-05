// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecentItem, RecentModel } from "@/lib/recent-core";
import type { DraftSummary } from "@/lib/studio-drafts";

/**
 * The app's one sidebar: New chat and the conversations only when the
 * deployment has a studio, the conversations read here off the studio and
 * taken from the page on it, and a row or New chat served in the browser
 * when the studio page published a way to.
 */

const mocks = vi.hoisted(() => ({
  pathname: "/home",
  listDrafts: vi.fn(),
  displayName: undefined as string | undefined,
  fetchRecent: vi.fn(),
  changeRecent: vi.fn(),
  renameDraft: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/studio-drafts", () => ({ listDrafts: mocks.listDrafts, renameDraft: mocks.renameDraft }));
vi.mock("@/lib/recent-client", () => ({ fetchRecent: mocks.fetchRecent, changeRecent: mocks.changeRecent }));
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
  mocks.fetchRecent.mockReset().mockResolvedValue(EMPTY);
  mocks.changeRecent.mockReset().mockResolvedValue(true);
  mocks.renameDraft.mockReset().mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", name: null, title: null, changed: true, note: "" } });
});

const EMPTY: RecentModel = { reachable: true, items: [], more: false, pinned: [], courses: [] };

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

/** The account row, at the sidebar's foot under its hairline. */
const ACCOUNT = "div.border-t button[aria-expanded]";

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
    // The sections below them are their own tests.
    const labels = [...nav(container).querySelectorAll("a")]
      .filter((a) => a.closest("[inert]") === null && a.closest("section") === null)
      .map((a) => a.textContent);
    expect(labels).toEqual(["Gnosia", "Home", "Courses", "Learn", "Library"]);
    expect(mocks.listDrafts).not.toHaveBeenCalled();
    expect(nav(container).textContent).not.toContain("Chats");
  });

  it("opens with New chat and lists the conversations, linked to the studio, off the studio", async () => {
    const container = await mount(true);
    expect(nav(container).querySelector("[data-studio-new]")?.getAttribute("href")).toBe("/studio");
    expect(mocks.listDrafts).toHaveBeenCalledTimes(1);
    const row = [...nav(container).querySelectorAll("a")].find((a) => a.textContent?.includes("TCP vs UDP"));
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

  it("closes the account menu on Escape and leaves the drawer around it open, until the next Escape", async () => {
    const container = await mount(true);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    const account = nav(container).querySelector<HTMLButtonElement>(ACCOUNT)!;
    act(() => account.click());
    expect(account.getAttribute("aria-expanded")).toBe("true");
    const escape = () =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
      });
    escape();
    expect(account.getAttribute("aria-expanded")).toBe("false");
    expect(nav(container).getAttribute("role")).toBe("dialog");
    escape();
    expect(nav(container).getAttribute("role")).toBeNull();
  });

  it("shows the learner's name on the account row, and Account until there is one", async () => {
    const unnamed = await mount(false);
    expect(nav(unnamed).querySelector(ACCOUNT)?.textContent).toBe("Account");
    mocks.displayName = "Ada Lovelace";
    const named = await mount(false);
    expect(nav(named).querySelector(ACCOUNT)?.textContent).toBe("Ada Lovelace");
  });

  it("wraps Tab inside the drawer past the closed account menu, which is inert", async () => {
    const container = await mount(true);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    const account = nav(container).querySelector<HTMLButtonElement>(ACCOUNT)!;
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

  it("keeps a flick past the end of its list from scrolling the page behind the drawer", async () => {
    const container = await mount(true);
    const scroller = nav(container).querySelector("ul")!.parentElement!;
    expect(scroller.className.split(" ")).toEqual(expect.arrayContaining(["overflow-y-auto", "overscroll-contain"]));
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

  it("keeps Recent mounted while folded to the rail, its rows drawn as glyphs", async () => {
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
    // A row is its glyph alone on the rail, named for a screen reader and a tooltip.
    const row = nav(container).querySelector<HTMLAnchorElement>('a[aria-label="Conversation: TCP vs UDP"]')!;
    expect(row.closest("[inert]")).toBeNull();
    expect(row.querySelector("span.opacity-0")?.textContent).toContain("TCP vs UDP");
    expect(nav(container).querySelector("#sidebar-recent")?.className).toContain("opacity-0");
    // Its menu is out of reach until the sidebar unfolds.
    expect(row.parentElement!.querySelector("button[aria-haspopup]")?.closest("[inert]")).not.toBeNull();
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

  it("pops the account menu in as a kit Popover, and keeps it inert for its way out so it can fade", () => {
    vi.useFakeTimers();
    const { container } = mountFolded(false);
    const account = nav(container).querySelector<HTMLButtonElement>(ACCOUNT)!;
    expect(nav(container).querySelector("[popover]")).toBeNull();
    act(() => account.click());
    const menu = nav(container).querySelector<HTMLElement>("[popover]")!;
    expect(menu.getAttribute("popover")).toBe("manual");
    expect(menu.className).toContain("animate-pop-in");
    expect(account.getAttribute("aria-controls")).toBe(menu.id);
    act(() => account.click());
    expect(menu.hasAttribute("inert")).toBe(true);
    expect(menu.className).toContain("animate-pop-out");
    expect(account.hasAttribute("aria-controls")).toBe(false);
    act(() => vi.advanceTimersByTime(120));
    expect(nav(container).querySelector("[popover]")).toBeNull();
    vi.useRealTimers();
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

describe("the sections", () => {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const item = (patch: Partial<RecentItem> & Pick<RecentItem, "key" | "kind" | "title" | "href">): RecentItem => ({
    detail: null,
    at: ago(0),
    ...patch,
  });
  const VIDEO = item({ key: "video:video:abc", kind: "video", title: "Master theorem", href: "/library/video%3Aabc", at: ago(1) });
  const CONCEPT = item({ key: "concept:recurrences", kind: "concept", title: "Recurrences", href: "/learn/recurrences", at: ago(3) });
  const MODULE = item({
    key: "module:cs3230/m2",
    kind: "module",
    title: "Divide and conquer",
    href: "/courses/cs3230/m2",
    at: ago(2),
    courseSlug: "cs3230",
    moduleSlug: "m2",
  });
  const COURSE = {
    slug: "cs3230",
    code: "CS3230",
    title: "Algorithms",
    href: "/courses/cs3230",
    open: "/courses/cs3230/m2",
    resume: { title: "Divide and conquer", order: 2 },
  };
  const withRows = (patch: Partial<RecentModel> = {}) => mocks.fetchRecent.mockResolvedValue({ ...EMPTY, items: [VIDEO, MODULE, CONCEPT], courses: [COURSE], ...patch });
  const section = (container: HTMLElement, id: string) => nav(container).querySelector(`#${id}`)!.closest("section")!;
  const recentRows = (container: HTMLElement) =>
    [...section(container, "sidebar-recent").querySelectorAll<HTMLAnchorElement>("li a")].map((a) => a.querySelector("span")?.textContent);
  const moreFor = (container: HTMLElement, title: string) => nav(container).querySelector<HTMLButtonElement>(`button[aria-label="More for ${title}"]`)!;
  /** A row's menu items: the kit `Menu`'s list, beside its button. */
  const itemsOf = (container: HTMLElement, title: string) =>
    [...moreFor(container, title).parentElement!.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')];
  const menuItems = (container: HTMLElement, title: string) => itemsOf(container, title).map((item) => item.textContent);
  const itemOf = (container: HTMLElement, title: string, name: string) => itemsOf(container, title).find((item) => item.textContent === name)!;
  const key = (target: Element, k: string) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });

  it("reads Recent without the conversations when the runner has them, and whole without a studio", async () => {
    await mount(true);
    expect(mocks.fetchRecent).toHaveBeenCalledWith({ pages: 1, drafts: false });
    mocks.fetchRecent.mockClear();
    mocks.listDrafts.mockClear();
    await mount(false);
    expect(mocks.fetchRecent).toHaveBeenCalledWith({ pages: 1, drafts: true });
    expect(mocks.listDrafts).not.toHaveBeenCalled();
  });

  it("merges the catalog's rows with the runner's conversations, newest first under day headings, each with its kind", async () => {
    withRows();
    const container = await mount(true);
    expect(recentRows(container)).toEqual([
      "Conversation: TCP vs UDP",
      "Video: Master theorem",
      "Course module: Divide and conquer",
      "Concept: Recurrences",
    ]);
    const headings = [...section(container, "sidebar-recent").querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings).toEqual(["Today", "Yesterday", "Previous 7 days"]);
    // Each row carries its kind's 18px glyph.
    expect(section(container, "sidebar-recent").querySelector("li a svg")?.getAttribute("width")).toBe("18");
  });

  it("marks the row of the page on screen, whichever way its path is escaped", async () => {
    mocks.pathname = "/library/video:abc";
    withRows();
    const container = await mount(false);
    const current = section(container, "sidebar-recent").querySelector('a[aria-current="page"]');
    expect(current?.getAttribute("href")).toBe("/library/video%3Aabc");
  });

  it("lists Courses under a sticky 13px label with an add button to /courses, each one row that opens where the owner left off", async () => {
    withRows();
    const container = await mount(false);
    const label = nav(container).querySelector("#sidebar-courses")!;
    expect(label.className).toContain("text-[13px]");
    expect(label.parentElement!.className).toContain("sticky");
    expect(nav(container).querySelector('a[aria-label="Browse courses"]')?.getAttribute("href")).toBe("/courses");

    const courses = section(container, "sidebar-courses");
    // No fold and no module list: the course page has its own.
    expect(courses.querySelector("button[aria-expanded]")).toBeNull();
    const rows = [...courses.querySelectorAll<HTMLAnchorElement>("li a")];
    expect(rows.map((a) => a.getAttribute("href"))).toEqual(["/courses/cs3230/m2"]);
    expect(rows[0]!.textContent).toBe("CS3230 Algorithms2. Divide and conquer");
    expect(rows[0]!.getAttribute("aria-current")).toBeNull();
    // Two lines tall, its height eased so it can settle on the rail.
    expect(rows[0]!.className).toContain("h-[calc(var(--shell-row,36px)+8px)]");
    expect(rows[0]!.className).toContain("transition-[height,color,background-color]");
    expect(rows[0]!.className).toContain("motion-reduce:transition-none");
  });

  it("names the module visited last by its whole title, never cut at the colon, truncating with the tooltip holding it", async () => {
    withRows({ courses: [{ ...COURSE, resume: { title: "Week 2: MapReduce", order: 2 } }] });
    const container = await mount(false);
    const row = section(container, "sidebar-courses").querySelector<HTMLAnchorElement>("li a")!;
    const line = [...row.querySelectorAll("span")].find((s) => s.textContent === "2. Week 2: MapReduce")!;
    expect(line).toBeDefined();
    expect(line.className).toContain("truncate");
    expect(row.getAttribute("title")).toBe("CS3230 Algorithms, 2. Week 2: MapReduce");
  });

  it("marks the course of the page on screen, on any page under it", async () => {
    mocks.pathname = "/courses/cs3230/m1/check";
    withRows();
    const container = await mount(false);
    expect(section(container, "sidebar-courses").querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/courses/cs3230/m2");
  });

  it("settles a two-line course row to one row's height on the rail, where only its glyph shows", async () => {
    withRows();
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() => root.render(createElement(ShellFrame, { studio: false, initialCollapsed: true } as ComponentProps<typeof ShellFrame>, null)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    mounted.push(() => {
      act(() => root.unmount());
      container.remove();
    });
    const row = nav(container).querySelector<HTMLAnchorElement>('a[aria-label="CS3230 Algorithms"]')!;
    expect(row.className).toContain("h-[var(--shell-row,36px)]");
    expect(row.className).not.toContain("+8px");
  });

  it("gives a course with no module visited one line, opening the course page", async () => {
    withRows({ courses: [{ ...COURSE, open: COURSE.href, resume: null }] });
    const container = await mount(false);
    const row = section(container, "sidebar-courses").querySelector<HTMLAnchorElement>("li a")!;
    expect(row.getAttribute("href")).toBe("/courses/cs3230");
    expect(row.textContent).toBe("CS3230 Algorithms");
  });

  it("shows Pinned only when something is pinned, and moves a pinned row out of Recent", async () => {
    withRows();
    const bare = await mount(false);
    expect(nav(bare).querySelector("#sidebar-pinned")!.closest("[inert]")).not.toBeNull();

    withRows({ pinned: [{ key: VIDEO.key, kind: "video", title: "Old title", href: VIDEO.href, at: ago(5) }] });
    const container = await mount(false);
    const pinned = section(container, "sidebar-pinned");
    expect(pinned.closest("[inert]")).toBeNull();
    // Titled as the live row is now.
    expect([...pinned.querySelectorAll("li a")].map((a) => a.textContent)).toEqual(["Video: Master theorem"]);
    expect(recentRows(container)).not.toContain("Video: Master theorem");
  });

  it("offers Pin on every row, Rename on a conversation and Open in course on a module", async () => {
    withRows();
    const container = await mount(true);
    act(() => moreFor(container, "Divide and conquer").click());
    expect(menuItems(container, "Divide and conquer")).toEqual(["Pin", "Open in course"]);
    expect(itemOf(container, "Divide and conquer", "Open in course").getAttribute("href")).toBe("/courses/cs3230");
    act(() => moreFor(container, "TCP vs UDP").click());
    expect(menuItems(container, "TCP vs UDP")).toEqual(["Pin", "Rename"]);
    act(() => moreFor(container, "Master theorem").click());
    expect(menuItems(container, "Master theorem")).toEqual(["Pin"]);
  });

  it("pins a row through the route and reads Recent back", async () => {
    withRows();
    const container = await mount(false);
    const reads = mocks.fetchRecent.mock.calls.length;
    // What the route stores, which the read after the pin brings back.
    withRows({ pinned: [{ key: VIDEO.key, kind: "video", title: "Master theorem", href: VIDEO.href, at: ago(0) }] });
    act(() => moreFor(container, "Master theorem").click());
    const pin = itemOf(container, "Master theorem", "Pin");
    await act(async () => {
      (pin as HTMLButtonElement).click();
    });
    expect(mocks.changeRecent).toHaveBeenCalledWith({
      action: "pin",
      row: { key: VIDEO.key, kind: "video", title: "Master theorem", href: VIDEO.href },
    });
    expect([...section(container, "sidebar-pinned").querySelectorAll("li a")].map((a) => a.textContent)).toEqual(["Video: Master theorem"]);
    expect(mocks.fetchRecent.mock.calls.length).toBeGreaterThan(reads);
  });

  it("opens a row's menu with a pop and closes it on Escape, focus back on its more button", async () => {
    withRows();
    const container = await mount(false);
    const more = moreFor(container, "Recurrences");
    // The more button fades in on hover rather than appearing.
    expect(more.className).toContain("group-hover/row:opacity-100");
    expect(more.className).toContain("motion-reduce:transition-none");
    // The kit menu button, as the Library's rows have.
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    act(() => more.click());
    const menu = more.parentElement!.querySelector<HTMLElement>('[role="menu"]')!;
    expect(more.getAttribute("aria-controls")).toBe(menu.id);
    // The kit Popover's pop, which reduced motion turns off.
    expect(menu.getAttribute("popover")).toBe("manual");
    expect(menu.className).toContain("animate-pop-in");
    expect(menu.className).toContain("motion-reduce:animate-none");
    expect(document.activeElement?.textContent).toBe("Pin");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
  });

  it("moves through a row's menu with the arrows and typeahead, and keeps its keys and clicks from the row", async () => {
    withRows();
    const container = await mount(true);
    const more = moreFor(container, "Divide and conquer");
    const row = more.closest("div.group\\/row")!.querySelector("a")!;
    const onRow = vi.fn();
    row.addEventListener("click", onRow);
    // Down on the button opens it on the first item.
    key(more, "ArrowDown");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Pin");
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Open in course");
    // It wraps, and a letter finds an item.
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Pin");
    key(document.activeElement!, "o");
    expect(document.activeElement?.textContent).toBe("Open in course");
    key(document.activeElement!, "Escape");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
    // A press inside the menu is not a press on the row's link.
    act(() => more.click());
    act(() => itemOf(container, "Divide and conquer", "Pin").click());
    expect(onRow).not.toHaveBeenCalled();
  });

  it("hands the focus to the rename field once the menu has gone, and back to the more button after", async () => {
    const container = await mount(true);
    act(() => moreFor(container, "TCP vs UDP").click());
    act(() => itemOf(container, "TCP vs UDP", "Rename").click());
    const field = nav(container).querySelector<HTMLInputElement>('input[aria-label="Name this conversation"]')!;
    expect(document.activeElement).toBe(field);
    expect(nav(container).querySelector('[role="menu"]')).toBeNull();
    // Escape keeps the old name and leaves the drawer around it alone.
    key(field, "Escape");
    expect(nav(container).querySelector('input[aria-label="Name this conversation"]')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(moreFor(container, "TCP vs UDP"));
    expect(mocks.renameDraft).not.toHaveBeenCalled();
  });

  it("opens a pinned row's menu in the top layer, so the Pinned fold around it cannot clip it", async () => {
    withRows({ pinned: [{ key: VIDEO.key, kind: "video", title: "Master theorem", href: VIDEO.href, at: ago(1) }] });
    const container = await mount(false);
    act(() => moreFor(container, "Master theorem").click());
    const menu = moreFor(container, "Master theorem").parentElement!.querySelector<HTMLElement>("[popover]")!;
    expect(menu.getAttribute("popover")).toBe("manual");
    expect(menu.className.split(" ")).toContain("fixed");
    // The fold that would have cut it off, still around it in the DOM.
    expect(menu.closest(".overflow-clip")).not.toBeNull();
    expect(menuItems(container, "Master theorem")).toEqual(["Unpin"]);
    expect(document.activeElement?.textContent).toBe("Unpin");
  });

  /** Rename on the "TCP vs UDP" row, typed and kept with Enter. */
  async function renameTo(container: HTMLElement, name: string) {
    act(() => moreFor(container, "TCP vs UDP").click());
    act(() => itemOf(container, "TCP vs UDP", "Rename").click());
    const field = nav(container).querySelector<HTMLInputElement>('input[aria-label="Name this conversation"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, name);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  }

  it("renames a conversation on its draft, through the runner, showing the name at once and keeping it", async () => {
    const container = await mount(true);
    let answer!: (value: unknown) => void;
    mocks.renameDraft.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    await renameTo(container, "  Transport   layer ");
    // Kept on the draft by the runner, never as a preference.
    expect(mocks.renameDraft).toHaveBeenCalledWith("d1", "Transport layer");
    expect(mocks.changeRecent).not.toHaveBeenCalled();
    // Shown before the runner has answered.
    expect(recentRows(container)).toContain("Conversation: Transport layer");
    // The runner's list carries the name from here on, and the row keeps it.
    mocks.listDrafts.mockResolvedValue({ ok: true, data: { drafts: [{ ...DRAFT, name: "Transport layer" }], note: "" } });
    await act(async () => {
      answer({ ok: true, status: 200, data: { draftId: "d1", name: "Transport layer", title: "TCP vs UDP", changed: true, note: "" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(recentRows(container)).toContain("Conversation: Transport layer");
    expect(recentRows(container)).not.toContain("Conversation: TCP vs UDP");
  });

  it("takes a name off when the field is emptied, and the planner's title shows again", async () => {
    mocks.listDrafts.mockResolvedValue({ ok: true, data: { drafts: [{ ...DRAFT, name: "Transport layer" }], note: "" } });
    const container = await mount(true);
    expect(recentRows(container)).toContain("Conversation: Transport layer");
    act(() => moreFor(container, "Transport layer").click());
    act(() => itemOf(container, "Transport layer", "Rename").click());
    const field = nav(container).querySelector<HTMLInputElement>('input[aria-label="Name this conversation"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "   ");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    mocks.listDrafts.mockResolvedValue({ ok: true, data: { drafts: [DRAFT], note: "" } });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.renameDraft).toHaveBeenCalledWith("d1", null);
    expect(recentRows(container)).toContain("Conversation: TCP vs UDP");
  });

  it("keeps a saved name shown when the read after it fails, rather than the old title", async () => {
    const container = await mount(true);
    mocks.listDrafts.mockResolvedValue({ ok: false, status: 502, refusal: { error: "the studio runner is not answering", detail: null } });
    mocks.renameDraft.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", name: "Transport layer", title: "TCP vs UDP", changed: true, note: "" } });
    await renameTo(container, "Transport layer");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(recentRows(container)).toContain("Conversation: Transport layer");
    // And once a read carries it, the list's own name is what shows.
    mocks.listDrafts.mockResolvedValue({ ok: true, data: { drafts: [{ ...DRAFT, name: "Transport layer" }], note: "" } });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(recentRows(container)).toContain("Conversation: Transport layer");
  });

  it("puts the old title back when the runner refuses the rename", async () => {
    mocks.renameDraft.mockResolvedValue({ ok: false, status: 502, refusal: { error: "the studio runner is not answering", detail: null } });
    const container = await mount(true);
    await renameTo(container, "Transport layer");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(recentRows(container)).toContain("Conversation: TCP vs UDP");
    expect(recentRows(container)).not.toContain("Conversation: Transport layer");
  });

  it("keeps Courses and its add button for someone who has opened no course", async () => {
    const container = await mount(false);
    const courses = section(container, "sidebar-courses");
    expect(courses.closest("[inert]")).toBeNull();
    expect(courses.textContent).toContain("Courses you open show here.");
    expect(courses.querySelector('a[aria-label="Browse courses"]')?.getAttribute("href")).toBe("/courses");
  });

  it("titles a pinned conversation by its name now, when it is older than Recent's loaded page", async () => {
    // A full page of newer rows, with more behind it: the merge holds back
    // the runner's older conversation, and Pinned must still find its name.
    const newer = Array.from({ length: 50 }, (_, i) =>
      item({ key: `concept:c${i}`, kind: "concept", title: `Concept ${i}`, href: `/learn/c${i}`, at: new Date(Date.now() - i * 60_000).toISOString() }),
    );
    const pin = { key: "draft:d1", kind: "draft" as const, title: "TCP vs UDP", href: "/studio?draft=d1", at: ago(20) };
    mocks.fetchRecent.mockResolvedValue({ ...EMPTY, items: newer, more: true, pinned: [pin] });
    // Renamed in the studio since it was pinned: the runner's list carries the name.
    mocks.listDrafts.mockResolvedValue({ ok: true, data: { drafts: [{ ...DRAFT, name: "Transport layer", updated: ago(10) }], note: "" } });
    const container = await mount(true);
    const pinnedTitles = () => [...section(container, "sidebar-pinned").querySelectorAll("li a")].map((a) => a.textContent);
    expect(pinnedTitles()).toEqual(["Conversation: Transport layer"]);

    // Renamed again from Pinned: shown at once, and kept once the runner has it.
    mocks.renameDraft.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", name: "Sockets", title: "TCP vs UDP", changed: true, note: "" } });
    mocks.listDrafts.mockResolvedValue({ ok: true, data: { drafts: [{ ...DRAFT, name: "Sockets", updated: ago(10) }], note: "" } });
    act(() => moreFor(container, "Transport layer").click());
    act(() => itemOf(container, "Transport layer", "Rename").click());
    const field = nav(container).querySelector<HTMLInputElement>('input[aria-label="Name this conversation"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Sockets");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.renameDraft).toHaveBeenCalledWith("d1", "Sockets");
    expect(pinnedTitles()).toEqual(["Conversation: Sockets"]);
  });

  it("offers Show older while there is more, even when every row on screen is pinned", async () => {
    const pins = [VIDEO, MODULE, CONCEPT].map((r) => ({ key: r.key, kind: r.kind, title: r.title, href: r.href, at: ago(0) }));
    withRows({ more: true, pinned: pins });
    const container = await mount(false);
    expect(recentRows(container)).toEqual([]);
    expect(section(container, "sidebar-recent").textContent).toContain("Show older");
    expect(section(container, "sidebar-recent").textContent).not.toContain("show here");
  });

  it("finds a renamed conversation by its name through the runner's search, headed by the name", async () => {
    const renamed = { ...DRAFT, name: "Transport layer" };
    mocks.listDrafts.mockImplementation(async (query: { q?: string }) => ({ ok: true, data: { drafts: query.q === undefined ? [renamed] : query.q === "transport" ? [renamed] : [], note: "" } }));
    const container = await mount(true);
    const field = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "transport");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const hits = [...nav(container).querySelectorAll("[data-peek-hold] li a")];
    expect(hits.map((a) => a.getAttribute("href"))).toEqual(["/studio?draft=d1"]);
    expect(hits[0]?.textContent).toContain("Transport layer");
    // The runner was asked with the words, and the catalog left the conversations to it.
    expect(mocks.listDrafts).toHaveBeenCalledWith(expect.objectContaining({ q: "transport" }));
  });

  it("says Recent could not be read, rather than that it is empty, when the catalog did not answer", async () => {
    mocks.fetchRecent.mockResolvedValue({ ...EMPTY, reachable: false });
    const container = await mount(false);
    expect(section(container, "sidebar-recent").textContent).toContain("Recent could not be read.");
  });
});

describe("the shortcuts", () => {
  // jsdom is neither a Mac nor a phone: Ctrl is the modifier, and the
  // sidebar is the desktop column.
  const key = (init: KeyboardEventInit, target: EventTarget = window) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  beforeAll(() => {
    const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
    proto.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  afterEach(() => {
    document.cookie = "gnosia-sidebar=; Max-Age=0; Path=/";
  });

  it("folds and unfolds the sidebar on Ctrl+., and keeps the browser's own press from running", async () => {
    const container = await mount(false);
    const room = () => nav(container).parentElement!;
    expect(room().className).toContain("w-[260px]");
    const event = key({ key: ".", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(room().className).toContain("w-[60px]");
    expect(document.cookie).toContain("gnosia-sidebar=collapsed");
    key({ key: ".", ctrlKey: true });
    expect(room().className).toContain("w-[260px]");
  });

  it("focuses the search on Ctrl+K, even from a field, and slides the rail out to do it", async () => {
    const container = await mount(false);
    const field = () => nav(container).querySelector<HTMLInputElement>('input[name="history-search"]')!;
    const elsewhere = document.createElement("textarea");
    document.body.append(elsewhere);
    elsewhere.focus();
    key({ key: "k", ctrlKey: true }, elsewhere);
    expect(document.activeElement).toBe(field());

    elsewhere.focus();
    key({ key: ".", ctrlKey: true }, elsewhere);
    // Typing: the fold is not taken from the field.
    expect(nav(container).dataset.state).toBe("open");
    elsewhere.blur();
    key({ key: ".", ctrlKey: true });
    expect(nav(container).dataset.state).toBe("rail");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true }));
    });
    expect(nav(container).dataset.state).toBe("peek");
    expect(document.activeElement).toBe(field());
    elsewhere.remove();
  });

  it("presses New chat on Ctrl+Shift+O, which on the studio empties its composer", async () => {
    mocks.pathname = "/studio";
    const newChat = vi.fn();
    function Studio() {
      usePublishStudioChats({ active: "d1", pending: null, newChat, navigate: () => true, path: "/studio", initial: [DRAFT], titles: {} });
      return null;
    }
    await mount(true, Studio as () => null);
    key({ key: "O", ctrlKey: true, shiftKey: true });
    expect(newChat).toHaveBeenCalledTimes(1);
  });

  it("binds no New chat without a studio, and nothing while a modal dialog is open", async () => {
    const container = await mount(false);
    expect(key({ key: "O", ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    expect(key({ key: ".", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(nav(container).dataset.state).toBe("open");
    dialog.remove();
  });

  it("leaves Ctrl+Shift+O to the browser when there is no New chat to press", async () => {
    const container = await mount(true);
    const button = nav(container).querySelector<HTMLElement>("[data-studio-new]")!;
    button.removeAttribute("data-studio-new");
    expect(key({ key: "O", ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    button.setAttribute("data-studio-new", "");
    expect(key({ key: "O", ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
  });

  it("binds nothing while a row's menu is open, so the fold cannot move the menu's anchor", async () => {
    const row: RecentItem = { key: "concept:recurrences", kind: "concept", title: "Recurrences", detail: null, href: "/learn/recurrences", at: new Date().toISOString() };
    mocks.fetchRecent.mockResolvedValue({ ...EMPTY, items: [row] });
    const container = await mount(false);
    const more = nav(container).querySelector<HTMLButtonElement>('button[aria-label="More for Recurrences"]')!;
    act(() => more.click());
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(key({ key: ".", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(nav(container).dataset.state).toBe("open");
    expect(key({ key: "?", shiftKey: true }).defaultPrevented).toBe(false);
    expect(document.querySelector("dialog[open]")).toBeNull();
    // From a field, as a combobox with its suggestions open, search still fires.
    const field = document.createElement("input");
    document.body.append(field);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(key({ key: "k", ctrlKey: true }, field).defaultPrevented).toBe(true);
    field.remove();
    // The search field took the focus, which closed the menu; open it again.
    if (more.getAttribute("aria-expanded") !== "true") act(() => more.click());
    expect(more.getAttribute("aria-expanded")).toBe("true");
    // Escape closes the menu, and the shortcuts are bound again.
    key({ key: "Escape" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(key({ key: ".", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(nav(container).dataset.state).toBe("rail");
  });

  it("opens the shortcuts sheet on ? as a kit Dialog listing the table, and closes it on Escape", async () => {
    await mount(true);
    key({ key: "?", shiftKey: true });
    const sheet = document.querySelector<HTMLDialogElement>("dialog[open]")!;
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain("Keyboard shortcuts");
    expect([...sheet.querySelectorAll("[data-shortcut]")].map((row) => row.getAttribute("data-shortcut"))).toEqual(
      expect.arrayContaining(["new-chat", "search", "toggle-sidebar", "show-shortcuts", "preview-step"]),
    );
    // Ctrl and the key as caps, not ⌘: jsdom is not a Mac.
    const caps = [...sheet.querySelectorAll('[data-shortcut="search"] kbd')].map((kbd) => kbd.textContent);
    expect(caps).toEqual(["Ctrl", "K"]);
    // The kit's rise and fade, and none of it under reduced motion.
    expect(sheet.className).toContain("starting:open:opacity-0");
    expect(sheet.className).toContain("motion-reduce:transition-none");
    act(() => {
      sheet.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("leaves Ctrl+K and Ctrl+. to the browser on a focus page, where the sidebar is hidden", async () => {
    const Focus = () => createElement("div", { "data-layout": "focus" });
    const container = await mount(false, Focus as unknown as () => null);
    expect(key({ key: "k", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key({ key: ".", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(nav(container).dataset.state).toBe("open");
  });

  it("leaves Ctrl+Shift+O to the browser on a focus page, and presses no hidden New chat", async () => {
    const Focus = () => createElement("div", { "data-layout": "focus" });
    const container = await mount(true, Focus as unknown as () => null);
    const pressed = vi.fn((event: Event) => event.preventDefault());
    nav(container).querySelector("[data-studio-new]")!.addEventListener("click", pressed);
    expect(key({ key: "O", ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressed).not.toHaveBeenCalled();
  });

  it("hands focus to the fold when Ctrl+. sends the slid-out sidebar back to the rail", async () => {
    const container = await mount(false);
    key({ key: ".", ctrlKey: true });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true }));
    });
    expect(nav(container).dataset.state).toBe("peek");
    const home = [...nav(container).querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === "Home")!;
    home.focus();
    key({ key: ".", ctrlKey: true }, home);
    expect(nav(container).dataset.state).toBe("rail");
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement?.hasAttribute("data-fold")).toBe(true);
  });

  it("closes the phone's drawer before opening the sheet, so its Tab trap lets the sheet be", async () => {
    const container = await mount(true);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar"]')!.click());
    expect(nav(container).getAttribute("role")).toBe("dialog");
    key({ key: "?", shiftKey: true });
    expect(nav(container).getAttribute("role")).toBeNull();
    expect(document.querySelector("dialog[open]")).not.toBeNull();
  });

  it("does not open the sheet while typing, and opens it from Ctrl+/", async () => {
    await mount(false);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    key({ key: "?", shiftKey: true }, field);
    expect(document.querySelector("dialog")).toBeNull();
    field.remove();
    key({ key: "/", ctrlKey: true });
    expect(document.querySelector("dialog[open]")).not.toBeNull();
  });
});
