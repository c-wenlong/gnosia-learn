import type { Indexer } from "./source";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * `content/topics.yaml` into the `topic` table.
 *
 * The thinnest indexer in the set, and the one every other source depends on:
 * `topic.slug` is the foreign key an asset, a curriculum item and a concept all
 * reach each other through. The reading and the validation both live in
 * `vocabulary.ts`, because every other indexer needs the same lookups and
 * loading the file twice would let two sources disagree about it.
 */
export const topicsIndexer: Indexer = {
  source: "topics",
  owns: ["topic"],
  root: () => VOCABULARY_FILE,
  read: async ({ vocabulary }) => ({
    rows: {
      topic: vocabulary.entries.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        domain: entry.domain,
        summary: entry.summary,
        aliases: entry.aliases,
      })),
    },
    notes: [`${vocabulary.entries.length} topics across ${countDomains(vocabulary.entries)} domains`],
  }),
};

function countDomains(entries: readonly { domain: string }[]): number {
  return new Set(entries.map((e) => e.domain)).size;
}
