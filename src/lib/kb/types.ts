/**
 * Shape of `learn/state/index.json`, the snapshot the pipeline writes for
 * the web hub. Regenerate it with `npm run learn -- index`.
 */

export type MasteryLabel = "mastered" | "solid" | "shaky" | "weak" | "gap";

export interface KbConcept {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  requires: string[];
  /** Background: affects ordering only, never gates or carries evidence. */
  assumes: string[];
  /** p(L) from Bayesian Knowledge Tracing: probability the learner holds it. */
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  correct: number;
  lastSeen: string | null;
  due: string | null;
  lapses: number;
  leech: boolean;
  sources: string[];
  openQuestions: string[];
  /** Course topic ids this concept supports, linking back to the hub. */
  topics: string[];
}

export type EdgeKind = "requires" | "assumes";

export interface KbEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface KbStats {
  total: number;
  mastered: number;
  learning: number;
  untouched: number;
}

export interface KnowledgeBase {
  version: number;
  generatedAt: string | null;
  stats: KbStats;
  /** Concept ids at the edge of understanding. */
  frontier: string[];
  concepts: KbConcept[];
  edges: KbEdge[];
  mermaid: string;
}

export const EMPTY_KB: KnowledgeBase = {
  version: 1,
  generatedAt: null,
  stats: { total: 0, mastered: 0, learning: 0, untouched: 0 },
  frontier: [],
  concepts: [],
  edges: [],
  mermaid: "",
};

export const MASTERY_ORDER: MasteryLabel[] = [
  "gap",
  "weak",
  "shaky",
  "solid",
  "mastered",
];
