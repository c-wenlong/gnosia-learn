// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { panelSignature, type Diagram } from "@/lib/studio-view";

/**
 * The conversation opens and closes in the browser: the address bar moves
 * with `history.pushState` and the page is not drawn on the server again,
 * which was 2 to 3 seconds each way. These pin that, that a conversation
 * takes the frame in place of the home view, that a panel
 * the server drew only shows while the URL still names it, and that the
 * conversation opens at the press, with the person's words, before the
 * runner has made the draft.
 */

const mocks = vi.hoisted(() => ({ search: "", push: vi.fn(), loadSettings: vi.fn(), saveAgent: vi.fn() }));
vi.mock("@/app/(app)/studio/actions", () => ({ loadStudioSettings: mocks.loadSettings, saveStudioAgent: mocks.saveAgent }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
  usePathname: () => "/studio",
}));
vi.mock("@/components/studio/DraftPanel", async () => {
  // The real header, which is where the panel's Close is.
  const { DialogHeader } = await import("./StudioDialog");
  return {
    DraftPanel: ({ draftId, path }: { draftId: string; path: string }) =>
      createElement("div", { "data-draft": draftId, "data-path": path }, createElement(DialogHeader, { title: draftId })),
  };
});

const live = vi.hoisted(() => ({ jobs: [] as { jobId: string; state: string; title: string | null; target: string; requested: string }[] }));
vi.mock("@/components/studio/JobsProvider", () => ({ useStudioJobs: () => ({ jobs: live.jobs }) }));
vi.mock("@/components/studio/JobPanel", () => ({
  JobPanel: ({ jobId, path }: { jobId: string; path: string }) => createElement("div", { "data-job": jobId, "data-path": path }),
}));
// The app's sidebar reads the runner; what is pinned here is what the host
// publishes to it.
const published = vi.hoisted(() => ({ chats: null as null | { active: string | null; pending: string | null; newChat: () => void } }));
vi.mock("@/components/shell/shell-context", () => ({
  usePublishStudioChats: (chats: { active: string | null; pending: string | null; newChat: () => void }) => {
    published.chats = chats;
  },
}));
vi.mock("@/components/studio/DiagramInspector", () => ({
  DiagramPanelBody: ({ diagram, jobs, extendHref }: { diagram: { name: string }; jobs: { jobId: string }[]; extendHref: string }) =>
    createElement("div", { "data-tile": diagram.name, "data-jobs": jobs.map((job) => job.jobId).join(","), "data-extend": extendHref }),
}));

const { PanelHost, historyOf } = await import("./PanelHost");
const { usePanelHost } = await import("./panel-host");

type Controls = NonNullable<ReturnType<typeof usePanelHost>>;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom's dialog does not open itself.
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

/** The address bar: what `useSearchParams` answers and what `window.location` says. */
function setUrl(search: string) {
  mocks.search = search;
  window.history.replaceState(null, "", search === "" ? "/studio" : `/studio?${search}`);
}

let pushState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  live.jobs = [];
  setUrl("");
  mocks.push.mockReset();
  // A read nobody answers, unless a test says otherwise.
  mocks.loadSettings.mockReset().mockReturnValue(new Promise(() => undefined));
  pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  pushState.mockRestore();
});

/** Hands the host's controls to the test, as the home composer would use them. */
const grabbed: { controls: Controls | null } = { controls: null };
function Grab(): ReactNode {
  const value = usePanelHost();
  useEffect(() => {
    grabbed.controls = value;
  });
  return null;
}

const DIAGRAM = {
  name: "graph",
  title: "A graph",
  topic: "graphs",
  concepts: [],
  tldr: { path: "learn/assets/graph.tldr", modified: null },
  svg: { exists: true, path: "learn/assets/graph.svg", bytes: 10, modified: null },
  svgState: "fresh",
  shapes: 3,
  created: null,
  source: null,
} as unknown as Diagram;

function mount(options: { panel?: ReactNode; panelKey?: string } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const props: Omit<ComponentProps<typeof PanelHost>, "children"> = {
    panel: options.panel ?? null,
    panelKey: options.panelKey ?? panelSignature({}),
    topics: [],
    titles: {},
    suggestions: [],
    cap: null,
    diagrams: [DIAGRAM],
    drafts: [],
    jobs: [
      { jobId: "j1", state: "accepted", title: "Draw the graph", target: "learn/assets/graph.tldr", requested: "2026-09-30" },
      { jobId: "j2", state: "failed", title: "Something else", target: "learn/assets/other.tldr", requested: "2026-09-30" },
    ],
  };
  const draw = () =>
    act(() =>
      root.render(
        // Children as an argument, as the lint rule wants; the props type
        // requires them, hence the cast.
        createElement(PanelHost, props as ComponentProps<typeof PanelHost>, createElement(Grab), createElement("p", { "data-home": true }, "Home")),
      ),
    );
  draw();
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  /** The address bar moved (Next syncs `useSearchParams` with pushState): draw again. */
  const go = (search: string) => {
    setUrl(search);
    draw();
  };
  return { container, go };
}

const close = (container: HTMLElement) =>
  act(() => container.querySelector<HTMLButtonElement>("[data-dialog-close]")!.click());

// The sidebar's New chat, which calls what the host published.
const newChat = () => act(() => published.chats!.newChat());
/** The home view's wrapper: hidden while a conversation has the frame. */
const home = (container: HTMLElement) => container.querySelector("[data-home]")!.parentElement!;
const pane = (container: HTMLElement) => container.querySelector('section[aria-label="Conversation"]');
const FIRST = { text: "how does a raft log stay in step", mentions: [] };

describe("the conversation", () => {
  it("opens from the URL in place of the home view, and New chat moves the address bar without a router push", () => {
    setUrl("topic=graphs&draft=d1");
    const { container, go } = mount();
    const panel = container.querySelector("[data-draft]");
    expect(panel?.getAttribute("data-draft")).toBe("d1");
    expect(panel?.getAttribute("data-path")).toBe("/studio?topic=graphs&draft=d1");
    // Full screen, not a dialog, with no Close of its own: New chat is the way home.
    expect(pane(container)?.contains(panel!)).toBe(true);
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector("[data-dialog-close]")).toBeNull();
    expect(home(container).hidden).toBe(true);
    expect(published.chats?.active).toBe("d1");

    newChat();
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?topic=graphs");
    expect(mocks.push).not.toHaveBeenCalled();
    go("topic=graphs");
    expect(pane(container)).toBeNull();
    expect(home(container).hidden).toBe(false);
  });

  it("is not open under a picture or the settings, as the server's order has it", () => {
    setUrl("draft=d1&job=j1&shot=after");
    const first = mount();
    expect(first.container.querySelector("[data-draft]")).toBeNull();
    first.go("draft=d1&settings=1");
    expect(first.container.querySelector("[data-draft]")).toBeNull();
  });

  it("opens at the press with the person's words, and becomes the conversation once the URL names it", () => {
    const { container, go } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin(FIRST);
    });
    expect(pane(container)?.textContent).toContain("Opening the conversation");
    expect(pane(container)?.textContent).toContain(FIRST.text);
    expect(home(container).hidden).toBe(true);
    expect(published.chats?.pending).toBe(FIRST.text);

    let went = false;
    act(() => {
      went = grabbed.controls!.settle(token, "/studio?draft=d9");
    });
    expect(went).toBe(true);
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?draft=d9");
    // Still there until the address bar has the draft: no frame with neither.
    expect(pane(container)).not.toBeNull();

    go("draft=d9");
    expect(container.querySelector("[data-draft]")?.getAttribute("data-draft")).toBe("d9");
    expect(container.textContent).not.toContain("Opening the conversation");

    // And leaving it does not bring the placeholder back.
    newChat();
    go("");
    expect(pane(container)).toBeNull();
  });

  it("goes home again when the draft could not be made", () => {
    const { container } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin(FIRST);
    });
    let went = true;
    act(() => {
      went = grabbed.controls!.settle(token, null);
    });
    expect(went).toBe(false);
    expect(pane(container)).toBeNull();
    expect(home(container).hidden).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
  });

  it("does not open a draft that arrives after the person pressed New chat", () => {
    const { container } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin(FIRST);
    });
    newChat();
    expect(pane(container)).toBeNull();
    let went = true;
    act(() => {
      went = grabbed.controls!.settle(token, "/studio?draft=late");
    });
    expect(went).toBe(false);
    expect(pushState).not.toHaveBeenCalledWith(null, "", "/studio?draft=late");
  });

  it("does not open a draft that arrives after Back to another view with no draft", () => {
    setUrl("sel=graph");
    const { container, go } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin(FIRST);
    });
    // Back from a tile's panel to the plain home view: no draft either side.
    go("");
    expect(pane(container)).toBeNull();
    let went = true;
    act(() => {
      went = grabbed.controls!.settle(token, "/studio?draft=late");
    });
    expect(went).toBe(false);
    expect(pushState).not.toHaveBeenCalledWith(null, "", "/studio?draft=late");
  });
});

describe("Start over in a conversation", () => {
  it("does not open the new draft when the person left the conversation meanwhile", () => {
    setUrl("draft=d1");
    const { container, go } = mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin(null);
    });
    newChat();
    expect(pushState).toHaveBeenLastCalledWith(null, "", "/studio");
    go("");
    act(() => {
      grabbed.controls!.settle(token, "/studio?draft=d2");
    });
    expect(pushState).not.toHaveBeenCalledWith(null, "", "/studio?draft=d2");
    expect(pane(container)).toBeNull();
  });

  it("opens it when the person is still there", () => {
    setUrl("draft=d1");
    mount();
    let token = 0;
    act(() => {
      token = grabbed.controls!.begin(null);
    });
    act(() => {
      grabbed.controls!.settle(token, "/studio?draft=d2");
    });
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?draft=d2");
  });
});

describe("a panel the server drew", () => {
  const drawn = createElement("div", { "data-server-panel": true });

  it("shows while the URL names the panel it was drawn for, whatever the filters", () => {
    setUrl("extend=graph&topic=a");
    const { container, go } = mount({ panel: drawn, panelKey: panelSignature({ extend: "graph" }) });
    expect(container.querySelector("[data-server-panel]")).not.toBeNull();
    go("extend=graph&topic=b");
    expect(container.querySelector("[data-server-panel]")).not.toBeNull();
  });

  it("gives way to a conversation opened over it, and does not come back when that closes", () => {
    setUrl("extend=graph");
    const { container, go } = mount({ panel: drawn, panelKey: panelSignature({ extend: "graph" }) });
    expect(container.querySelector("[data-server-panel]")).not.toBeNull();
    go("draft=d2");
    expect(container.querySelector("[data-server-panel]")).toBeNull();
    expect(container.querySelector("[data-draft]")).not.toBeNull();
    go("");
    expect(container.querySelector("[data-server-panel]")).toBeNull();
  });
});

describe("a job and a tile", () => {
  it("draws a job's panel from the URL, titled from the page's rows, and closes it with pushState", () => {
    setUrl("job=j1&topic=graphs");
    const { container } = mount();
    expect(container.querySelector("[data-job]")?.getAttribute("data-job")).toBe("j1");
    expect(container.querySelector("dialog")?.getAttribute("aria-label")).toBe("Draw the graph");
    close(container);
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?topic=graphs");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("draws a tile's panel with that diagram's jobs, and says a verb's outcome there once", () => {
    setUrl("sel=graph&v=verify&ok=1&m=verified");
    const { container } = mount();
    const body = container.querySelector("[data-tile]");
    expect(body?.getAttribute("data-tile")).toBe("graph");
    expect(body?.getAttribute("data-jobs")).toBe("j1");
    expect(body?.getAttribute("data-extend")).toBe("/studio?extend=graph");
    expect(container.textContent).toContain("verified");
    // Close drops the outcome with the panel.
    close(container);
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio");
  });

  it("says so for a name the directory does not have", () => {
    setUrl("sel=missing");
    const { container } = mount();
    expect(container.textContent).toContain("There is no diagram named missing");
  });

  it("moves between panels and views in the browser, and hands anything else back", () => {
    setUrl("sel=graph");
    mount();
    expect(grabbed.controls!.navigate("/studio?job=j1")).toBe(true);
    expect(pushState).toHaveBeenLastCalledWith(null, "", "/studio?job=j1");
    pushState.mockClear();
    expect(grabbed.controls!.navigate("/studio?settings=1")).toBe(true);
    pushState.mockClear();
    // Another filter is a view change, which the grid redraws in the browser.
    expect(grabbed.controls!.navigate("/studio?topic=b")).toBe(true);
    expect(pushState).toHaveBeenLastCalledWith(null, "", "/studio?topic=b");
    pushState.mockClear();
    // Another filter with another panel, a picture, an Extend press, another page.
    for (const href of ["/studio?topic=b&job=j1", "/studio?job=j1&shot=after", "/studio?extend=graph", "/library"]) {
      expect(grabbed.controls!.navigate(href)).toBe(false);
    }
    expect(pushState).not.toHaveBeenCalled();
  });
});

describe("a tile's job history", () => {
  const row = (jobId: string, state: string, requested: string, target = "t") => ({ jobId, state, title: jobId, target, requested });

  it("takes the live state of a job the page read, and adds one it never saw, newest first", () => {
    const rows = [row("old", "drawing", "2026-09-30T08:00:00Z"), row("elsewhere", "accepted", "2026-09-30T08:30:00Z", "u")];
    const now = [row("old", "awaiting_review", "2026-09-30T08:00:00Z"), row("new", "queued", "2026-09-30T09:00:00Z")];
    expect(historyOf(rows, now, "t")).toEqual([row("new", "queued", "2026-09-30T09:00:00Z"), row("old", "awaiting_review", "2026-09-30T08:00:00Z")]);
  });

  it("is what the tile's panel shows", () => {
    live.jobs = [row("j9", "queued", "2026-10-01", "learn/assets/graph.tldr")];
    setUrl("sel=graph");
    const { container } = mount();
    expect(container.querySelector("[data-tile]")?.getAttribute("data-jobs")).toBe("j9,j1");
  });
});

describe("the settings", () => {
  const rows = (model: string) => ({
    reachable: true,
    rows: [
      { kind: "video", name: "Videos", value: { model, effort: "default" }, fallback: { model: "default", effort: "default" }, models: [{ value: "default", label: "Claude Code default" }, { value: "opus", label: "Opus" }], efforts: [{ value: "default", label: "Claude Code default" }] },
      { kind: "diagram", name: "Diagrams", value: { model: "sonnet", effort: "default" }, fallback: { model: "sonnet", effort: "default" }, models: [{ value: "sonnet", label: "Sonnet" }], efforts: [{ value: "default", label: "Claude Code default" }] },
    ],
  });

  it("open at once, read their rows once a visit, and close without a server render", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mocks.loadSettings.mockImplementation(() => new Promise((settle) => (answer = settle)));
    setUrl("topic=graphs&settings=1");
    const { container, go } = mount();

    // The dialog is up before the rows are, holding their shape.
    expect(container.querySelector("dialog[open]")?.getAttribute("aria-label")).toBe("Settings");
    expect(container.querySelector("[aria-busy]")).not.toBeNull();
    await act(async () => answer(rows("default")));
    expect(container.querySelectorAll("dialog[open] select")).toHaveLength(4);

    close(container);
    expect(pushState).toHaveBeenCalledWith(null, "", "/studio?topic=graphs");
    expect(mocks.push).not.toHaveBeenCalled();
    go("topic=graphs");
    expect(container.querySelector("dialog")).toBeNull();

    // Opened again: the rows it read, not a second read.
    go("topic=graphs&settings=1");
    expect(container.querySelectorAll("dialog[open] select")).toHaveLength(4);
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);
  });

  it("start reading on a hover, so the press finds the rows", async () => {
    mocks.loadSettings.mockResolvedValue(rows("opus"));
    const { container, go } = mount();
    await act(async () => grabbed.controls!.warmSettings());
    go("settings=1");
    expect(container.querySelector<HTMLSelectElement>("dialog[open] select")?.value).toBe("opus");
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);
  });

  it("do not read again on a hover once rows with the catalog behind them are held", async () => {
    mocks.loadSettings.mockResolvedValue(rows("opus"));
    mount();
    await act(async () => grabbed.controls!.warmSettings());
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);

    // Each later hover or focus on the Settings button asks again, and reads nothing.
    await act(async () => grabbed.controls!.warmSettings());
    await act(async () => grabbed.controls!.warmSettings());
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);
  });

  it("read again on a hover while the rows held are the defaults, until the catalog answers", async () => {
    mocks.loadSettings
      .mockResolvedValueOnce({ ...rows("default"), reachable: false })
      .mockResolvedValueOnce(rows("opus"))
      .mockResolvedValue(rows("default"));
    mount();
    await act(async () => grabbed.controls!.warmSettings());
    expect(mocks.loadSettings).toHaveBeenCalledTimes(1);

    await act(async () => grabbed.controls!.warmSettings());
    expect(mocks.loadSettings).toHaveBeenCalledTimes(2);

    // That one had the catalog behind it, so the next hover is free.
    await act(async () => grabbed.controls!.warmSettings());
    expect(mocks.loadSettings).toHaveBeenCalledTimes(2);
  });

  it("read again on the next opening when the last read had no catalog behind it", async () => {
    mocks.loadSettings.mockResolvedValueOnce({ ...rows("default"), reachable: false }).mockResolvedValueOnce(rows("opus"));
    setUrl("settings=1");
    const { container, go } = mount();
    await act(async () => undefined);
    expect(container.textContent).toContain("The catalog is not answering");

    close(container);
    go("");
    await act(async () => go("settings=1"));
    expect(mocks.loadSettings).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("The catalog is not answering");
    expect(container.querySelector<HTMLSelectElement>("dialog[open] select")?.value).toBe("opus");
  });

  it("say so when the studio does not answer, and try again on a press", async () => {
    mocks.loadSettings.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(rows("default"));
    setUrl("settings=1");
    const { container } = mount();
    await act(async () => undefined);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be read");

    await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(container.querySelectorAll("dialog[open] select")).toHaveLength(4);
  });
});
