import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  NewAsset,
  NewAssetConcept,
  NewAssetTopic,
  NewConcept,
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
 * prerequisites, so this indexer produces two different kinds of edge from
 * one file:
 *
 * - `concept_prerequisite`, from the note's `requires:` and `assumes:` lists.
 *   Both point at other concepts; `requires` is hard, `assumes` is soft, and
 *   the distinction is kept because the graph code reads them differently.
 * - `asset_concept` and `asset_topic`, because the note itself is a file with
 *   bytes — an agent that wants to read it needs the path, and `show` gives it
 *   the path rather than the body.
 *
 * The link from a note to a course row, `concept_curriculum_item`, used to be
 * a third edge here, read from a `topics:` frontmatter key whose values were
 * curriculum item ids. It is authored in the course file now, as
 * `topics[].concepts`, and the courses source writes it
 * (docs/proposals/course-items-declare-concepts.md). A note that still
 * carries the key is refused by name rather than read, because a link that
 * two files can state is a link two files can disagree about.
 *
 * The concept's own topic comes from `maps.concepts` in `content/topics.yaml`,
 * because the note frontmatter has no field for it. Every one of the notes must
 * resolve; a note with no topic would be unreachable from a course or a video
 * about the same subject, which is the entire point of the vocabulary.
 */

export const CONCEPTS_DIR = "learn/concepts";

/** The retired frontmatter key; see the module comment. */
const RETIRED_LINK_KEY = "topics";

export const conceptsIndexer: Indexer = {
  source: "concepts",
  owns: ["concept", "conceptPrerequisite"],
  assetPrefix: ASSET_PREFIX.concepts,
  root: () => CONCEPTS_DIR,

  read: async ({ repoRoot, vocabulary }) => {
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

    const problems = new IndexErrors();
    const slugs = new Set<string>();

    for (const file of files) {
      const where = relativeTo(repoRoot, file);
      const { data } = parseFrontmatter(await readFile(file, "utf8"));

      if (RETIRED_LINK_KEY in data) {
        problems.add(
          `${where}: has a \`${RETIRED_LINK_KEY}:\` key. A note no longer names its course rows; ` +
            `list the concept under the row's \`concepts:\` in content/courses/ and delete the key.`,
        );
        continue;
      }

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
        // Where the topic lists it, so the export writes `maps.concepts` back
        // in the order it was authored.
        topicPosition: (vocabulary.bySlug.get(topicSlug)?.maps.concepts.indexOf(slug) ?? -1) + 1,
        path: where,
      });

      for (const kind of ["requires", "assumes"] as const) {
        for (const target of readList(data, kind)) {
          prerequisiteDrafts.push({ from: slug, to: target, kind, where });
        }
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

    // The other direction: a `maps.concepts` entry naming no note. The
    // mapping is stored as the note's own `concept.topic_slug`, so a mapping
    // with no note behind it has no row to live in and would silently vanish
    // from the next export.
    for (const [mapped, topicSlug] of vocabulary.byConcept) {
      if (slugs.has(mapped)) continue;
      problems.add(
        `${VOCABULARY_FILE}: topic "${topicSlug}" lists concept "${mapped}" in maps.concepts, ` +
          `but no note in ${CONCEPTS_DIR} has that id. Write the note, or remove the mapping.`,
      );
    }

    problems.throwIfAny(CONCEPTS_DIR);

    // Prerequisites resolve against the concepts just read, not against the
    // database: a note may legitimately require one indexed moments ago in the
    // same run, and a foreign key error would name the constraint rather than
    // the file with the typo in it.
    const prerequisites: NewConceptPrerequisite[] = [];
    const seenPrerequisites = new Set<string>();
    /** Next position per note and list: `requires:` and `assumes:` are two lists. */
    const nextPosition = new Map<string, number>();
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
      const list = `${draft.from} ${draft.kind}`;
      const position = (nextPosition.get(list) ?? 0) + 1;
      nextPosition.set(list, position);
      prerequisites.push({
        conceptSlug: draft.from,
        prerequisiteSlug: draft.to,
        kind: draft.kind,
        position,
      });
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
    };
    return {
      rows,
      notes: [`${concepts.length} notes, ${prerequisites.length} prerequisites`],
    };
  },
};
