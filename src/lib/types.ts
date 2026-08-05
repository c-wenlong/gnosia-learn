export type ResourceType = "paper" | "docs" | "video" | "book" | "other";

export type TagId =
  | "hci"
  | "agentic-ai"
  | "transformers"
  | "generative-models"
  | "graphics"
  | "classical-ai"
  | "recommenders"
  | "product";

export interface Resource {
  id: string;
  title: string;
  url: string;
  type: ResourceType;
}

export interface Topic {
  id: string;
  title: string;
  subtopics: string[];
}

export interface Module {
  id: string;
  slug: string;
  title: string;
  order: number;
  topics: Topic[];
  resources: Resource[];
}

export interface Course {
  id: string;
  slug: string;
  code: string;
  title: string;
  credits: number;
  prereq?: string;
  track?: string;
  notes?: string;
  inferred: boolean;
  tags: TagId[];
  modules: Module[];
  capstone: string;
}

export interface UserResource {
  id: string;
  title: string;
  url: string;
}

export type ThemeMode = "light" | "dark";

/** Where a knowledge record came from. */
export type KnowledgeSource = "agent" | "manual";

/**
 * Durable record of what the learner actually established about a topic.
 * Survives progress resets — this is the "remind me what I learnt" layer.
 */
export interface TopicKnowledge {
  topicId: string;
  /** Short prose recap, written from the learner's own conclusions. */
  summary: string;
  keyPoints: string[];
  misconceptions: string[];
  openQuestions: string[];
  source: KnowledgeSource;
  updatedAt: string;
  /** How many agent sessions have been folded into this record. */
  sessions: number;
}

/** Fields a summariser (or the learner) supplies; the rest is derived. */
export interface KnowledgeInput {
  summary: string;
  keyPoints: string[];
  misconceptions: string[];
  openQuestions: string[];
  source: KnowledgeSource;
}

export const CURRENT_STATE_VERSION = 2;

export interface LearnerState {
  version: typeof CURRENT_STATE_VERSION;
  theme: ThemeMode;
  completed: Record<string, true>;
  notes: Record<string, string>;
  userResources: Record<string, UserResource[]>;
  /** Per-topic session recaps, keyed by topic id. */
  knowledge: Record<string, TopicKnowledge>;
  /** Bumps when progress is reset so local UI state can remount. */
  epoch: number;
  lastVisited?: {
    courseSlug: string;
    moduleSlug?: string;
    at: string;
  };
}

export interface ProgressCounts {
  completed: number;
  total: number;
  percent: number;
}

export interface TagMeta {
  id: TagId;
  label: string;
  description: string;
}
