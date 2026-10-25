// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { threadKey } from "@/lib/tutor-thread";

/**
 * The concept tutor's wiring to the studio (docs/STUDIO-TUTOR-HANDOFF.md,
 * D64 to D70), in a DOM: when it asks the studio anything, when it fetches
 * the @ composer's chunk, when it swaps it in, and where a tagged message
 * goes. The chunk is a stand-in that shows the value it is handed and exposes
 * its callbacks, since Lexical's editing is not what is under test here; the
 * hand-off's rules are `tutor-handoff.test.ts`.
 *
 * Every test starts from a fresh module registry (`vi.resetModules`) with the
 * chunk's stand-in registered again (`vi.doMock`: a `vi.mock` factory's module
 * is kept across resets), so it is evaluated the first time that test's
 * `TutorChat` imports it, and `mocks.imported` counts that test's imports
 * alone, in any order. React and the component are imported after the reset,
 * so the stand-ins' hooks run on the same React as the component.
 */

type Value = { text: string; mentions: Array<{ kind: string; start: number; end: number }> };

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  focus: vi.fn(),
  openInStudio: vi.fn(),
  /** How many times the chunk was imported. */
  imported: 0,
  /** Every `scrollTo` on an element, which jsdom does not have. */
  scrolls: [] as ScrollToOptions[],
  field: null as null | {
    value: Value;
    disabled: boolean;
    sendDisabled: boolean;
    disabledReason?: string;
    health: unknown;
    autoFocus: boolean;
    onChange: (value: Value) => void;
    onSubmit: (value: Value) => void;
  },
}));

vi.mock("next/navigation", () => {
  const router = { push: mocks.push, replace: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
  };
});
vi.mock("@/components/NoteProse", async () => {
  const { createElement } = await import("react");
  return { NoteProse: ({ source }: { source: string }) => createElement("div", null, source) };
});
vi.mock("@/components/Math", async () => {
  const { createElement } = await import("react");
  return { MathText: ({ text }: { text: string }) => createElement("span", null, text) };
});
async function kitStandIn() {
  mocks.imported += 1;
  const { createElement, useEffect, useImperativeHandle } = await import("react");
  function TutorMentionField(props: NonNullable<typeof mocks.field> & { handleRef: { current: unknown } }) {
    mocks.field = props;
    useImperativeHandle(props.handleRef as never, () => ({ focus: mocks.focus, insertMention: vi.fn() }), []);
    const { autoFocus } = props;
    useEffect(() => {
      if (autoFocus) mocks.focus();
      // Mount only, as the real one.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return createElement("div", { "data-rich": JSON.stringify(props.value) });
  }
  return {
    TutorMentionField,
    openInStudio: mocks.openInStudio,
    OPENING_THE_STUDIO: "Opening the studio",
    trimValue: (value: Value) => ({ ...value, text: value.text.trim() }),
    isEmptyValue: (value: Value) => value.text.trim() === "" && value.mentions.length === 0,
  };
}

let act: typeof import("react").act;
let createElement: typeof import("react").createElement;
let createRoot: typeof import("react-dom/client").createRoot;
let TutorChat: typeof import("./TutorChat").TutorChat;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout; the composer measures itself.
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 52 });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(options: ScrollToOptions) {
      mocks.scrolls.push(options);
    },
  });
});

const GOOD = { ok: true, diagramAgent: { ok: true, problem: null }, video: { ok: true, checks: [] }, dailyCap: { totalUsd: 0 } };
let health: unknown = GOOD;
const fetched: Array<{ url: string; body: unknown }> = [];

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("./TutorStudioKit", kitStandIn);
  mocks.imported = 0;
  ({ act, createElement } = await import("react"));
  ({ createRoot } = await import("react-dom/client"));
  ({ TutorChat } = await import("./TutorChat"));
  mocks.push.mockClear();
  mocks.focus.mockClear();
  mocks.openInStudio.mockReset();
  mocks.field = null;
  mocks.scrolls.length = 0;
  health = GOOD;
  fetched.length = 0;
  sessionStorage.clear();
  window.history.replaceState(null, "", "/learn/tcp-handshake");
  // jsdom's window is never focused by a person; the page is taken to be.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.stubGlobal("requestIdleCallback", (task: () => void) => setTimeout(task, 0));
  vi.stubGlobal("cancelIdleCallback", (handle: number) => clearTimeout(handle));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetched.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
      if (url === "/studio/api/health") {
        return health === null ? new Response("{}", { status: 502 }) : new Response(JSON.stringify(health), { status: 200 });
      }
      return new Response(JSON.stringify({ message: { content: "An answer [1]." }, sources: [] }), { status: 200 });
    }),
  );
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
  vi.unstubAllGlobals();
  // `Date.now` moved forward by a focus test, and `document.hasFocus`.
  vi.restoreAllMocks();
});

async function settle() {
  for (let at = 0; at < 6; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * Move the clock on for the 30-second focus rule. The clock keeps running:
 * a frozen `Date.now` stalls the module loader a fresh chunk import goes through.
 */
function laterBy(ms: number) {
  const real = Date.now.bind(Date);
  vi.spyOn(Date, "now").mockImplementation(() => real() + ms);
}

/** Settle until `ready`, for a chunk whose stand-in is evaluated afresh (a second or so, at most). */
async function until(ready: () => boolean) {
  for (let at = 0; at < 100 && !ready(); at += 1) await settle();
  expect(ready()).toBe(true);
}

let slugs = 0;

async function mount(props: { studio?: boolean; initialDraft?: string; slug?: string } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(TutorChat, {
        slug: `tcp-${(slugs += 1)}`,
        title: "The TCP handshake",
        sources: [],
        suggestions: ["What is a SYN?"],
        ...props,
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

const textarea = (host: HTMLElement) => host.querySelector("textarea");
const studioCalls = () => fetched.filter((call) => call.url.startsWith("/studio/api"));
const chatCalls = () => fetched.filter((call) => call.url === "/api/agent/chat");

async function typePlain(host: HTMLElement, text: string) {
  const box = textarea(host)!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("with the studio off (H1)", () => {
  it("asks the studio nothing and never fetches the composer's chunk", async () => {
    const host = await mount({ studio: false });
    // Focus after the 30 seconds would read health again, were the studio on.
    laterBy(31_000);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await settle();
    expect(studioCalls()).toEqual([]);
    expect(mocks.field).toBeNull();
    expect(textarea(host)).not.toBeNull();
    expect(mocks.imported).toBe(0);
  });
});

describe("the count of chunk imports", () => {
  it("sees an import, so the zeros around it mean something", async () => {
    await mount({ studio: true });
    expect(mocks.imported).toBe(1);
  });
});

describe("with the studio on", () => {
  it("keeps the plain field when the runner does not answer (H2)", async () => {
    health = null;
    const host = await mount({ studio: true });
    expect(studioCalls().map((call) => call.url)).toEqual(["/studio/api/health"]);
    expect(mocks.field).toBeNull();
    expect(textarea(host)).not.toBeNull();
    expect(mocks.imported).toBe(0);
  });

  it("keeps the plain field when the planner cannot run, and mounts it when only the machines are down: an SVG needs no machine (D105)", async () => {
    health = { ...GOOD, ok: false };
    await mount({ studio: true });
    expect(mocks.field).toBeNull();
    expect(mocks.imported).toBe(0);
    // Both machine kinds down, planner up: the @ composer still mounts.
    health = { ...GOOD, diagramAgent: { ok: false, problem: "x" }, video: { ok: false } };
    const host = await mount({ studio: true });
    await settle();
    expect(mocks.field).not.toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("swaps the @ composer in after a good read while the field is empty and unfocused, without taking focus", async () => {
    const host = await mount({ studio: true });
    expect(textarea(host)).toBeNull();
    expect(mocks.field).not.toBeNull();
    expect(mocks.field!.health).toEqual(GOOD);
    expect(mocks.focus).not.toHaveBeenCalled();
  });

  it("never swaps a field holding words: the ?ask= prefill waits until it is sent (H16)", async () => {
    window.history.replaceState(null, "", "/learn/tcp-handshake?ask=Why%20three%20packets%3F&x=1");
    const host = await mount({ studio: true, initialDraft: "Why three packets?" });
    expect(mocks.field).toBeNull();
    expect(textarea(host)!.value).toBe("Why three packets?");
    // Sent: the field is empty, and the @ composer takes its place and its focus.
    await act(async () => textarea(host)!.form!.requestSubmit());
    await settle();
    expect(chatCalls()).toHaveLength(1);
    expect(mocks.field).not.toBeNull();
    expect(mocks.field!.value).toEqual({ text: "", mentions: [] });
    // The question is off the URL, so Back to this page does not fill it in again.
    expect(window.location.search).toBe("?x=1");
  });

  it("leaves the field empty on a page whose URL has lost its ?ask=, as Back from the studio shows it", async () => {
    const host = await mount({ studio: false, initialDraft: "Why three packets?" });
    expect(textarea(host)!.value).toBe("");
  });

  it("never swaps a focused, empty field when the chunk lands, and swaps it on blur", async () => {
    health = null;
    const host = await mount({ studio: true });
    await act(async () => textarea(host)!.focus());
    health = GOOD;
    laterBy(31_000);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await settle();
    await until(() => mocks.imported === 1);
    await settle();
    expect(mocks.field).toBeNull();
    expect(document.activeElement).toBe(textarea(host));
    await act(async () => textarea(host)!.blur());
    await settle();
    expect(mocks.field).not.toBeNull();
    // Swapped on a blur, the new field does not pull focus back.
    expect(mocks.focus).not.toHaveBeenCalled();
  });

  it("keeps the field, caret and all, when the window loses focus rather than the field", async () => {
    health = null;
    const host = await mount({ studio: true });
    await act(async () => textarea(host)!.focus());
    health = GOOD;
    laterBy(31_000);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await settle();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => textarea(host)!.blur());
    await settle();
    expect(mocks.field).toBeNull();
    expect(textarea(host)).not.toBeNull();
  });

  it("never swaps a focused field, and swaps it on blur once it is empty", async () => {
    health = null;
    const host = await mount({ studio: true });
    await act(async () => textarea(host)!.focus());
    await typePlain(host, "half a thought");
    health = GOOD;
    // Focus again after the 30 seconds: a good read, the chunk lands, the field is busy.
    laterBy(31_000);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await settle();
    expect(mocks.field).toBeNull();
    await typePlain(host, "");
    await act(async () => textarea(host)!.blur());
    await settle();
    expect(mocks.field).not.toBeNull();
  });
});

describe("a message from the @ composer", () => {
  it("goes to the tutor when it has no chip", async () => {
    await mount({ studio: true });
    await act(async () => mocks.field!.onSubmit({ text: "What is a SYN?", mentions: [] }));
    await settle();
    expect(chatCalls()).toHaveLength(1);
    expect(mocks.openInStudio).not.toHaveBeenCalled();
  });

  it("goes to a new studio conversation when it has one, and leaves a marker the tutor is never sent (D64, D70)", async () => {
    sessionStorage.setItem(
      threadKey("tcp-handshake"),
      JSON.stringify([
        { role: "user", content: "What is a SYN?" },
        { role: "assistant", content: "The opener [1]." },
      ]),
    );
    const sent: Value = { text: "@diagram of that", mentions: [{ kind: "diagram", start: 0, end: 8 }] };
    let answer: (value: unknown) => void = () => {};
    mocks.openInStudio.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const host = await mount({ studio: true, slug: "tcp-handshake" });
    await act(async () => mocks.field!.onSubmit(sent));
    // Locked while the conversation is made.
    expect(mocks.field!.disabled).toBe(true);
    expect(mocks.field!.disabledReason).toBe("Opening the studio");
    const [call] = mocks.openInStudio.mock.calls[0] as [{ slug: string; items: unknown[]; value: Value }];
    expect(call.slug).toBe("tcp-handshake");
    expect(call.value).toEqual(sent);
    expect(call.items).toHaveLength(2);
    await act(async () =>
      answer({
        ok: true,
        href: "/studio?draft=d-7",
        marker: { role: "studio", content: sent.text, mentions: sent.mentions, draftId: "d-7" },
      }),
    );
    await settle();
    expect(mocks.push).toHaveBeenCalledWith("/studio?draft=d-7");
    expect(chatCalls()).toHaveLength(0);
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent === "Opened in the studio");
    expect(link?.getAttribute("href")).toBe("/studio?draft=d-7");
    expect(host.textContent).toContain("Diagram tag of that");

    // The field stays locked until the page has gone. Back (H7): the page
    // again, the thread with its marker, the field empty.
    expect(mocks.field!.disabled).toBe(true);
    mounted.pop()?.();
    mocks.field = null;
    const back = await mount({ studio: true, slug: "tcp-handshake" });
    expect(back.textContent).toContain("Opened in the studio");
    expect(mocks.field!.value).toEqual({ text: "", mentions: [] });
    // The next question to the tutor carries the thread without the marker.
    await act(async () => mocks.field!.onSubmit({ text: "And the ACK?", mentions: [] }));
    await settle();
    const messages = (chatCalls()[0]!.body as { messages: Array<{ role: string }> }).messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("keeps the message and its chips, unlocks, and says why when the hand-off is refused", async () => {
    mocks.openInStudio.mockResolvedValue({ ok: false, text: "The studio runner is not answering." });
    const sent: Value = { text: "@video", mentions: [{ kind: "video", start: 0, end: 6 }] };
    const host = await mount({ studio: true });
    await act(async () => mocks.field!.onChange(sent));
    await act(async () => mocks.field!.onSubmit(sent));
    await settle();
    expect(mocks.field!.disabled).toBe(false);
    expect(mocks.field!.value).toEqual(sent);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("The studio runner is not answering.");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(chatCalls()).toHaveLength(0);
  });
});

describe("while the message is going to the studio", () => {
  it("a suggested question leaves the locked message alone", async () => {
    mocks.openInStudio.mockImplementation(() => new Promise(() => {}));
    const sent: Value = { text: "@video of it", mentions: [{ kind: "video", start: 0, end: 6 }] };
    const host = await mount({ studio: true });
    await act(async () => mocks.field!.onChange(sent));
    await act(async () => mocks.field!.onSubmit(sent));
    const chip = [...host.querySelectorAll("button")].find((b) => b.textContent === "What is a SYN?")!;
    await act(async () => chip.click());
    expect(mocks.field!.value).toEqual(sent);
    expect(mocks.field!.disabled).toBe(true);
  });
});

describe("a hand-off after a question the tutor never answered", () => {
  it("keeps its Try again, which asks it once, past the marker", async () => {
    sessionStorage.setItem(
      threadKey("tcp-retry"),
      JSON.stringify([
        { role: "user", content: "What is a SYN?" },
        { role: "assistant", content: "The opener." },
        { role: "user", content: "And the ACK?" },
        { role: "studio", content: "@video", mentions: [{ kind: "video", start: 0, end: 6 }], draftId: "d-1" },
      ]),
    );
    const host = await mount({ studio: true, slug: "tcp-retry" });
    const retry = [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again");
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    await settle();
    const messages = (chatCalls()[0]!.body as { messages: Array<{ role: string; content: string }> }).messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages.at(-1)!.content).toBe("And the ACK?");
  });
});

describe("health on focus", () => {
  it("is read again after 30 seconds, and a bad answer disables the menu rather than swapping back (H3)", async () => {
    await mount({ studio: true });
    expect(studioCalls()).toHaveLength(1);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(studioCalls()).toHaveLength(1);
    health = null;
    laterBy(31_000);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await settle();
    expect(studioCalls()).toHaveLength(2);
    expect(mocks.field).not.toBeNull();
    expect(mocks.field!.health).toBeNull();
  });
});

describe("motion", () => {
  const STORED = [
    { role: "user", content: "What is a SYN?" },
    { role: "assistant", content: "The opener." },
  ];
  const turnsIn = (host: HTMLElement) =>
    [...host.querySelectorAll('[aria-live="polite"] > *')].filter((el) => el.matches("article, div.flex.justify-end"));

  function reducedMotion(on: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: on && query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  it("fades in a restored thread, and lets only a turn added now rise in", async () => {
    sessionStorage.setItem(threadKey("tcp-motion"), JSON.stringify(STORED));
    const host = await mount({ slug: "tcp-motion" });
    const restored = turnsIn(host);
    expect(restored).toHaveLength(2);
    for (const turn of restored) {
      expect(turn.classList.contains("animate-fade-in")).toBe(true);
      expect(turn.classList.contains("animate-enter")).toBe(false);
    }

    await typePlain(host, "And the ACK?");
    await act(async () => textarea(host)!.form!.requestSubmit());
    await settle();
    const after = turnsIn(host);
    expect(after).toHaveLength(4);
    // The two said before keep their class, so nothing replays; the question and its answer rise in.
    expect(after.slice(0, 2).every((t) => t.classList.contains("animate-fade-in"))).toBe(true);
    expect(after.slice(2).every((t) => t.classList.contains("animate-enter"))).toBe(true);
  });

  it("shows the greeting only once hydration has said there is no thread", async () => {
    const host = await mount();
    const greeting = host.querySelector('[aria-live="polite"] > article') as HTMLElement;
    expect(greeting.textContent).toContain("Ask me anything");
    expect(greeting.classList.contains("animate-fade-in")).toBe(true);
    expect(greeting.classList.contains("opacity-0")).toBe(false);
  });

  it("jumps to the newest turn on its first paint, and glides after a send", async () => {
    reducedMotion(false);
    sessionStorage.setItem(threadKey("tcp-glide"), JSON.stringify(STORED));
    const host = await mount({ slug: "tcp-glide" });
    expect(mocks.scrolls).toEqual([]);

    await typePlain(host, "And the ACK?");
    await act(async () => textarea(host)!.form!.requestSubmit());
    await settle();
    expect(mocks.scrolls.length).toBeGreaterThan(0);
    expect(mocks.scrolls.every((s) => s.behavior === "smooth")).toBe(true);
  });

  it("jumps under reduced motion", async () => {
    reducedMotion(true);
    sessionStorage.setItem(threadKey("tcp-still"), JSON.stringify(STORED));
    const host = await mount({ slug: "tcp-still" });
    await typePlain(host, "And the ACK?");
    await act(async () => textarea(host)!.form!.requestSubmit());
    await settle();
    expect(mocks.scrolls).toEqual([]);
  });
});

describe("a recorded answer (D89)", () => {
  const verdict = (over: Record<string, unknown> = {}) => ({
    question: "What does the second packet carry?",
    requestId: "req-1",
    source: "teach",
    judged: "ready",
    suggested: true,
    feedback: null,
    state: "recorded",
    tapped: true,
    error: null,
    recorded: { correct: true, pLBefore: 0.25, pLAfter: 0.41, intervalDays: 1 },
    ...over,
  });
  const seed = (slug: string, answer: Record<string, unknown>) =>
    sessionStorage.setItem(
      threadKey(slug),
      JSON.stringify([
        { role: "assistant", content: "CHECK: What does the second packet carry?" },
        { role: "user", content: "SYN and ACK", verdict: answer },
        { role: "assistant", content: "Right." },
      ]),
    );

  it("is a card naming the concept, the verdict and the move, with a link to the note", async () => {
    seed("tcp-recorded", verdict());
    const host = await mount({ slug: "tcp-recorded" });
    const card = host.querySelector<HTMLElement>("[data-recorded]");
    expect(card?.dataset.recorded).toBe("correct");
    expect(card?.getAttribute("aria-label")).toBe("Recorded as correct: The TCP handshake");
    expect(card?.textContent).toContain("The TCP handshake");
    expect(card?.textContent).toContain("Mastery moved: p(L) 0.25 → 0.41");
    expect(card?.textContent).toContain("review in 1 day");
    const link = [...card!.querySelectorAll("a")].find((a) => a.textContent === "Open the note");
    expect(link?.getAttribute("href")).toBe("#note");
  });

  it("says incorrect in the warn colour, and leaves an answer not yet recorded as its row", async () => {
    seed("tcp-wrong", verdict({ recorded: { correct: false, pLBefore: 0.4, pLAfter: 0.3, intervalDays: null }, tapped: false }));
    const host = await mount({ slug: "tcp-wrong" });
    const card = host.querySelector<HTMLElement>("[data-recorded]");
    expect(card?.dataset.recorded).toBe("incorrect");
    expect(card?.textContent).toContain("Recorded as incorrect");
    expect(card?.textContent).not.toContain("review in");

    seed("tcp-open", verdict({ state: "open", recorded: null, tapped: null }));
    const open = await mount({ slug: "tcp-open" });
    expect(open.querySelector("[data-recorded]")).toBeNull();
    expect(open.querySelector('[aria-label="Record this answer"]')).not.toBeNull();
  });
});
