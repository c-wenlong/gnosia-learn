import type {
  Course,
  KnowledgeInput,
  Module,
  Topic,
  TopicKnowledge,
} from "./types";
import { buildLearningObjectives } from "./objectives";

export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * System prompt for the recap pass. Deliberately separate from the tutor
 * prompt: here the model is an archivist, not a teacher.
 */
export function buildSummarySystemPrompt(
  course: Course,
  module: Module,
  topic: Topic,
): string {
  const objectives = buildLearningObjectives(course, module, topic);

  return `# Session Recap · ${course.code}

You are summarising a finished Socratic micro-session so the learner can return to this topic months later and remember what they actually worked out.

## Context
- Course: ${course.code} — ${course.title}
- Module: M${module.order} ${module.title}
- Topic: ${topic.title}
- Subtopics: ${topic.subtopics.join("; ") || "(none listed)"}

## Objectives the session was aiming at
${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## What to produce
Return **only** a JSON object, no prose before or after, no markdown fences:

{
  "summary": "3-6 sentences, second person ('you established…'), describing what the learner actually understood by the end. Concrete, not generic.",
  "keyPoints": ["the specific things they can now explain, in their own framing", "..."],
  "misconceptions": ["misconceptions they held and how they were corrected — empty array if none surfaced"],
  "openQuestions": ["what stayed unresolved or should be picked up next time — empty array if none"]
}

## Rules
1. Report only what the transcript supports. Do not invent understanding the learner never demonstrated.
2. If the learner barely engaged, say so plainly in the summary and keep the arrays short or empty.
3. Prefer their own wording and examples over textbook phrasing — this is their memory aid, not a syllabus.
4. Each array item is one sentence, at most ~40 words. At most 6 items per array.
5. No headings, no bullet characters, no markdown inside the JSON string values.`;
}

/** Flatten a dialogue into the single user message the recap pass reads. */
export function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map(
      (t) => `${t.role === "assistant" ? "TUTOR" : "LEARNER"}: ${t.content.trim()}`,
    )
    .join("\n\n");
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  // Some free models return a newline- or semicolon-joined string.
  if (typeof value === "string") {
    return value
      .split(/\n+|;\s*/)
      .map((v) => v.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parse a recap response. Free-tier models are inconsistent about fences and
 * array-vs-string, so accept the common variants rather than failing the save.
 */
export function parseKnowledgeResponse(raw: string): KnowledgeInput | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const keyPoints = toStringList(obj.keyPoints);
  const misconceptions = toStringList(obj.misconceptions);
  const openQuestions = toStringList(obj.openQuestions);

  if (
    !summary &&
    keyPoints.length === 0 &&
    misconceptions.length === 0 &&
    openQuestions.length === 0
  ) {
    return null;
  }

  return {
    summary,
    keyPoints,
    misconceptions,
    openQuestions,
    source: "agent",
  };
}

/** Block injected into the tutor prompt so a repeat session resumes, not restarts. */
export function formatPriorKnowledgeBlock(
  knowledge: TopicKnowledge,
): string {
  const section = (label: string, items: string[]) =>
    items.length ? `\n${label}\n${items.map((i) => `- ${i}`).join("\n")}` : "";

  return `## What the learner already established (session ${knowledge.sessions}, last on ${knowledge.updatedAt.slice(0, 10)})
${knowledge.summary || "(no summary recorded)"}${section(
    "Already solid:",
    knowledge.keyPoints,
  )}${section("Previously corrected misconceptions:", knowledge.misconceptions)}${section(
    "Left open last time:",
    knowledge.openQuestions,
  )}

Treat this as established ground. Do not re-teach it from scratch — verify it briefly, then spend the session on the open questions and on deeper application.`;
}

/** Portable export so recaps can leave localStorage and live in notes or git. */
export function formatKnowledgeMarkdown(
  knowledge: TopicKnowledge,
  course: Course,
  module: Module,
  topic: Topic,
): string {
  const section = (label: string, items: string[]) =>
    items.length
      ? `\n### ${label}\n${items.map((i) => `- ${i}`).join("\n")}\n`
      : "";

  return `## ${topic.title}

*${course.code} ${course.title} · M${module.order} ${module.title}*
*${knowledge.sessions} session${knowledge.sessions === 1 ? "" : "s"} · last updated ${knowledge.updatedAt.slice(0, 10)} · ${knowledge.source === "agent" ? "agent recap" : "written by hand"}*

${knowledge.summary}
${section("Key points", knowledge.keyPoints)}${section(
    "Misconceptions corrected",
    knowledge.misconceptions,
  )}${section("Open questions", knowledge.openQuestions)}`;
}
