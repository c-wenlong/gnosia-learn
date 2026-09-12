import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  NewAsset,
  NewAssetTopic,
  NewCollection,
  NewCollectionItem,
  NewCurriculumItem,
  NewCurriculumItemTopic,
} from "@self-learn/schema";
import { parse } from "yaml";

import { IndexError, IndexErrors } from "./errors";
import { filesIn, relativeTo } from "./files";
import { ASSET_PREFIX, type Indexer, type SourceRows } from "./source";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * `content/courses/*.yaml` into collections, curriculum items and link assets.
 *
 * A course becomes a `collection` of kind `course`; each of its modules a
 * `collection` of kind `module` beneath it; each module's `topics:` entries
 * become `curriculum_item` rows, which are the checklist the learner actually
 * ticks. That three-level shape is why `collection` self-references rather than
 * having separate course and module tables.
 *
 * **Where the shared topic comes in.** A module carries `topic: <slug>`, and
 * that slug is also listed under the topic's `maps.courses` in
 * `content/topics.yaml`. Two files stating the same fact is a drift risk, so
 * this indexer checks them against each other and refuses when they disagree,
 * rather than picking a winner. Every curriculum item inherits its module's
 * topic — an item is part of what the module teaches, and giving items their
 * own vocabulary entry would mean 300 more slugs to maintain for no query
 * anyone has asked for.
 *
 * Curated resources become `link` assets: they have a URL and no bytes, which
 * is exactly what `asset`'s `num_nonnulls(path, url) = 1` check describes.
 */

export const COURSES_DIR = "content/courses";

interface YamlResource {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  type?: unknown;
}

interface YamlTopic {
  id?: unknown;
  title?: unknown;
  subtopics?: unknown;
}

interface YamlModule {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  order?: unknown;
  topic?: unknown;
  topics?: unknown;
  resources?: unknown;
}

interface YamlCourse {
  id?: unknown;
  slug?: unknown;
  code?: unknown;
  title?: unknown;
  credits?: unknown;
  prereq?: unknown;
  track?: unknown;
  notes?: unknown;
  inferred?: unknown;
  tags?: unknown;
  modules?: unknown;
  capstone?: unknown;
}

function text(value: unknown, where: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new IndexError(`${where}: ${field} is required and must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
    : [];
}

export const coursesIndexer: Indexer = {
  source: "courses",
  owns: ["collection", "curriculumItem", "collectionItem", "curriculumItemTopic"],
  assetPrefix: ASSET_PREFIX.courses,
  root: () => COURSES_DIR,

  read: async ({ repoRoot, vocabulary }) => {
    const directory = path.join(repoRoot, COURSES_DIR);
    const files = await filesIn(directory, [".yaml", ".yml"]);
    if (files.length === 0) {
      throw new IndexError(`${COURSES_DIR}: no course YAML files found`);
    }

    const collections: NewCollection[] = [];
    const curriculumItems: NewCurriculumItem[] = [];
    const collectionItems: NewCollectionItem[] = [];
    const curriculumItemTopics: NewCurriculumItemTopic[] = [];
    const assets: NewAsset[] = [];
    const assetTopics: NewAssetTopic[] = [];

    const problems = new IndexErrors();
    /** Modules seen here, so the vocabulary's own `maps.courses` can be checked back. */
    const seenModules = new Set<string>();
    let moduleCount = 0;

    for (const file of files) {
      const where = relativeTo(repoRoot, file);
      const course = parse(await readFile(file, "utf8")) as YamlCourse | null;
      if (course === null || typeof course !== "object") {
        throw new IndexError(`${where}: expected a course mapping`);
      }

      const courseId = text(course.id, where, "id");
      collections.push({
        id: courseId,
        kind: "course",
        slug: text(course.slug, where, "slug"),
        title: text(course.title, where, "title"),
        parentId: null,
        position: 0,
        // Everything the web app shows and no query joins on. It lives in
        // jsonb rather than as columns because the set differs per collection
        // kind and grows with the UI, not with the schema.
        metadata: {
          code: text(course.code, where, "code"),
          credits: typeof course.credits === "number" ? course.credits : null,
          prereq: optionalText(course.prereq),
          track: optionalText(course.track),
          notes: optionalText(course.notes),
          inferred: course.inferred === true,
          tags: stringList(course.tags),
          capstone: optionalText(course.capstone),
        },
      });

      const modules = Array.isArray(course.modules) ? course.modules : [];
      if (modules.length === 0) throw new IndexError(`${where}: course "${courseId}" has no modules`);

      for (const [moduleIndex, rawModule] of modules.entries()) {
        const mod = rawModule as YamlModule;
        const at = `${where} module[${moduleIndex}]`;
        const moduleId = text(mod.id, at, "id");
        moduleCount += 1;
        seenModules.add(moduleId);

        const order = typeof mod.order === "number" ? mod.order : moduleIndex + 1;
        collections.push({
          id: moduleId,
          kind: "module",
          slug: text(mod.slug, at, "slug"),
          title: text(mod.title, at, "title"),
          parentId: courseId,
          position: order,
          metadata: {},
        });

        // The module's shared-vocabulary topic, cross-checked against the
        // vocabulary's own mapping. Either file alone would be believable;
        // disagreeing is the thing that must never pass silently.
        const declared = optionalText(mod.topic);
        const mapped = vocabulary.byCourseModule.get(moduleId) ?? null;
        if (declared === null) {
          problems.add(`${at}: module "${moduleId}" has no \`topic:\` slug`);
          continue;
        }
        if (!vocabulary.bySlug.has(declared)) {
          problems.add(
            `${at}: module "${moduleId}" names topic "${declared}", which is not in ${VOCABULARY_FILE}`,
          );
          continue;
        }
        if (mapped === null) {
          problems.add(
            `${VOCABULARY_FILE}: module "${moduleId}" is in no topic's maps.courses, but ` +
              `${where} says its topic is "${declared}". Add it there.`,
          );
          continue;
        }
        if (mapped !== declared) {
          problems.add(
            `module "${moduleId}" has two different topics: ${where} says "${declared}", ` +
              `${VOCABULARY_FILE} maps it to "${mapped}". Fix one.`,
          );
          continue;
        }

        collectionItems.push({
          collectionId: moduleId,
          position: 0,
          topicSlug: declared,
          conceptSlug: null,
          assetId: null,
        });

        for (const [topicIndex, rawTopic] of (Array.isArray(mod.topics) ? mod.topics : []).entries()) {
          const item = rawTopic as YamlTopic;
          const itemAt = `${at} topics[${topicIndex}]`;
          const itemId = text(item.id, itemAt, "id");
          curriculumItems.push({
            id: itemId,
            collectionId: moduleId,
            position: topicIndex + 1,
            title: text(item.title, itemAt, "title"),
            subtopics: stringList(item.subtopics),
          });
          // Every item inherits the module's topic: that is how a course row
          // reaches the videos and notes about the same subject.
          curriculumItemTopics.push({ curriculumItemId: itemId, topicSlug: declared });
        }

        for (const rawResource of Array.isArray(mod.resources) ? mod.resources : []) {
          const resource = rawResource as YamlResource;
          const resourceId = text(resource.id, at, "resources[].id");
          const id = `${ASSET_PREFIX.courses}${resourceId}`;
          assets.push({
            id,
            kind: "link",
            path: null,
            url: text(resource.url, at, `resource "${resourceId}" url`),
            contentHash: null,
            bytes: null,
            title: text(resource.title, at, `resource "${resourceId}" title`),
            sourceRepo: "self-learn",
          });
          assetTopics.push({ assetId: id, topicSlug: declared });
        }
      }
    }

    problems.throwIfAny(COURSES_DIR);

    // The other direction: a mapping in the vocabulary naming a module that no
    // course file contains. That is a typo in topics.yaml and nothing else
    // would ever notice it, because the row it would have produced is absent.
    const orphanMappings = [...vocabulary.byCourseModule.keys()].filter((m) => !seenModules.has(m));
    if (orphanMappings.length > 0) {
      throw new IndexError(
        `${VOCABULARY_FILE}: maps.courses names ${orphanMappings.length} module(s) that no ` +
          `file in ${COURSES_DIR} defines: ${orphanMappings.join(", ")}`,
      );
    }

    const rows: SourceRows = {
      collection: collections,
      curriculumItem: curriculumItems,
      asset: assets,
      assetTopic: assetTopics,
      collectionItem: collectionItems,
      curriculumItemTopic: curriculumItemTopics,
    };
    return {
      rows,
      notes: [
        `${files.length} courses, ${moduleCount} modules, ${curriculumItems.length} curriculum items`,
        `${assets.length} curated links`,
      ],
    };
  },
};
