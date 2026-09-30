import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/studio` starts health and the five reads the grid is drawn from together,
 * so a load costs the slowest call and not health plus the slowest. What each
 * answer decides is what it decided when health was awaited first: a failing
 * doctor replaces the screen, a failing read costs its own section.
 */

type Answer = { ok: true; data: unknown } | { ok: false; reason: "down" | "refused"; status: number | null; headline: string; detail: string };

/** One call the page made, and the promise it is waiting on. */
interface Call {
  path: string;
  signal: AbortSignal | undefined;
  settle: (answer: Answer) => void;
}

const mocks = vi.hoisted(() => ({ calls: [] as unknown[], studioApi: vi.fn(), requireStudio: vi.fn(), openShot: vi.fn() }));
vi.mock("@/lib/studio", () => ({ studioApi: mocks.studioApi, requireStudio: mocks.requireStudio, openShot: mocks.openShot }));
vi.mock("@/lib/studio-agents", () => ({ readStudioAgents: vi.fn() }));
vi.mock("@/data/topics", async () => {
  const real = await vi.importActual<typeof import("@/data/topics")>("@/data/topics").catch(() => null);
  return {
    getTopics: vi.fn(),
    topicTitleMap: (topics: { slug: string; title: string }[]) => new Map(topics.map((topic) => [topic.slug, topic.title])),
    topicDomainMap: (topics: { slug: string; domain: string }[]) => new Map(topics.map((topic) => [topic.slug, topic.domain])),
    topicOptionsOf: real?.topicOptionsOf ?? (() => []),
  };
});

const { default: StudioPage } = await import("@/app/(app)/studio/page");
const { BlockedCard } = await import("@/components/studio/StudioBlocked");
const { ConversationHost } = await import("@/components/studio/ConversationHost");
const { panelSignature } = await import("@/lib/studio-view");

const calls = mocks.calls as Call[];

const down: Answer = { ok: false, reason: "refused", status: 503, headline: "the catalog is down", detail: "{}" };
const healthy = {
  ok: true,
  tldrawkc: true,
  postgres: true,
  stale: false,
  checks: [],
  note: "",
};
const listing = { dir: "catalog", diagrams: [], errors: [], counts: { total: 0, withTopic: 0, unreadable: 0 } };

beforeEach(() => {
  calls.length = 0;
  mocks.studioApi.mockImplementation(
    (path: string, init?: { signal?: AbortSignal }) =>
      new Promise<Answer>((settle) => calls.push({ path, signal: init?.signal, settle })),
  );
});

function answer(path: string, value: Answer): void {
  const call = calls.find((held) => held.path === path || held.path.startsWith(`${path}?`));
  if (!call) throw new Error(`the page never asked for ${path}`);
  call.settle(value);
}

/** Every element of a static tree, so a test can ask "is the blocked card in here". */
function elements(node: ReactNode, into: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((child) => elements(child, into));
  else if (isValidElement(node)) {
    const element = node as unknown as { type: unknown; props: Record<string, unknown> };
    into.push(element);
    elements(element.props.children as ReactNode, into);
  }
  return into;
}

function blockedTitles(tree: ReactNode): string[] {
  return elements(tree)
    .filter((element) => element.type === BlockedCard)
    .map((element) => String(element.props.title));
}

/** Starts the page and waits until it has asked the runner for everything, boxed so the page itself is not awaited. */
async function render(params: Record<string, string> = {}): Promise<{ page: Promise<ReactNode> }> {
  const page = StudioPage({ searchParams: Promise.resolve(params) }) as Promise<ReactNode>;
  // The page awaits its search params before it calls the runner.
  await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(6));
  return { page };
}

describe("the /studio load", () => {
  it("starts health and all five reads before any of them has answered", async () => {
    const { page: pending } = await render();
    expect(calls.map((call) => call.path.split("?")[0]).sort()).toEqual(
      ["/api/diagrams", "/api/health", "/api/jobs", "/api/vocabulary", "/api/videos", "/api/drafts"].sort(),
    );
    // None has answered, so a serial page could not have asked for more than one.
    answer("/api/health", { ok: true, data: healthy });
    for (const path of ["/api/diagrams", "/api/jobs", "/api/vocabulary", "/api/drafts", "/api/videos"]) {
      answer(path, path === "/api/diagrams" ? { ok: true, data: listing } : path === "/api/jobs" ? { ok: true, data: { jobs: [] } } : down);
    }
    const tree = await pending;
    expect(blockedTitles(tree)).toEqual([]);
    // Nothing further was awaited after the six.
    expect(calls).toHaveLength(6);
  });

  it("puts the blocked screen up from health alone, without waiting on the reads", async () => {
    const { page: pending } = await render();
    answer("/api/health", { ok: true, data: { ...healthy, tldrawkc: false, checks: [{ name: "page", status: "fail", detail: "no bundle" }] } });
    // The five never answer: a doctor failure must not wait on them.
    const tree = await pending;
    expect(blockedTitles(tree)).toEqual(["tldrawkc cannot run on this machine"]);
  });

  it("aborts the five reads when a blocked screen makes them moot, and leaves health's own call alone", async () => {
    const { page } = await render();
    const reads = calls.filter((call) => call.path !== "/api/health");
    expect(reads).toHaveLength(5);
    // One signal for all five, live while the page is deciding.
    expect(new Set(reads.map((call) => call.signal)).size).toBe(1);
    expect(reads.every((call) => call.signal !== undefined && !call.signal.aborted)).toBe(true);
    answer("/api/health", { ok: true, data: { ...healthy, tldrawkc: false } });
    await page;
    expect(reads.every((call) => call.signal?.aborted)).toBe(true);
    expect(calls.find((call) => call.path === "/api/health")?.signal).toBeUndefined();
  });

  it("aborts them when the runner is down too", async () => {
    const { page } = await render();
    answer("/api/health", { ok: false, reason: "down", status: null, headline: "down", detail: "" });
    await page;
    expect(calls.filter((call) => call.path !== "/api/health").every((call) => call.signal?.aborted)).toBe(true);
  });

  it("does not abort them when the page draws", async () => {
    const { page } = await render();
    answer("/api/health", { ok: true, data: healthy });
    answer("/api/diagrams", { ok: true, data: listing });
    for (const path of ["/api/jobs", "/api/vocabulary", "/api/drafts", "/api/videos"]) answer(path, down);
    await page;
    expect(calls.filter((call) => call.path !== "/api/health").some((call) => call.signal?.aborted)).toBe(false);
  });

  it("shows the runner being down as it did, and leaves the reads unused", async () => {
    const { page: pending } = await render();
    answer("/api/health", { ok: false, reason: "down", status: null, headline: "The studio runner is not answering.", detail: "nothing on 7250" });
    const tree = await pending;
    expect(blockedTitles(tree)).toEqual(["The studio runner is not answering."]);
    // A late failure of a read nobody awaits is not an unhandled rejection.
    answer("/api/diagrams", down);
  });

  it("still blocks on a diagram list that cannot be read, after the others answered", async () => {
    const { page: pending } = await render();
    answer("/api/health", { ok: true, data: healthy });
    answer("/api/diagrams", down);
    for (const path of ["/api/jobs", "/api/vocabulary", "/api/drafts", "/api/videos"]) answer(path, down);
    expect(blockedTitles(await pending)).toEqual(["the catalog is down"]);
  });

  it.each(["/api/jobs", "/api/vocabulary", "/api/drafts", "/api/videos"])(
    "draws the grid when only %s fails",
    async (failing) => {
      const { page: pending } = await render();
      answer("/api/health", { ok: true, data: healthy });
      answer("/api/diagrams", { ok: true, data: listing });
      answer("/api/jobs", failing === "/api/jobs" ? down : { ok: true, data: { jobs: [] } });
      answer("/api/vocabulary", failing === "/api/vocabulary" ? down : { ok: true, data: { topics: [] } });
      answer("/api/drafts", failing === "/api/drafts" ? down : { ok: true, data: { drafts: [] } });
      answer("/api/videos", failing === "/api/videos" ? down : { ok: true, data: { videos: [] } });
      expect(blockedTitles(await pending)).toEqual([]);
    },
  );
});

describe("the conversation panel", () => {
  it("is left to the browser: a ?draft= render draws no dialog of its own, and says which panel it drew", async () => {
    const { page: pending } = await render({ draft: "d1", sel: "a" });
    answer("/api/health", { ok: true, data: healthy });
    answer("/api/diagrams", { ok: true, data: listing });
    for (const path of ["/api/jobs", "/api/vocabulary", "/api/drafts", "/api/videos"]) answer(path, down);
    const host = elements(await pending).find((element) => element.type === ConversationHost);
    expect(host?.props.panel).toBeNull();
    expect(host?.props.panelKey).toBe(panelSignature({ draft: "d1", sel: "a" }));
  });
});
