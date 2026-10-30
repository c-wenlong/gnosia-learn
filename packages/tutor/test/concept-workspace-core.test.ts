import type { KbConcept, KnowledgeBase } from "@gnosia/catalog/state";
import { describe, expect, it } from "vitest";

import {
  buildConceptWorkspace,
  checkStatuses,
  historyBars,
  isConceptSlug,
  noteBody,
  observationsOf,
  placeLabel,
  toConceptPromptInput,
  type WorkspaceEvent,
  type WorkspaceInput,
} from "../src/concept-workspace-core";

const concept = (id: string, over: Partial<KbConcept> = {}): KbConcept => ({
  id,
  title: id.replace(/-/g, " "),
  summary: `${id} summary`,
  requires: [],
  assumes: [],
  pL: 0.2,
  mastery: "weak",
  observations: 0,
  correct: 0,
  lastSeen: null,
  due: null,
  lapses: 0,
  leech: false,
  topics: [],
  positions: {},
  domain: "foundations",
  topic: "foundations",
  ...over,
});

const kb: KnowledgeBase = {
  indexedAt: null,
  stats: { total: 4, mastered: 0, learning: 1, untouched: 3 },
  frontier: ["dot-product"],
  concepts: [
    concept("vector", { mastery: "mastered", pL: 0.97, observations: 3, correct: 3 }),
    concept("dot-product", { requires: ["vector"], observations: 2, correct: 1, pL: 0.55, mastery: "shaky" }),
    concept("attention", { requires: ["dot-product"] }),
    concept("block", { assumes: ["dot-product"] }),
  ],
  edges: [
    { from: "vector", to: "dot-product", kind: "requires" },
    { from: "dot-product", to: "attention", kind: "requires" },
    { from: "dot-product", to: "block", kind: "assumes" },
  ],
};

const events: WorkspaceEvent[] = [
  { at: "2026-09-01T00:00:00Z", type: "observation", concept: "dot-product", session: "s1", correct: false, pLAfter: 0.1, question: "Why is it zero for perpendicular vectors?" },
  { at: "2026-09-02T00:00:00Z", type: "observation", concept: "dot-product", session: "s2", correct: true, pLAfter: 0.9, question: "voided one" },
  { at: "2026-09-02T01:00:00Z", type: "void", session: "s2" },
  { at: "2026-09-03T00:00:00Z", type: "observation", concept: "dot-product", session: "s3", correct: true, pLAfter: 0.55, question: "why is it ZERO for  perpendicular vectors?" },
  { at: "2026-09-03T00:00:01Z", type: "observation", concept: "vector", correct: true, pLAfter: 0.97 },
  { at: "2026-09-04T00:00:00Z", type: "review", concept: "dot-product", grade: 3 },
];

const input = (over: Partial<WorkspaceInput> = {}): WorkspaceInput => ({
  kb,
  slug: "dot-product",
  note: { available: true, path: "learn/concepts/foundations/dot-product.md", source: "---\nid: dot-product\n---\n\n# Dot product\n\nBody text." },
  frontmatter: { sources: ["https://example.org/dot"], tags: [] },
  checks: [
    { id: "c1", question: "Why is it zero for perpendicular vectors?", answer: "", why: "", source: "" },
    { id: "c2", question: "Never asked", answer: "", why: "", source: "" },
  ],
  events,
  card: {
    conceptId: "dot-product",
    repetitions: 1,
    ease: 2.5,
    intervalDays: 4,
    lapses: 0,
    due: "2026-09-30T00:00:00Z",
    lastReviewed: null,
    leech: false,
    history: [],
  },
  assets: [
    { id: "note:learn/concepts/foundations/dot-product.md", kind: "note", path: "learn/concepts/foundations/dot-product.md", url: null, bytes: 1, title: "Dot product", sourceRepo: "gnosia" },
    { id: "diagram:learn/assets/dot-product.svg", kind: "diagram_svg", path: "learn/assets/dot-product.svg", url: null, bytes: 1, title: null, sourceRepo: "gnosia" },
  ],
  place: {
    courseSlug: "cp4281",
    courseCode: "CP4281",
    courseTitle: "Graphics",
    moduleSlug: "m2",
    moduleOrder: 2,
    moduleTitle: "Transformations",
    topicId: "cp4281-m2-t1",
    topicTitle: "Transformations",
  },
  ...over,
});

describe("buildConceptWorkspace", () => {
  it("returns null for a concept the knowledge base does not hold", () => {
    expect(buildConceptWorkspace(input({ slug: "ghost" }))).toBeNull();
  });

  it("splits neighbours into prerequisites, dependants and backlinks", () => {
    const w = buildConceptWorkspace(input())!;
    expect(w.requires.map((r) => r.slug)).toEqual(["vector"]);
    expect(w.requires[0].bucket).toBe("mastered");
    // Dependants are hard edges only; backlinks take background ones too.
    expect(w.dependants.map((r) => r.slug)).toEqual(["attention"]);
    expect(w.backlinks.map((r) => r.slug)).toEqual(["attention", "block"]);
    expect(w.graph.nodes.map((n) => n.id).sort()).toEqual(["attention", "block", "dot-product", "vector"]);
    expect(w.frontier).toBe(true);
  });

  it("leaves the concept's own note out of its assets", () => {
    const w = buildConceptWorkspace(input())!;
    expect(w.assets.map((a) => a.kind)).toEqual(["diagram_svg"]);
  });

  it("builds history from direct observations outside voided sessions", () => {
    const w = buildConceptWorkspace(input())!;
    expect(w.history.map((h) => h.pLAfter)).toEqual([0.1, 0.55]);
    expect(historyBars(w.history)).toEqual([0.1, 0.55]);
    expect(w.review).toMatchObject({ intervalDays: 4, ease: 2.5 });
  });

  it("marks a check by the latest observation asking its question", () => {
    const w = buildConceptWorkspace(input())!;
    expect(w.checks.map((c) => c.status)).toEqual(["passed", "untried"]);
  });
});

describe("checkStatuses and observationsOf", () => {
  it("a later wrong answer turns a passed check to missed", () => {
    const history = observationsOf(
      [
        ...events,
        { at: "2026-09-05T00:00:00Z", type: "observation", concept: "dot-product", correct: false, question: "Why is it zero for perpendicular vectors?" },
      ],
      "dot-product",
    );
    const [c] = checkStatuses([{ id: "c1", question: "Why is it zero for perpendicular vectors?", answer: "", why: "", source: "" }], history);
    expect(c.status).toBe("missed");
  });

  it("keeps only six bars", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ at: `2026-09-0${i + 1}T00:00:00Z`, correct: true, pLBefore: null, pLAfter: i / 10, question: null, source: null }));
    expect(historyBars(many)).toHaveLength(6);
  });
});

describe("the concept context for the tutor", () => {
  it("carries the note body without its frontmatter, the neighbours, mastery and recent answers", () => {
    const p = toConceptPromptInput(buildConceptWorkspace(input())!);
    expect(p.body).toBe("# Dot product\n\nBody text.");
    expect(p.place).toBe("CP4281 · Module 2 · Transformations");
    expect(p.requires).toEqual([{ slug: "vector", title: "vector", label: "Mastered" }]);
    expect(p.dependants.map((d) => d.slug)).toEqual(["attention"]);
    expect(p.mastery).toMatchObject({ pL: 0.55, label: "Learning", observations: 2, due: "2026-09-30T00:00:00Z" });
    expect(p.recent.map((r) => r.correct)).toEqual([false, true]);
    expect(p.sources).toEqual(["https://example.org/dot"]);
  });

  it("has no body when the note file could not be read", () => {
    const p = toConceptPromptInput(
      buildConceptWorkspace(input({ note: { available: false, code: "too-large", message: "too big" } }))!,
    );
    expect(p.body).toBeNull();
  });
});

describe("helpers", () => {
  it("accepts only concept ids", () => {
    expect(isConceptSlug("dot-product")).toBe(true);
    expect(isConceptSlug("Dot")).toBe(false);
    expect(isConceptSlug("../etc")).toBe(false);
    expect(isConceptSlug("a%2Fb")).toBe(false);
    expect(isConceptSlug(42)).toBe(false);
  });

  it("strips frontmatter and names a place", () => {
    expect(noteBody("no frontmatter")).toBe("no frontmatter");
    expect(noteBody("---\nunclosed")).toBe("---\nunclosed");
    expect(placeLabel(null)).toBeNull();
  });
});
