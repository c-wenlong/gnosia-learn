// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, type LearnerState } from "@gnosia/schema/shared";

/**
 * A name saved while a refresh lands: the refresh carries the row as it was
 * then, and which name is newest is the database's to say, so a stored save
 * that no longer matches the screen reads the snapshot again.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: router.refresh, push: vi.fn(), replace: vi.fn() }) }));

const { LearnerProvider, useLearner } = await import("./learner-context");

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
beforeEach(() => router.refresh.mockReset());
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

/** The provider with a held `fetch`, and a way to answer it. */
function setup(initial: string) {
  let answer: (response: Response) => void = () => undefined;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  root = createRoot(container);
  const draw = (name: string) => {
    const state: LearnerState = { ...emptyLearnerState(), displayName: name };
    act(() => root!.render(createElement(LearnerProvider, { initialState: state, reachable: true } as ComponentProps<typeof LearnerProvider>, createElement(Name))));
  };
  draw(initial);
  const settle = async (saved: Promise<boolean>) => {
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      answer(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      expect(await saved).toBe(true);
    });
  };
  return { container, draw, settle };
}

describe("setDisplayName", () => {
  it("shows the name at once, and reads nothing more when the save lands with it on screen", async () => {
    const { container, settle } = setup("Ada");
    let saved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saved = held.setDisplayName!("Grace");
    });
    expect(container.textContent).toBe("Grace");
    await settle(saved);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("reads the snapshot again when a refresh mid-write replaced the saved name", async () => {
    const { container, draw, settle } = setup("Ada");
    let saved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      saved = held.setDisplayName!("Grace");
    });
    // A refresh with some other row: the one from before, or another tab's.
    // It is held back while the save is in flight, so the name stays.
    draw("Hopper");
    expect(container.textContent).toBe("Grace");
    await settle(saved);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
