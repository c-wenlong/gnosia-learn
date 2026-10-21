// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, type LearnerState } from "@gnosia/schema/shared";

/**
 * A write queued behind another on the same key supersedes it: only the
 * newest sets the banner. The older write's promise still resolves, with
 * whether that write was stored, as soon as it lands.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/theme-cookie", () => ({
  applyThemeToDocument: vi.fn(),
  followTheme: () => () => undefined,
  writeThemeCookie: vi.fn(),
}));

const { LearnerProvider, useLearner } = await import("./learner-context");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

type Learner = ReturnType<typeof useLearner>;
const held: { learner: Learner | null } = { learner: null };
function Probe() {
  const learner = useLearner();
  useEffect(() => {
    held.learner = learner;
  });
  return createElement("p", null, learner.state.displayName ?? "none");
}

/** The provider with every `fetch` held until answered, in order. */
function setup(initial: Partial<LearnerState> = {}) {
  const answers: ((response: Response) => void)[] = [];
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve))));
  root = createRoot(document.createElement("div"));
  const state: LearnerState = { ...emptyLearnerState(), ...initial };
  act(() =>
    root!.render(
      createElement(
        LearnerProvider,
        { initialState: state, reachable: true } as ComponentProps<typeof LearnerProvider>,
        createElement(Probe),
      ),
    ),
  );
  /** Answer the next held request with `status`, and let the provider react. */
  const answer = async (status = 200) => {
    await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
    const body = status === 200 ? { ok: true } : { ok: false, error: `Not saved (${status}).` };
    await act(async () => {
      answers.shift()!(new Response(JSON.stringify(body), { status }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  return { answer };
}

/** A promise's outcome so far, without waiting for it. */
function track(promise: Promise<boolean>) {
  const seen: { value: boolean | "pending" } = { value: "pending" };
  void promise.then((value) => (seen.value = value));
  return seen;
}

describe("a superseded write", () => {
  it("resolves with its own outcome when it lands, before the newer write is answered", async () => {
    const { answer } = setup();
    let first = track(Promise.resolve(false));
    let second = track(Promise.resolve(false));
    act(() => {
      first = track(held.learner!.setDisplayName("Ada"));
      second = track(held.learner!.setDisplayName("Ada Lovelace"));
    });

    await answer();
    expect(first.value).toBe(true);
    expect(second.value).toBe("pending");
    // The superseded write says nothing to the banner.
    expect(held.learner!.saveError).toBeNull();

    await answer(503);
    expect(second.value).toBe(false);
    expect(held.learner!.saveError).toBe("Not saved (503).");
  });

  it("resolves false when refused, and leaves the banner to the newer write that was stored", async () => {
    const { answer } = setup();
    let first = track(Promise.resolve(true));
    let second = track(Promise.resolve(false));
    act(() => {
      first = track(held.learner!.setDisplayName("Ada"));
      second = track(held.learner!.setDisplayName("Grace"));
    });

    await answer(503);
    expect(first.value).toBe(false);
    expect(held.learner!.saveError).toBeNull();

    await answer();
    expect(second.value).toBe(true);
    expect(held.learner!.saveError).toBeNull();
  });

  it("resolves a stored reset true when the writes queued behind it on every key are refused", async () => {
    const { answer } = setup({ completed: { t1: true }, notes: { t1: "old" } });
    let reset = track(Promise.resolve(false));
    act(() => {
      reset = track(held.learner!.resetCourse(["t1"]));
      // A tick and a note on the two keys the reset holds, queued behind it.
      held.learner!.toggleTopicCompletion("t1");
      held.learner!.updateNote("t1", "again");
    });

    await answer();
    expect(reset.value).toBe(true);
    await answer(503);
    await answer(503);
    expect(reset.value).toBe(true);
    expect(held.learner!.saveError).toBe("Not saved (503).");
  });
});
