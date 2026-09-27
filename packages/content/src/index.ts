/**
 * One reader for the authored content under `content/`, and the seam that lets
 * that content move into Postgres.
 *
 * Two layers. The synchronous parsers (`loadCourses`, `loadTopics`,
 * `loadTags`) are what `catalog index` turns into rows, and they are the only
 * place a course file's meaning is decided. `ContentSource` is what a reader
 * holds: `fileSource(root)` answers it from those parsers, `dbSource` in
 * `@self-learn/catalog` will answer it from rows, and `selectSource` picks one
 * per content type (docs/CONTENT-MIGRATION.md, 0.6 and D9). The web app and
 * the studio read through the seam; only the indexers call the parsers
 * directly, until phase 2 retires them to import validators.
 *
 * **This reads the filesystem.** Anything importing it runs on the server. The
 * web app puts `server-only` in front of it (`apps/web/src/data/source.ts`) so
 * a `"use client"` module that reaches it fails at build time rather than
 * shipping a YAML parser and every course file to the browser.
 */

export { ContentError } from "./errors";
export { COURSES_DIR, loadCourses, type LoadCoursesOptions } from "./courses";
export { TAGS_FILE, loadTags } from "./tags";
export { TOPICS_FILE, loadTopics } from "./topics";
export type { LoadOptions } from "./read";
export { DIAGRAMS_DIR, fileSource, noteId, NOTES_DIR, SESSIONS_DIR } from "./file-source";
export {
  CONTENT_SOURCE_VAR,
  parseContentSource,
  resolveOwnership,
  selectSource,
  type Ownership,
  type Resolution,
  type Resolutions,
  type ResolvedFrom,
  type SelectedSource,
  type SelectSourceOptions,
} from "./select";
export {
  CONTENT_TYPES,
  METHOD_TYPES,
  SOURCE_KINDS,
  type ConceptNoteSource,
  type ContentSource,
  type ContentType,
  type DiagramSource,
  type SessionLogSource,
  type SourceKind,
} from "./source";
export type {
  Course,
  Module,
  Resource,
  ResourceType,
  TagId,
  TagMeta,
  Topic,
  TopicEntry,
} from "./types";
