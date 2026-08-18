import { describe, expect, it } from "vitest";
import {
  DEFAULT_EASE,
  LEECH_THRESHOLD,
  MIN_EASE,
  dueCards,
  forecast,
  gradeFromOutcome,
  newCard,
  nextEase,
  review,
} from "./schedule.mjs";

const AT = new Date("2026-08-17T09:00:00.000Z");
const opts = { now: AT, fuzz: false };

describe("newCard", () => {
  it("starts due immediately with the default ease", () => {
    const card = newCard("softmax", AT);
    expect(card.ease).toBe(DEFAULT_EASE);
    expect(card.repetitions).toBe(0);
    expect(card.due).toBe(AT.toISOString());
  });
});

describe("nextEase", () => {
  it("raises ease on a perfect answer and lowers it on a hard one", () => {
    expect(nextEase(2.5, 5)).toBeGreaterThan(2.5);
    expect(nextEase(2.5, 3)).toBeLessThan(2.5);
  });

  it("matches the SM-2 formula", () => {
    const q = 4;
    const expected = 2.5 + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    expect(nextEase(2.5, q)).toBeCloseTo(expected, 12);
  });

  it("never falls below the floor", () => {
    let ease = DEFAULT_EASE;
    for (let i = 0; i < 20; i += 1) ease = nextEase(ease, 0);
    expect(ease).toBe(MIN_EASE);
  });
});

describe("review", () => {
  it("walks the SM-2 interval ladder: 1 day, 6 days, then ease-scaled", () => {
    let card = newCard("c", AT);
    card = review(card, 4, opts);
    expect(card.intervalDays).toBe(1);
    card = review(card, 4, opts);
    expect(card.intervalDays).toBe(6);
    const third = review(card, 4, opts);
    expect(third.intervalDays).toBe(Math.round(6 * third.ease));
  });

  it("resets the interval and counts a lapse on a failing grade", () => {
    let card = newCard("c", AT);
    card = review(card, 5, opts);
    card = review(card, 5, opts);
    expect(card.repetitions).toBe(2);

    const lapsed = review(card, 1, opts);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.lapses).toBe(1);
  });

  it("flags a card as a leech after repeated lapses", () => {
    let card = newCard("c", AT);
    for (let i = 0; i < LEECH_THRESHOLD; i += 1) card = review(card, 0, opts);
    expect(card.leech).toBe(true);
  });

  it("does not mutate the card it was given", () => {
    const card = newCard("c", AT);
    const before = JSON.stringify(card);
    review(card, 5, opts);
    expect(JSON.stringify(card)).toBe(before);
  });

  it("sets the due date interval days into the future", () => {
    const card = review(newCard("c", AT), 4, opts);
    const days = (new Date(card.due) - AT) / 86400000;
    expect(days).toBeCloseTo(card.intervalDays, 6);
  });

  it("caps the stored history so a long-lived card cannot grow without bound", () => {
    let card = newCard("c", AT);
    for (let i = 0; i < 40; i += 1) card = review(card, 4, opts);
    expect(card.history.length).toBeLessThanOrEqual(20);
  });

  it("clamps out-of-range grades instead of throwing", () => {
    expect(() => review(newCard("c", AT), 99, opts)).not.toThrow();
    expect(review(newCard("c", AT), -5, opts).lapses).toBe(1);
  });
});

describe("dueCards", () => {
  const reviews = {
    cards: {
      overdue: { ...newCard("overdue"), due: "2026-08-10T00:00:00.000Z" },
      today: { ...newCard("today"), due: "2026-08-17T08:00:00.000Z" },
      later: { ...newCard("later"), due: "2026-09-01T00:00:00.000Z" },
    },
  };

  it("returns only what is due, most overdue first", () => {
    const ids = dueCards(reviews, { now: AT }).map((c) => c.conceptId);
    expect(ids).toEqual(["overdue", "today"]);
  });

  it("respects a limit", () => {
    expect(dueCards(reviews, { now: AT, limit: 1 })).toHaveLength(1);
  });

  it("handles an empty queue", () => {
    expect(dueCards({}, { now: AT })).toEqual([]);
  });
});

describe("forecast", () => {
  it("counts overdue separately from the upcoming days", () => {
    const reviews = {
      cards: {
        a: { ...newCard("a"), due: "2026-08-01T00:00:00.000Z" },
        b: { ...newCard("b"), due: "2026-08-17T12:00:00.000Z" },
        c: { ...newCard("c"), due: "2026-08-19T12:00:00.000Z" },
      },
    };
    const f = forecast(reviews, { now: AT, days: 7 });
    expect(f.overdue).toBe(1);
    expect(f.buckets[0]).toBe(1);
    expect(f.buckets[2]).toBe(1);
  });
});

describe("gradeFromOutcome", () => {
  it("maps confident correct answers to high grades", () => {
    expect(gradeFromOutcome(true, 0.95)).toBe(5);
    expect(gradeFromOutcome(true, 0.8)).toBe(4);
    expect(gradeFromOutcome(true, 0.5)).toBe(3);
  });

  it("keeps wrong answers below the passing grade", () => {
    expect(gradeFromOutcome(false, 0.9)).toBeLessThan(3);
    expect(gradeFromOutcome(false, 0.1)).toBeLessThan(3);
  });
});
