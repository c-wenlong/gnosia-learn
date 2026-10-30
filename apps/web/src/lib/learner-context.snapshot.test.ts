// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyLearnerState, type LearnerState } from "@gnosia/schema/shared";

/**
 * A snapshot read before a write landed carries the old row: held back while
 * the write is in flight, checked against the stored write once it settles
 * (or when it arrives just after), and read again once when it disagrees.
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
  const { notes, completed, epoch } = learner.state;
  const text = `note=${notes.t1 ?? "none"} tick=${completed.t1 === true}`;
  return createElement("p", null, epoch > 0 ? `${text} epoch=${epoch}` : text);
}

/** The provider with every `fetch` held until answered, in order. */
function setup(initial: Partial<LearnerState>) {
  const answers: ((response: Response) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve)));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  root = createRoot(container);
  const draw = (snapshot: Partial<LearnerState>, reachable = true) => {
    const state: LearnerState = { ...emptyLearnerState(), ...snapshot };
    act(() =>
      root!.render(
        createElement(
          LearnerProvider,
          { initialState: state, reachable } as ComponentProps<typeof LearnerProvider>,
          createElement(Probe),
        ),
      ),
    );
  };
  draw(initial);
  /** The body of the `n`th request (from 0), as sent. */
  const sent = (n: number) => JSON.parse((fetcher.mock.calls[n] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
  /** Answer the next held request with `status`, and let the provider react. */
  const answer = async (status = 200) => {
    await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
    const body = status === 200 ? { ok: true } : { ok: false, error: "Not saved." };
    await act(async () => {
      answers.shift()!(new Response(JSON.stringify(body), { status }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  return { container, draw, answer, fetcher, sent };
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

  it("holds back a snapshot read during the write that arrives just after it is stored", async () => {
    const { container, draw, answer } = setup({ notes: { t1: "old" } });
    act(() => held.learner!.updateNote("t1", "new"));
    await answer();
    // Read on the server while the note was in flight, delivered after it settled.
    draw({ notes: { t1: "old" } });
    expect(container.textContent).toBe("note=new tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // A second snapshot from before the write, on its way too, is held back.
    draw({ notes: { t1: "old" } });
    expect(container.textContent).toBe("note=new tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(2);
    // Then the re-read, which shows it.
    draw({ notes: { t1: "new" } });
    expect(container.textContent).toBe("note=new tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("adopts the database's answer once re-reading keeps disagreeing: another tab wrote since", async () => {
    const { container, draw, answer } = setup({ notes: { t1: "old" } });
    act(() => held.learner!.updateNote("t1", "new"));
    await answer();
    draw({ notes: { t1: "another tab" } });
    draw({ notes: { t1: "another tab" } });
    expect(container.textContent).toBe("note=new tick=false");
    draw({ notes: { t1: "another tab" } });
    expect(container.textContent).toBe("note=another tab tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(2);
    // Confirmed and forgotten: the next snapshot is adopted with no question.
    draw({ notes: { t1: "later" } });
    expect(container.textContent).toBe("note=later tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("checks a reset by its epoch, which moves even when there was nothing to clear", async () => {
    const { container, draw, answer } = setup({});
    let reset: Promise<boolean> = Promise.resolve(false);
    act(() => {
      reset = held.learner!.resetCourse(["t1"]);
    });
    expect(container.textContent).toBe("note=none tick=false epoch=1");
    await answer();
    expect(await reset).toBe(true);
    draw({ epoch: 0 });
    expect(container.textContent).toBe("note=none tick=false epoch=1");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw({ epoch: 1 });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("adopts the next snapshot without reading again when it already shows the stored write", async () => {
    const { container, draw, answer } = setup({});
    act(() => held.learner!.toggleTopicCompletion("t1"));
    await answer();
    draw({ completed: { t1: true }, notes: { t2: "from the terminal" } });
    expect(container.textContent).toBe("note=none tick=true");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("gives a new write its own re-reads, whatever an earlier one used", async () => {
    const { container, draw, answer } = setup({ notes: { t1: "old" } });
    act(() => held.learner!.updateNote("t1", "new"));
    await answer();
    draw({ notes: { t1: "old" } });
    draw({ notes: { t1: "old" } });
    expect(router.refresh).toHaveBeenCalledTimes(2);
    act(() => held.learner!.updateNote("t1", "newer"));
    await answer();
    draw({ notes: { t1: "new" } });
    expect(container.textContent).toBe("note=newer tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });

  it("checks a reset against the database's epoch, not one a refused reset raised", async () => {
    const { container, draw, answer } = setup({});
    act(() => void held.learner!.resetCourse(["t1"]));
    await answer(503);
    act(() => void held.learner!.resetCourse(["t1"]));
    expect(container.textContent).toBe("note=none tick=false epoch=2");
    await answer();
    // The database moved its epoch once, from 0 to 1.
    draw({ epoch: 1 });
    expect(container.textContent).toBe("note=none tick=false epoch=1");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("expects one more epoch for each reset stored before a snapshot", async () => {
    const { container, draw, answer } = setup({});
    act(() => void held.learner!.resetCourse(["t1"]));
    await answer();
    act(() => void held.learner!.resetCourse(["t2"]));
    await answer();
    // Read between the two resets: it has the first and not the second.
    draw({ epoch: 1 });
    expect(container.textContent).toBe("note=none tick=false epoch=2");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw({ epoch: 2 });
    expect(container.textContent).toBe("note=none tick=false epoch=2");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("counts an overlapping reset of the same course, which the queue does not report", async () => {
    const { container, draw, answer } = setup({});
    act(() => void held.learner!.resetCourse(["t1"]));
    act(() => void held.learner!.resetCourse(["t1"]));
    await answer();
    await answer();
    draw({ epoch: 1 });
    expect(container.textContent).toBe("note=none tick=false epoch=2");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw({ epoch: 2 });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("protects a stored write that a refused one superseded: the database has it", async () => {
    const { container, draw, answer } = setup({ notes: { t1: "old" } });
    act(() => held.learner!.updateNote("t1", "first"));
    act(() => held.learner!.updateNote("t1", "second"));
    draw({ notes: { t1: "old" } });
    await answer();
    await answer(400);
    expect(held.learner!.saveError).toBe("Not saved.");
    // The held snapshot predates "first", which was stored: read again.
    expect(container.textContent).toBe("note=second tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw({ notes: { t1: "first" } });
    expect(container.textContent).toBe("note=first tick=false");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("protects a stored reset when the writes queued behind it on every key are refused", async () => {
    const { container, draw, answer } = setup({ completed: { t1: true }, notes: { t1: "old" } });
    act(() => {
      void held.learner!.resetCourse(["t1"]);
      held.learner!.toggleTopicCompletion("t1");
      held.learner!.updateNote("t1", "again");
    });
    draw({ completed: { t1: true }, notes: { t1: "old" } });
    await answer();
    await answer(400);
    await answer(400);
    expect(container.textContent).toBe("note=again tick=true epoch=1");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw({ epoch: 1 });
    expect(container.textContent).toBe("note=none tick=false epoch=1");
  });

  it("adopts a snapshot with a reset and the writes stored after it on its keys", async () => {
    const { container, draw, answer } = setup({ completed: { t1: true }, notes: { t1: "old" } });
    act(() => {
      void held.learner!.resetCourse(["t1"]);
      held.learner!.toggleTopicCompletion("t1");
      held.learner!.updateNote("t1", "again");
    });
    await answer();
    await answer();
    await answer();
    draw({ completed: { t1: true }, notes: { t1: "again" }, epoch: 1 });
    expect(container.textContent).toBe("note=again tick=true epoch=1");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("reads again a snapshot from before a reset that later writes on its keys replaced", async () => {
    const { container, draw, answer } = setup({ notes: { t1: "same" } });
    act(() => {
      void held.learner!.resetCourse(["t1"]);
      held.learner!.updateNote("t1", "same");
    });
    await answer();
    await answer();
    // Its note matches the one stored after the reset, but its epoch is older.
    draw({ notes: { t1: "same" } });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    draw({ notes: { t1: "same" }, epoch: 1 });
    expect(container.textContent).toBe("note=same tick=false epoch=1");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("protects nothing for a write refused for good: the database never had it", async () => {
    const { container, draw, answer } = setup({});
    act(() => held.learner!.updateNote("t1", "three paragraphs"));
    draw({});
    expect(container.textContent).toBe("note=three paragraphs tick=false");
    await answer(400);
    expect(held.learner!.saveError).toBe("Not saved.");
    expect(container.textContent).toBe("note=none tick=false");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("a write refused for a reason that can pass", () => {
  it("keeps the note over the snapshots after it, and sends it again from the next reachable one", async () => {
    const { container, draw, answer, fetcher, sent } = setup({});
    act(() => held.learner!.updateNote("t1", "three paragraphs"));
    draw({});
    await answer(503);
    expect(held.learner!.saveError).toBe("Not saved.");
    // The snapshot held during the write is adopted, with the note drawn over it.
    expect(container.textContent).toBe("note=three paragraphs tick=false");
    expect(fetcher).toHaveBeenCalledTimes(1);

    // A navigation: the database answers, without the note. Shown, and sent again.
    draw({ completed: { t1: true } });
    expect(container.textContent).toBe("note=three paragraphs tick=true");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(sent(1)).toEqual({ curriculumItemId: "t1", note: "three paragraphs" });
    await answer();
    expect(held.learner!.saveError).toBeNull();

    // Stored now: the next snapshot that shows it is adopted, and nothing is sent.
    draw({ completed: { t1: true }, notes: { t1: "three paragraphs" } });
    expect(container.textContent).toBe("note=three paragraphs tick=true");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps it again when it is refused again, and drops it once a later write on its key is stored", async () => {
    const { container, draw, answer, fetcher } = setup({});
    act(() => held.learner!.updateNote("t1", "draft"));
    await answer(503);
    draw({});
    await answer(503);
    draw({});
    expect(container.textContent).toBe("note=draft tick=false");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    act(() => held.learner!.updateNote("t1", "rewritten"));
    await answer(503);
    await answer();
    draw({ notes: { t1: "rewritten" } });
    expect(container.textContent).toBe("note=rewritten tick=false");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("sets a refused tick again rather than flipping it, over a snapshot that already has it", async () => {
    const { container, draw, answer, sent } = setup({});
    act(() => held.learner!.toggleTopicCompletion("t1"));
    await answer(503);
    // The write landed after all (an answer that came too late): the snapshot has the tick.
    draw({ completed: { t1: true } });
    expect(container.textContent).toBe("note=none tick=true");
    await vi.waitFor(() => expect(sent(1)).toEqual({ curriculumItemId: "t1", completed: true }));
  });

  it("does not keep a reset: a learner told it was not stored does not see it happen later", async () => {
    const { container, draw, answer, fetcher } = setup({ completed: { t1: true } });
    act(() => void held.learner!.resetCourse(["t1"]));
    await answer(503);
    draw({ completed: { t1: true } });
    expect(container.textContent).toBe("note=none tick=true");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops a kept note once a reset of its item is stored", async () => {
    const { container, draw, answer, fetcher } = setup({});
    act(() => held.learner!.updateNote("t1", "draft"));
    await answer(503);
    act(() => void held.learner!.resetCourse(["t1"]));
    await answer();
    draw({ epoch: 1 });
    expect(container.textContent).toBe("note=none tick=false epoch=1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("drops a kept note the moment a newer edit to it is made, so going online cannot send the older text after it", async () => {
    const { container, answer, fetcher, sent } = setup({});
    act(() => held.learner!.updateNote("t1", "older"));
    await answer(503);
    act(() => held.learner!.updateNote("t1", "newer"));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    // Online while "newer" is in flight: nothing kept to send.
    act(() => void window.dispatchEvent(new Event("online")));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.textContent).toBe("note=newer tick=false");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sent(1)).toEqual({ curriculumItemId: "t1", note: "newer" });
  });

  it("keeps only the newest of a key's refused writes, not one a newer write superseded", async () => {
    const { container, draw, answer, fetcher, sent } = setup({});
    act(() => held.learner!.updateNote("t1", "first"));
    act(() => held.learner!.updateNote("t1", "second"));
    await answer(503);
    act(() => void window.dispatchEvent(new Event("online")));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(fetcher).toHaveBeenCalledTimes(2);
    await answer(503);
    draw({});
    expect(container.textContent).toBe("note=second tick=false");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(sent(2)).toEqual({ curriculumItemId: "t1", note: "second" });
  });

  it("sends kept writes again when a held snapshot is adopted, all but the one refused just now", async () => {
    const { draw, answer, fetcher, sent } = setup({});
    act(() => held.learner!.updateNote("t1", "kept"));
    await answer(503);
    act(() => held.learner!.toggleTopicCompletion("t2"));
    // Arrives while the tick is in flight: held, then adopted once it is refused.
    draw({});
    await answer(503);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(sent(2)).toEqual({ curriculumItemId: "t1", note: "kept" });
  });

  it("sends kept writes again when the browser is back online", async () => {
    const { answer, fetcher, sent } = setup({});
    act(() => held.learner!.updateNote("t1", "offline"));
    await answer(503);
    act(() => void window.dispatchEvent(new Event("online")));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(sent(1)).toEqual({ curriculumItemId: "t1", note: "offline" });
  });
});

describe("a snapshot from a database that did not answer", () => {
  it("is not adopted: it is empty, and would wipe what is on screen", () => {
    const { container, draw } = setup({ completed: { t1: true }, notes: { t1: "kept" } });
    draw({}, false);
    expect(container.textContent).toBe("note=kept tick=true");
    expect(router.refresh).not.toHaveBeenCalled();
    // The database answers again: adopted.
    draw({ notes: { t1: "kept" } });
    expect(container.textContent).toBe("note=kept tick=false");
  });
});
