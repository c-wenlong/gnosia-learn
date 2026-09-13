import type { Course, Module, Topic } from "@/lib/types";

/**
 * Derive concrete end-of-session learning objectives for a topic.
 * Kept deterministic so every Launch Agent session has clear success criteria.
 */
export function buildLearningObjectives(
  course: Course,
  module: Module,
  topic: Topic,
): string[] {
  const base = [
    `Explain ${topic.title} in your own words, at a level a peer in ${course.code} would accept.`,
    `Relate this topic back to module "${module.title}" and why it appears in the roadmap now.`,
  ];

  const fromSubtopics = topic.subtopics.map((s) => {
    const cleaned = s.replace(/\s+/g, " ").trim();
    if (/^[A-Z0-9*ε-]+$/.test(cleaned) || cleaned.length < 40) {
      return `Define or correctly use: ${cleaned}.`;
    }
    return `Demonstrate understanding of: ${cleaned}.`;
  });

  const synthesis = [
    `Given a short novel scenario, apply ${topic.title} (not just restate definitions).`,
    `Name one common misconception or failure mode related to this topic and how you would detect it.`,
  ];

  // Cap objectives so micro-sessions stay focused (about 15–25 min).
  const all = [...base, ...fromSubtopics, ...synthesis];
  return all.slice(0, 6);
}

export function buildSessionAngle(
  course: Course,
  module: Module,
  topic: Topic,
): string {
  const tags = course.tags.join(", ") || "general CS";
  return [
    `Socratic micro-learning (not a lecture dump).`,
    `Course lens: ${course.code} ${course.title} (${tags}).`,
    `Module context: M${module.order} ${module.title}.`,
    `Focus: ${topic.title}.`,
    `Style: short turns, one probing question at a time, demand the learner think before revealing answers.`,
    `Depth: undergraduate / upper-year SoC self-study; prefer worked micro-examples over abstract monologue.`,
  ].join(" ");
}
