import "server-only";

import { cache } from "react";

import { contentSource } from "@/data/source";
import type { TagMeta } from "@/lib/types";

/**
 * The app's view of the cross-course themes.
 *
 * Server only, for the same reason as `@/data/courses`: it reads content.
 * `TagChip` is rendered inside client components, so a server page resolves
 * the metadata here and passes the chip what it displays.
 *
 * Once per request, through the content seam, like `getCourses`.
 */
export const getTags = cache(async (): Promise<TagMeta[]> => contentSource().tags());

/**
 * The theme with this id. An unknown id still renders: the chip falls back to
 * showing the raw id, which is what it did when the list was a TypeScript
 * array and `getTag` returned undefined. A tag typo should cost a label, not
 * a page.
 */
export function tagFor(tags: readonly TagMeta[], id: string): TagMeta {
  return tags.find((t) => t.id === id) ?? { id, label: id, description: "" };
}

/** Metadata for a course's `tags:`, in the order the course lists them. */
export function tagsFor(tags: readonly TagMeta[], ids: readonly string[]): TagMeta[] {
  return ids.map((id) => tagFor(tags, id));
}
