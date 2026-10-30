import { describe, expect, it } from "vitest";

import { takeUnanswered } from "./unanswered";

/**
 * The unanswered learner turn every tutor chat's Try again sends back, and a
 * new question replaces: found past a studio marker, and the same object, so
 * an answer's verdict and request id go back with it.
 */

describe("takeUnanswered", () => {
  it("is null when the tutor had the last word, or nobody has spoken", () => {
    expect(takeUnanswered([])).toBeNull();
    expect(takeUnanswered([{ role: "user" }, { role: "assistant" }])).toBeNull();
    expect(takeUnanswered([{ role: "assistant" }, { role: "studio" }])).toBeNull();
  });

  it("takes the learner's last turn out, itself and not a copy", () => {
    const asked = { role: "assistant", content: "Why?" };
    const answer = { role: "user", content: "Because.", verdict: { requestId: "r1" } };
    const found = takeUnanswered([asked, answer]);
    expect(found?.turn).toBe(answer);
    expect(found?.rest).toEqual([asked]);
  });

  it("looks past a hand-off marker after it, and keeps the marker", () => {
    const question = { role: "user", content: "What is a SYN?" };
    const marker = { role: "studio", content: "@diagram the handshake" };
    const found = takeUnanswered([{ role: "assistant" }, question, marker]);
    expect(found?.turn).toBe(question);
    expect(found?.rest).toEqual([{ role: "assistant" }, marker]);
  });
});
