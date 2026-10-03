import { describe, expect, it } from "vitest";

import { askTutorHref, normalize, rankAsk, type AskEntry } from "./ask-core";

const entry = (kind: AskEntry["kind"], title: string, extra: Partial<AskEntry> = {}): AskEntry => ({
  kind,
  key: `${kind}:${title}`,
  title,
  detail: null,
  href: `/${kind}/${title}`,
  ...extra,
});

const ENTRIES = [
  entry("concept", "Softmax"),
  entry("concept", "Self-attention", { aliases: ["self attention"] }),
  entry("module", "Randomized algorithms", { detail: "CS3230 · Module 6" }),
  entry("course", "Design and Analysis of Algorithms", { aliases: ["CS3230"] }),
  entry("video", "CS3230 week 5: randomized algorithms (narrated)"),
  entry("concept", "Attention weights"),
  entry("concept", "Café au lait spots"),
];

describe("rankAsk", () => {
  it("puts a whole-title match first, then a start, then a word start, then anywhere", () => {
    expect(rankAsk("attention", ENTRIES).map((e) => e.title)).toEqual(["Attention weights", "Self-attention"]);
    expect(rankAsk("randomized algorithms", ENTRIES).map((e) => e.kind)).toEqual(["module", "video"]);
  });

  it("matches every word in any order, aliases such as a course code, and folds accents and case", () => {
    expect(rankAsk("algorithms randomized", ENTRIES)[0]?.title).toBe("Randomized algorithms");
    expect(rankAsk("cs3230", ENTRIES).map((e) => e.kind)).toEqual(["course", "video"]);
    expect(rankAsk("CAFE", ENTRIES)[0]?.title).toBe("Café au lait spots");
  });

  it("matches nothing for under two characters or a miss, and stops at the limit", () => {
    expect(rankAsk("s", ENTRIES)).toEqual([]);
    expect(rankAsk("kalman filter", ENTRIES)).toEqual([]);
    expect(rankAsk("a", ENTRIES)).toEqual([]);
    expect(rankAsk("at", ENTRIES, 1)).toHaveLength(1);
  });

  it("normalizes punctuation to single spaces", () => {
    expect(normalize("  Self-attention: (Q, K, V)  ")).toBe("self attention q k v");
  });

  it("sends a miss to the tutor with the text as typed", () => {
    expect(askTutorHref("  Kalman filters & you ")).toBe("/ask?q=Kalman%20filters%20%26%20you");
    expect(askTutorHref("x".repeat(300))).toBe(`/ask?q=${"x".repeat(200)}`);
  });
});
