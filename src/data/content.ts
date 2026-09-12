import "server-only";

import { loadTags } from "@self-learn/content";

import type { TagMeta } from "@/lib/types";

/**
 * The app's view of `content/tags.yaml`: the cross-course themes.
 *
 * Server only, for the same reason as `@/data/courses` — it reads the
 * filesystem. `TagChip` is rendered inside client components, so a server page
 * resolves the metadata here and passes the chip what it displays.
 *
 * Read once per process.
 */
export const tags: TagMeta[] = loadTags();

/**
 * The theme with this id. An unknown id still renders: the chip falls back to
 * showing the raw id, which is what it did when the list was a TypeScript
 * array and `getTag` returned undefined. A tag typo should cost a label, not
 * a page.
 */
export function getTag(id: string): TagMeta {
  return tags.find((t) => t.id === id) ?? { id, label: id, description: "" };
}

/** Metadata for a course's `tags:`, in the order the course lists them. */
export function getTags(ids: readonly string[]): TagMeta[] {
  return ids.map(getTag);
}
