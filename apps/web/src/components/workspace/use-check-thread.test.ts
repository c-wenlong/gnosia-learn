import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import type { Verdict } from "@gnosia/tutor/tutor-check";

import { slotPlan, type CheckItem } from "./use-check-thread";

const verdict = (requestId: string) => ({ requestId, question: "Why?" }) as unknown as Verdict;

describe("slotPlan", () => {
  it("places each typed answer's row under the tutor's reply, or under the answer until it comes, in one pass", () => {
    const items: (CheckItem & { concept?: string })[] = [
      { role: "assistant", content: "Q1", check: { question: "Q1", concept: "a" } },
      { role: "user", content: "A1", verdict: verdict("r1") },
      { role: "assistant", content: "Right. Q2", check: { question: "Q2", concept: "b" } },
      { role: "user", content: "A2", verdict: verdict("r2") },
    ];
    const plan = slotPlan(items, (asked) => asked.check?.concept ?? null);
    expect([...plan.rowsAfter]).toEqual([
      [2, { at: 1, verdict: verdict("r1"), concept: "a" }],
      [3, { at: 3, verdict: verdict("r2"), concept: "b" }],
    ]);
    expect(plan.lastVerdict).toBe(3);
  });

  it("leaves a recall card's answer to its card, though it is still the newest verdict", () => {
    const items: CheckItem[] = [
      { role: "assistant", content: "Q", check: { question: "Q" } },
      { role: "user", content: "words", verdict: verdict("r1"), recall: { answer: "words", confidence: 50, thinking: null } },
    ];
    const plan = slotPlan(items, () => "a");
    expect(plan.rowsAfter.size).toBe(0);
    expect(plan.lastVerdict).toBe(1);
  });
});
