import type { NewManimkcTopic, NewTopic, NewTopicRelation } from "@self-learn/schema";

import type { Indexer } from "./source";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * `content/topics.yaml` into `topic`, `topic_relation` and `manimkc_topic`.
 *
 * The one every other source depends on: `topic.slug` is the foreign key an
 * asset, a curriculum item and a concept all reach each other through. The
 * reading and the validation both live in `vocabulary.ts`, because every other
 * indexer needs the same lookups and loading the file twice would let two
 * sources disagree about it.
 *
 * Every list the file holds in an authored order keeps that order as a
 * position, so `catalog export` writes the file back the way a person wrote
 * it (docs/CONTENT-MIGRATION.md 0.5): the topics themselves, each one's
 * `relations:` and its `maps.manimkc`. `maps.concepts` and `maps.courses` are
 * stored by the sources that own those rows, as `concept.topic_position` and
 * the module's `collection_item.topic_position`.
 *
 * A `related` edge is stored once, under the smaller slug, and the reader has
 * already refused one written under the other (`packages/content/src/topics.ts`).
 */
export const topicsIndexer: Indexer = {
  source: "topics",
  owns: ["topic", "topicRelation", "manimkcTopic"],
  root: () => VOCABULARY_FILE,
  read: async ({ vocabulary }) => {
    const topics: NewTopic[] = [];
    const relations: NewTopicRelation[] = [];
    const manimkc: NewManimkcTopic[] = [];
    for (const [index, entry] of vocabulary.entries.entries()) {
      topics.push({
        slug: entry.slug,
        title: entry.title,
        domain: entry.domain,
        summary: entry.summary,
        aliases: entry.aliases,
        position: index + 1,
      });
      for (const [at, relation] of entry.relations.entries()) {
        relations.push({
          fromSlug: entry.slug,
          toSlug: relation.to,
          kind: relation.kind,
          position: at + 1,
        });
      }
      for (const [at, path] of entry.maps.manimkc.entries()) {
        manimkc.push({ path, topicSlug: entry.slug, position: at + 1 });
      }
    }
    return {
      rows: { topic: topics, topicRelation: relations, manimkcTopic: manimkc },
      notes: [
        `${topics.length} topics across ${countDomains(vocabulary.entries)} domains, ` +
          `${relations.length} relations, ${manimkc.length} manimkc paths`,
      ],
    };
  },
};

function countDomains(entries: readonly { domain: string }[]): number {
  return new Set(entries.map((e) => e.domain)).size;
}
