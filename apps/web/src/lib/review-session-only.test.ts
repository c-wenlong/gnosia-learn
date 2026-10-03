import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `readReviewSession` with `only` (Home's "Recall these"): just those due
 * cards, in that order, and never a card that is not due. The catalog reads
 * are stand-ins; what is under test is how the session narrows the queue.
 */
const reviewQueue = vi.hoisted(() => vi.fn());

vi.mock("@self-learn/catalog/state", () => ({
  reviewQueue,
  conceptSummaries: vi.fn(async () => []),
}));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/concept-note", () => ({ readConceptNote: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

const item = (conceptId: string) => ({
  conceptId,
  title: conceptId,
  summary: "",
  domain: null,
  card: null,
  intervals: { again: "1m", hard: "1d", good: "1d", easy: "4d" },
});

describe("readReviewSession with only", () => {
  beforeEach(() => {
    reviewQueue.mockReset();
    reviewQueue.mockResolvedValue({ items: [item("a"), item("b"), item("c")], nextDue: null });
  });

  it("keeps just the named due cards, in the order named, and drops a name that is not due", async () => {
    const { readReviewSession } = await import("./review-queue");
    const session = await readReviewSession(null, new Date(), ["c", "gone", "a"]);
    expect(session.items.map((i) => i.conceptId)).toEqual(["c", "a"]);
  });

  it("does not apply a focus beside only, which could bring in a card that is not due", async () => {
    const { readReviewSession } = await import("./review-queue");
    await readReviewSession("x", new Date(), ["x"]);
    expect(reviewQueue.mock.calls[0]?.[1]).toMatchObject({ focus: null });
    await readReviewSession("x", new Date(), null);
    expect(reviewQueue.mock.calls[1]?.[1]).toMatchObject({ focus: "x" });
  });

  it("asks no card for an empty selection", async () => {
    const { readReviewSession } = await import("./review-queue");
    expect((await readReviewSession(null, new Date(), [])).items).toEqual([]);
  });
});
