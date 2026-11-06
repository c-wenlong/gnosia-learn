import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `readReviewSession` and the tutor's options: a check card with the notes'
 * options names its check (`rewrite`) only when a tutor model can be asked,
 * and whether one can is read only when some card would ask. The catalog,
 * the notes and the model check are stand-ins.
 */
const reviewQueue = vi.hoisted(() => vi.fn());
const tutorModelConfigured = vi.hoisted(() => vi.fn());
const readWrittenOptions = vi.hoisted(() => vi.fn());
const readConceptNote = vi.hoisted(() => vi.fn());

vi.mock("@gnosia/catalog/state", () => ({
  reviewQueue,
  conceptSummaries: vi.fn(async () => [
    { conceptId: "x", summary: "Softmax makes a distribution.", domain: null },
    { conceptId: "y", summary: "Heads run in parallel.", domain: null },
    { conceptId: "z", summary: "Values get mixed.", domain: null },
  ]),
}));
vi.mock("@/lib/learner-store", () => ({ catalogDatabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/concept-note", () => ({ readConceptNote }));
vi.mock("@/lib/session-page", () => ({ tutorModelConfigured }));
vi.mock("@gnosia/tutor/server/check-options", () => ({ readWrittenOptions }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  isSignedIn: async () => true,
}));

const due = {
  conceptId: "dot",
  title: "Dot product",
  summary: "Measures alignment.",
  domain: null,
  card: null,
  intervals: [1, 1, 1, 4],
};
const check = { id: "c1", question: "Why zero for perpendicular vectors?", answer: "They share no component.", why: "", source: "" };

beforeEach(() => {
  reviewQueue.mockReset().mockResolvedValue({ items: [due], nextDue: null });
  tutorModelConfigured.mockReset();
  readWrittenOptions.mockReset().mockResolvedValue(new Map());
  readConceptNote.mockReset().mockResolvedValue({ ok: true, checks: [check] });
});

describe("readReviewSession and the tutor's options", () => {
  it("names the check to ask for when a tutor model can be asked", async () => {
    tutorModelConfigured.mockResolvedValue(true);
    const { readReviewSession } = await import("./review-queue");
    const [card] = (await readReviewSession()).items;
    expect(card?.wrong).toBe("notes");
    expect(card?.rewrite).toEqual({ check: "c1" });
  });

  it("names none when no model can be asked, or the check cannot be read", async () => {
    tutorModelConfigured.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("catalog down"));
    const { readReviewSession } = await import("./review-queue");
    expect((await readReviewSession()).items[0]?.rewrite).toBeUndefined();
    expect((await readReviewSession()).items[0]?.rewrite).toBeUndefined();
  });

  it("does not look for a model when every card already has the tutor's options", async () => {
    readWrittenOptions.mockResolvedValue(new Map([["dot", { c1: ["They point the same way.", "Their lengths cancel.", "One is zero."] }]]));
    const { readReviewSession } = await import("./review-queue");
    const [card] = (await readReviewSession()).items;
    expect(card?.wrong).toBe("tutor");
    expect(tutorModelConfigured).not.toHaveBeenCalled();
  });
});
