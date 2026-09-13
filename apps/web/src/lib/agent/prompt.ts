import type { Course, Module, Topic, TopicKnowledge } from "@/lib/types";
import { buildLearningObjectives, buildSessionAngle } from "./objectives";
import { formatPriorKnowledgeBlock } from "./summary";

export interface AgentSessionContext {
  course: Course;
  module: Module;
  topic: Topic;
  objectives: string[];
  angle: string;
  systemPrompt: string;
  openingUserSeed: string;
  terminalCommand: string;
  model: string;
}

/** Display label for the free production cascade (not a single vendor id). */
export const DEFAULT_AGENT_MODEL = "free cascade (NVIDIA → Gemini → OpenRouter)";

export function buildAgentSessionContext(
  course: Course,
  module: Module,
  topic: Topic,
  options?: {
    model?: string;
    learnerNote?: string;
    priorKnowledge?: TopicKnowledge;
  },
): AgentSessionContext {
  const model = options?.model ?? DEFAULT_AGENT_MODEL;
  const objectives = buildLearningObjectives(course, module, topic);
  const angle = buildSessionAngle(course, module, topic);
  const noteBlock =
    options?.learnerNote && options.learnerNote.trim()
      ? `\n## Learner notes (from their study hub)\n${options.learnerNote.trim()}\n`
      : "";
  const priorKnowledge = options?.priorKnowledge;
  const knowledgeBlock = priorKnowledge
    ? `\n${formatPriorKnowledgeBlock(priorKnowledge)}\n`
    : "";

  const siblingTopics = module.topics
    .filter((t) => t.id !== topic.id)
    .map((t) => `- ${t.title}`)
    .join("\n");

  const resources = module.resources
    .map((r) => `- [${r.type}] ${r.title}: ${r.url}`)
    .join("\n");

  const systemPrompt = `# Self-Learn Micro-Session · ${course.code}

You are a Socratic tutor for a university self-study roadmap (NUS SoC AY2026/27 shortlist).
Stay in tutor mode regardless of which free backend model is serving this session.

## Why this session exists
The learner is self-studying **${course.code} — ${course.title}** and opened a focused micro-session on a single topic.
Your job is not to complete the course for them. Your job is to help them *internalize* this topic through dialogue, checks for understanding, and light practice.

## Session angle
${angle}

## Full context
### Course
- Code: ${course.code}
- Title: ${course.title}
- Credits: ${course.credits}
- Prereq: ${course.prereq ?? "none listed"}
- Track / notes: ${course.track ?? course.notes ?? "n/a"}
- Inferred syllabus: ${course.inferred ? "yes (flag uncertainty if official syllabus may differ)" : "no"}
- Capstone goal: ${course.capstone}

### Module
- M${module.order}: ${module.title}
- Other topics in this module:
${siblingTopics || "- (this is the only topic)"}

### Focus topic
- ${topic.title}
- Subtopics:
${topic.subtopics.map((s) => `  - ${s}`).join("\n") || "  - (none listed)"}

### Curated resources for this module
${resources || "- (none curated)"}
${noteBlock}${knowledgeBlock}
## What the learner should be able to answer by the end
By the end of this micro-session, the learner should be able to:
${objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## How to teach (strict)
1. ${
    priorKnowledge
      ? "This is a RETURN visit. Open by reflecting back, in one or two sentences, what they established last time, then ask **one** question that either checks that ground still holds or pushes into an open question. Never re-open the topic from zero."
      : "Open with a 2–4 sentence framing of the topic and why it matters in this course, then ask **one** diagnostic question."
  }
2. Prefer Socratic method: questions, counter-examples, "what if…", "explain as if teaching a peer".
3. Keep turns short. Do not dump a textbook chapter unless the learner explicitly asks for a lecture.
4. After each learner reply: (a) brief feedback, (b) correct misconceptions, (c) one next question or a tiny exercise.
5. Use the learner's own wording when possible; push for precision without being pedantic.
6. If they are stuck: give a scaffolded hint, not the full answer.
7. When most objectives look met, run a quick oral "exit ticket" (2–3 questions) and then summarize remaining gaps.
8. Stay on this topic. Adjacent material only if needed for understanding.
9. Never invent course policy or grading claims. If the syllabus is inferred, say so.

## Output style
- Clear, conversational prose.
- Use bullet points sparingly for checklists or exit tickets.
- When useful, include a tiny worked example (5–10 lines max).
`;

  const openingUserSeed = priorKnowledge
    ? [
        `Resume my micro-session on "${topic.title}" for ${course.code}.`,
        `I have studied this before — my recap is in your context.`,
        `Pick up from what I already established and push on the open questions.`,
        `Open by checking one piece of that ground, not by re-introducing the topic.`,
      ].join(" ")
    : [
        `Start the micro-session on "${topic.title}" for ${course.code}.`,
        `Session goal: I should be able to answer the end-of-session objectives by the time we finish.`,
        `Please open with brief framing + one diagnostic question. Do not lecture yet.`,
      ].join(" ");

  const terminalCommand = [
    `# Launch Self-Learn agent for ${course.code} · ${topic.title}`,
    `# Browser prod uses free cascade: NVIDIA NIM → Gemini Flash → OpenRouter free`,
    `# Optional terminal paste into any chat/droid session:`,
    ``,
    `# Then send the system prompt + opening seed as the first message.`,
  ].join("\n");

  return {
    course,
    module,
    topic,
    objectives,
    angle,
    systemPrompt,
    openingUserSeed,
    terminalCommand,
    model,
  };
}
