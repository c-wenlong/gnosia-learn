// @vitest-environment jsdom
import { act, createElement, useEffect, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyLearnerState } from "@gnosia/schema/shared";

import {
  clearTables,
  migratedScratchDatabase,
  probe,
  type Scratch,
} from "../../../../services/catalog/test/scratch-database";
import { ITEMS, seedContent } from "../../../../services/catalog/test/state-fixture";

/**
 * A recap whose answer is lost after the server stored it, end to end: the
 * provider in the page, the real `POST /api/learner/recap` and a scratch
 * database, with only the answer between them dropped. The page cannot tell
 * a lost answer from a write that never landed, so it keeps the recap and
 * sends it again; the request id it sends both times is what lets the route
 * count one session rather than two.
 */

// A signed-in request, so the owner seam (`@/lib/owner`) resolves `local`.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/theme-cookie", () => ({
  applyThemeToDocument: vi.fn(),
  followTheme: () => () => undefined,
  writeThemeCookie: vi.fn(),
}));

const reachable = await probe();

const ORIGIN = "http://localhost:3000";
const INPUT = {
  summary: "Attention is permutation-equivariant without positions.",
  keyPoints: ["Positions break the symmetry."],
  misconceptions: [],
  openQuestions: [],
  source: "agent" as const,
};

describe.skipIf(!reachable.ok)("a recap whose answer was lost after it was stored", () => {
  let scratch: Scratch;
  let POST: (req: Request) => Promise<Response>;
  let state: typeof import("@gnosia/catalog/state");
  let provider: typeof import("./learner-context");
  let root: Root | null = null;
  const held: { learner: ReturnType<typeof import("./learner-context").useLearner> | null } = { learner: null };

  beforeAll(async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    scratch = await migratedScratchDatabase();
    await seedContent(scratch.db);
    // Before the route is imported: the store it opens reads this once.
    process.env.DATABASE_URL = scratch.url;
    const [route, loaded, context] = await Promise.all([
      import("@/app/api/learner/recap/route"),
      import("@gnosia/catalog/state"),
      import("./learner-context"),
    ]);
    POST = route.POST;
    state = loaded;
    provider = context;
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await clearTables(scratch.db, ["recap"]);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.unstubAllGlobals();
  });

  /**
   * The page's `fetch`, wired to the route. The first `lose` answers are
   * dropped after the route has run, as a connection that fails on the way
   * back would drop them.
   */
  function mount(lose: number) {
    let dropped = 0;
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      const response = await POST(
        new Request(`${ORIGIN}${url}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", origin: ORIGIN, host: "localhost:3000" },
          body: init.body,
        }),
      );
      if (dropped < lose) {
        dropped += 1;
        throw new TypeError("Failed to fetch");
      }
      return response;
    });
    function Probe() {
      const learner = provider.useLearner();
      useEffect(() => {
        held.learner = learner;
      });
      return null;
    }
    root = createRoot(document.createElement("div"));
    act(() =>
      root!.render(
        createElement(
          provider.LearnerProvider,
          { initialState: emptyLearnerState(), reachable: true } as ComponentProps<typeof provider.LearnerProvider>,
          createElement(Probe),
        ),
      ),
    );
    return bodies;
  }

  const sessions = async () =>
    (await state.readRecaps(scratch.db)).find((recap) => recap.topicId === ITEMS[0])?.sessions;

  it("is sent again under the same request id when the browser is back online, and counted once", async () => {
    const bodies = mount(1);
    act(() => held.learner!.saveKnowledge(ITEMS[0], INPUT));
    await vi.waitFor(() => expect(held.learner!.saveError).toMatch(/^Not saved/));
    // The route stored it; only the answer was lost.
    expect(await sessions()).toBe(1);

    act(() => void window.dispatchEvent(new Event("online")));
    await vi.waitFor(() => expect(bodies).toHaveLength(2));
    await vi.waitFor(() => expect(held.learner!.saveError).toBeNull());

    expect(bodies[1].requestId).toBe(bodies[0].requestId);
    expect(typeof bodies[0].requestId).toBe("string");
    expect(await sessions()).toBe(1);

    // A new save is a new session.
    act(() => held.learner!.saveKnowledge(ITEMS[0], { ...INPUT, summary: "Next time." }));
    await vi.waitFor(() => expect(bodies).toHaveLength(3));
    await vi.waitFor(async () => expect(await sessions()).toBe(2));
    expect(bodies[2].requestId).not.toBe(bodies[0].requestId);
  });

  it("is sent again by the next page under the same request id, and counted once", async () => {
    const bodies = mount(1);
    act(() => held.learner!.saveKnowledge(ITEMS[0], INPUT));
    await vi.waitFor(() => expect(held.learner!.saveError).toMatch(/^Not saved/));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    act(() => root?.unmount());
    root = null;

    // The next load sends the outbox.
    const next = mount(0);
    await vi.waitFor(() => expect(next).toHaveLength(1));
    await vi.waitFor(() => expect(held.learner!.saveError).toBeNull());
    expect(next[0].requestId).toBe(bodies[0].requestId);
    expect(await sessions()).toBe(1);
  });
});
