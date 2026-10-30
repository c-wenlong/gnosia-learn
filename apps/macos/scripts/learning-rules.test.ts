import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { confidenceGrade, LOW_CONFIDENCE } from "../../../services/catalog/src/state/observe";
// @ts-expect-error: plain ESM with no declarations; vitest runs it as it is.
import { DEFAULT_PARAMS, PROPAGATION_CEILING, PROPAGATION_DECAY, propagate, update } from "../../../scripts/learn/lib/bkt.mjs";
// @ts-expect-error: as above.
import { DEFAULT_EASE, gradeFromOutcome, LEECH_THRESHOLD, MAX_INTERVAL_DAYS, MIN_EASE, PASS_GRADE, review } from "../../../scripts/learn/lib/schedule.mjs";

/**
 * The learning rules the macOS app runs itself (S9-06): BKT, propagation,
 * the SM-2 grade and card, and the confidence rule. The app shows its own
 * numbers the moment an answer lands, before the catalog has them, so its
 * Swift port has to compute what the catalog will record.
 *
 * One fixture for two languages: this half writes every case's expected
 * value from the TypeScript and JavaScript sources the catalog uses, and
 * apps/macos/Tests/GnosiaTests/LearningRulesTests.swift asserts the Swift
 * port against the same file. A rule change here fails this test until the
 * fixture is regenerated (`UPDATE_RULES_FIXTURE=1`), and then fails the Swift
 * suite until the port follows.
 */

const FIXTURE = resolve(__dirname, "../Tests/GnosiaTests/Fixtures/learning-rules.json");

interface Card {
  repetitions: number;
  ease: number;
  intervalDays: number;
  lapses: number;
}

const priors = [0, 0.05, 0.25, 0.5, 0.7, 0.89, 0.9, 0.95, 1];
const cards: (Card | null)[] = [
  null,
  { repetitions: 0, ease: 2.5, intervalDays: 0, lapses: 0 },
  { repetitions: 1, ease: 2.5, intervalDays: 1, lapses: 0 },
  { repetitions: 2, ease: 2.36, intervalDays: 6, lapses: 1 },
  { repetitions: 2, ease: 2.5, intervalDays: 0, lapses: 0 },
  { repetitions: 5, ease: 1.3, intervalDays: 40, lapses: 3 },
  { repetitions: 9, ease: 2.9, intervalDays: 20000, lapses: 0 },
];

function build() {
  const params = DEFAULT_PARAMS as { pL0: number; pT: number; pG: number; pS: number };
  return {
    constants: {
      params,
      propagationDecay: PROPAGATION_DECAY,
      propagationCeiling: PROPAGATION_CEILING,
      lowConfidence: LOW_CONFIDENCE,
      minEase: MIN_EASE,
      defaultEase: DEFAULT_EASE,
      passGrade: PASS_GRADE,
      leechThreshold: LEECH_THRESHOLD,
      maxIntervalDays: MAX_INTERVAL_DAYS,
    },
    update: priors.flatMap((prior) =>
      [true, false].flatMap((correct) =>
        [true, false].map((opportunity) => ({ prior, correct, opportunity, expect: update(prior, correct, { opportunity }) as number })),
      ),
    ),
    propagate: priors.flatMap((prior) => [0, 1, 2, 3].map((hops) => ({ prior, hops, expect: propagate(prior, true, hops) as number }))),
    grade: priors.flatMap((pL) => [true, false].map((correct) => ({ correct, pL, expect: gradeFromOutcome(correct, pL) as number }))),
    confidence: [0.2, 0.75, 0.95].flatMap((pL) =>
      [true, false].flatMap((correct) =>
        [null, 0, 30, 31, 100].map((confidence) => ({
          correct,
          confidence,
          pL,
          expect: confidenceGrade(correct, confidence ?? undefined, pL),
        })),
      ),
    ),
    review: cards.flatMap((card) =>
      [0, 1, 2, 3, 4, 5].map((grade) => {
        const next = review(card ?? { conceptId: "x" }, grade, { now: new Date(0) }) as Card & { leech: boolean };
        return {
          card,
          grade,
          expect: { repetitions: next.repetitions, ease: next.ease, intervalDays: next.intervalDays, lapses: next.lapses, leech: next.leech },
        };
      }),
    ),
  };
}

describe("the learning rules fixture the macOS port is held to", () => {
  it("is what the catalog's own rules compute", () => {
    const fresh = build();
    if (process.env.UPDATE_RULES_FIXTURE === "1") writeFileSync(FIXTURE, `${JSON.stringify(fresh, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(fresh);
  });
});
