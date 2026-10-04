// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The history search (D87 of docs/STUDIO-CHAT-FIRST.md) is the second half of
 * this file.
 *
 * The sidebar's collapse (D83 of docs/STUDIO-CHAT-FIRST.md): the toggle
 * folds it to a rail and remembers that, resting the pointer on the rail
 * slides it out over the page and leaving slides it back, and the toggle
 * pressed then keeps it open. Classes are what is checked, since jsdom has
 * no layout: the `md:` ones are the desktop sidebar's.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never),
}));
const listMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-drafts")>()),
  listDrafts: listMock,
}));

const { StudioSidebar } = await import("./StudioSidebar");
type DraftSummary = import("@/lib/studio-drafts").DraftSummary;

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
  listMock.mockReset().mockResolvedValue({ ok: true, status: 200, data: { drafts: [], note: "" } });
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
});

function mount(options: { initial?: DraftSummary[]; active?: string | null } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(StudioSidebar, {
        initial: options.initial ?? [],
        path: "/studio",
        titles: {},
        active: options.active ?? null,
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
  const field = () => container.querySelector<HTMLInputElement>('input[type="search"]')!;
  const links = () => [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
  return { container, nav, button, room, field, links };
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

describe("the history search", () => {
  function draft(patch: Partial<DraftSummary>): DraftSummary {
    return {
      draftId: "d",
      kind: "diagram",
      state: "open",
      title: null,
      source: null,
      turns: 1,
      costUsd: null,
      updated: new Date().toISOString(),
      jobId: null,
      firstMessage: null,
      ...patch,
    };
  }
  const loaded = [
    draft({ draftId: "a", title: "Binary search trees", updated: "2026-10-04T10:00:00.000Z" }),
    draft({ draftId: "b", title: "TCP congestion window", updated: "2026-10-03T10:00:00.000Z" }),
  ];
  // Not in what the page loaded: the runner is where the older ones are found.
  const unloaded = draft({ draftId: "z", firstMessage: "Why does TCP slow start double each round?", updated: "2025-01-02T10:00:00.000Z" });

  /** What the runner answers: every draft it holds that has `q` in a title or first message. */
  function runnerWith(held: DraftSummary[]) {
    listMock.mockImplementation(async (query: { q?: string }) => ({
      ok: true,
      status: 200,
      data: {
        drafts: held.filter((d) => query.q === undefined || `${d.title ?? ""} ${d.firstMessage ?? ""}`.toLowerCase().includes(query.q.toLowerCase())),
        note: "",
      },
    }));
  }

  function type(input: HTMLInputElement, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const settle = (ms = 250) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  const searches = () => listMock.mock.calls.map(([query]) => query as { q?: string }).filter((query) => query.q !== undefined);

  it("waits for typing to rest, then asks the runner, which finds conversations that are not loaded", async () => {
    runnerWith([...loaded, unloaded]);
    const { field, links, container } = mount({ initial: loaded });
    expect(links()).toHaveLength(2);

    type(field(), "t");
    type(field(), "tc");
    type(field(), "tcp");
    await settle(150);
    expect(searches()).toEqual([]);
    await settle(100);
    // One read for the three letters, with the words as typed and the history's own filters.
    expect(searches()).toEqual([expect.objectContaining({ q: "tcp", nonEmpty: true, limit: 50 })]);

    // Flat: no day headings, only the two hits, newest first, the unloaded one among them.
    expect(container.querySelectorAll("nav section")).toHaveLength(0);
    expect(links().map((link) => link.textContent)).toEqual(["TCP congestion window, In conversation", "Why does TCP slow start double each round?, In conversation"]);
    // What matched is marked, in whichever case it was written.
    expect([...container.querySelectorAll("nav mark")].map((mark) => mark.textContent)).toEqual(["TCP", "TCP"]);
  });

  it("shows the words around a match the heading does not hold", async () => {
    runnerWith([draft({ draftId: "t", title: "Congestion control", firstMessage: "@diagram how does a sender back off?" })]);
    const { field, links } = mount();
    type(field(), "sender");
    await settle();
    expect(links()[0].textContent).toBe("Congestion control@diagram how does a sender back off?, In conversation");
    expect(links()[0].querySelector("mark")?.textContent).toBe("sender");
  });

  it("says when nothing matches, and puts the grouped history back on Escape and on the clear button", async () => {
    runnerWith([...loaded, unloaded]);
    const { field, links, container, button } = mount({ initial: loaded });
    expect(button("Clear the search")).toBeNull();

    type(field(), "zzz");
    await settle();
    expect(container.textContent).toContain("No conversations match");
    expect(links()).toHaveLength(0);

    act(() => {
      field().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(field().value).toBe("");
    expect(container.textContent).not.toContain("No conversations match");
    expect(links()).toHaveLength(2);
    expect(container.querySelectorAll("nav section").length).toBeGreaterThan(0);

    type(field(), "tcp");
    await settle();
    expect(links()).toHaveLength(2);
    act(() => button("Clear the search")!.click());
    expect(field().value).toBe("");
    expect(container.querySelectorAll("nav section").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(field());
  });

  it("lets Escape through when the field is empty, and keeps it when it clears words", async () => {
    runnerWith(loaded);
    const { field } = mount({ initial: loaded });
    const reached = vi.fn();
    window.addEventListener("keydown", reached);
    const press = () => act(() => void field().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    type(field(), "tcp");
    press();
    expect(reached).not.toHaveBeenCalled();
    press();
    expect(reached).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", reached);
  });

  it("keeps the open conversation marked among the matches", async () => {
    runnerWith([...loaded, unloaded]);
    const { field, links } = mount({ initial: loaded, active: "z" });
    type(field(), "tcp");
    await settle();
    const marked = links().filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute("href")).toContain("draft=z");
  });

  it("says the studio did not answer rather than that nothing matches", async () => {
    listMock.mockResolvedValue({ ok: false, status: 502, refusal: { error: "the studio runner is not answering", detail: null } });
    const { field, container } = mount({ initial: loaded });
    type(field(), "tcp");
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("did not answer");
    expect(container.textContent).not.toContain("No conversations match");
  });

  it("drops an answer for words that are no longer in the field", async () => {
    let release: (value: unknown) => void = () => {};
    listMock.mockImplementation((query: { q?: string }) =>
      query.q === "tcp"
        ? new Promise((resolve) => (release = resolve))
        : Promise.resolve({ ok: true, status: 200, data: { drafts: [loaded[0]], note: "" } }),
    );
    const { field, links } = mount({ initial: loaded });
    type(field(), "tcp");
    await settle();
    type(field(), "binary");
    await settle();
    expect(links().map((link) => link.textContent)).toEqual(["Binary search trees, In conversation"]);
    // The slow read for "tcp" lands last and changes nothing.
    await act(async () => release({ ok: true, status: 200, data: { drafts: [loaded[1]], note: "" } }));
    expect(links().map((link) => link.textContent)).toEqual(["Binary search trees, In conversation"]);
  });

  it("is a search button on the collapsed rail, which slides the sidebar out with the field focused", async () => {
    localStorage.setItem("studio:sidebar-collapsed", "1");
    const { nav, button, field } = mount({ initial: loaded });
    expect(nav().className).toContain("md:hidden");
    act(() => button("Search conversations")!.click());
    expect(nav().className).toContain("md:absolute");
    expect(document.activeElement).toBe(field());

    // The pointer leaving does not take it back while the field is in use.
    const room = nav().parentElement!;
    act(() => {
      room.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body } as PointerEventInit));
    });
    await settle(300);
    expect(nav().className).toContain("md:absolute");
  });
});
