import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  GAP_THRESHOLD,
  MASTERY_THRESHOLD,
  entropy,
  expectedInfoGain,
  isMastered,
  masteryLabel,
  posterior,
  predictCorrect,
  transit,
  update,
  propagate,
  PROPAGATION_CEILING,
} from "./bkt.mjs";

describe("posterior", () => {
  it("raises belief on a correct answer and lowers it on a wrong one", () => {
    const prior = 0.5;
    expect(posterior(prior, true)).toBeGreaterThan(prior);
    expect(posterior(prior, false)).toBeLessThan(prior);
  });

  it("matches the BKT formula for a correct answer", () => {
    const { pG, pS } = DEFAULT_PARAMS;
    const pL = 0.4;
    const expected = (pL * (1 - pS)) / (pL * (1 - pS) + (1 - pL) * pG);
    expect(posterior(pL, true)).toBeCloseTo(expected, 12);
  });

  it("matches the BKT formula for a wrong answer", () => {
    const { pG, pS } = DEFAULT_PARAMS;
    const pL = 0.4;
    const expected = (pL * pS) / (pL * pS + (1 - pL) * (1 - pG));
    expect(posterior(pL, false)).toBeCloseTo(expected, 12);
  });

  it("stays inside [0,1] at the extremes", () => {
    for (const prior of [0, 1]) {
      for (const correct of [true, false]) {
        const p = posterior(prior, correct);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it("treats a high guess rate as weak evidence", () => {
    const strict = posterior(0.3, true, { pG: 0.05, pS: 0.1 });
    const guessy = posterior(0.3, true, { pG: 0.9, pS: 0.1 });
    expect(strict).toBeGreaterThan(guessy);
  });
});

describe("transit", () => {
  it("only ever moves belief upward", () => {
    expect(transit(0.5)).toBeGreaterThan(0.5);
    expect(transit(1)).toBe(1);
  });
});

describe("update", () => {
  it("applies the learning step only when the item was an opportunity", () => {
    const assessed = update(0.5, true, { opportunity: false });
    const taught = update(0.5, true, { opportunity: true });
    expect(taught).toBeGreaterThan(assessed);
    expect(assessed).toBeCloseTo(posterior(0.5, true), 12);
  });

  it("converges to mastery under repeated correct answers", () => {
    let pL = DEFAULT_PARAMS.pL0;
    for (let i = 0; i < 6; i += 1) pL = update(pL, true);
    expect(isMastered(pL)).toBe(true);
  });

  it("collapses to a gap under repeated wrong answers", () => {
    let pL = 0.9;
    for (let i = 0; i < 4; i += 1) pL = update(pL, false);
    expect(pL).toBeLessThan(GAP_THRESHOLD);
  });
});

describe("predictCorrect", () => {
  it("bottoms out at the guess rate and tops out at 1 minus slip", () => {
    expect(predictCorrect(0)).toBeCloseTo(DEFAULT_PARAMS.pG, 12);
    expect(predictCorrect(1)).toBeCloseTo(1 - DEFAULT_PARAMS.pS, 12);
  });
});

describe("entropy and information gain", () => {
  it("peaks at maximum uncertainty and vanishes at certainty", () => {
    expect(entropy(0.5)).toBeCloseTo(1, 12);
    expect(entropy(0)).toBe(0);
    expect(entropy(1)).toBe(0);
  });

  it("is never negative", () => {
    for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.99, 1]) {
      expect(expectedInfoGain(p)).toBeGreaterThanOrEqual(0);
    }
  });

  it("ranks an uncertain concept above a settled one", () => {
    // This ordering is what makes the probe a binary search rather than
    // a march through the syllabus.
    expect(expectedInfoGain(0.5)).toBeGreaterThan(expectedInfoGain(0.98));
    expect(expectedInfoGain(0.5)).toBeGreaterThan(expectedInfoGain(0.02));
  });
});

describe("masteryLabel", () => {
  it("labels the whole range", () => {
    expect(masteryLabel(MASTERY_THRESHOLD)).toBe("mastered");
    expect(masteryLabel(0.8)).toBe("solid");
    expect(masteryLabel(0.6)).toBe("shaky");
    expect(masteryLabel(0.45)).toBe("weak");
    expect(masteryLabel(0.1)).toBe("gap");
  });
});

describe("propagate", () => {
  it("moves belief less than a direct answer would", () => {
    const direct = update(0.25, true, { opportunity: false });
    const oneHop = propagate(0.25, true, 1);
    expect(oneHop).toBeGreaterThan(0.25);
    expect(oneHop).toBeLessThan(direct);
  });

  it("thins with every hop", () => {
    const [a, b, c] = [1, 2, 3].map((h) => propagate(0.25, true, h));
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0.25);
  });

  it("never confers mastery on its own", () => {
    let pL = 0.25;
    for (let i = 0; i < 200; i += 1) pL = propagate(pL, true, 1);
    expect(pL).toBeLessThanOrEqual(PROPAGATION_CEILING);
    expect(isMastered(pL)).toBe(false);
  });

  it("leaves a directly earned belief above the ceiling untouched", () => {
    expect(propagate(0.97, true, 1)).toBeCloseTo(0.97, 12);
  });

  it("returns the prior for the direct case", () => {
    expect(propagate(0.4, true, 0)).toBe(0.4);
  });
});
