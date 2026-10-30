// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftView, TranscriptEntry } from "@/lib/studio-drafts";
import type { VideoBrief } from "@/lib/studio-brief-video";
import type { Brief } from "@/lib/studio-jobs";

/**
 * The conversation panel's wiring, in a DOM, against a mocked client module:
 * what it sends, when, and what it never presses. The judgements themselves
 * are `studio-cards.test.ts` and `studio-chat.test.ts`; these pin that the
 * panel applies them (review of #204).
 *
 * The composer is a stand-in that shows the value it is handed and exposes
 * the callbacks, since Lexical's editing is not what is under test here.
 */

const mocks = vi.hoisted(() => ({
  getDraft: vi.fn(),
  sendMessage: vi.fn(),
  abandonDraft: vi.fn(),
  createDraft: vi.fn(),
  drawDraft: vi.fn(),
  drawBoth: vi.fn(),
  setDraftTrust: vi.fn(),
  declineSuggestion: vi.fn(),
  push: vi.fn(),
  focus: vi.fn(),
  insertMention: vi.fn(),
  readStudioHealth: vi.fn(async () => null),
  lateHandle: false,
  events: null as null | { onEvent: (event: { type: string; data: unknown }) => void },
  composer: null as null | {
    value: { text: string; mentions: unknown[] };
    disabled?: boolean;
    sendDisabled?: boolean;
    disabledReason?: string;
    onChange: (value: { text: string; mentions: unknown[] }) => void;
    onModEnter?: () => void;
    handleRef?: { current: unknown } | ((handle: unknown) => void) | null;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  // Extend's label, on a card of something the conversation made.
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function StubComposer(props: NonNullable<typeof mocks.composer>) {
      mocks.composer = props;
      // A late handle stands in for the real composer's lazy chunk: rendered,
      // but with nothing to focus until the test hands it over.
      if (!mocks.lateHandle && props.handleRef && typeof props.handleRef === "object") {
        props.handleRef.current = { focus: mocks.focus, insertMention: mocks.insertMention };
      }
      return createElement("div", { "data-composer": JSON.stringify(props.value) });
    },
}));
vi.mock("@/components/studio/StudioDialog", () => ({
  DialogHeader: ({ title, meta }: { title: ReactNode; meta?: ReactNode }) =>
    createElement("header", { "data-header": true }, createElement("h2", null, title), meta ?? null),
}));
vi.mock("@/components/studio/JobsProvider", () => ({
  useStudioJobs: () => ({ jobs: [], refresh: async () => {} }),
  askToNotify: async () => {},
}));
vi.mock("@/components/studio/JobPanel", () => ({ JobPanel: () => null }));
vi.mock("@/components/studio/PinnedDiagram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/studio/PinnedDiagram")>()),
  // The diagram's picture as a marker, so a test can see which one is pinned.
  PinnedDiagram: ({ name }: { name: string }) => createElement("img", { src: `/diagrams/${name}` }),
}));
vi.mock("@/lib/studio-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-drafts")>()),
  getDraft: mocks.getDraft,
  sendMessage: mocks.sendMessage,
  abandonDraft: mocks.abandonDraft,
  createDraft: mocks.createDraft,
  drawDraft: mocks.drawDraft,
  drawBoth: mocks.drawBoth,
  setDraftTrust: mocks.setDraftTrust,
  declineSuggestion: mocks.declineSuggestion,
}));
vi.mock("@/lib/studio-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-events")>()),
  openDraftEvents: (_id: string, _after: unknown, handlers: NonNullable<typeof mocks.events>) => {
    mocks.events = handlers;
    return () => {};
  },
}));
vi.mock("@/lib/studio-health", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/studio-health")>()),
  readStudioHealth: mocks.readStudioHealth,
}));

const { DraftPanel } = await import("./DraftPanel");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.composer = null;
  mocks.events = null;
  mocks.focus.mockClear();
  mocks.insertMention.mockClear();
  mocks.setDraftTrust.mockClear();
  mocks.declineSuggestion.mockClear();
  mocks.sendMessage.mockClear();
  mocks.readStudioHealth.mockClear();
  mocks.lateHandle = false;
  sessionStorage.clear();
  mocks.sendMessage.mockResolvedValue({ ok: true, status: 202, data: { draftId: "d1", seq: 1, note: "" } });
  mocks.abandonDraft.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", state: "abandoned", note: "" } });
  mocks.createDraft.mockResolvedValue({ ok: true, status: 201, data: { draftId: "d2", state: "open", note: "" } });
  mocks.drawDraft.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", jobId: "j1", state: "drawing", note: "" } });
  mocks.setDraftTrust.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", trust: ["video"], note: "" } });
  mocks.declineSuggestion.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", declined: ["video"], note: "" } });
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

const DIAGRAM: Brief = {
  intent: "Show attention",
  title: "Attention weights",
  topic: "transformers",
  slug: "attention-weights",
  mode: "new",
  elements: [{ label: "Query" }],
  relations: [],
};

const VIDEO: VideoBrief = {
  title: "How attention weights are computed",
  topic: "transformers",
  slug: "attention-weights",
  mode: "new",
  idea: "Weights come from comparing a query with every key.",
  audience: "familiar",
  targetSeconds: 60,
  voice: "af_heart",
  scenes: [{ name: "one", beats: [{ say: "Each word decides.", show: "A sentence.", labels: [] }] }],
  concepts: [],
};

const entry = (seq: number, role: TranscriptEntry["role"], text: string, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({
  seq,
  role,
  text,
  at: "2026-09-29T00:00:00Z",
  ...extra,
});

const slot = (over: Record<string, unknown> = {}) => ({
  brief: null,
  briefSeq: null,
  pendingTopic: null,
  jobId: null,
  waiting: null,
  requestSeq: null,
  held: null,
  state: "open" as const,
  ...over,
});

function draft(over: Partial<DraftView> = {}): DraftView {
  return {
    draftId: "d1",
    kind: "diagram",
    state: "open",
    source: null,
    title: null,
    transcript: [],
    brief: null,
    pendingTopic: null,
    jobId: null,
    turns: 0,
    turnCap: 20,
    costUsd: null,
    costSource: null,
    inFlight: false,
    error: null,
    created: "2026-09-29T00:00:00Z",
    updated: "2026-09-29T00:00:00Z",
    note: "",
    plannerKinds: ["diagram", "video", "svg"],
    slots: { diagram: slot(), video: slot() },
    ...over,
  } as DraftView;
}

/** Both briefs live, asked for in one message. */
const pair = () =>
  draft({
    state: "briefed",
    turns: 1,
    transcript: [
      entry(1, "person", "@video and @diagram", {
        mentions: [
          { kind: "video", start: 0, end: 6 },
          { kind: "diagram", start: 11, end: 19 },
        ],
      }),
      entry(2, "planner", "Both.", {
        briefs: [
          { kind: "diagram", brief: DIAGRAM, requestSeq: 1 },
          { kind: "video", brief: VIDEO, requestSeq: 1 },
        ],
      }),
    ],
    slots: {
      diagram: slot({ brief: DIAGRAM, briefSeq: 2, requestSeq: 1, state: "briefed" }),
      video: slot({ brief: VIDEO, briefSeq: 2, requestSeq: 1, state: "briefed" }),
    },
  });

async function settle() {
  for (let at = 0; at < 5; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(view: DraftView, jobId: string | null = null) {
  mocks.getDraft.mockResolvedValue({ ok: true, status: 200, data: view });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(DraftPanel, {
        draftId: "d1",
        jobId,
        path: "/studio?draft=d1",
        topics: [],
        titles: {},
        suggestions: [],
        cap: null,
        video: { ok: true, reason: null },
        videoTitles: { "softmax-basics": "Softmax, slowly" },
      }),
    );
  });
  await settle();
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

const leave = (opener: Record<string, unknown>) =>
  sessionStorage.setItem("studio:extend-opener:d1", JSON.stringify({ send: null, compose: "", source: null, ...opener }));

describe("the Extend opener", () => {
  it("is sent once when the conversation opens empty, with the record read (not the first render's null)", async () => {
    leave({ send: "What should this diagram add?", source: "tcp-handshake" });
    await mount(draft({ source: "tcp-handshake" }));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", { text: "What should this diagram add?", mentions: [] });
  });
});

describe("the Extend opener with chips", () => {
  it("sends a message queued during the read with its chips, once", async () => {
    leave({
      send: "A @video of how it opens",
      sendMentions: [{ kind: "video", start: 2, end: 8 }],
      source: "tcp-handshake",
    });
    await mount(draft({ source: "tcp-handshake" }));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", {
      text: "A @video of how it opens",
      mentions: [{ kind: "video", start: 2, end: 8 }],
    });
  });

  it("puts unsent words in the composer with their chip where it was typed, and sends nothing", async () => {
    leave({
      compose: "then a @diagram of the close",
      composeMentions: [{ kind: "diagram", start: 7, end: 15 }],
      source: "tcp-handshake",
    });
    await mount(draft({ source: "tcp-handshake" }));
    expect(mocks.composer!.value).toEqual({
      text: "then a @diagram of the close",
      mentions: [{ kind: "diagram", start: 7, end: 15 }],
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the queued message's chips and the unsent words' chips apart", async () => {
    leave({
      send: "@video first",
      sendMentions: [{ kind: "video", start: 0, end: 6 }],
      compose: "and a @diagram",
      composeMentions: [{ kind: "diagram", start: 6, end: 14 }],
      source: "tcp-handshake",
    });
    await mount(draft({ source: "tcp-handshake" }));
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", { text: "@video first", mentions: [{ kind: "video", start: 0, end: 6 }] });
    expect(mocks.composer!.value).toEqual({ text: "and a @diagram", mentions: [{ kind: "diagram", start: 6, end: 14 }] });
  });
});

describe("a Change's opener on an open conversation", () => {
  it("goes in front of what the person had typed, with its Video chip, and is not sent", async () => {
    await mount(pair());
    await act(async () => mocks.composer!.onChange({ text: "half typed", mentions: [] }));
    leave({ compose: "say it slower", mentions: ["video"] });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("studio:opener", { detail: { draftId: "d1" } }));
    });
    expect(mocks.composer!.value).toEqual({
      text: "@video say it slower\nhalf typed",
      mentions: [{ kind: "video", start: 0, end: 6 }],
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe("Cmd+Enter with two live cards", () => {
  it("presses nothing and leaves focus where it was, so a stray Space cannot start two jobs", async () => {
    const host = await mount(pair());
    expect(host.querySelector("[data-make-both]")).not.toBeNull();
    const before = document.activeElement;
    await act(async () => mocks.composer!.onModEnter!());
    await settle();
    expect(mocks.drawDraft).not.toHaveBeenCalled();
    expect(mocks.drawBoth).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);
    expect(host.querySelector("[data-make-both]")?.getAttribute("aria-keyshortcuts")).toBeNull();
  });
});

describe("a long message", () => {
  it("is not blocked: the chat has no length cap, only the runner's 1 MB body limit", async () => {
    await mount(pair());
    await act(async () => mocks.composer!.onChange({ text: "x".repeat(16_500), mentions: [] }));
    expect(mocks.composer!.disabled).toBe(false);
    expect(mocks.composer!.sendDisabled).toBe(false);
    expect(mocks.composer!.disabledReason).toBeUndefined();
  });
});

describe("Start over while a job runs (Greptile on #204)", () => {
  it("opens a new conversation and leaves the drawing draft alone", async () => {
    const host = await mount(
      draft({
        state: "drawing",
        turns: 1,
        transcript: [entry(1, "person", "@diagram tcp", { mentions: [{ kind: "diagram", start: 0, end: 8 }] })],
        slots: { diagram: slot({ state: "drawing", jobId: "j1" }), video: slot() },
      }),
    );
    const startOver = () => [...host.querySelectorAll("button")].filter((button) => button.textContent === "Start over");
    await act(async () => startOver()[0]!.click());
    await act(async () => startOver()[0]!.click());
    await settle();
    expect(mocks.abandonDraft).not.toHaveBeenCalled();
    expect(mocks.createDraft).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toMatch(/could not be closed|is drawing/);
  });
});

describe("a conversation opened with Change on a video (p2v-video on #203)", () => {
  it("names, pins and opens on the video, never as a diagram", async () => {
    const host = await mount(draft({ source: "softmax-basics", sourceKind: "video" }));
    // The video's own title, never a diagram's of the same slug.
    expect(host.textContent).toContain("Changing Softmax, slowly");
    expect(host.textContent).not.toContain("Extending");
    expect(host.textContent).toContain("I've read this video's brief.");
    expect(host.textContent).not.toContain("I've read this diagram");
    const srcs = [...host.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toContain("/api/assets/video%3Asoftmax-basics/poster");
    expect(srcs.some((src) => src?.includes("/diagrams/"))).toBe(false);
  });
});

describe("the conversation's header", () => {
  const heading = (host: HTMLElement) => host.querySelector("[data-header] h2")?.textContent;

  it("is the name the owner gave it, over the planner's title, as the sidebar calls it", async () => {
    expect(heading(await mount(draft({ title: "Attention weights" })))).toBe("Attention weights");
    expect(heading(await mount(draft({ name: "My attention notes", title: "Attention weights" })))).toBe("My attention notes");
    expect(heading(await mount(draft({ name: "   " })))).toBe("New conversation");
  });
});

describe("a conversation opened from the concept tutor (docs/STUDIO-TUTOR-HANDOFF.md)", () => {
  const concept = { slug: "tcp-handshake", title: "The TCP handshake", topic: "tcp", tutorTurns: 6 };

  it("sends the tutor's tagged message on arrival, chips and all, and a bare tag is enough (H8)", async () => {
    leave({ send: "@video", sendMentions: [{ kind: "video", start: 0, end: 6 }], source: null });
    await mount(draft({ concept }));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", { text: "@video", mentions: [{ kind: "video", start: 0, end: 6 }] });
  });

  it("pins the concept as a link back, with the exchanges that came along, and no topic suggestions", async () => {
    const host = await mount(draft({ concept }));
    const link = [...host.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/learn/tcp-handshake");
    expect(link?.textContent).toBe("The TCP handshake");
    expect(host.textContent).toContain("and your last 3 exchanges with the tutor");
    expect(host.querySelector('[aria-label="Suggestions"]')).toBeNull();
  });

  it("says nothing about the tutor when no turns came along", async () => {
    const host = await mount(draft({ concept: { ...concept, tutorTurns: 0 } }));
    expect(host.textContent).toContain("The TCP handshake");
    expect(host.textContent).not.toContain("exchange");
  });

  it("opens on the note when the first message could not be sent (H14), and takes a bare tag back", async () => {
    const host = await mount(draft({ concept }));
    expect(host.textContent).toContain(
      "I have your note on The TCP handshake. Tag @diagram or @video to make one of it, or ask me about it first.",
    );
    await act(async () => mocks.composer!.onChange({ text: "@diagram", mentions: [{ kind: "diagram", start: 0, end: 8 }] }));
    expect(mocks.composer!.sendDisabled).toBe(false);
  });

  it("still refuses a bare tag in any other empty conversation (T15)", async () => {
    await mount(draft());
    await act(async () => mocks.composer!.onChange({ text: "@diagram", mentions: [{ kind: "diagram", start: 0, end: 8 }] }));
    expect(mocks.composer!.sendDisabled).toBe(true);
    expect(mocks.composer!.disabledReason).toBe("Say what it should show");
  });
});

describe("Make both, while the press is still answering (phase 2 measurement, bug 8)", () => {
  it("stops saying Queuing once the record has both jobs, and links the video card to its job", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.drawBoth.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const host = await mount(pair());
    const both = host.querySelector("[data-make-both]") as HTMLButtonElement;
    await act(async () => both.click());
    expect(host.textContent).toContain("Queuing");

    // The runner records each job on the draft as it queues it and says so on
    // the draft's stream, well before the press's own answer comes back.
    const drawing = pair();
    drawing.state = "drawing";
    drawing.slots = {
      diagram: slot({ brief: DIAGRAM, briefSeq: 2, requestSeq: 1, state: "drawing", jobId: "j-d", live: true, busy: { jobId: "j-d", state: "running" } }),
      video: slot({ brief: VIDEO, briefSeq: 2, requestSeq: 1, state: "drawing", jobId: "j-v", live: true, busy: { jobId: "j-v", state: "running" } }),
    } as DraftView["slots"];
    mocks.getDraft.mockResolvedValue({ ok: true, status: 200, data: drawing });
    await act(async () => mocks.events!.onEvent({ type: "state", data: { state: "drawing", jobId: "j-v", slots: {} } }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    await settle();

    expect(host.textContent).not.toContain("Queuing");
    const video = host.querySelector('[data-card="video"]') as HTMLElement;
    const link = [...video.querySelectorAll("a")].find((a) => /job=j-v/.test(a.getAttribute("href") ?? ""));
    expect(link).toBeDefined();

    await act(async () => answer({ ok: true, status: 200, data: { results: [{ kind: "diagram", jobId: "j-d" }, { kind: "video", jobId: "j-v" }] } }));
    await settle();
    expect(host.textContent).not.toContain("Queuing");
  });
});

describe("the dialog header's cost (bug 9)", () => {
  const costed = () => ({ ...pair(), costUsd: 0.058, costSource: "result" as const, jobId: "j1" });

  it("shows the conversation's cost in the conversation", async () => {
    const host = await mount(costed());
    expect(host.querySelector("[data-header]")?.textContent).toContain("$0.058");
  });

  it("leaves it out of the job view, whose own line carries the job's cost", async () => {
    const host = await mount(costed(), "j1");
    expect(host.querySelector("[data-header]")?.textContent).not.toContain("$0.058");
  });
});

describe("the diagram card (bug 11)", () => {
  it("prints no path for where the job will draw", async () => {
    const host = await mount(pair());
    const card = host.querySelector('[data-card="diagram"]') as HTMLElement;
    expect(card.textContent).toContain("Draw");
    expect(card.textContent).not.toMatch(/STUDIO_HOME|candidate\/|\.tldr/);
  });
});

describe("what arrives while the conversation is open", () => {
  /** The thread's child box that holds `text`: an entry's, the pending turn's, the reply being written's. */
  const boxOf = (host: HTMLElement, text: string) =>
    [...host.querySelectorAll('[role="log"] > *')].find((box) => box.textContent?.includes(text)) ?? null;

  it("rises in, and what the conversation opened with stands still", async () => {
    const host = await mount(draft({ turns: 1, transcript: [entry(1, "person", "a raft log"), entry(2, "planner", "An opening reply.")] }));
    expect(boxOf(host, "An opening reply.")?.className).not.toContain("animate-enter");

    // Another turn lands (from another tab, say): its reply is news.
    mocks.getDraft.mockResolvedValue({
      ok: true,
      status: 200,
      data: draft({
        turns: 2,
        transcript: [entry(1, "person", "a raft log"), entry(2, "planner", "An opening reply."), entry(3, "person", "and the leader?"), entry(4, "planner", "A new reply.")],
      }),
    });
    act(() => mocks.events!.onEvent({ type: "reply", data: {} }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    await settle();
    expect(boxOf(host, "A new reply.")?.className).toContain("animate-enter");
    // A person's turn replaces the bubble that rose in at Send, so it does not rise twice.
    expect(boxOf(host, "and the leader?")?.className).not.toContain("animate-enter");
    // A re-render does not start the opening reply's animation late.
    expect(boxOf(host, "An opening reply.")?.className).not.toContain("animate-enter");
  });

  it("raises the person's turn at Send, and the reply being written under it", async () => {
    const host = await mount(draft());
    mocks.sendMessage.mockReturnValue(new Promise(() => undefined));
    const composer = mocks.composer as unknown as { onSubmit: (value: { text: string; mentions: unknown[] }) => void };
    await act(async () => composer.onSubmit({ text: "draw a heap", mentions: [] }));
    const sent = [...host.querySelectorAll('[role="log"] p')].find((line) => line.textContent?.includes("draw a heap"));
    expect(sent?.closest(".animate-enter")).not.toBeNull();
    const thinking = host.querySelector('[role="log"] [role="status"]');
    expect(thinking?.closest(".animate-enter")).not.toBeNull();
  });
});

describe("focus on opening", () => {
  it("goes to the composer when nobody has moved it since the panel opened", async () => {
    await mount(pair());
    expect(mocks.focus).toHaveBeenCalledTimes(1);
  });

  it("stays where the person put it while the conversation loaded, such as the sidebar's search", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.getDraft.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const search = document.createElement("input");
    const host = document.createElement("div");
    document.body.append(search, host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(DraftPanel, {
          draftId: "d1",
          jobId: null,
          path: "/studio?draft=d1",
          topics: [],
          titles: {},
          suggestions: [],
          cap: null,
          video: { ok: true, reason: null },
          videoTitles: {},
        }),
      );
    });
    mounted.push(() => {
      act(() => root.unmount());
      host.remove();
      search.remove();
    });
    search.focus();
    await act(async () => answer({ ok: true, status: 200, data: pair() }));
    await settle();
    expect(mocks.composer).not.toBeNull();
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(search);
  });

  /** Hand the stub's composer its handle, as the lazy chunk arriving would, and let the retries run. */
  async function handOver() {
    const ref = mocks.composer!.handleRef;
    if (ref && typeof ref === "object") ref.current = { focus: mocks.focus, insertMention: () => {} };
    for (let frame = 0; frame < 5; frame += 1) {
      await act(async () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    }
  }

  it("goes to a composer that arrives after the conversation, when nobody moved focus meanwhile", async () => {
    mocks.lateHandle = true;
    await mount(pair());
    expect(mocks.focus).not.toHaveBeenCalled();
    await handOver();
    expect(mocks.focus).toHaveBeenCalledTimes(1);
  });

  it("stays where the person put it while the composer itself loaded", async () => {
    mocks.lateHandle = true;
    await mount(pair());
    const search = document.createElement("input");
    document.body.append(search);
    mounted.push(() => search.remove());
    search.focus();
    await handOver();
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(search);
  });
});

describe("what the conversation made (D89)", () => {
  const ACCEPTED = "2026-09-30T02:25:41.703Z";
  const made = (over: Record<string, unknown> = {}) => ({
    id: "diagram:learn/assets/tcp-vs-udp.svg",
    kind: "diagram_svg",
    title: "TCP vs UDP",
    name: "tcp-vs-udp",
    jobId: "j1",
    madeAt: "2026-09-30T02:25:41.686Z",
    thumbnail: true,
    ...over,
  });
  const accepted = () =>
    draft({
      state: "done",
      transcript: [
        entry(1, "person", "A diagram for TCP vs UDP.", { at: "2026-09-29T06:16:53Z" }),
        entry(2, "planner", "A comparison.", { at: "2026-09-29T06:17:30Z" }),
        entry(3, "studio", 'The diagram "TCP vs UDP" was accepted.', { at: ACCEPTED }),
        entry(4, "person", "Thanks.", { at: "2026-09-30T03:00:00Z" }),
      ],
    });

  function stubMade(items: unknown[]) {
    const reads: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        reads.push(input);
        return new Response(JSON.stringify({ ok: true, reachable: true, made: items }), { status: 200 });
      }),
    );
    mounted.push(() => vi.unstubAllGlobals());
    return reads;
  }

  it("reads the catalog route and puts the card under the line that says the job landed", async () => {
    const reads = stubMade([made()]);
    const host = await mount(accepted());
    expect(reads).toContain("/studio/made/d1");
    const card = host.querySelector<HTMLElement>('[data-made="diagram:learn/assets/tcp-vs-udp.svg"]');
    expect(card).not.toBeNull();
    // After the accepted line, before the person's next turn.
    const log = host.querySelector('[role="log"]')!;
    const text = log.textContent ?? "";
    expect(text.indexOf("was accepted")).toBeLessThan(text.indexOf("TCP vs UDP", text.indexOf("was accepted")));
    expect(text.indexOf("TCP vs UDP", text.indexOf("was accepted"))).toBeLessThan(text.indexOf("Thanks."));
    const open = [...card!.querySelectorAll("a")].find((a) => a.textContent === "Open");
    expect(open?.getAttribute("href")).toBe("/library?open=diagram%3Alearn%2Fassets%2Ftcp-vs-udp.svg");
    expect(card!.querySelector("img")?.getAttribute("src")).toBe("/api/assets/diagram%3Alearn%2Fassets%2Ftcp-vs-udp.svg/file");
    expect([...card!.querySelectorAll("a")].some((a) => a.getAttribute("href")?.includes("extend=tcp-vs-udp"))).toBe(true);
    // A card the panel opened with is not new, so it does not rise in.
    expect(card!.parentElement?.className ?? "").not.toContain("animate-enter");
  });

  it("lists everything made at the end of the thread, and opens each in the previewer", async () => {
    stubMade([
      made({ id: "video:dengue", kind: "video", title: "How dengue moves", name: "dengue", jobId: "j2", madeAt: "2026-10-03T18:28:43Z", thumbnail: false }),
      made(),
    ]);
    const host = await mount(accepted());
    const toggle = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Everything made in this conversation"));
    expect(toggle?.textContent).toBe("Everything made in this conversation (2)");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle!.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    const list = host.querySelector(`#${CSS.escape(toggle!.getAttribute("aria-controls")!)}`)!;
    const links = [...list.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/library?open=video%3Adengue", "/library?open=diagram%3Alearn%2Fassets%2Ftcp-vs-udp.svg"]);
  });

  it("keeps its cards when a later read finds the catalog unreachable", async () => {
    const answers = [
      { ok: true, reachable: true, made: [made()] },
      { ok: true, reachable: false, made: [] },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(answers.shift() ?? { ok: true, reachable: false, made: [] }), { status: 200 })),
    );
    mounted.push(() => vi.unstubAllGlobals());
    const view = accepted();
    const host = await mount(view);
    expect(host.querySelector("[data-made]")).not.toBeNull();
    // The thread moves (a new entry), which reads again: the catalog is down now.
    mocks.getDraft.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...view, transcript: [...view.transcript, entry(5, "planner", "Anything else?", { at: "2026-09-30T03:00:05Z" })] },
    });
    await act(async () => mocks.events?.onEvent({ type: "turn", data: {} }));
    // The panel gathers a burst of events into one read, 60ms later.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 120)));
    await settle();
    expect(host.textContent).toContain("Anything else?");
    // The unreachable answer was read, and changed nothing on screen.
    expect(answers).toEqual([]);
    expect(host.querySelector("[data-made]")).not.toBeNull();
    expect(host.textContent).toContain("Everything made in this conversation (1)");
  });

  it("draws the kind's glyph when the picture will not load", async () => {
    stubMade([made()]);
    const host = await mount(accepted());
    const img = host.querySelector<HTMLImageElement>("[data-made] img")!;
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(host.querySelector("[data-made] img")).toBeNull();
    expect(host.querySelector("[data-made] svg")).not.toBeNull();
  });

  it("shows neither a card nor the list when nothing was made", async () => {
    stubMade([]);
    const host = await mount(accepted());
    expect(host.querySelector("[data-made]")).toBeNull();
    expect(host.textContent).not.toContain("Everything made");
  });
});

describe("the consent card (D106–D110)", () => {
  const offered = (extra: Partial<DraftView> = {}, replyExtra: Partial<TranscriptEntry> = {}) =>
    draft({
      turns: 1,
      transcript: [
        entry(1, "person", "how does TCP back off?"),
        entry(2, "planner", "A video would show it moving.", { suggest: ["video"], pitch: "the window shrinking on loss", ...replyExtra }),
      ],
      ...extra,
    });
  const button = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));

  it("shows the pitch, the recorded cost band and the three answers", async () => {
    const host = await mount(offered({ estimates: { video: { low: 0.74, high: 1.35, n: 8 } } }));
    const card = host.querySelector('[data-consent="video"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("The planner wants to make a video");
    expect(card!.textContent).toContain("the window shrinking on loss");
    expect(card!.textContent).toContain("$0.74–$1.35");
    expect(card!.textContent).toContain("8 makes");
    expect(button(host, "Allow once")).toBeDefined();
    expect(button(host, "Always allow here")).toBeDefined();
    expect(button(host, "Deny")).toBeDefined();
  });

  it("Allow once sends the kind's chip marked make, and keeps a half-typed message", async () => {
    const host = await mount(offered());
    await act(async () => mocks.composer!.onChange({ text: "half typed", mentions: [] }));
    await act(async () => button(host, "Allow once")!.click());
    await settle();
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", {
      text: "@video",
      mentions: [{ kind: "video", start: 0, end: 6 }],
      make: true,
    });
    expect(mocks.composer!.value.text).toBe("half typed");
    expect(mocks.setDraftTrust).not.toHaveBeenCalled();
  });

  it("Always allow trusts the kind on this conversation, then sends the same chip", async () => {
    const host = await mount(offered());
    await act(async () => button(host, "Always allow here")!.click());
    await settle();
    expect(mocks.setDraftTrust).toHaveBeenCalledWith("d1", "video", true);
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", expect.objectContaining({ text: "@video", make: true }));
  });

  it("holds Allow while a brief card is being edited, as Send is held (R2-1-07)", async () => {
    const host = await mount(
      draft({
        state: "briefed",
        turns: 1,
        transcript: [
          entry(1, "person", "@diagram attention", { mentions: [{ kind: "diagram", start: 0, end: 8 }] }),
          entry(2, "planner", "Here, and a video would show it moving.", {
            briefs: [{ kind: "diagram", brief: DIAGRAM, requestSeq: 1 }],
            suggest: ["video"],
            pitch: "the weights shifting",
          }),
        ],
        slots: { diagram: slot({ brief: DIAGRAM, briefSeq: 2, requestSeq: 1, state: "briefed" }), video: slot() },
      }),
    );
    expect(button(host, "Allow once")!.disabled).toBe(false);
    await act(async () => host.querySelector<HTMLElement>("[data-card-edit]")!.click());
    await settle();
    expect(button(host, "Allow once")!.disabled).toBe(true);
    expect(button(host, "Always allow here")!.disabled).toBe(true);
    expect(button(host, "Deny")!.disabled).toBe(false);
    expect(host.querySelector('[data-consent="video"]')!.textContent).toContain("Save or cancel your edits to the brief first.");
  });

  it("Deny tells the runner which reply's offer was refused, and sends nothing", async () => {
    const host = await mount(offered());
    await act(async () => button(host, "Deny")!.click());
    await settle();
    expect(mocks.declineSuggestion).toHaveBeenCalledWith("d1", 2, ["video"]);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("a declined offer collapses to a quiet line", async () => {
    const host = await mount(offered({}, { declined: ["video"] }));
    expect(host.querySelector('[data-consent="declined"]')).not.toBeNull();
    expect(host.querySelector('[data-consent="video"]')).toBeNull();
    expect(host.textContent).toContain("will not offer it again");
    expect(button(host, "Allow once")).toBeUndefined();
  });

  it("an svg offer is the same card minus the spend: no band, no Always allow (D110)", async () => {
    const host = await mount(offered({}, { suggest: ["svg"], pitch: "a small sketch" }));
    const card = host.querySelector('[data-consent="svg"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("The planner wants to draw an SVG");
    expect(card!.textContent).toContain("a small sketch");
    expect(card!.textContent).not.toContain("cost");
    expect(button(host, "Always allow")).toBeUndefined();
    await act(async () => button(host, "Allow once")!.click());
    await settle();
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", { text: "@svg", mentions: [{ kind: "svg", start: 0, end: 4 }], make: true });
    expect(mocks.setDraftTrust).not.toHaveBeenCalled();
  });

  it("a trusted kind sits under the composer until its press revokes it", async () => {
    const host = await mount(
      draft({ trust: ["video"], turns: 1, transcript: [entry(1, "person", "hi"), entry(2, "planner", "There.")] }),
    );
    const chip = button(host, "Video allowed");
    expect(chip).toBeDefined();
    await act(async () => chip!.click());
    await settle();
    expect(mocks.setDraftTrust).toHaveBeenCalledWith("d1", "video", false);
  });

  it("a brief card's press carries the kind's recorded cost band", async () => {
    const host = await mount(
      draft({
        state: "briefed",
        turns: 1,
        transcript: [
          entry(1, "person", "@diagram the window", { mentions: [{ kind: "diagram", start: 0, end: 8 }] }),
          entry(2, "planner", "Here.", { briefs: [{ kind: "diagram", brief: DIAGRAM, requestSeq: 1 }] }),
        ],
        slots: { diagram: slot({ brief: DIAGRAM, briefSeq: 2, requestSeq: 1, state: "briefed" }), video: slot() },
        estimates: { diagram: { low: 0.02, high: 0.15, n: 5 }, video: null },
      }),
    );
    expect(host.textContent).toContain("Past diagrams here ran $0.02–$0.15.");
  });

  it("a refused Allow once re-arms the card rather than sticking on an answer that never landed", async () => {
    mocks.sendMessage.mockResolvedValue({ ok: false, status: 409, refusal: { error: "a turn is in flight", detail: { reason: "in-flight" } } });
    const host = await mount(offered());
    await act(async () => button(host, "Allow once")!.click());
    await settle();
    const allow = button(host, "Allow once")!;
    expect(allow.hasAttribute("disabled")).toBe(false);
    expect(allow.textContent).toContain("Allow once");
    expect(host.textContent).toContain("still answering");
  });

  it("Always allow sends first and trusts after — a refused send never grants it", async () => {
    let release: (value: unknown) => void = () => {};
    mocks.sendMessage.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const host = await mount(offered());
    await act(async () => button(host, "Always allow here")!.click());
    // The send is still out: the trust write has not run yet.
    expect(mocks.setDraftTrust).not.toHaveBeenCalled();
    await act(async () => release({ ok: false, status: 409, refusal: { error: "a turn is in flight", detail: { reason: "in-flight" } } }));
    await settle();
    expect(mocks.setDraftTrust).not.toHaveBeenCalled();
    expect(button(host, "Allow once")!.hasAttribute("disabled")).toBe(false);
  });

  it("a failed Deny re-arms the card", async () => {
    mocks.declineSuggestion.mockResolvedValue({ ok: false, status: 502, refusal: { error: "the studio runner is not running" } });
    const host = await mount(offered());
    await act(async () => button(host, "Deny")!.click());
    await settle();
    const deny = button(host, "Deny")!;
    expect(deny.hasAttribute("disabled")).toBe(false);
    expect(deny.textContent).toContain("Deny");
    expect(mocks.declineSuggestion).toHaveBeenCalledWith("d1", 2, ["video"]);
  });

  it("a trust write that fails after the send gets its own retry — no second make request", async () => {
    mocks.setDraftTrust
      .mockResolvedValueOnce({ ok: false, status: 502, refusal: { error: "the studio runner is not running" } })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { draftId: "d1", trust: ["video"], note: "" } });
    const host = await mount(offered());
    await act(async () => button(host, "Always allow here")!.click());
    await settle();
    // The send landed and the card is gone; the owed write shows its retry on the error line.
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    const retry = button(host, "Save always-allow")!;
    expect(retry).toBeDefined();
    await act(async () => retry.click());
    await settle();
    expect(mocks.setDraftTrust).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(button(host, "Save always-allow")).toBeUndefined();
  });
});

describe("health on opening (S1-11)", () => {
  it("is read once, not again when the record lands after it", async () => {
    const view = draft({ harness: "claude" } as Partial<DraftView>);
    // The record lands after the opening read has gone out, as it does
    // against a real runner.
    mocks.getDraft.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, data: view }), 10)),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(DraftPanel, {
          draftId: "d1",
          jobId: null,
          path: "/studio?draft=d1",
          topics: [],
          titles: {},
          suggestions: [],
          cap: null,
          video: { ok: true, reason: null },
          videoTitles: {},
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await settle();
    mounted.push(() => {
      act(() => root.unmount());
      host.remove();
    });
    expect(host.textContent).not.toBe("");
    expect(mocks.readStudioHealth).toHaveBeenCalledTimes(1);
  });
});

describe("Cmd+Enter from outside the composer (S1-15)", () => {
  it("does not send the composer's words while Send is held", async () => {
    const host = await mount({ ...pair(), inFlight: true });
    await act(async () => mocks.composer!.onChange({ text: "and make it blue", mentions: [] }));
    expect(mocks.composer!.sendDisabled).toBe(true);
    const outside = host.querySelector("[data-header] h2")!;
    await act(async () => {
      outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    });
    await settle();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sends them when Send is free", async () => {
    const host = await mount(pair());
    await act(async () => mocks.composer!.onChange({ text: "and make it blue", mentions: [] }));
    const outside = host.querySelector("[data-header] h2")!;
    await act(async () => {
      outside.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    });
    await settle();
    expect(mocks.sendMessage).toHaveBeenCalledWith("d1", { text: "and make it blue", mentions: [] });
  });
});

describe("a brief that names two elements alike (S1-20)", () => {
  it("draws both chips without a duplicate-key warning", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const twin: Brief = { ...DIAGRAM, elements: [{ label: "Node" }, { label: "Node", note: "the replica" }] };
    const host = await mount(
      draft({
        state: "briefed",
        turns: 1,
        transcript: [
          entry(1, "person", "@diagram replicas", { mentions: [{ kind: "diagram", start: 0, end: 8 }] }),
          entry(2, "planner", "Here.", { briefs: [{ kind: "diagram", brief: twin, requestSeq: 1 }] }),
        ],
        slots: { diagram: slot({ brief: twin, briefSeq: 2, requestSeq: 1, state: "briefed" }), video: slot() },
      }),
    );
    const said = errors.mock.calls.map((call) => String(call[0]));
    errors.mockRestore();
    expect(host.textContent?.match(/Node/g)?.length).toBeGreaterThanOrEqual(2);
    expect(said.filter((line) => line.includes("same key"))).toEqual([]);
  });
});

