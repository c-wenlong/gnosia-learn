// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, LEGACY_STORAGE_KEY, type LearnerState } from "@gnosia/schema/shared";

/**
 * How a learner write travels: in time-bounded requests, with `keepalive`
 * while small, a reset in batches the route takes, a visit announced once it
 * is stored, and the old localStorage document posted once and dropped when
 * the server refuses it for good.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: router.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/theme-cookie", () => ({
  applyThemeToDocument: vi.fn(),
  followTheme: () => () => undefined,
  writeThemeCookie: vi.fn(),
}));

const { LearnerProvider, useLearner, POST_TIMEOUT_MS, RESET_BATCH } = await import("./learner-context");
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

describe("the old localStorage document", () => {
  async function importWith(status: number, stored: string = JSON.stringify({ completed: { t1: true } })) {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, stored);
    const { calls } = mount(() => Promise.resolve(new Response(JSON.stringify({ ok: status === 200 }), { status })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return calls();
  }

  it("is removed once imported", async () => {
    expect(await importWith(200)).toHaveLength(1);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("is removed when the server refuses it for good, rather than posted on every load", async () => {
    await importWith(400);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    await importWith(413);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("is kept for the next load when the refusal can pass", async () => {
    await importWith(503);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    act(() => root?.unmount());
    root = null;
    await importWith(429);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });

  it("is removed, and not posted, when it is not a document", async () => {
    expect(await importWith(200, "[1,2]")).toHaveLength(0);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});
