import { describe, expect, it } from "vitest";

import {
  buildChoices,
  cardEyebrow,
  cardStats,
  formatAgo,
  formatDue,
  formatInterval,
  isRating,
  minutesLeft,
  queueDomain,
  RATING_IF_CORRECT,
  RATING_IF_WRONG,
  RATING_LABEL,
  recallPrompt,
  seedOf,
} from "./review-core";

describe("the ratings", () => {
  it("are Again, Hard, Good, Easy at 0 to 3, and nothing else is one", () => {
    expect(RATING_LABEL).toEqual(["Again", "Hard", "Good", "Easy"]);
    expect([0, 1, 2, 3].every(isRating)).toBe(true);
    for (const bad of [-1, 4, 1.5, "2", null, undefined]) expect(isRating(bad)).toBe(false);
  });

  it("grade a check card Good when right and Again when wrong", () => {
    expect(RATING_LABEL[RATING_IF_CORRECT]).toBe("Good");
    expect(RATING_LABEL[RATING_IF_WRONG]).toBe("Again");
  });
});

describe("buildChoices", () => {
  const pool = ["Wrong one.", "Wrong two.", "Wrong three.", "Wrong four.", "Wrong five."];

  it("puts the answer among three wrong options and says where", () => {
    const built = buildChoices("softmax", "The right one.", pool);
    expect(built).not.toBeNull();
    expect(built?.choices).toHaveLength(4);
    expect(built?.choices[built.correct]).toBe("The right one.");
    expect(new Set(built?.choices).size).toBe(4);
  });

  it("is the same for the same concept, so the server and the browser agree", () => {
    expect(buildChoices("softmax", "The right one.", pool)).toEqual(buildChoices("softmax", "The right one.", pool));
  });

  it("draws from the front of the pool, best distractors first", () => {
    const built = buildChoices("softmax", "The right one.", pool);
    for (const choice of built?.choices ?? []) {
      expect(["The right one.", ...pool.slice(0, 6)]).toContain(choice);
    }
  });

  it("drops blanks and anything that repeats the answer, whitespace and case aside", () => {
    const built = buildChoices("x", "The right one.", ["", "  the RIGHT   one. ", "A.", "B.", "B."]);
    expect(built?.choices.sort()).toEqual(["A.", "B.", "The right one."]);
  });

  it("gives up below two wrong options, and on an empty answer", () => {
    expect(buildChoices("x", "Answer.", ["Only one."])).toBeNull();
    expect(buildChoices("x", "  ", pool)).toBeNull();
  });

  it("spreads the right answer across positions over many concepts", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 40; i += 1) positions.add(buildChoices(`concept-${i}`, "Answer.", pool)?.correct ?? -1);
    expect(positions.size).toBe(4);
    expect(seedOf("a")).not.toBe(seedOf("b"));
  });
});

describe("formatting", () => {
  it("writes intervals the way the hi-fi does, compact on a phone", () => {
    expect(formatInterval(1)).toBe("1 day");
    expect(formatInterval(4)).toBe("4 days");
    expect(formatInterval(4, true)).toBe("4d");
    expect(formatInterval(45)).toBe("2 months");
    expect(formatInterval(45, true)).toBe("2mo");
    expect(formatInterval(30)).toBe("30 days");
    expect(formatInterval(400)).toBe("1.1 years");
    expect(formatInterval(365, true)).toBe("1y");
  });

  const now = new Date(2026, 8, 26, 10, 0);

  it("says when a card was last seen on the calendar, not by 24-hour blocks", () => {
    expect(formatAgo(new Date(2026, 8, 26, 1, 0).toISOString(), now)).toBe("today");
    expect(formatAgo(new Date(2026, 8, 25, 23, 0).toISOString(), now)).toBe("yesterday");
    expect(formatAgo(new Date(2026, 8, 22, 12, 0).toISOString(), now)).toBe("4 days ago");
    expect(formatAgo(null, now)).toBeNull();
    expect(formatAgo("not a date", now)).toBeNull();
  });

  it("says when the next card is due", () => {
    expect(formatDue(new Date(2026, 8, 26, 20, 0).toISOString(), now)).toBe("today");
    expect(formatDue(new Date(2026, 8, 27, 1, 0).toISOString(), now)).toBe("tomorrow");
    expect(formatDue(new Date(2026, 8, 29, 1, 0).toISOString(), now)).toBe("in 3 days");
    expect(formatDue(new Date(2026, 9, 10, 1, 0).toISOString(), now)).toBe("10 Oct");
    expect(formatDue(null, now)).toBeNull();
  });

  it("estimates half a minute a card, rounded up", () => {
    expect(minutesLeft(0)).toBe(0);
    expect(minutesLeft(1)).toBe(1);
    expect(minutesLeft(12)).toBe(6);
    expect(minutesLeft(13)).toBe(7);
  });

  it("names the queue's domain only when one dominates", () => {
    expect(queueDomain(["algorithms", "algorithms"])).toBe("algorithms");
    expect(queueDomain(["algorithms", "algorithms", "agents"])).toBe("mostly algorithms");
    expect(queueDomain(["algorithms", "agents"])).toBeNull();
    expect(queueDomain([null, null])).toBeNull();
  });

  it("prints the card line from the SM-2 state, or says the card is new", () => {
    expect(
      cardStats({ ease: 2.5, repetitions: 4, lastReviewed: new Date(2026, 8, 22, 9).toISOString() }, now),
    ).toBe("ease 2.5 · 4 reps · last seen 4 days ago");
    expect(cardStats({ ease: 2.36, repetitions: 1, lastReviewed: null }, now)).toBe("ease 2.36 · 1 rep");
    expect(cardStats({ ease: null, repetitions: 0, lastReviewed: null }, now)).toBe("new card");
  });
});

describe("cardEyebrow", () => {
  const card = { title: "Transformer block", leech: false };

  it("leaves it out when a recall prompt already names the concept", () => {
    expect(cardEyebrow({ ...card, kind: "recall", prompt: recallPrompt(card.title) })).toBeNull();
  });

  it("names the concept over a check's question", () => {
    expect(cardEyebrow({ ...card, kind: "check", prompt: "What does it stack?" })).toBe(
      "Check · Transformer block",
    );
  });

  it("names the concept over a recall card that kept its check's question", () => {
    // A check whose answer cannot become choices is a recall card whose prompt
    // is still the question, so the label is the only place the concept is named.
    expect(cardEyebrow({ ...card, kind: "recall", prompt: "What does it stack?" })).toBe(
      "Recall · Transformer block",
    );
  });

  it("says a leech keeps slipping, even when the prompt names the concept", () => {
    expect(cardEyebrow({ ...card, leech: true, kind: "recall", prompt: recallPrompt(card.title) })).toBe("Keeps slipping");
    expect(cardEyebrow({ ...card, leech: true, kind: "check", prompt: "Why?" })).toBe(
      "Check · Transformer block · Keeps slipping",
    );
  });
});
