import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewQueueItem, StoredCheckDistractor } from "@gnosia/catalog/state";
import { CHECK_OPTIONS_VERSION } from "@gnosia/tutor/check-options";
import type { ConceptCheck } from "@gnosia/tutor/concept-note-core";
import { checkHash, readWrittenOptions } from "@gnosia/tutor/server/check-options";

import { toReviewItem } from "./review-queue";

/**
 * A review card's wrong options, one fixture for two languages
 * (docs/LEARN.md, "Wrong options"). The macOS app builds its review cards
 * from the catalog snapshot, which mirrors `check_distractor`
 * (apps/macos/scripts/catalog-snapshot.mjs), and its port of the hash match
 * in `readWrittenOptions` and of `toReviewItem` (StoredCheckOptions.swift,
 * LearnModel.swift) has to ask a card as the web's review queue does: the
 * tutor's stored options when they still fit the check, else the notes'.
 * apps/macos/Tests/GnosiaTests/ReviewOptionsTests.swift asserts the port
 * against this same file; this half holds the file to the web.
 */

const stored = vi.hoisted(() => ({ rows: [] as StoredCheckDistractor[] }));

vi.mock("@gnosia/catalog/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@gnosia/catalog/state")>()),
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
}

const FIXTURE = resolve(__dirname, "../../../macos/Tests/GnosiaTests/Fixtures/review-options.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

beforeEach(() => {
  stored.rows = [];
});

describe("the review-options contract with the macOS app", () => {
  it("hashes a check as the store keys it", () => {
    expect(fixture.checkOptionsVersion).toBe(CHECK_OPTIONS_VERSION);
    for (const h of fixture.hashes) expect(checkHash(h), JSON.stringify(h.question)).toBe(h.hash);
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
