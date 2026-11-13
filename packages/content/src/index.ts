/**
 * The parsers for the export format (the layout `catalog export` writes and
 * `catalog import` reads, seed/README.md), and the seam every reader of
 * authored content goes through.
 *
 * Two layers. The synchronous parsers (`loadCourses`, `loadTopics`,
 * `loadTags`) are what `catalog import` turns into rows, and they are the only
 * place a course file's meaning is decided. `ContentSource` is what a reader
 * holds: `dbSource` in `@hermes/catalog` answers it from rows, which is the
 * default and, since the phase 3 cut-over, the only copy of the content;
 * `fileSource(root)` answers it from the parsers, for an import and for a
 * test that hands the seam a tree of its own. `selectSource` picks one per
 * content type (docs/CONTENT-MIGRATION.md, 0.6 and D9). The web app and the
 * studio read through the seam; only the importers call the parsers directly.
 *
 * **This reads the filesystem.** Anything importing it runs on the server. The
 * web app puts `server-only` in front of it (`apps/web/src/data/source.ts`) so
 * a `"use client"` module that reaches it fails at build time rather than
 * shipping a YAML parser and every course file to the browser.
 */

export { ContentError } from "./errors";
export {
  COURSE_COVER_EXTENSIONS,
  COURSES_DIR,
  coverFileName,
  courseFileName,
  isCoverFile,
  isSourceUrl,
  loadCourses,
  parseCourse,
  VIDEO_ASSET_PREFIXES,
  type CourseCoverExtension,
  type LoadCoursesOptions,
} from "./courses";
export { TAGS_FILE, loadTags } from "./tags";
export { TOPIC_RELATION_KINDS, TOPICS_FILE, loadTopics } from "./topics";
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
  type ConceptNoteSource,
  type ContentSource,
  type ContentType,
  type DiagramSource,
  type SessionLogSource,
  type SourceKind,
} from "./source";
export { RESOURCE_TYPES } from "./types";
export type {
  Course,
  CourseCover,
  Module,
  Resource,
  ResourceType,
  TagId,
  TagMeta,
  Topic,
  TopicEntry,
  TopicRelation,
  TopicRelationKind,
} from "./types";
