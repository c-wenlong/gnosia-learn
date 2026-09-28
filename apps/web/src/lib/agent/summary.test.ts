import { describe, expect, it, vi } from "vitest";
import { getCourses } from "@/data/courses";
import {
  buildSummarySystemPrompt,
  formatKnowledgeMarkdown,
  formatPriorKnowledgeBlock,
  formatTranscript,
  parseKnowledgeResponse,
} from "@/lib/agent/summary";
import { buildAgentSessionContext } from "@/lib/agent/prompt";
import type { TopicKnowledge } from "@/lib/types";

// The app reads courses from the database only; this suite tests logic over
// real course data, so it reads the export tree instead (`@/test/content-files`).
vi.mock("@/data/source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/source")>()),
  contentSource: (await import("@/test/content-files")).fileContentSource,
}));

// Read once for the file: the list is per request in the app, and a test file is one request.
const courses = await getCourses();

const course = courses[0];
const mod = course.modules[0];
const topic = mod.topics[0];

const knowledge: TopicKnowledge = {
  topicId: topic.id,
  summary: "You established the core distinction and defended it with an example.",
  keyPoints: ["Point one", "Point two"],
  misconceptions: ["Confused A with B"],
  openQuestions: ["How does this scale?"],
  source: "agent",
  updatedAt: "2026-03-14T09:30:00.000Z",
  sessions: 2,
};

describe("summary system prompt", () => {
  it("embeds the topic context and demands bare JSON", () => {
    const prompt = buildSummarySystemPrompt(course, mod, topic);
    expect(prompt).toContain(course.code);
    expect(prompt).toContain(topic.title);
    expect(prompt).toContain('"openQuestions"');
    expect(prompt).toContain("no markdown fences");
  });
});

describe("formatTranscript", () => {
  it("labels speakers so the summariser can tell them apart", () => {
    const out = formatTranscript([
      { role: "assistant", content: "What is attention?" },
      { role: "user", content: "A weighted average." },
    ]);
    expect(out).toContain("TUTOR: What is attention?");
    expect(out).toContain("LEARNER: A weighted average.");
  });
});

describe("parseKnowledgeResponse", () => {
  it("parses a clean JSON object", () => {
    const parsed = parseKnowledgeResponse(
      JSON.stringify({
        summary: "You got it.",
        keyPoints: ["a", "b"],
        misconceptions: [],
        openQuestions: ["c"],
      }),
    );
    expect(parsed?.summary).toBe("You got it.");
    expect(parsed?.keyPoints).toEqual(["a", "b"]);
    expect(parsed?.openQuestions).toEqual(["c"]);
    expect(parsed?.source).toBe("agent");
  });

  it("recovers JSON from markdown fences and surrounding prose", () => {
    const parsed = parseKnowledgeResponse(
      'Sure! Here is the recap:\n```json\n{"summary":"Fenced.","keyPoints":["x"]}\n```\nHope that helps.',
    );
    expect(parsed?.summary).toBe("Fenced.");
    expect(parsed?.keyPoints).toEqual(["x"]);
  });

  it("accepts a newline-joined string where a list was expected", () => {
    const parsed = parseKnowledgeResponse(
      '{"summary":"S","keyPoints":"- first\\n- second"}',
    );
    expect(parsed?.keyPoints).toEqual(["first", "second"]);
  });

  it("returns null for unusable responses", () => {
    expect(parseKnowledgeResponse("I could not summarise that.")).toBeNull();
    expect(parseKnowledgeResponse("{not json}")).toBeNull();
    expect(
      parseKnowledgeResponse('{"summary":"","keyPoints":[]}'),
    ).toBeNull();
  });
});

describe("prior knowledge in the tutor prompt", () => {
  it("is absent on a first visit", () => {
    const session = buildAgentSessionContext(course, mod, topic);
    expect(session.systemPrompt).not.toContain("already established");
    expect(session.openingUserSeed).toContain("Start the micro-session");
  });

  it("injects the recap and switches to resume mode on a return visit", () => {
    const session = buildAgentSessionContext(course, mod, topic, {
      priorKnowledge: knowledge,
    });
    expect(session.systemPrompt).toContain("already established");
    expect(session.systemPrompt).toContain("Point one");
    expect(session.systemPrompt).toContain("How does this scale?");
    expect(session.systemPrompt).toContain("RETURN visit");
    expect(session.systemPrompt).not.toContain(
      "Open with a 2–4 sentence framing",
    );
    expect(session.openingUserSeed).toContain("Resume my micro-session");
  });

  it("dates the recall block from the stored timestamp", () => {
    expect(formatPriorKnowledgeBlock(knowledge)).toContain("2026-03-14");
  });
});

describe("formatKnowledgeMarkdown", () => {
  it("produces a portable, self-describing block", () => {
    const md = formatKnowledgeMarkdown(knowledge, course, mod, topic);
    expect(md).toContain(`## ${topic.title}`);
    expect(md).toContain(course.code);
    expect(md).toContain("2 sessions");
    expect(md).toContain("### Key points");
    expect(md).toContain("- Point one");
    expect(md).toContain("### Open questions");
  });

  it("omits sections that have no content", () => {
    const md = formatKnowledgeMarkdown(
      { ...knowledge, misconceptions: [], openQuestions: [] },
      course,
      mod,
      topic,
    );
    expect(md).toContain("### Key points");
    expect(md).not.toContain("### Misconceptions corrected");
    expect(md).not.toContain("### Open questions");
  });
});
