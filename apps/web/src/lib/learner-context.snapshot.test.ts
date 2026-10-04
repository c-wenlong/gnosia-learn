// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, type LearnerState } from "@self-learn/schema/shared";

/**
 * A snapshot that lands while a write is in flight was read before the write,
 * so the provider holds it back rather than putting the old row over the
 * optimistic value, and reads the snapshot again once every write is stored.
 */

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: router.refresh, push: vi.fn(), replace: vi.fn() }) }));
// The theme effect writes a cookie and a class; neither is under test here.
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
beforeEach(() => router.refresh.mockReset());
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
  const { notes, completed } = learner.state;
  return createElement("p", null, `note=${notes.t1 ?? "none"} tick=${completed.t1 === true}`);
}

/** The provider with every `fetch` held until answered, in order. */
function setup(initial: Partial<LearnerState>) {
  const answers: ((response: Response) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve)));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  root = createRoot(container);
  const draw = (snapshot: Partial<LearnerState>) => {
    const state: LearnerState = { ...emptyLearnerState(), ...snapshot };
    act(() =>
      root!.render(
        createElement(
          LearnerProvider,
          { initialState: state, reachable: true } as ComponentProps<typeof LearnerProvider>,
          createElement(Probe),
        ),
      ),
    );
  };
  draw(initial);
  /** Answer the next held request with `status`, and let the provider react. */
  const answer = async (status = 200) => {
    await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
    const body = status === 200 ? { ok: true } : { ok: false, error: "Not saved." };
    await act(async () => {
      answers.shift()!(new Response(JSON.stringify(body), { status }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  return { container, draw, answer, fetcher };
}

describe("a snapshot during a write", () => {
  it("adopts a snapshot at once when no write is in flight", () => {
    const { container, draw } = setup({});
    draw({ notes: { t1: "from the terminal" } });
    expect(container.textContent).toBe("note=from the terminal tick=false");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("reads nothing more when no snapshot landed during the write", async () => {
    const { container, answer } = setup({});
    act(() => held.learner!.updateNote("t1", "draft"));
    expect(container.textContent).toBe("note=draft tick=false");
    await answer();
    expect(container.textContent).toBe("note=draft tick=false");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("keeps a note being saved over a snapshot from before it, then reads again", async () => {
    const { container, draw, answer } = setup({ notes: { t1: "old" } });
    act(() => held.learner!.updateNote("t1", "new"));
    // A refresh or a navigation rendered while the note was in flight.
    draw({ notes: { t1: "old" } });
    expect(container.textContent).toBe("note=new tick=false");
    expect(router.refresh).not.toHaveBeenCalled();

    await answer();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The snapshot read after the write carries it.
    draw({ notes: { t1: "new" } });
    expect(container.textContent).toBe("note=new tick=false");
  });

  it("keeps a tick, and reads again only once every write has settled", async () => {
    const { container, draw, answer } = setup({});
    act(() => held.learner!.toggleTopicCompletion("t1"));
    act(() => held.learner!.updateNote("t1", "why"));
    draw({});
    expect(container.textContent).toBe("note=why tick=true");

    await answer();
    expect(router.refresh).not.toHaveBeenCalled();
    await answer();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps a refused write on screen and reads nothing, so the banner and the text stay", async () => {
    const { container, draw, answer } = setup({});
    act(() => held.learner!.updateNote("t1", "three paragraphs"));
    draw({});
    await answer(503);
    expect(container.textContent).toBe("note=three paragraphs tick=false");
    expect(held.learner!.saveError).toBe("Not saved.");
    expect(router.refresh).not.toHaveBeenCalled();
    // The next snapshot, with nothing in flight, is the database's to give.
    draw({});
    expect(container.textContent).toBe("note=none tick=false");
  });
});
