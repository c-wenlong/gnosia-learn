// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, type LearnerState } from "@self-learn/schema/shared";

/**
 * A name saved while a refresh lands: the refresh carries the row from
 * before the write, and once the write is stored the sidebar shows the saved
 * name again rather than the old one.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

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

const held: { setDisplayName: ((name: string) => Promise<boolean>) | null } = { setDisplayName: null };
function Name() {
  const { state, setDisplayName } = useLearner();
  useEffect(() => {
    held.setDisplayName = setDisplayName;
  });
  return createElement("p", null, state.displayName ?? "none");
}

describe("setDisplayName", () => {
  it("shows the saved name once stored, though a refresh mid-write carried the old one", async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    vi.stubGlobal("fetch", fetcher);
    const container = document.createElement("div");
    root = createRoot(container);
    const draw = (state: LearnerState) =>
      act(() => root!.render(createElement(LearnerProvider, { initialState: state, reachable: true } as ComponentProps<typeof LearnerProvider>, createElement(Name))));
    const before: LearnerState = { ...emptyLearnerState(), displayName: "Ada" };
    draw(before);

    let saved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saved = held.setDisplayName!("Grace");
    });
    expect(container.textContent).toBe("Grace");

    // A refresh with the row as it was before the write.
    draw({ ...before });
    expect(container.textContent).toBe("Ada");

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      answer(new Response(JSON.stringify({ ok: true, result: "Grace" }), { status: 200 }));
      expect(await saved).toBe(true);
    });
    expect(container.textContent).toBe("Grace");
  });

  it("leaves a name saved elsewhere meanwhile, which is newer than this one", async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    vi.stubGlobal("fetch", fetcher);
    const container = document.createElement("div");
    root = createRoot(container);
    const draw = (state: LearnerState) =>
      act(() => root!.render(createElement(LearnerProvider, { initialState: state, reachable: true } as ComponentProps<typeof LearnerProvider>, createElement(Name))));
    draw({ ...emptyLearnerState(), displayName: "Ada" });

    let saved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saved = held.setDisplayName!("Grace");
    });
    // Another tab saved after this write, and a refresh brought it here.
    draw({ ...emptyLearnerState(), displayName: "Hopper" });

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      answer(new Response(JSON.stringify({ ok: true, result: "Grace" }), { status: 200 }));
      expect(await saved).toBe(true);
    });
    expect(container.textContent).toBe("Hopper");
  });
});
