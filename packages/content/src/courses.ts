import path from "node:path";

import { parse } from "yaml";

import { ContentError } from "./errors";
import {
  filesIn,
  mappingList,
  optionalText,
  readYamlFile,
  repoRoot,
  requireText,
  stringList,
  type LoadOptions,
} from "./read";
import { loadTags } from "./tags";
import { loadTopics } from "./topics";
import type {
  Course,
  CourseCover,
  Module,
  Resource,
  ResourceType,
  TagMeta,
  Topic,
  TopicEntry,
} from "./types";

/**
 * `content/courses/*.yaml`: one file per course, and the only parser of them.
 *
 * What is validated here is what would otherwise be discovered by a page
 * rendering wrong: a duplicated topic id (two checklist rows sharing one
 * progress key), a module whose `topic:` names a subject that does not exist
 * (a course row nothing can join to), a missing slug (a route that 404s).
 * Every refusal names the file, because the reader runs during a Next build,
 * during `catalog index`, and in tests, and only one of those is where the
 * author is looking.
 *
 * The catalog layers its own checks on top — the vocabulary's `maps.courses`
 * has to agree with each module's `topic:`, in both directions — because those
 * are facts about the vocabulary rather than about a course file.
 */

export const COURSES_DIR = "content/courses";

/** What a course code may be: it names the file, `<code>.yaml` in lowercase. */
const COURSE_CODE = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

const RESOURCE_TYPES: readonly ResourceType[] = ["paper", "docs", "video", "book", "other"];

interface RawResource {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  type?: unknown;
}

interface RawTopic {
  id?: unknown;
  title?: unknown;
  concepts?: unknown;
  subtopics?: unknown;
}

interface RawModule {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  order?: unknown;
  topic?: unknown;
  topics?: unknown;
  resources?: unknown;
}

interface RawCover {
  file?: unknown;
  photographer?: unknown;
  source?: unknown;
  licence?: unknown;
}

interface RawCourse {
  id?: unknown;
  slug?: unknown;
  code?: unknown;
  title?: unknown;
  credits?: unknown;
  order?: unknown;
  prereq?: unknown;
  track?: unknown;
  notes?: unknown;
  inferred?: unknown;
  tags?: unknown;
  modules?: unknown;
  capstone?: unknown;
  cover?: unknown;
}

export interface LoadCoursesOptions extends LoadOptions {
  /**
   * The shared vocabulary, when the caller has already read it. The catalog
   * has; the web app has not, and gets it loaded here.
   */
  topics?: readonly TopicEntry[];
  /** The theme list, likewise. Loaded from `content/tags.yaml` when absent. */
  tags?: readonly TagMeta[];
}

/**
 * The image types a cover file may be, by extension: the same closed list as
 * `COURSE_COVER_TYPES` in `@self-learn/schema`, which this package does not
 * import. `catalog course cover` decides the type from the bytes; the export
 * names the file by it.
 */
export const COURSE_COVER_EXTENSIONS = ["webp", "jpg", "png"] as const;
export type CourseCoverExtension = (typeof COURSE_COVER_EXTENSIONS)[number];

/** The cover file beside a course file: `<code>.cover.<ext>`, in lowercase. */
export function coverFileName(code: string, ext: CourseCoverExtension): string {
  return `${code.toLowerCase()}.cover.${ext}`;
}

/** Whether a file name in `content/courses/` is a cover image rather than a course. */
export function isCoverFile(name: string): boolean {
  return COURSE_COVER_EXTENSIONS.some((ext) => name.endsWith(`.cover.${ext}`));
}

const COVER_KEYS = new Set(["file", "photographer", "source", "licence"]);

/**
 * A course's `cover:` mapping, or undefined when the file has none. The file
 * name is not free: it is the course code's, with a known image extension,
 * so a cover can only ever name the file beside its own course, and no path
 * is ever built out of what a file says. A key outside the four is refused,
 * since `license` for `licence` would otherwise drop the licence silently.
 */
function readCover(value: unknown, where: string, code: string): CourseCover | undefined {
  if (value === undefined) return undefined;
  const at = `${where} cover`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ContentError(
      `${at}: expected a mapping of file, photographer, source and licence. Delete the key for no cover.`,
    );
  }
  const unknown = Object.keys(value).filter((key) => !COVER_KEYS.has(key));
  if (unknown.length > 0) {
    throw new ContentError(`${at}: unknown key(s) ${unknown.join(", ")}; a cover has file, photographer, source and licence`);
  }
  const raw = value as RawCover;
  const file = requireText(raw.file, at, "file");
  const allowed = COURSE_COVER_EXTENSIONS.map((ext) => coverFileName(code, ext));
  if (!allowed.includes(file)) {
    throw new ContentError(`${at}: file "${file}" must be one of ${allowed.join(", ")}: the image beside this course's file`);
  }
  const source = requireText(raw.source, at, "source");
  if (!/^https?:\/\/\S+$/.test(source)) {
    throw new ContentError(`${at}: source "${source}" must be an http(s) URL: the page the photo came from`);
  }
  return {
    file,
    photographer: requireText(raw.photographer, at, "photographer"),
    source,
    licence: requireText(raw.licence, at, "licence"),
  };
}

/**
 * Collects every unresolved reference before throwing, so one read reports all
 * of them. Fixing thirty typos one error per run is thirty runs.
 */
class Problems {
  private readonly lines: string[] = [];

  add(message: string): void {
    this.lines.push(message);
  }

  throwIfAny(): void {
    if (this.lines.length === 0) return;
    const body = this.lines.map((l) => `  - ${l}`).join("\n");
    throw new ContentError(
      `${COURSES_DIR}: ${this.lines.length} unresolved reference${
        this.lines.length === 1 ? "" : "s"
      }\n${body}`,
    );
  }
}

function requireInteger(value: unknown, where: string, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ContentError(`${where}: ${field} is required and must be a whole number`);
  }
  return value;
}

function requireBoolean(value: unknown, where: string, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ContentError(
      `${where}: ${field} is required and must be true or false, not ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/** Claims one id for one thing, naming both claimants when it is taken. */
function claim(seen: Map<string, string>, kind: string, id: string, where: string): void {
  const first = seen.get(id);
  if (first !== undefined) {
    throw new ContentError(
      `${where}: ${kind} id "${id}" is already used in ${first}. ` +
        `Ids are permanent keys for learner progress; two things cannot share one.`,
    );
  }
  seen.set(id, where);
}

function readResource(raw: RawResource, where: string): Resource {
  const id = requireText(raw.id, where, "resources[].id");
  const at = `${where} resource "${id}"`;
  const type = requireText(raw.type, at, "type");
  if (!(RESOURCE_TYPES as readonly string[]).includes(type)) {
    throw new ContentError(
      `${at}: type "${type}" is not one of ${RESOURCE_TYPES.join(", ")}`,
    );
  }
  return {
    id,
    title: requireText(raw.title, at, "title"),
    url: requireText(raw.url, at, "url"),
    type: type as ResourceType,
  };
}

function readTopic(raw: RawTopic, where: string): Topic {
  const id = requireText(raw.id, where, "topics[].id");
  const at = `${where} topic "${id}"`;
  // `concepts:` with nothing after it parses as null, which `stringList`
  // reads as an empty list. An author who wrote the key meant to list
  // something, so the row is refused rather than read as having no concepts.
  if (raw.concepts === null) {
    throw new ContentError(
      `${at}: concepts is present but empty. List the concept ids, or delete the key.`,
    );
  }
  const concepts = stringList(raw.concepts, at, "concepts");
  // The list is the teaching order and the catalog stores a position per
  // entry, so a concept named twice would hold two positions on one row.
  const seen = new Set<string>();
  for (const concept of concepts) {
    if (seen.has(concept)) {
      throw new ContentError(`${at}: concepts lists "${concept}" twice`);
    }
    seen.add(concept);
  }
  return {
    id,
    title: requireText(raw.title, at, "title"),
    concepts,
    subtopics: stringList(raw.subtopics, at, "subtopics"),
  };
}

/**
 * The claims one read shares across files: every id kind is global, so a
 * directory read passes one set to every file and a single-file read gets a
 * fresh one.
 */
interface Claims {
  courseIds: Map<string, string>;
  courseSlugs: Map<string, string>;
  moduleIds: Map<string, string>;
  topicIds: Map<string, string>;
  resourceIds: Map<string, string>;
  orders: Map<number, string>;
}

function freshClaims(): Claims {
  return {
    courseIds: new Map(),
    courseSlugs: new Map(),
    moduleIds: new Map(),
    topicIds: new Map(),
    resourceIds: new Map(),
    orders: new Map(),
  };
}

/**
 * What a course is checked against beyond its own text. A directory read has
 * the vocabulary and the themes from their files; `parseCourse` has neither,
 * because its caller (`catalog course import`) checks those references
 * against rows instead.
 */
interface References {
  vocabulary: ReadonlyMap<string, TopicEntry> | null;
  themes: ReadonlySet<string> | null;
}

/**
 * One course mapping read into a `Course`: every rule that is a fact about the
 * text, plus the vocabulary and theme checks when `references` carries them.
 * Duplicates across files are caught through `claims`; unresolved references
 * go to `problems`, so one read reports all of them.
 */
function readCourse(
  parsed: RawCourse | null,
  where: string,
  claims: Claims,
  references: References,
  problems: Problems,
): Course {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ContentError(`${where}: expected a course mapping`);
  }

  const id = requireText(parsed.id, where, "id");
  claim(claims.courseIds, "course", id, where);
  const slug = requireText(parsed.slug, where, "slug");
  claim(claims.courseSlugs, "course slug", slug, where);

  const order = requireInteger(parsed.order, where, "order");
  const takenBy = claims.orders.get(order);
  if (takenBy !== undefined) {
    throw new ContentError(
      `${where}: order ${order} is already used by ${takenBy}. ` +
        `Course order is the catalog and sidebar order, so it has to be unambiguous.`,
    );
  }
  claims.orders.set(order, where);

  const rawModules = mappingList(parsed.modules, where, "modules");
  if (rawModules.length === 0) {
    throw new ContentError(`${where}: course "${id}" has no modules`);
  }

  const modules: Module[] = [];
  /** Module slugs are the second URL segment, so they collide per course, not globally. */
  const moduleSlugs = new Map<string, string>();
  for (const [i, rawModule] of rawModules.entries()) {
    const mod = rawModule as RawModule;
    const at = `${where} module[${i}]`;
    const moduleId = requireText(mod.id, at, "id");
    claim(claims.moduleIds, "module", moduleId, at);

    const topicSlug = optionalText(mod.topic);
    if (topicSlug === undefined) {
      problems.add(`${at}: module "${moduleId}" has no \`topic:\` slug`);
    } else if (references.vocabulary !== null && !references.vocabulary.has(topicSlug)) {
      problems.add(
        `${at}: module "${moduleId}" names topic "${topicSlug}", which is not in content/topics.yaml`,
      );
    }

    const topics = mappingList(mod.topics, at, "topics").map((raw) =>
      readTopic(raw as RawTopic, at),
    );
    if (topics.length === 0) {
      throw new ContentError(
        `${at}: module "${moduleId}" has no topics. A module with no ` +
          `checklist rows is a page with an empty section and nothing to tick.`,
      );
    }
    for (const topic of topics) claim(claims.topicIds, "topic", topic.id, at);

    // A row's concepts must sit under the module's vocabulary topic. Both
    // files name the same fact, so when they disagree neither is knowably
    // right and the read stops, the same rule `catalog index` applies to
    // `maps.courses`. Skipped when the module topic is itself unresolved:
    // that is already a problem above, and there is nothing to check against.
    const entry =
      topicSlug === undefined || references.vocabulary === null
        ? undefined
        : references.vocabulary.get(topicSlug);
    if (entry !== undefined) {
      const mapped = new Set(entry.maps.concepts);
      for (const topic of topics) {
        for (const concept of topic.concepts) {
          if (!mapped.has(concept)) {
            problems.add(
              `${at} topic "${topic.id}" lists concept "${concept}", which is not in ` +
                `maps.concepts of topic "${topicSlug}" in content/topics.yaml`,
            );
          }
        }
      }
    }

    const resources = mappingList(mod.resources, at, "resources").map((raw) =>
      readResource(raw as RawResource, at),
    );
    for (const resource of resources) claim(claims.resourceIds, "resource", resource.id, at);

    const moduleSlug = requireText(mod.slug, at, "slug");
    claim(moduleSlugs, "module slug", moduleSlug, at);

    modules.push({
      id: moduleId,
      slug: moduleSlug,
      title: requireText(mod.title, at, "title"),
      order: requireInteger(mod.order, at, "order"),
      topic: topicSlug ?? "",
      topics,
      resources,
    });
  }

  const code = requireText(parsed.code, where, "code");
  // The code names the course's file (`courseFileName`), and an import
  // writes that file back, so it has to be one safe file name: no separator,
  // no `..`, nothing a path could be built out of.
  if (!COURSE_CODE.test(code)) {
    throw new ContentError(
      `${where}: code "${code}" must be letters and digits, optionally joined by single dots, ` +
        `dashes or underscores: it is the course's file name`,
    );
  }
  const course: Course = {
    id,
    slug,
    code,
    title: requireText(parsed.title, where, "title"),
    credits: requireInteger(parsed.credits, where, "credits"),
    order,
    inferred: requireBoolean(parsed.inferred, where, "inferred"),
    tags: stringList(parsed.tags, where, "tags"),
    modules,
    capstone: requireText(parsed.capstone, where, "capstone"),
  };
  // Optional keys are omitted rather than set to undefined: the shape has to
  // match what the TypeScript literals produced, or every consumer that
  // spreads or compares a course sees a difference that is not one.
  const prereq = optionalText(parsed.prereq);
  if (prereq !== undefined) course.prereq = prereq;
  const track = optionalText(parsed.track);
  if (track !== undefined) course.track = track;
  const notes = optionalText(parsed.notes);
  if (notes !== undefined) course.notes = notes;
  const cover = readCover(parsed.cover, where, code);
  if (cover !== undefined) course.cover = cover;

  if (references.themes !== null) {
    for (const tag of course.tags) {
      if (!references.themes.has(tag)) {
        problems.add(
          `${where}: course "${code}" is tagged "${tag}", which is not in content/tags.yaml`,
        );
      }
    }
  }
  return course;
}

/**
 * One course file's text, read with every rule that is a fact about the file
 * itself: required fields and their types, a module with no rows, an id used
 * twice inside it, a module slug used twice, a concept listed twice on a row,
 * an unknown resource type, a module with no `topic:`.
 *
 * What it does not check is what the file points at, because that is a fact
 * about somewhere else: that the module topics, the tags and the concepts
 * exist, that no other course already uses one of its ids, and that the
 * file's name matches its code. `loadCourses` checks those against the other
 * files; `catalog course import` checks them against the database's rows,
 * which is the truth once the courses type is flipped.
 */
export function parseCourse(text: string, where: string): Course {
  const problems = new Problems();
  const parsed = parse(text) as RawCourse | null;
  const course = readCourse(parsed, where, freshClaims(), { vocabulary: null, themes: null }, problems);
  problems.throwIfAny();
  return course;
}

export function loadCourses(options?: LoadCoursesOptions): Course[] {
  const root = repoRoot(options);
  const directory = path.join(root, COURSES_DIR);
  const files = filesIn(directory, [".yaml", ".yml"], COURSES_DIR);
  if (files.length === 0) {
    throw new ContentError(`${COURSES_DIR}: no course YAML files found`);
  }

  const vocabulary = new Map(
    (options?.topics ?? loadTopics({ root })).map((entry) => [entry.slug, entry]),
  );
  // Tags are checked here rather than by a test over today's files, because a
  // typo is not a cosmetic problem: the chip falls back to the raw id and, more
  // quietly, the course drops out of every related-course list for the theme it
  // meant to name.
  const themes = new Set((options?.tags ?? loadTags({ root })).map((tag) => tag.id));

  const problems = new Problems();
  const claims = freshClaims();
  const courses: Course[] = [];

  for (const file of files) {
    const where = path.posix.join(COURSES_DIR, path.basename(file));
    const parsed = parse(readYamlFile(file, where)) as RawCourse | null;
    const course = readCourse(parsed, where, claims, { vocabulary, themes }, problems);

    // The file is named after the code, in lowercase. Enforced rather than
    // assumed because the catalog quotes the filename back in its error
    // messages, and a file whose name and code disagree would send an author
    // to edit the wrong one.
    const expected = courseFileName(course.code);
    if (path.basename(file) !== expected) {
      throw new ContentError(
        `${where}: course "${course.code}" belongs in ${COURSES_DIR}/${expected}. ` +
          `One file per course, named after its code in lowercase.`,
      );
    }

    courses.push(course);
  }

  problems.throwIfAny();

  // `order:` is the display order the home page and the sidebar render in. It
  // is authored rather than derived because the shortlist is curated, and
  // sorting by filename would silently reshuffle it.
  return courses.sort((a, b) => a.order - b.order);
}

/** The file a course lives in under `content/courses/`: its code, in lowercase. */
export function courseFileName(code: string): string {
  return `${code.toLowerCase()}.yaml`;
}
