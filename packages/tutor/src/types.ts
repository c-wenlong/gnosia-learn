/**
 * The type re-exports `apps/web/src/lib/types.ts` held before the tutor's
 * share of `lib/` moved here: course content types from `@gnosia/content`,
 * learner-state shapes from `@gnosia/schema/shared`.
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
} from "@gnosia/content";
export type {
  KnowledgeInput,
  KnowledgeSource,
  LastVisited,
  LearnerState,
  ThemeMode,
  TopicKnowledge,
  UserResource,
} from "@gnosia/schema/shared";
export { emptyLearnerState, LEGACY_STORAGE_KEY } from "@gnosia/schema/shared";

export interface ProgressCounts {
  completed: number;
  total: number;
  percent: number;
}
