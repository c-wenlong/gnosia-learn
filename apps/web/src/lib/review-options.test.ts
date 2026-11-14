import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewQueueItem, StoredCheckDistractor } from "@hermes/catalog/state";
import { CHECK_OPTIONS_VERSION } from "@hermes/tutor/check-options";
import { parseChecks, type ConceptCheck } from "@hermes/tutor/concept-note-core";
import { checkHash, readWrittenOptions } from "@hermes/tutor/server/check-options";

import { toReviewItem } from "./review-queue";

/**
 * A review card's wrong options, as worked cases (docs/LEARN.md, "Wrong
 * options"): the review queue asks a card with the tutor's stored options
 * when their hash still fits the check (`readWrittenOptions`), else the
 * notes' (`toReviewItem`).
 */

const stored = vi.hoisted(() => ({ rows: [] as StoredCheckDistractor[] }));

vi.mock("@hermes/catalog/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hermes/catalog/state")>()),
  readCheckDistractors: vi.fn(async () => stored.rows),
}));

interface Card {
  name: string;
  conceptId: string;
  checks: ConceptCheck[];
  stored: { checkId: string; checkHash: string; options: string[] }[];
  expected: {
    kind: "check" | "recall";
    prompt: string;
    answer: string;
    choices: string[] | null;
    correct: number | null;
    wrong: "tutor" | "notes" | null;
  };
}

interface Fixture {
  checkOptionsVersion: number;
  hashes: { question: string; answer: string; hash: string }[];
  item: Omit<ReviewQueueItem, "conceptId" | "card">;
  pool: string[];
  cards: Card[];
  /** Note bodies, and the checks and hashes they read as: the parse the hash starts from. */
  notes: { name: string; body: string; checks: (ConceptCheck & { hash: string })[] }[];
}

const FIXTURE = resolve(__dirname, "fixtures/review-options.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

beforeEach(() => {
  stored.rows = [];
});

describe("a review card's wrong options", () => {
  it("hashes a check as the store keys it", () => {
    expect(fixture.checkOptionsVersion).toBe(CHECK_OPTIONS_VERSION);
    for (const h of fixture.hashes) expect(checkHash(h), JSON.stringify(h.question)).toBe(h.hash);
  });

  it.each(fixture.notes.map((n) => [n.name, n] as const))("reads a note's checks as the store keys them: %s", (_, n) => {
    const checks = parseChecks(n.body);
    expect(checks.map((c) => ({ ...c, hash: checkHash(c) }))).toEqual(n.checks);
  });

  it("covers the tutor's options, the notes' and recall", () => {
    expect(new Set(fixture.cards.map((c) => c.expected.wrong))).toEqual(new Set(["tutor", "notes", null]));
  });

  it.each(fixture.cards.map((c) => [c.name, c] as const))("%s", async (_, c) => {
    stored.rows = c.stored.map((s) => ({ conceptSlug: c.conceptId, model: null, provider: null, ...s }));
    const written = await readWrittenOptions({} as never, "local", [{ slug: c.conceptId, checks: c.checks }]);
    const item: ReviewQueueItem = { ...fixture.item, conceptId: c.conceptId, card: null };
    const built = toReviewItem(item, c.checks, fixture.pool, written.get(c.conceptId));
    expect({
      kind: built.kind,
      prompt: built.prompt,
      answer: built.answer,
      choices: built.choices,
      correct: built.correct,
      wrong: built.wrong ?? null,
    }).toEqual(c.expected);
  });
});
