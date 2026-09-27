import { loadTags, TAGS_FILE } from "@self-learn/content";
import type { NewTag } from "@self-learn/schema";

import { asIndexError } from "./content-errors";
import type { Indexer } from "./source";

/**
 * `content/tags.yaml` into `tag`, in file order.
 *
 * Before 0.5 of docs/CONTENT-MIGRATION.md a tag reached Postgres only as a
 * string inside a course's metadata, so a tag no course wore would export and
 * never come back. The courses source links courses to these rows through
 * `collection_tag`, which is why it runs after this one.
 */
export const tagsIndexer: Indexer = {
  source: "tags",
  owns: ["tag"],
  root: () => TAGS_FILE,
  read: async ({ repoRoot }) => {
    const tags = asIndexError(() => loadTags({ root: repoRoot }));
    const rows: NewTag[] = tags.map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      description: entry.description,
      position: index + 1,
    }));
    return { rows: { tag: rows }, notes: [`${rows.length} tags`] };
  },
};
