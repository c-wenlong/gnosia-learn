import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  NewAsset,
  NewAssetConcept,
  NewAssetTopic,
  NewConcept,
  NewConceptCurriculumItem,
  NewConceptPrerequisite,
} from "@self-learn/schema";

import { IndexError, IndexErrors } from "./errors";
import { directoriesIn, fileFacts, filesIn, relativeTo } from "./files";
import { parseFrontmatter, readList, readText } from "./frontmatter";
import { ASSET_PREFIX, type Indexer, type SourceRows } from "./source";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * `learn/concepts/<domain>/*.md` into concepts, prerequisites and note assets.
 *
 * A concept is the only thing in the catalog that carries mastery and
 * prerequisites, so this indexer produces three different kinds of edge from
 * one file:
 *
 * - `concept_prerequisite`, from the note's `requires:` and `assumes:` lists.
 *   Both point at other concepts; `requires` is hard, `assumes` is soft, and
 *   the distinction is kept because the graph code reads them differently.
 * - `concept_curriculum_item`, from the note's `topics:` list. That key is
 *   misleadingly named: its values are *curriculum item* ids like
 *   `cp4284-m1-t1`, not shared-vocabulary topic slugs. This is the one
 *   cross-tree link that already existed in the files before the catalog.
 * - `asset_concept` and `asset_topic`, because the note itself is a file with
 *   bytes — an agent that wants to read it needs the path, and `show` gives it
 *   the path rather than the body.
 *
 * The concept's own topic comes from `maps.concepts` in `content/topics.yaml`,
 * because the note frontmatter has no field for it. Every one of the notes must
 * resolve; a note with no topic would be unreachable from a course or a video
 * about the same subject, which is the entire point of the vocabulary.
 */

export const CONCEPTS_DIR = "learn/concepts";

export const conceptsIndexer: Indexer = {
  source: "concepts",
  owns: ["concept", "conceptPrerequisite", "conceptCurriculumItem"],
  assetPrefix: ASSET_PREFIX.concepts,
  root: () => CONCEPTS_DIR,

  read: async ({ repoRoot, vocabulary, knownCurriculumItems }) => {
    const directory = path.join(repoRoot, CONCEPTS_DIR);
    const files: string[] = [];
    for (const domain of await directoriesIn(directory)) {
      files.push(...(await filesIn(domain, [".md"])));
    }

    const concepts: NewConcept[] = [];
    const assets: NewAsset[] = [];
    const assetConcepts: NewAssetConcept[] = [];
    const assetTopics: NewAssetTopic[] = [];
    /** Deferred until every concept slug is known, so a prerequisite can be checked. */
    const prerequisiteDrafts: { from: string; to: string; kind: "requires" | "assumes"; where: string }[] =
      [];
    const curriculumDrafts: { concept: string; item: string; where: string }[] = [];

    const problems = new IndexErrors();
    const slugs = new Set<string>();

    for (const file of files) {
      const where = relativeTo(repoRoot, file);
      const { data } = parseFrontmatter(await readFile(file, "utf8"));

      // The id in the frontmatter wins over the filename. They agree today, and
      // when they do not the id is what every `requires:` list in every other
      // note points at, so it is the one that must be the primary key.
      const slug = readText(data, "id") ?? path.basename(file, ".md");
      if (slugs.has(slug)) {
        problems.add(`${where}: concept id "${slug}" is already defined by another note`);
        continue;
      }
      slugs.add(slug);

      const topicSlug = vocabulary.byConcept.get(slug);
      if (topicSlug === undefined) {
        problems.add(
          `${where}: concept "${slug}" is in no topic's maps.concepts in ${VOCABULARY_FILE}. ` +
            `A note with no topic cannot be reached from a course or a video about the same subject.`,
        );
        continue;
      }

      concepts.push({
        slug,
        title: readText(data, "title") ?? slug,
        summary: readText(data, "summary"),
        topicSlug,
        path: where,
      });

      for (const kind of ["requires", "assumes"] as const) {
        for (const target of readList(data, kind)) {
          prerequisiteDrafts.push({ from: slug, to: target, kind, where });
        }
      }
      for (const item of readList(data, "topics")) {
        curriculumDrafts.push({ concept: slug, item, where });
      }

      // The note is also a file. Hashing it is what lets bundle 6 notice a
      // diagram or a transcript that no longer matches the note it came from.
      const { contentHash, bytes } = await fileFacts(file);
      const id = `${ASSET_PREFIX.concepts}${where}`;
      assets.push({
        id,
        kind: "note",
        path: where,
        url: null,
        contentHash,
        bytes,
        title: readText(data, "title") ?? slug,
        sourceRepo: "self-learn",
      });
      assetConcepts.push({ assetId: id, conceptSlug: slug });
      assetTopics.push({ assetId: id, topicSlug });
    }

    problems.throwIfAny(CONCEPTS_DIR);

    // Prerequisites resolve against the concepts just read, not against the
    // database: a note may legitimately require one indexed moments ago in the
    // same run, and a foreign key error would name the constraint rather than
    // the file with the typo in it.
    const prerequisites: NewConceptPrerequisite[] = [];
    const seenPrerequisites = new Set<string>();
    for (const draft of prerequisiteDrafts) {
      if (!slugs.has(draft.to)) {
        problems.add(
          `${draft.where}: ${draft.kind}: "${draft.to}", which is not a concept in ${CONCEPTS_DIR}`,
        );
        continue;
      }
      if (draft.to === draft.from) {
        problems.add(`${draft.where}: ${draft.kind} itself`);
        continue;
      }
      const key = `${draft.from} ${draft.to} ${draft.kind}`;
      if (seenPrerequisites.has(key)) continue;
      seenPrerequisites.add(key);
      prerequisites.push({
        conceptSlug: draft.from,
        prerequisiteSlug: draft.to,
        kind: draft.kind,
      });
    }

    // `topics:` names curriculum items, which the courses indexer produces.
    // Checking against the vocabulary's course modules would not be enough:
    // these ids are item-level (`cp4284-m1-t1`), one level below a module.
    // Without this check the failure is a bare foreign-key error naming a
    // constraint rather than the note that has the typo.
    const known = await knownCurriculumItems();
    const curriculumItems: NewConceptCurriculumItem[] = [];
    const seenCurriculum = new Set<string>();
    for (const draft of curriculumDrafts) {
      if (!known.has(draft.item)) {
        problems.add(
          `${draft.where}: topics: "${draft.item}", which is not a curriculum item in any ` +
            `course. That key names curriculum items, not shared-vocabulary topic slugs.`,
        );
        continue;
      }
      const key = `${draft.concept} ${draft.item}`;
      if (seenCurriculum.has(key)) continue;
      seenCurriculum.add(key);
      curriculumItems.push({ conceptSlug: draft.concept, curriculumItemId: draft.item });
    }

    problems.throwIfAny(CONCEPTS_DIR);

    if (concepts.length === 0) {
      throw new IndexError(`${CONCEPTS_DIR}: no concept notes found`);
    }

    const rows: SourceRows = {
      concept: concepts,
      asset: assets,
      assetTopic: assetTopics,
      assetConcept: assetConcepts,
      conceptPrerequisite: prerequisites,
      conceptCurriculumItem: curriculumItems,
    };
    return {
      rows,
      notes: [
        `${concepts.length} notes, ${prerequisites.length} prerequisites, ` +
          `${curriculumItems.length} curriculum links`,
      ],
    };
  },
};
