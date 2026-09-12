import { COURSES_DIR, loadCourses } from "@self-learn/content";
import type {
  NewAsset,
  NewAssetTopic,
  NewCollection,
  NewCollectionItem,
  NewCurriculumItem,
  NewCurriculumItemTopic,
} from "@self-learn/schema";

import { asIndexError } from "./content-errors";
import { IndexError, IndexErrors } from "./errors";
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
 * **It does not parse YAML.** `@self-learn/content` does, and the web app reads
 * the same function, so a course file means one thing in both places. What is
 * left here is the mapping from courses to rows, plus the one check only the
 * catalog can make: a module carries `topic: <slug>`, and that slug is also
 * listed under the topic's `maps.courses` in `content/topics.yaml`. Two files
 * stating the same fact is a drift risk, so this checks them against each other
 * and refuses when they disagree, rather than picking a winner. Every
 * curriculum item inherits its module's topic — an item is part of what the
 * module teaches, and giving items their own vocabulary entry would mean 300
 * more slugs to maintain for no query anyone has asked for.
 *
 * Curated resources become `link` assets: they have a URL and no bytes, which
 * is exactly what `asset`'s `num_nonnulls(path, url) = 1` check describes.
 */

export { COURSES_DIR };

export const coursesIndexer: Indexer = {
  source: "courses",
  owns: ["collection", "curriculumItem", "collectionItem", "curriculumItemTopic"],
  assetPrefix: ASSET_PREFIX.courses,
  root: () => COURSES_DIR,

  read: async ({ repoRoot, vocabulary }) => {
    const courses = asIndexError(() =>
      loadCourses({ root: repoRoot, topics: vocabulary.entries }),
    );

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

    for (const course of courses) {
      const where = `${COURSES_DIR}/${course.code.toLowerCase()}.yaml`;
      collections.push({
        id: course.id,
        kind: "course",
        slug: course.slug,
        title: course.title,
        parentId: null,
        position: course.order,
        // Everything the web app shows and no query joins on. It lives in
        // jsonb rather than as columns because the set differs per collection
        // kind and grows with the UI, not with the schema.
        metadata: {
          code: course.code,
          credits: course.credits,
          prereq: course.prereq ?? null,
          track: course.track ?? null,
          notes: course.notes ?? null,
          inferred: course.inferred,
          tags: course.tags,
          capstone: course.capstone,
        },
      });

      for (const mod of course.modules) {
        moduleCount += 1;
        seenModules.add(mod.id);

        collections.push({
          id: mod.id,
          kind: "module",
          slug: mod.slug,
          title: mod.title,
          parentId: course.id,
          position: mod.order,
          metadata: {},
        });

        // The module's shared-vocabulary topic, cross-checked against the
        // vocabulary's own mapping. Either file alone would be believable;
        // disagreeing is the thing that must never pass silently. That the slug
        // exists at all is already guaranteed by the reader.
        const declared = mod.topic;
        const mapped = vocabulary.byCourseModule.get(mod.id) ?? null;
        if (mapped === null) {
          problems.add(
            `${VOCABULARY_FILE}: module "${mod.id}" is in no topic's maps.courses, but ` +
              `${where} says its topic is "${declared}". Add it there.`,
          );
          continue;
        }
        if (mapped !== declared) {
          problems.add(
            `module "${mod.id}" has two different topics: ${where} says "${declared}", ` +
              `${VOCABULARY_FILE} maps it to "${mapped}". Fix one.`,
          );
          continue;
        }

        collectionItems.push({
          collectionId: mod.id,
          position: 0,
          topicSlug: declared,
          conceptSlug: null,
          assetId: null,
        });

        for (const [topicIndex, item] of mod.topics.entries()) {
          curriculumItems.push({
            id: item.id,
            collectionId: mod.id,
            position: topicIndex + 1,
            title: item.title,
            subtopics: item.subtopics,
          });
          // Every item inherits the module's topic: that is how a course row
          // reaches the videos and notes about the same subject.
          curriculumItemTopics.push({ curriculumItemId: item.id, topicSlug: declared });
        }

        for (const resource of mod.resources) {
          const id = `${ASSET_PREFIX.courses}${resource.id}`;
          assets.push({
            id,
            kind: "link",
            path: null,
            url: resource.url,
            contentHash: null,
            bytes: null,
            title: resource.title,
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
        `${courses.length} courses, ${moduleCount} modules, ${curriculumItems.length} curriculum items`,
        `${assets.length} curated links`,
      ],
    };
  },
};
