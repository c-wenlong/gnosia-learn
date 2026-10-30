import type { ReviewQueueItem } from "@gnosia/catalog/state";
import { describe, expect, it } from "vitest";

import type { ConceptCheck } from "@gnosia/tutor/concept-note-core";
import { toReviewItem } from "./review-queue";

/**
 * How a due card becomes what the page asks. The loader's database half is
 * `reviewQueue` in the catalog, tested there; this is the part that reads the
 * note's check blocks and decides between a multiple-choice check and recall.
 */

const item: ReviewQueueItem = {
  conceptId: "dot-product",
  title: "Dot product",
  summary: "The dot product measures alignment.",
  domain: "foundations",
  card: {
    conceptId: "dot-product",
    repetitions: 3,
    ease: 2.36,
    intervalDays: 6,
    lapses: 1,
    due: "2026-09-25T00:00:00.000Z",
    lastReviewed: "2026-09-19T00:00:00.000Z",
    leech: false,
    history: [],
  },
  intervals: [1, 12, 14, 15],
};

const check = (overrides: Partial<ConceptCheck> = {}): ConceptCheck => ({
  id: "c1",
  question: "Why is it zero for perpendicular vectors?",
  answer: "They share no component.",
  why: "Catches the belief that it measures length.",
  source: "Lecture 3, slide 8",
  ...overrides,
});

const POOL = ["Softmax makes a distribution.", "Heads run in parallel.", "Values get mixed."];

describe("toReviewItem with the tutor's options", () => {
  const written = { c1: ["They point the same way.", "Their lengths cancel.", "One of them is zero."] };

  it("uses the options the tutor wrote for the check, and only those, once a session stored them", () => {
    const built = toReviewItem(item, [check()], POOL, written);
    expect(built.wrong).toBe("tutor");
    expect([...(built.choices ?? [])].sort()).toEqual([...written.c1, "They share no component."].sort());
  });

  it("falls back to the pool, marked as from the notes, when none are stored for this check", () => {
    const built = toReviewItem(item, [check()], POOL, { c2: written.c1 });
    expect(built.wrong).toBe("notes");
    expect(built.choices).toContain("Softmax makes a distribution.");
    expect(toReviewItem(item, [check()], POOL).wrong).toBe("notes");
  });

  it("marks nothing on a recall card", () => {
    expect(toReviewItem(item, [], POOL, written).wrong).toBeUndefined();
  });
});

describe("toReviewItem", () => {
  it("asks the first check as multiple choice when the pool can fill the options", () => {
    const built = toReviewItem(item, [check(), check({ id: "c2", question: "Second?" })], POOL);
    expect(built).toMatchObject({
      kind: "check",
      prompt: "Why is it zero for perpendicular vectors?",
      answer: "They share no component.",
      why: "Catches the belief that it measures length.",
      source: "Lecture 3, slide 8",
      checks: 2,
      intervals: [1, 12, 14, 15],
      ease: 2.36,
      repetitions: 3,
      lapses: 1,
      lastReviewed: "2026-09-19T00:00:00.000Z",
    });
    expect(built.choices?.[built.correct ?? -1]).toBe("They share no component.");
  });

  it("asks the check as recall when the pool is too thin for options", () => {
    const built = toReviewItem(item, [check()], ["Only one."]);
    expect(built).toMatchObject({ kind: "recall", prompt: "Why is it zero for perpendicular vectors?", choices: null });
    expect(built.answer).toBe("They share no component.");
  });

  it("falls back to the summary for a check with no answer, and never offers options for it", () => {
    const built = toReviewItem(item, [check({ answer: "", why: "", source: "" })], POOL);
    expect(built).toMatchObject({
      kind: "recall",
      answer: "The dot product measures alignment.",
      why: null,
      source: null,
    });
  });

  it("recalls the title against the summary when the note has no check", () => {
    expect(toReviewItem(item, [], POOL)).toMatchObject({
      kind: "recall",
      prompt: "Recall: Dot product",
      answer: "The dot product measures alignment.",
      checks: 0,
      choices: null,
      correct: null,
    });
  });

  it("describes a never-scheduled concept as a new card", () => {
    expect(toReviewItem({ ...item, card: null }, [], POOL)).toMatchObject({
      ease: null,
      repetitions: 0,
      lastReviewed: null,
      due: null,
    });
  });
});

describe("parseOnly", () => {
  it("reads a comma list of slugs, once each, and nothing else", async () => {
    const { parseOnly, MAX_ONLY } = await import("./review-queue");
    expect(parseOnly("softmax,dot-product")).toEqual(["softmax", "dot-product"]);
    expect(parseOnly(["a,b", "c"])).toEqual(["a", "b"]);
    expect(parseOnly(" a , a ,,b ")).toEqual(["a", "b"]);
    expect(parseOnly(undefined)).toBeNull();
    // Present but empty asks no card, rather than falling back to the queue.
    expect(parseOnly(",,")).toEqual([]);
    expect(parseOnly("")).toEqual([]);
    expect(parseOnly(`${"x".repeat(129)},ok`)).toEqual(["ok"]);
    expect(parseOnly(Array.from({ length: 20 }, (_, i) => `c${i}`).join(","))).toHaveLength(MAX_ONLY);
  });
});
