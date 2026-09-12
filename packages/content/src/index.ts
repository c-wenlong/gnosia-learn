/**
 * One reader for the authored content under `content/`.
 *
 * Two consumers: the Next app renders it, and `catalog index` turns it into
 * rows. They used to hold separate ideas of what a course file meant — a set of
 * TypeScript literals on one side, a private `YamlCourse` interface on the
 * other — and nothing compared them but a parity test that could only ever
 * notice drift after it happened. Now there is one parser and one set of types,
 * so the question does not arise.
 *
 * **This reads the filesystem.** Anything importing it runs on the server. The
 * web app puts `server-only` in front of it (`src/data/courses/index.ts`) so a
 * `"use client"` module that reaches it fails at build time rather than
 * shipping a YAML parser and every course file to the browser.
 */

export { ContentError } from "./errors";
export { COURSES_DIR, loadCourses, type LoadCoursesOptions } from "./courses";
export { TAGS_FILE, loadTags } from "./tags";
export { TOPICS_FILE, loadTopics } from "./topics";
export type { LoadOptions } from "./read";
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
