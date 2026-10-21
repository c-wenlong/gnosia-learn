import { existsSync } from "node:fs";
import path from "node:path";

import { key as blobKey } from "@gnosia/blob";
import { COURSES_DIR, loadCourses } from "@gnosia/content";
import {
  LOCAL_LEARNER_ID,
  type NewAsset,
  NewAssetTopic,
  type NewCollection,
  type NewCollectionItem,
  type NewCollectionTag,
  type NewConceptCurriculumItem,
  type NewCurriculumItem,
  type NewCurriculumItemAsset,
  type NewCurriculumItemTopic,
} from "@gnosia/schema";

import {
  type CoverCredit,
  type CoverImage,
  CoverImageError,
  creditOf,
  keyParts,
  readCoverImage,
} from "../content/cover-image";
import { asIndexError } from "./content-errors";
import { IndexError, IndexErrors } from "./errors";
import { ASSET_PREFIX, type Indexer, type SourceBlob, type SourceRows } from "./source";
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
 * **It does not parse YAML.** `@gnosia/content` does, and the web app reads
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
 * A row's `concepts:` list becomes `concept_curriculum_item` rows with the
 * list's order as `position`. The course file is the one place that link is
 * authored (docs/proposals/course-items-declare-concepts.md); the reader has
 * already checked each id sits under the module's topic in the vocabulary,
 * and what is left here is that a note with that id exists, which only the
 * catalog knows. The concepts source runs first for exactly that reason.
 *
 * Curated resources become `link` assets: they have a URL and no bytes, which
 * is exactly what `asset`'s location check describes. Each carries its
 * `type:` as `asset.resource_type`, and the module holds it as a
 * `collection_item` row at its place in the `resources:` list. Two modules can
 * share a topic, so the topic cannot say which module a link belongs to; the
 * membership row can, and `catalog export` reads the list back from it.
 *
 * A reading's `lessons:` become `curriculum_item_asset` rows, each with the
 * item's place in that list as `position`, so the export writes the list
 * back as it was written; the reader has already checked each id is an item
 * of the reading's own module. A lesson's `videos:` is `curriculum_item.videos`
 * and a module's is `metadata.videos`, kept as data and never resolved here,
 * since the video tools index after this source and a clone may have none
 * (docs/proposals/module-learning-path.md). Both are left out of a module's
 * metadata and an item's snapshot while empty, so a course that lists none
 * writes exactly the rows it did before.
 *
 * A course's `tags:` become `collection_tag` rows in list order, pointing at
 * the rows the tags source wrote. The strings stay in `metadata.tags` as well,
 * because the web app reads them there until Track B moves its reader.
 *
 * A course's `cover:` names the image beside its file
 * (`content/courses/<code>.cover.<ext>`). The image is handed back as a
 * `SourceBlob`, which the runner stores before the rows are written, the way
 * the diagrams source hands back each SVG; the course row names its key in
 * `cover_blob_key` and carries the credit as `metadata.coverCredit`. An image
 * that is missing, is not a WebP, JPEG or PNG by its bytes, or is not the type
 * its name says, is refused by name, never skipped.
 *
 * **An import sets a cover the course lacks, and never changes one it has**
 * (`knownCovers`), the rule `course import` keeps. A file with no `cover:`
 * (an export from before covers, say) keeps the stored cover and credit, so
 * importing an old archive takes no photo away. A `cover:` that names the
 * stored cover exactly is carried over, its image optional; one that differs
 * in its credit, its type or its bytes is refused by name, and `catalog course
 * cover` is how a cover changes.
 */

export { COURSES_DIR };

export const coursesIndexer: Indexer = {
  source: "courses",
  owns: [
    "collection",
    "curriculumItem",
    "collectionItem",
    "curriculumItemTopic",
    "conceptCurriculumItem",
    "curriculumItemAsset",
    "collectionTag",
  ],
  assetPrefix: ASSET_PREFIX.courses,
  root: () => COURSES_DIR,

  read: async ({ repoRoot, vocabulary, knownConcepts, knownCovers, owner = LOCAL_LEARNER_ID }) => {
    const courses = asIndexError(() =>
      loadCourses({ root: repoRoot, topics: vocabulary.entries }),
    );
    const concepts = await knownConcepts();
    const covers = await knownCovers();

    const collections: NewCollection[] = [];
    const curriculumItems: NewCurriculumItem[] = [];
    const collectionItems: NewCollectionItem[] = [];
    const curriculumItemTopics: NewCurriculumItemTopic[] = [];
    const conceptLinks: NewConceptCurriculumItem[] = [];
    const readingLinks: NewCurriculumItemAsset[] = [];
    const assets: NewAsset[] = [];
    const assetTopics: NewAssetTopic[] = [];
    const collectionTags: NewCollectionTag[] = [];
    const blobs: SourceBlob[] = [];

    const problems = new IndexErrors();
    /** Modules seen here, so the vocabulary's own `maps.courses` can be checked back. */
    const seenModules = new Set<string>();
    let moduleCount = 0;

    for (const course of courses) {
      const where = `${COURSES_DIR}/${course.code.toLowerCase()}.yaml`;
      const stored = covers.get(course.id);
      let coverBlobKey: string | null = null;
      let coverCredit: CoverCredit | null = null;
      if (course.cover === undefined) {
        // A file from before covers existed, or an export cut before this one
        // was set: it says nothing about the cover, so the stored one stays.
        if (stored !== undefined) ({ key: coverBlobKey, credit: coverCredit } = stored);
      } else {
        const named = `${COURSES_DIR}/${course.cover.file}`;
        const file = path.join(repoRoot, COURSES_DIR, course.cover.file);
        const credit = creditOf(course.cover);
        const differs = stored === undefined ? [] : coverDifferences(stored, course.cover.file, credit);
        let image: CoverImage | null = null;
        try {
          // A file that names the stored cover exactly may leave the image
          // out; any other must carry it.
          image = stored !== undefined && differs.length === 0 && !existsSync(file) ? null : await readCoverImage(file, named);
        } catch (error) {
          if (!(error instanceof CoverImageError)) throw error;
          problems.add(`${where}: its cover cannot be stored: ${error.message}`);
        }
        if (image !== null && !course.cover.file.endsWith(`.${image.ext}`)) {
          problems.add(`${where}: cover ${named} holds a ${image.ext.toUpperCase()} image; name it ${course.code.toLowerCase()}.cover.${image.ext}`);
          image = null;
        }
        const key = image === null ? null : blobKey(owner, image.sha256, image.ext);
        if (stored !== undefined && key !== null && key !== stored.key) differs.push(`${named} is not the stored image`);
        if (differs.length > 0) {
          problems.add(
            `${where}: its cover: is not course "${course.id}"'s cover in the catalog (${differs.join("; ")}). ` +
              `An import does not change a cover; \`catalog course cover ${course.id}\` sets, replaces or clears it.`,
          );
        } else if (stored !== undefined) {
          ({ key: coverBlobKey, credit: coverCredit } = stored);
        } else if (image !== null && key !== null) {
          coverBlobKey = key;
          coverCredit = credit;
          blobs.push({ file, ownerId: owner, mime: image.mime, ext: image.ext, sha256: image.sha256, bytes: image.bytes.length });
        }
      }
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
          // Only with a cover: a course without one keeps the metadata it
          // had before covers existed, so its snapshot does not move.
          ...(coverBlobKey === null || coverCredit === null ? {} : { coverCredit }),
        },
        coverBlobKey,
      });
      for (const [index, tagId] of course.tags.entries()) {
        collectionTags.push({ collectionId: course.id, tagId, position: index + 1 });
      }

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
          // Only with a list: a module that lists no video keeps the metadata
          // it had before 0022, so its snapshot does not move.
          metadata: mod.videos === undefined ? {} : { videos: mod.videos },
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
          // Where the vocabulary lists this module under the topic, so the
          // export writes `maps.courses` in the order it was written. A rank;
          // the writer places the stored number (D22).
          topicPosition: (vocabulary.bySlug.get(declared)?.maps.courses.indexOf(mod.id) ?? -1) + 1,
        });

        for (const [topicIndex, item] of mod.topics.entries()) {
          curriculumItems.push({
            id: item.id,
            collectionId: mod.id,
            // A rank in the module; the writer places the stored number
            // (D22), so an item added at the top is one revision.
            position: topicIndex + 1,
            title: item.title,
            subtopics: item.subtopics,
            videos: item.videos ?? [],
          });
          // Every item inherits the module's topic: that is how a course row
          // reaches the videos and notes about the same subject.
          curriculumItemTopics.push({ curriculumItemId: item.id, topicSlug: declared });

          // Checked against the concepts just indexed rather than left to the
          // foreign key, so the error names the course file and the id rather
          // than a constraint.
          for (const [conceptIndex, slug] of item.concepts.entries()) {
            if (!concepts.has(slug)) {
              problems.add(
                `${where}: item "${item.id}" lists concept "${slug}", which is not a note ` +
                  `in learn/concepts`,
              );
              continue;
            }
            conceptLinks.push({
              conceptSlug: slug,
              curriculumItemId: item.id,
              position: conceptIndex + 1,
            });
          }
        }

        for (const [resourceIndex, resource] of mod.resources.entries()) {
          const id = `${ASSET_PREFIX.courses}${resource.id}`;
          assets.push({
            id,
            kind: "link",
            path: null,
            url: resource.url,
            contentHash: null,
            bytes: null,
            title: resource.title,
            sourceRepo: "gnosia",
            resourceType: resource.type,
          });
          assetTopics.push({ assetId: id, topicSlug: declared });
          collectionItems.push({
            collectionId: mod.id,
            position: resourceIndex + 1,
            topicSlug: null,
            conceptSlug: null,
            assetId: id,
          });
          for (const [lessonIndex, lesson] of (resource.lessons ?? []).entries()) {
            readingLinks.push({ curriculumItemId: lesson, assetId: id, position: lessonIndex + 1 });
          }
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
      conceptCurriculumItem: conceptLinks,
      curriculumItemAsset: readingLinks,
      collectionTag: collectionTags,
    };
    return {
      rows,
      notes: [
        `${courses.length} courses, ${moduleCount} modules, ${curriculumItems.length} curriculum items`,
        `${assets.length} curated links, ${conceptLinks.length} concept links, ` +
          `${readingLinks.length} reading links, ${blobs.length} cover(s)`,
      ],
      blobs,
      coversRead: new Map(courses.map((course) => [course.id, covers.get(course.id) ?? null] as const)),
    };
  },
};

/** How a file's `cover:` differs from the stored cover's type and credit. */
function coverDifferences(stored: { key: string; credit: CoverCredit | null }, file: string, credit: CoverCredit): string[] {
  const out: string[] = [];
  const { ext } = keyParts(stored.key);
  if (!file.endsWith(`.${ext}`)) out.push(`the stored image is a .${ext}, not ${file}`);
  for (const field of ["photographer", "source", "licence"] as const) {
    if (stored.credit?.[field] !== credit[field]) out.push(`${field} is ${JSON.stringify(stored.credit?.[field] ?? null)}`);
  }
  return out;
}
