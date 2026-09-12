import path from "node:path";

import { parse } from "yaml";

import { ContentError } from "./errors";
import {
  filesIn,
  optionalText,
  readYamlFile,
  repoRoot,
  requireText,
  stringList,
  type LoadOptions,
} from "./read";
import { loadTopics } from "./topics";
import type { Course, Module, Resource, ResourceType, Topic, TopicEntry } from "./types";

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
}

export interface LoadCoursesOptions extends LoadOptions {
  /**
   * The shared vocabulary, when the caller has already read it. The catalog
   * has; the web app has not, and gets it loaded here.
   */
  topics?: readonly TopicEntry[];
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
  return {
    id,
    title: requireText(raw.title, at, "title"),
    subtopics: stringList(raw.subtopics, at, "subtopics"),
  };
}

export function loadCourses(options?: LoadCoursesOptions): Course[] {
  const root = repoRoot(options);
  const directory = path.join(root, COURSES_DIR);
  const files = filesIn(directory, [".yaml", ".yml"], COURSES_DIR);
  if (files.length === 0) {
    throw new ContentError(`${COURSES_DIR}: no course YAML files found`);
  }

  const vocabulary = new Set(
    (options?.topics ?? loadTopics({ root })).map((entry) => entry.slug),
  );

  const problems = new Problems();
  const courseIds = new Map<string, string>();
  const courseSlugs = new Map<string, string>();
  const moduleIds = new Map<string, string>();
  const topicIds = new Map<string, string>();
  const resourceIds = new Map<string, string>();
  const orders = new Map<number, string>();

  const courses: Course[] = [];

  for (const file of files) {
    const where = path.posix.join(COURSES_DIR, path.basename(file));
    const parsed = parse(readYamlFile(file, where)) as RawCourse | null;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ContentError(`${where}: expected a course mapping`);
    }

    const id = requireText(parsed.id, where, "id");
    claim(courseIds, "course", id, where);
    const slug = requireText(parsed.slug, where, "slug");
    claim(courseSlugs, "course slug", slug, where);

    const order = requireInteger(parsed.order, where, "order");
    const takenBy = orders.get(order);
    if (takenBy !== undefined) {
      throw new ContentError(
        `${where}: order ${order} is already used by ${takenBy}. ` +
          `Course order is the catalog and sidebar order, so it has to be unambiguous.`,
      );
    }
    orders.set(order, where);

    const rawModules = Array.isArray(parsed.modules) ? parsed.modules : [];
    if (rawModules.length === 0) {
      throw new ContentError(`${where}: course "${id}" has no modules`);
    }

    const modules: Module[] = [];
    for (const [i, rawModule] of rawModules.entries()) {
      const mod = rawModule as RawModule;
      const at = `${where} module[${i}]`;
      const moduleId = requireText(mod.id, at, "id");
      claim(moduleIds, "module", moduleId, at);

      const topicSlug = optionalText(mod.topic);
      if (topicSlug === undefined) {
        problems.add(`${at}: module "${moduleId}" has no \`topic:\` slug`);
      } else if (!vocabulary.has(topicSlug)) {
        problems.add(
          `${at}: module "${moduleId}" names topic "${topicSlug}", which is not in content/topics.yaml`,
        );
      }

      const topics = (Array.isArray(mod.topics) ? mod.topics : []).map((raw) =>
        readTopic(raw as RawTopic, at),
      );
      for (const topic of topics) claim(topicIds, "topic", topic.id, at);

      const resources = (Array.isArray(mod.resources) ? mod.resources : []).map((raw) =>
        readResource(raw as RawResource, at),
      );
      for (const resource of resources) claim(resourceIds, "resource", resource.id, at);

      modules.push({
        id: moduleId,
        slug: requireText(mod.slug, at, "slug"),
        title: requireText(mod.title, at, "title"),
        order: requireInteger(mod.order, at, "order"),
        topic: topicSlug ?? "",
        topics,
        resources,
      });
    }

    const code = requireText(parsed.code, where, "code");
    // The file is named after the code, in lowercase. Enforced rather than
    // assumed because the catalog quotes the filename back in its error
    // messages, and a file whose name and code disagree would send an author
    // to edit the wrong one.
    const expected = `${code.toLowerCase()}.yaml`;
    if (path.basename(file) !== expected) {
      throw new ContentError(
        `${where}: course "${code}" belongs in ${COURSES_DIR}/${expected}. ` +
          `One file per course, named after its code in lowercase.`,
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

    courses.push(course);
  }

  problems.throwIfAny();

  // `order:` is the display order the home page and the sidebar render in. It
  // is authored rather than derived because the shortlist is curated, and
  // sorting by filename would silently reshuffle it.
  return courses.sort((a, b) => a.order - b.order);
}
