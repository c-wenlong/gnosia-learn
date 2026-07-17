import { describe, expect, it } from "vitest";
import { courses } from "@/data/courses";
import {
  buildAgentSessionContext,
  DEFAULT_AGENT_MODEL,
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
