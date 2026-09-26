import { describe, expect, it } from "vitest";
import { courses } from "@/data/courses";
import {
  buildAgentSessionContext,
  buildConceptSessionContext,
  CONCEPT_BODY_LIMIT,
  conceptCitationSources,
  DEFAULT_AGENT_MODEL,
  type ConceptPromptInput,
} from "@/lib/agent/prompt";
import { buildLearningObjectives } from "@/lib/agent/objectives";
import { findTopicBySlugs } from "@/lib/agent/lookup";

describe("agent prompt builder", () => {
  const course = courses[0];
  const mod = course.modules[0];
  const topic = mod.topics[0];

  it("defaults to free cascade label", () => {
    expect(DEFAULT_AGENT_MODEL).toContain("NVIDIA");
    expect(DEFAULT_AGENT_MODEL).toContain("Gemini");
    expect(DEFAULT_AGENT_MODEL).toContain("OpenRouter");
  });

  it("builds objectives capped for micro-sessions", () => {
    const objectives = buildLearningObjectives(course, mod, topic);
    expect(objectives.length).toBeGreaterThan(0);
    expect(objectives.length).toBeLessThanOrEqual(6);
    expect(objectives[0]).toContain(topic.title);
  });

  it("embeds full context and end goals in the system prompt", () => {
    const session = buildAgentSessionContext(course, mod, topic, {
      learnerNote: "I struggle with affordances",
    });

    expect(session.model).toBe(DEFAULT_AGENT_MODEL);
    expect(session.systemPrompt).toContain(course.code);
    expect(session.systemPrompt).toContain(topic.title);
    expect(session.systemPrompt).toContain("Socratic");
    expect(session.systemPrompt).toContain(
      "What the learner should be able to answer by the end",
    );
    expect(session.systemPrompt).toContain("I struggle with affordances");
    expect(session.openingUserSeed).toContain(topic.title);
    expect(session.terminalCommand).toContain("NVIDIA");
    expect(session.objectives.length).toBeGreaterThan(0);
  });
});

describe("topic lookup", () => {
  it("resolves a topic by course/module/topic ids", () => {
    const course = courses[0];
    const mod = course.modules[0];
    const topic = mod.topics[0];
    const found = findTopicBySlugs(course.slug, mod.slug, topic.id);
    expect(found?.topic.id).toBe(topic.id);
    expect(found?.course.code).toBe(course.code);
  });

  it("returns undefined for unknown ids", () => {
    expect(findTopicBySlugs("nope", "nope", "nope")).toBeUndefined();
  });
});

describe("concept tutor prompt", () => {
  const input: ConceptPromptInput = {
    slug: "dot-product",
    title: "Dot product",
    summary: "Measures alignment.",
    body: "# Dot product\n\nThe sum of elementwise products.",
    place: "CP4281 · Module 2 · Transformations",
    requires: [{ slug: "vector", title: "Vector as a list of numbers", label: "Mastered" }],
    assumes: [],
    dependants: [{ slug: "attention", title: "Attention weights", label: "Not started" }],
    mastery: { pL: 0.42, label: "Learning", observations: 5, correct: 4, lastSeen: "2026-09-20T00:00:00Z", due: "2026-09-30T00:00:00Z" },
    recent: [{ at: "2026-09-20T00:00:00Z", correct: true, question: "Why zero?", pLAfter: 0.42 }],
    sources: ["https://example.org/dot", "Lecture 4 slides.pdf"],
  };

  it("grounds the prompt in the note, the neighbours and what the learner holds", () => {
    const { systemPrompt } = buildConceptSessionContext(input);
    expect(systemPrompt).toContain("Dot product");
    expect(systemPrompt).toContain("The sum of elementwise products.");
    expect(systemPrompt).toContain("Vector as a list of numbers (Mastered)");
    expect(systemPrompt).toContain("Attention weights (Not started)");
    expect(systemPrompt).toContain("p(L) 0.42 from 5 observations (4 correct)");
    expect(systemPrompt).toContain('correct on "Why zero?"');
    expect(systemPrompt).toContain("Socratic");
  });

  it("numbers the sources with the note first and asks for [n] citations", () => {
    const { systemPrompt, sources } = buildConceptSessionContext(input);
    expect(sources).toEqual([
      { n: 1, label: "Your note: Dot product", href: "/learn/dot-product" },
      { n: 2, label: "https://example.org/dot", href: "https://example.org/dot" },
      { n: 3, label: "Lecture 4 slides.pdf", href: null },
    ]);
    expect(systemPrompt).toContain("[1] Your note: Dot product");
    expect(systemPrompt).toContain("[3] Lecture 4 slides.pdf");
    expect(systemPrompt).toMatch(/square brackets, like \[1\]/);
  });

  it("clips a long note and says the body is missing when it is", () => {
    const long = buildConceptSessionContext({ ...input, body: "x".repeat(CONCEPT_BODY_LIMIT + 50) });
    expect(long.systemPrompt).toContain("[note truncated]");
    const none = buildConceptSessionContext({ ...input, body: null });
    expect(none.systemPrompt).toContain("could not be read");
  });

  it("suggests three questions, one of them a check", () => {
    const { suggestions } = buildConceptSessionContext(input);
    expect(suggestions).toHaveLength(3);
    expect(suggestions).toContain("Give me a check");
    expect(suggestions[1]).toContain("vector as a list of numbers");
    expect(conceptCitationSources({ slug: "x", title: "X", sources: [] })).toHaveLength(1);
  });

  it("leaves the topic path unchanged", () => {
    const course = courses[0];
    const session = buildAgentSessionContext(course, course.modules[0], course.modules[0].topics[0]);
    expect(session.systemPrompt).not.toContain("Sources you may cite");
  });
});
