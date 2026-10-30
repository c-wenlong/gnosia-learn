// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, type LearnerState } from "@gnosia/schema/shared";

/**
 * How a learner write travels: in time-bounded requests, with `keepalive`
 * while small, a reset in batches the route takes, a visit announced once it
 * is stored, and a write queued behind another saved to the page's own
 * outbox when the page is left, never started out of turn.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: router.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/theme-cookie", () => ({
  applyThemeToDocument: vi.fn(),
  followTheme: () => () => undefined,
  writeThemeCookie: vi.fn(),
}));

const { LearnerProvider, useLearner, OUTBOX_KEY, POST_TIMEOUT_MS, RESET_BATCH } = await import("./learner-context");
const { VISIT_STORED_EVENT } = await import("./recent-client");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
beforeEach(() => {
  router.refresh.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type Learner = ReturnType<typeof useLearner>;
const held: { learner: Learner | null } = { learner: null };
function Probe() {
  const learner = useLearner();
  useEffect(() => {
    held.learner = learner;
  });
  const { notes, completed } = learner.state;
  return createElement("p", null, `note=${notes.t1 ?? "none"} tick=${completed.t1 === true}`);
}

type Call = [string, RequestInit];

function mount(fetcher: (url: string, init: RequestInit) => Promise<Response>, initial: Partial<LearnerState> = {}) {
  const spy = vi.fn(fetcher);
  vi.stubGlobal("fetch", spy);
  const container = document.createElement("div");
  root = createRoot(container);
  const draw = (snapshot: Partial<LearnerState>) =>
    act(() =>
      root!.render(
        createElement(
          LearnerProvider,
          { initialState: { ...emptyLearnerState(), ...snapshot }, reachable: true } as ComponentProps<typeof LearnerProvider>,
          createElement(Probe),
        ),
      ),
    );
  draw(initial);
  const calls = () => spy.mock.calls as unknown as Call[];
  return { container, draw, calls };
}

const ok = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));

/** Every outbox in `localStorage`, each page's own box and the old shared one, as `[key, writes]`. */
function outboxes(): [string, unknown[]][] {
  const out: [string, unknown[]][] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)!;
    if (key !== OUTBOX_KEY && !key.startsWith(`${OUTBOX_KEY}:`)) continue;
    out.push([key, (JSON.parse(window.localStorage.getItem(key)!) as { writes: unknown[] }).writes]);
  }
  return out;
}

describe("a write that never answers", () => {
  it("gives up after its deadline, so its key and the snapshots behind it are not held for good", async () => {
    vi.useFakeTimers();
    const { container, draw } = mount(
      (_url, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    act(() => held.learner!.updateNote("t1", "draft"));
    // A navigation while it hangs: held behind the write.
    draw({ completed: { t1: true } });
    expect(container.textContent).toBe("note=draft tick=false");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POST_TIMEOUT_MS);
    });
    expect(held.learner!.saveError).toMatch(/^Not saved/);
    // The held snapshot is adopted, and the note kept over it to be sent again.
    expect(container.textContent).toBe("note=draft tick=true");
  });
});

describe("leaving the page", () => {
  it("saves a write queued behind one in flight, rather than sending it out of turn, and the next load sends it", async () => {
    const answers: ((response: Response) => void)[] = [];
    const { calls } = mount(() => new Promise<Response>((resolve) => answers.push(resolve)));
    act(() => held.learner!.updateNote("t1", "first"));
    act(() => held.learner!.updateNote("t1", "typed last"));
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    // Not sent beside "first", which could then land after it.
    expect(calls()).toHaveLength(1);
    expect(outboxes().map(([, writes]) => writes)).toEqual([[{ kind: "note", topicId: "t1", note: "typed last" }]]);

    // The next load: a new provider sends it, and empties the outbox.
    act(() => root?.unmount());
    root = null;
    const next = mount(ok);
    await vi.waitFor(() => expect(next.calls()).toHaveLength(1));
    expect(JSON.parse(next.calls()[0][1].body as string)).toEqual({ curriculumItemId: "t1", note: "typed last" });
    expect(outboxes()).toEqual([]);
  });

  it("saves a refused write still kept, so closing the tab does not lose it", async () => {
    mount(() => Promise.resolve(new Response("{}", { status: 503 })));
    act(() => held.learner!.toggleTopicCompletion("t1"));
    await vi.waitFor(() => expect(held.learner!.saveError).not.toBeNull());
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(outboxes().map(([, writes]) => writes)).toEqual([[{ kind: "progress", topicId: "t1", done: true }]]);
  });

  it("sends nothing from an outbox over a day old, and removes it", async () => {
    const old = JSON.stringify({ at: Date.now() - 25 * 3_600_000, writes: [{ kind: "note", topicId: "t1", note: "old" }] });
    window.localStorage.setItem(OUTBOX_KEY, old);
    window.localStorage.setItem(`${OUTBOX_KEY}:gone`, old);
    const { calls } = mount(ok);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(calls()).toHaveLength(0);
    expect(outboxes()).toEqual([]);
  });

  it("sends every page's box and the old shared one, the oldest first", async () => {
    const at = Date.now();
    window.localStorage.setItem(`${OUTBOX_KEY}:later`, JSON.stringify({ at: at - 1_000, writes: [{ kind: "note", topicId: "t1", note: "newer" }] }));
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify({ at: at - 60_000, writes: [{ kind: "note", topicId: "t1", note: "older" }] }));
    window.localStorage.setItem("gnosia:something-else", "{}");
    const { calls } = mount(ok);
    await vi.waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls().map(([, init]) => (JSON.parse(init.body as string) as { note: string }).note)).toEqual(["older", "newer"]);
    expect(outboxes()).toEqual([]);
    expect(window.localStorage.getItem("gnosia:something-else")).toBe("{}");
  });
});

describe("two tabs sharing the outbox", () => {
  /** One tab: its own root and its own handle on the provider, beside the shared `localStorage`. */
  function tab(): { learner: () => Learner; close: () => void } {
    const box: { learner: Learner | null } = { learner: null };
    function TabProbe() {
      const learner = useLearner();
      useEffect(() => {
        box.learner = learner;
      });
      return null;
    }
    const tabRoot = createRoot(document.createElement("div"));
    act(() =>
      tabRoot.render(
        createElement(
          LearnerProvider,
          { initialState: emptyLearnerState(), reachable: true } as ComponentProps<typeof LearnerProvider>,
          createElement(TabProbe),
        ),
      ),
    );
    return { learner: () => box.learner!, close: () => act(() => tabRoot.unmount()) };
  }

  it("keeps a closed tab's saved write when another tab, with nothing pending, leaves or comes back from the cache", async () => {
    const refused = vi.fn(() => Promise.resolve(new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", refused);
    const b = tab();
    const a = tab();
    act(() => a.learner().updateNote("t1", "kept by A"));
    await vi.waitFor(() => expect(a.learner().saveError).not.toBeNull());
    // A closes: both tabs see a pagehide here, B with nothing pending.
    act(() => void window.dispatchEvent(new Event("pagehide")));
    a.close();
    // B goes into the back-forward cache and comes back, then leaves for good.
    act(() => void window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    b.close();

    // The next load sends A's note.
    const { calls } = mount(ok);
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    expect(JSON.parse(calls()[0][1].body as string)).toEqual({ curriculumItemId: "t1", note: "kept by A" });
    expect(outboxes()).toEqual([]);
  });
});

describe("two pages loading at once", () => {
  it("takes every box under one lock the pages share, so one page sends a note's writes in order and the other none", async () => {
    // A lock that runs one holder at a time, each in a later task: two pages' takes cannot interleave.
    let tail = Promise.resolve();
    const request = vi.fn((_name: string, take: () => unknown) => {
      const turn = tail.then(() => new Promise((resolve) => setTimeout(resolve, 0))).then(take);
      tail = turn.then(() => undefined);
      return turn;
    });
    Object.defineProperty(window.navigator, "locks", { value: { request }, configurable: true });
    try {
      const at = Date.now();
      window.localStorage.setItem(`${OUTBOX_KEY}:a`, JSON.stringify({ at: at - 60_000, writes: [{ kind: "note", topicId: "t1", note: "older" }] }));
      window.localStorage.setItem(`${OUTBOX_KEY}:b`, JSON.stringify({ at: at - 1_000, writes: [{ kind: "note", topicId: "t1", note: "newer" }] }));
      const { calls } = mount(ok);
      const other = createRoot(document.createElement("div"));
      act(() =>
        other.render(
          createElement(LearnerProvider, { initialState: emptyLearnerState(), reachable: true } as ComponentProps<typeof LearnerProvider>, null),
        ),
      );
      await vi.waitFor(() => expect(calls()).toHaveLength(2));
      expect(request.mock.calls.map(([name]) => name)).toEqual([OUTBOX_KEY, OUTBOX_KEY]);
      expect(calls().map(([, init]) => (JSON.parse(init.body as string) as { note: string }).note)).toEqual(["older", "newer"]);
      expect(outboxes()).toEqual([]);
      act(() => other.unmount());
    } finally {
      delete (window.navigator as { locks?: unknown }).locks;
    }
  });
});

describe("an edit made while the outbox waits for its lock", () => {
  it("wins over the saved write on its key, which is skipped, while a saved write on another key is sent", async () => {
    let grant: () => void = () => undefined;
    const granted = new Promise<void>((resolve) => (grant = resolve));
    const request = vi.fn((_name: string, take: () => unknown) => granted.then(take));
    Object.defineProperty(window.navigator, "locks", { value: { request }, configurable: true });
    try {
      window.localStorage.setItem(
        `${OUTBOX_KEY}:a`,
        JSON.stringify({ at: Date.now() - 1_000, writes: [{ kind: "note", topicId: "t1", note: "saved" }, { kind: "progress", topicId: "t2", done: true }] }),
      );
      const { calls, container } = mount(ok);
      act(() => held.learner!.updateNote("t1", "typed now"));
      await act(async () => grant());
      await vi.waitFor(() => expect(calls()).toHaveLength(2));
      expect(calls().map(([, init]) => JSON.parse(init.body as string))).toEqual([
        { curriculumItemId: "t1", note: "typed now" },
        { curriculumItemId: "t2", completed: true },
      ]);
      expect(container.textContent).toBe("note=typed now tick=false");
    } finally {
      delete (window.navigator as { locks?: unknown }).locks;
    }
  });
});

describe("a kept recap", () => {
  it("is drawn again as the write made it, without counting another session each time", async () => {
    const { draw } = mount(() => Promise.resolve(new Response("{}", { status: 503 })));
    const input = { summary: "Why attention is permutation-equivariant.", keyPoints: [], misconceptions: [], openQuestions: [], source: "agent" as const };
    act(() => held.learner!.saveKnowledge("t1", input));
    await vi.waitFor(() => expect(held.learner!.saveError).not.toBeNull());
    expect(held.learner!.state.knowledge.t1?.sessions).toBe(1);
    draw({});
    draw({ completed: { t9: true } });
    expect(held.learner!.state.knowledge.t1?.summary).toBe(input.summary);
    expect(held.learner!.state.knowledge.t1?.sessions).toBe(1);
  });
});

describe("keepalive", () => {
  it("goes with a small write, so a tab closed while it is in flight still delivers it", async () => {
    const { calls } = mount(ok);
    act(() => held.learner!.updateNote("t1", "short"));
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0][1].keepalive).toBe(true);
  });

  it("is left off a body past the browser's budget, which would refuse the request outright", async () => {
    const { calls } = mount(ok);
    act(() => held.learner!.updateNote("t1", "x".repeat(40_000)));
    await vi.waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0][1].keepalive).toBe(false);
  });
});

describe("a reset", () => {
  it("goes in batches the route takes, one after another, and is stored once all are", async () => {
    const ids = Array.from({ length: 2 * RESET_BATCH + 7 }, (_, i) => `course-m1-t${i}`);
    const { calls } = mount(ok);
    let stored: Promise<boolean> = Promise.resolve(false);
    act(() => {
      stored = held.learner!.resetCourse(ids);
    });
    expect(await stored).toBe(true);
    const batches = calls().map(([url, init]) => {
      expect(url).toBe("/api/learner/reset");
      return (JSON.parse(init.body as string) as { curriculumItemIds: string[] }).curriculumItemIds;
    });
    expect(batches.map((b) => b.length)).toEqual([RESET_BATCH, RESET_BATCH, 7]);
    expect(batches.flat()).toEqual(ids);
  });

  it("stops at a refused batch and says it was not stored", async () => {
    let n = 0;
    const { calls } = mount(() => {
      n += 1;
      return n === 2 ? Promise.resolve(new Response(JSON.stringify({ ok: false, error: "No." }), { status: 400 })) : ok();
    });
    let stored: Promise<boolean> = Promise.resolve(true);
    act(() => {
      stored = held.learner!.resetCourse(Array.from({ length: 3 * RESET_BATCH }, (_, i) => `t${i}`));
    });
    expect(await stored).toBe(false);
    expect(calls()).toHaveLength(2);
  });

  it("still sends one request for a course with no items, which moves the epoch", async () => {
    const { calls } = mount(ok);
    let stored: Promise<boolean> = Promise.resolve(false);
    act(() => {
      stored = held.learner!.resetCourse([]);
    });
    expect(await stored).toBe(true);
    expect(calls()).toHaveLength(1);
  });
});

describe("a visit", () => {
  it("is announced once stored, so the sidebar reads Recent with it", async () => {
    const heard = vi.fn();
    window.addEventListener(VISIT_STORED_EVENT, heard);
    try {
      mount(ok);
      act(() => held.learner!.markVisited("cs1", "m1"));
      await vi.waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener(VISIT_STORED_EVENT, heard);
    }
  });

  it("is not announced when it was refused", async () => {
    const heard = vi.fn();
    window.addEventListener(VISIT_STORED_EVENT, heard);
    try {
      const { calls } = mount(() => Promise.resolve(new Response("{}", { status: 503 })));
      act(() => held.learner!.markVisited("cs1", "m1"));
      await vi.waitFor(() => expect(calls()).toHaveLength(1));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(heard).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(VISIT_STORED_EVENT, heard);
    }
  });
});
