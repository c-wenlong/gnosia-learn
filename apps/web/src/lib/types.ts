/**
 * Course content types come from `@gnosia/content`, which is also what
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
} from "@gnosia/content";

/**
 * The learner-state shapes are declared in `@gnosia/schema/shared` and
 * re-exported here.
 *
 * They used to be written out below, when learner state was a localStorage
 * document this file alone described. It is rows in Postgres now, and the
 * store in `services/catalog/src/state/` builds the same object the components
 * consume, so one definition has to serve both. `shared` is the module that
 * imports nothing, which is what makes it safe in a client component.
 *
 * Components keep importing from `@/lib/types`, so nothing below the provider
 * had to change.
 */
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
