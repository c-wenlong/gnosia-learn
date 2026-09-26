import { describe, expect, it } from "vitest";

import { citedNumbers, parseThread, threadKey, trimForRequest, type TutorTurn } from "@/lib/tutor-thread";

describe("tutor thread", () => {
  it("keys the thread per concept", () => {
    expect(threadKey("dot-product")).toBe("self-learn:tutor:dot-product");
  });

  it("reads back only well-formed turns", () => {
    expect(parseThread(null)).toEqual([]);
    expect(parseThread("not json")).toEqual([]);
    expect(parseThread('{"role":"user"}')).toEqual([]);
    expect(
      parseThread(JSON.stringify([{ role: "user", content: "hi" }, { role: "system", content: "x" }, { role: "assistant" }])),
    ).toEqual([{ role: "user", content: "hi" }]);
  });

  it("finds the citations a reply uses, known numbers only, in first-use order", () => {
    expect(citedNumbers("As the note says [2]. Also [1, 3] and [1][2].", [1, 2, 3])).toEqual([2, 1, 3]);
    expect(citedNumbers("A made-up source [7], and an array a[0].", [1, 2])).toEqual([]);
    expect(citedNumbers("No citations here.", [1])).toEqual([]);
  });

  it("trims a long thread from the front and starts on a user turn", () => {
    const turns: TutorTurn[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const kept = trimForRequest(turns, { maxMessages: 5 });
    expect(kept.length).toBeLessThanOrEqual(5);
    expect(kept[0].role).toBe("user");
    expect(kept[kept.length - 1]).toEqual(turns[49]);

    const big: TutorTurn[] = [
      { role: "user", content: "x".repeat(15_000) },
      { role: "assistant", content: "y".repeat(10_000) },
      { role: "user", content: "last" },
    ];
    expect(trimForRequest(big)).toEqual([{ role: "user", content: "last" }]);
  });
});
