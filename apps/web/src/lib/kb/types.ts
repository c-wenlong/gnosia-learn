/**
 * The knowledge base as the web hub reads it.
 *
 * This used to describe `learn/state/index.json`, a snapshot the pipeline
 * wrote and the build baked in. The snapshot is gone: the shapes are now
 * whatever `readKnowledgeBase` returns from the `concept`, `mastery` and
 * `review` tables, and they are declared alongside that query in
 * `services/catalog/src/state/knowledge-base.ts` so the query and its type
 * cannot drift.
 *
 * Three fields the file had are not here, because the tables do not hold them
 * and the page never rendered them: `tags` and `sources` (frontmatter the
 * catalog does not index), and `openQuestions` (which was always empty — the
 * indexer never produced it). `generatedAt` became `indexedAt`, which is a
 * fact the database actually knows: when the concepts source last ran.
 */
export type {
  KbConcept,
  KbEdge,
  KnowledgeBase,
  MasteryLabel,
} from "@self-learn/catalog/state";
export { EMPTY_KNOWLEDGE_BASE } from "@self-learn/catalog/state";

import type { MasteryLabel } from "@self-learn/catalog/state";

/** Weakest first, for anything that wants to order by how well it is held. */
export const MASTERY_ORDER: MasteryLabel[] = ["gap", "weak", "shaky", "solid", "mastered"];
