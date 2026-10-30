// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftSummary } from "@/lib/studio-drafts";

/**
 * The conversation search in the app's sidebar (D87 of
 * docs/STUDIO-CHAT-FIRST.md): the field under New chat, the debounce, the
 * runner's matches in place of the day groups, Show more matches, the rail's
 * search button, and what a slid-out sidebar does while focus is in the
 * search. The sidebar is the shell's, so every test mounts the frame.
 */

const mocks = vi.hoisted(() => ({ pathname: "/home", listDrafts: vi.fn(), fetchRecent: vi.fn() }));
// The account row names the learner; this suite is about the search.
vi.mock("@/lib/learner-context", () => ({ useLearner: () => ({ state: { displayName: null } }) }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({ runnerDown: (await importOriginal<typeof import("@/lib/studio-drafts")>()).runnerDown, listDrafts: mocks.listDrafts }));
// The catalog's half of Recent: empty here, so every row is the runner's.
vi.mock("@/lib/recent-client", () => ({ fetchRecent: mocks.fetchRecent, changeRecent: vi.fn(async () => true), VISIT_STORED_EVENT: "gnosia:visit-stored" }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/brand", () => ({ GnosiaWordmark: () => createElement("span", null, "Gnosia") }));
vi.mock("@/components/ThemeSwitch", () => ({ ThemeSwitch: () => null }));

const { ShellFrame } = await import("./ShellFrame");
const { usePublishStudioChats } = await import("./shell-context");
const { SearchField } = await import("./ChatSearch");
const listMock = mocks.listDrafts;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  mocks.pathname = "/home";
  listMock.mockReset().mockResolvedValue({ ok: true, status: 200, data: { drafts: [], note: "" } });
  mocks.fetchRecent.mockReset().mockResolvedValue({ reachable: true, items: [], more: false, pinned: [], names: {}, courses: [] });
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.useRealTimers();
  document.cookie = "gnosia-sidebar=; Max-Age=0; Path=/";
});

/**
 * The frame with a studio, on /home unless a page is given. Mounted on real
 * timers so the sidebar's first read lands, then handed to fake ones.
 */
async function mount(options: { collapsed?: boolean; page?: () => null } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        ShellFrame,
        { studio: true, initialCollapsed: options.collapsed ?? false } as ComponentProps<typeof ShellFrame>,
        createElement(options.page ?? (() => null)),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  vi.useFakeTimers();
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  const nav = () => container.querySelector<HTMLElement>('nav[aria-label="Primary"]')!;
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const field = () => container.querySelector<HTMLInputElement>('input[type="search"]')!;
  /** The matches, once the search holds words; the history's rows are not these. */
  const links = () => [...container.querySelectorAll<HTMLAnchorElement>("nav [data-peek-hold] a")];
  return { container, nav, button, field, links };
}

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
  // Not in what the sidebar listed: the runner is where the older ones are found.
  const unloaded = draft({ draftId: "z", firstMessage: "Why does TCP slow start double each round?", updated: "2025-01-02T10:00:00.000Z" });

  /** What the runner answers: the history for a read with no `q`, else every draft it holds with `q` in a title or first message. */
  function runnerWith(held: DraftSummary[], listed: DraftSummary[] = held) {
    listMock.mockImplementation(async (query: { q?: string }) => ({
      ok: true,
      status: 200,
      data: {
        drafts:
          query.q === undefined
            ? listed
            : held.filter((d) => `${d.title ?? ""} ${d.firstMessage ?? ""}`.toLowerCase().includes(query.q!.toLowerCase())),
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
  /** jsdom answers `:hover` from the last mouseover it saw, and an earlier test may have left one on the sidebar. */
  const pointerAway = () => act(() => void document.body.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));

  it("is a field under New chat", async () => {
    runnerWith(loaded);
    const { container, field } = await mount();
    const items = [...container.querySelectorAll("nav ul > li")].map((li) => (li.querySelector("input") ? "search" : li.textContent));
    expect(items.slice(0, 3)).toEqual(["New chat", "search", "Home"]);
    expect(field().getAttribute("aria-label")).toBe("Search recent");
  });

  it("waits for typing to rest, then asks the runner, which finds conversations that are not loaded", async () => {
    runnerWith([...loaded, unloaded], loaded);
    const { field, links, container } = await mount();
    expect(container.querySelectorAll("nav section[aria-label]")).not.toHaveLength(0);

    type(field(), "t");
    type(field(), "tc");
    type(field(), "tcp");
    await settle(150);
    expect(searches()).toEqual([]);
    await settle(100);
    // One read for the three letters, with the words as typed and the history's own filters.
    expect(searches()).toEqual([expect.objectContaining({ q: "tcp", nonEmpty: true, limit: 50 })]);

    // Flat: no day headings, only the two hits, newest first, the unloaded one among them.
    expect(container.querySelectorAll("nav section[aria-label]")).toHaveLength(0);
    expect(links().map((link) => link.textContent)).toEqual(["Conversation: TCP congestion window, In conversation", "Conversation: Why does TCP slow start double each round?, In conversation"]);
    // What matched is marked, in whichever case it was written.
    expect([...container.querySelectorAll("nav mark")].map((mark) => mark.textContent)).toEqual(["TCP", "TCP"]);
  });

  it("merges the catalog's matches with the runner's by the instant, however each spells it", async () => {
    runnerWith([draft({ draftId: "r", title: "TCP handshake", updated: "2026-10-30T10:00:00.000Z" })]);
    // 09:30 UTC, half an hour before the conversation, though its text sorts after it.
    const older = { key: "concept:tcp", kind: "concept", title: "TCP basics", href: "/learn/tcp", detail: null, at: "2026-10-30T17:30:00+08:00" };
    const newer = { key: "video:video:t", kind: "video", title: "TCP in pictures", href: "/library/video%3At", detail: null, at: "2026-10-30T19:00:00+08:00" };
    mocks.fetchRecent.mockResolvedValue({ reachable: true, items: [newer, older], more: false, pinned: [], courses: [] });
    const { field, links } = await mount();
    type(field(), "tcp");
    await settle();
    expect(links().map((link) => link.getAttribute("href"))).toEqual(["/library/video%3At", "/studio?draft=r", "/learn/tcp"]);
  });

  it("works from a page that is not the studio: a match is a link to its conversation", async () => {
    runnerWith([...loaded, unloaded], loaded);
    const { field, links } = await mount();
    type(field(), "slow start");
    await settle();
    expect(links().map((link) => link.getAttribute("href"))).toEqual(["/studio?draft=z"]);
  });

  it("opens a match through the studio page's own navigation, and marks the open conversation among the matches", async () => {
    mocks.pathname = "/studio";
    runnerWith([...loaded, unloaded], loaded);
    const navigate = vi.fn(() => true);
    function Studio() {
      usePublishStudioChats({ active: "z", pending: null, newChat: () => undefined, navigate, path: "/studio?topic=x", initial: loaded, titles: {} });
      return null;
    }
    const { field, links } = await mount({ page: Studio as () => null });
    type(field(), "tcp");
    await settle();
    const marked = links().filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute("href")).toBe("/studio?topic=x&draft=z");
    const other = links().find((link) => link !== marked[0])!;
    act(() => other.click());
    expect(navigate).toHaveBeenCalledWith("/studio?topic=x&draft=b");
  });

  it("shows the words around a match the heading does not hold", async () => {
    runnerWith([draft({ draftId: "t", title: "Congestion control", firstMessage: "@diagram how does a sender back off?" })]);
    const { field, links } = await mount();
    type(field(), "sender");
    await settle();
    expect(links()[0].textContent).toBe("Conversation: Congestion control@diagram how does a sender back off?, In conversation");
    expect(links()[0].querySelector("mark")?.textContent).toBe("sender");
  });

  it("says when nothing matches, and puts the grouped history back on Escape and on the clear button", async () => {
    runnerWith([...loaded, unloaded], loaded);
    const { field, links, container, button } = await mount();
    expect(button("Clear the search")).toBeNull();

    type(field(), "zzz");
    await settle();
    expect(container.textContent).toContain("Nothing matches");
    expect(links()).toHaveLength(0);

    act(() => {
      field().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(field().value).toBe("");
    expect(container.textContent).not.toContain("Nothing matches");
    expect(container.querySelectorAll("nav section[aria-label]").length).toBeGreaterThan(0);

    type(field(), "tcp");
    await settle();
    expect(links()).toHaveLength(2);
    act(() => button("Clear the search")!.click());
    expect(field().value).toBe("");
    expect(container.querySelectorAll("nav section[aria-label]").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(field());
  });

  it("lets Escape through when the field is empty, and keeps it when it clears words", async () => {
    runnerWith(loaded);
    const { field } = await mount();
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

  it("says the studio did not answer rather than that nothing matches", async () => {
    listMock.mockImplementation(async (query: { q?: string }) =>
      query.q === undefined ? { ok: true, status: 200, data: { drafts: loaded, note: "" } } : { ok: false, status: 502, refusal: { error: "down", detail: null } },
    );
    const { field, container } = await mount();
    type(field(), "tcp");
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("did not answer");
    expect(container.textContent).not.toContain("Nothing matches");
  });

  it("drops an answer for words that are no longer in the field", async () => {
    let release: (value: unknown) => void = () => {};
    listMock.mockImplementation((query: { q?: string }) =>
      query.q === "tcp"
        ? new Promise((resolve) => (release = resolve))
        : Promise.resolve({ ok: true, status: 200, data: { drafts: query.q === undefined ? loaded : [loaded[0]], note: "" } }),
    );
    const { field, links } = await mount();
    type(field(), "tcp");
    await settle();
    type(field(), "binary");
    await settle();
    expect(links().map((link) => link.textContent)).toEqual(["Conversation: Binary search trees, In conversation"]);
    // The slow read for "tcp" lands last and changes nothing.
    await act(async () => release({ ok: true, status: 200, data: { drafts: [loaded[1]], note: "" } }));
    expect(links().map((link) => link.textContent)).toEqual(["Conversation: Binary search trees, In conversation"]);
  });

  describe("on the rail", () => {
    it("hands focus to the fold when Escape slides the sidebar back with focus inside it", async () => {
      runnerWith(loaded);
      const { nav, button, field } = await mount({ collapsed: true });
      act(() => button("Search recent")!.click());
      expect(document.activeElement).toBe(field());
      type(field(), "tcp");
      await settle();
      const clear = button("Clear the search")!;
      act(() => clear.focus());
      // The field's own Escape clears a query; this one comes from the clear button.
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      // Fake timers drive requestAnimationFrame too.
      await settle(50);
      expect(nav().dataset.state).toBe("rail");
      expect(document.activeElement?.hasAttribute("data-fold")).toBe(true);
    });

    it("drops the clear button while folded, so it never sits on the rail's icon", () => {
      const search = { query: "tcp", words: "tcp", setQuery: () => undefined, clear: () => undefined } as unknown as Parameters<typeof SearchField>[0]["search"];
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      const ref = { current: null as HTMLInputElement | null };
      act(() => root.render(createElement(SearchField, { search, inputRef: ref, compact: true })));
      expect(container.querySelector('button[aria-label="Clear the search"]')).toBeNull();
      act(() => root.render(createElement(SearchField, { search, inputRef: ref, compact: false })));
      expect(container.querySelector('button[aria-label="Clear the search"]')).not.toBeNull();
      act(() => root.unmount());
      container.remove();
    });

    it("is a search button, which slides the sidebar out with the field focused", async () => {
      runnerWith(loaded);
      const { nav, button, field, container } = await mount({ collapsed: true });
      // The field is there, narrowed to its icon and out of reach until the sidebar slides out.
      expect(container.querySelector('input[type="search"]')?.closest("[inert]")).not.toBeNull();
      expect(nav().dataset.state).toBe("rail");
      act(() => button("Search recent")!.click());
      expect(nav().dataset.state).toBe("peek");
      expect(document.activeElement).toBe(field());

      // The pointer leaving does not take it back while the field is in use.
      const room = nav().parentElement!;
      act(() => {
        room.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body } as PointerEventInit));
      });
      await settle(300);
      expect(nav().dataset.state).toBe("peek");
    });

    it("keeps the slid-out sidebar when focus returns to the field before the close it scheduled", async () => {
      runnerWith(loaded);
      const { nav, button, field } = await mount({ collapsed: true });
      act(() => button("Search recent")!.click());
      expect(document.activeElement).toBe(field());
      pointerAway();

      // Focus leaves with the pointer away: a close is scheduled. Tabbing back in time cancels it.
      act(() => field().blur());
      await settle(100);
      act(() => field().focus());
      await settle(400);
      expect(nav().dataset.state).toBe("peek");

      // Left for good, it does slide back.
      act(() => field().blur());
      await settle(300);
      expect(nav().dataset.state).toBe("rail");
    });

    it("does not close the slid-out sidebar when focus moves from the field to a match, and closes it when focus leaves from there", async () => {
      runnerWith([...loaded, unloaded], loaded);
      const { nav, button, field, links } = await mount({ collapsed: true });
      act(() => button("Search recent")!.click());
      pointerAway();
      type(field(), "tcp");
      await settle();
      act(() => links()[0].focus());
      await settle(400);
      expect(nav().dataset.state).toBe("peek");

      act(() => links()[0].blur());
      await settle(300);
      expect(nav().dataset.state).toBe("rail");
    });
  });

  describe("reads that overlap", () => {
    const many = Array.from({ length: 50 }, (_, at) =>
      draft({ draftId: `m${String(at).padStart(2, "0")}`, title: `Match number ${at}`, updated: new Date(Date.UTC(2026, 9, 4, 12, 0, 50 - at)).toISOString() }),
    );
    const rest = [draft({ draftId: "last", title: "Match last one", updated: "2026-10-03T00:00:00.000Z" })];
    const answer = (drafts: DraftSummary[]) => ({ ok: true, status: 200, data: { drafts, note: "" } });
    const down = { ok: false, status: 502, refusal: { error: "the studio runner is not answering", detail: null } };

    /** Reads for "match" answer by hand: the first page at once, the second page when told. */
    function held() {
      const second: Array<(value: unknown) => void> = [];
      listMock.mockImplementation((query: { q?: string; before?: unknown }) => {
        if (query.q === undefined) return Promise.resolve(answer([]));
        if (query.before === undefined) return Promise.resolve(answer(many));
        return new Promise((resolve) => second.push(resolve));
      });
      return { second };
    }
    const moreButton = (container: HTMLElement) => [...container.querySelectorAll("button")].find((b) => b.textContent === "Show more matches")!;
    const wake = () => act(async () => void window.dispatchEvent(new Event("focus")));

    it("does not report a failure for an older read that fails after a newer one landed", async () => {
      // The first search is slow and fails; a refresh for the same words lands first.
      const first: Array<(value: unknown) => void> = [];
      let calls = 0;
      listMock.mockImplementation((query: { q?: string }) => {
        if (query.q === undefined) return Promise.resolve(answer([]));
        calls += 1;
        return calls === 1 ? new Promise((resolve) => first.push(resolve)) : Promise.resolve(answer(rest));
      });
      const { field, container } = await mount();
      type(field(), "match");
      await settle();
      await wake();
      expect(container.textContent).toContain("Match last one");
      await act(async () => first[0](down));
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.textContent).toContain("Match last one");
    });

    it("still reports the newest read failing", async () => {
      listMock.mockImplementation((query: { q?: string }) => Promise.resolve(query.q === undefined ? answer([]) : down));
      const { field, container } = await mount();
      type(field(), "match");
      await settle();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("did not answer");
    });

    it("keeps the page a newer read loaded when the Show more read that began it fails after", async () => {
      const { second } = held();
      const { field, container, links } = await mount();
      type(field(), "match");
      await settle();
      expect(links()).toHaveLength(50);
      act(() => moreButton(container).click());
      await settle(0);
      // A refresh begins while the press is still reading its second page: both want two pages.
      await wake();
      expect(second).toHaveLength(2);
      await act(async () => second[1](answer(rest)));
      expect(links()).toHaveLength(51);
      // The press's own read fails afterwards: nothing is reported, and nothing is taken back.
      await act(async () => second[0](down));
      expect(container.textContent).not.toContain("More matches could not be read");
      expect(links()).toHaveLength(51);
      // So a later refresh still reads two pages, and the page is still there.
      await wake();
      expect(second).toHaveLength(3);
      await act(async () => second[2](answer(rest)));
      expect(links()).toHaveLength(51);
    });

    it("takes the page back, and says so, when the Show more read and a refresh that began under it both fail", async () => {
      const { second } = held();
      const { field, container, links } = await mount();
      type(field(), "match");
      await settle();
      act(() => moreButton(container).click());
      await settle(0);
      await wake();
      expect(second).toHaveLength(2);
      // The newest fails first: the press's read may still land the page, so nothing is said yet.
      await act(async () => second[1](down));
      expect(container.textContent).not.toContain("More matches could not be read");
      await act(async () => second[0](down));
      expect(container.textContent).toContain("More matches could not be read");
      expect(links()).toHaveLength(50);
      // The page is asked for again, not skipped: a refresh reads one page, as it did before the press.
      await wake();
      expect(second).toHaveLength(2);
    });

    it("takes the page back, and says so, while a read for words typed over is still out", async () => {
      const { second } = held();
      // The read for "matc" never answers until told; "match" answers.
      let late: (value: unknown) => void = () => {};
      const answerFor = listMock.getMockImplementation()!;
      listMock.mockImplementation((query: { q?: string; before?: unknown }) =>
        query.q === "matc" ? new Promise((resolve) => (late = resolve)) : answerFor(query),
      );
      const { field, container, links } = await mount();
      type(field(), "matc");
      await settle();
      type(field(), "match");
      await settle();
      expect(links()).toHaveLength(50);
      act(() => moreButton(container).click());
      await settle(0);
      await act(async () => second[0](down));
      expect(container.textContent).toContain("More matches could not be read");
      // Back to one page, though the old read has not finished: a refresh asks for no second page.
      await wake();
      expect(second).toHaveLength(1);
      await act(async () => late(answer(many)));
      expect(links()).toHaveLength(50);
    });

    it("takes the page back, and says so, when the Show more read is the newest and fails", async () => {
      const { second } = held();
      const { field, container, links } = await mount();
      type(field(), "match");
      await settle();
      act(() => moreButton(container).click());
      await settle(0);
      await act(async () => second[0](down));
      expect(container.textContent).toContain("More matches could not be read");
      expect(links()).toHaveLength(50);
      // The next refresh is back to one page.
      await wake();
      expect(second).toHaveLength(1);
    });
  });
});
