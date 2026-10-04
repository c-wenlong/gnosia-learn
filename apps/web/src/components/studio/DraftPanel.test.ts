// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftView, TranscriptEntry, VideoBrief } from "@/lib/studio-drafts";
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
  push: vi.fn(),
  focus: vi.fn(),
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
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function StubComposer(props: NonNullable<typeof mocks.composer>) {
      mocks.composer = props;
      // A late handle stands in for the real composer's lazy chunk: rendered,
      // but with nothing to focus until the test hands it over.
      if (!mocks.lateHandle && props.handleRef && typeof props.handleRef === "object") {
        props.handleRef.current = { focus: mocks.focus, insertMention: () => {} };
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
  openDraftEvents: (_id: string, _after: unknown, handlers: NonNullable<typeof mocks.events>) => {
    mocks.events = handlers;
    return () => {};
  },
  readStudioHealth: async () => null,
}));

const { DraftPanel } = await import("./DraftPanel");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.composer = null;
  mocks.events = null;
  mocks.focus.mockClear();
  mocks.lateHandle = false;
  sessionStorage.clear();
  mocks.sendMessage.mockResolvedValue({ ok: true, status: 202, data: { draftId: "d1", seq: 1, note: "" } });
  mocks.abandonDraft.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", state: "abandoned", note: "" } });
  mocks.createDraft.mockResolvedValue({ ok: true, status: 201, data: { draftId: "d2", state: "open", note: "" } });
  mocks.drawDraft.mockResolvedValue({ ok: true, status: 200, data: { draftId: "d1", jobId: "j1", state: "drawing", note: "" } });
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
    plannerKinds: ["diagram", "video"],
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
