/**
 * Course content types come from `@self-learn/content`, which is also what
 * parses `content/`. They are re-exported here so every `@/lib/types` import
 * keeps working and there is still one place to look for "what shape is a
 * Course" — but the declaration lives with the parser, because a type the
 * parser does not produce is a lie that compiles.
 *
 * `export type` is erased at build time, so a `"use client"` module importing
 * these does not pull the filesystem reader into the browser bundle.
 */
export type {
  Course,
  Module,
  Resource,
  ResourceType,
  TagId,
  TagMeta,
  Topic,
} from "@self-learn/content";

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
