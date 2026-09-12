import path from "node:path";

import { parse } from "yaml";

import { ContentError } from "./errors";
import { KEBAB_SLUG, readYamlFile, repoRoot, requireText, type LoadOptions } from "./read";
import type { TagMeta } from "./types";

/**
 * `content/tags.yaml`: the cross-course themes.
 *
 * Small enough to have stayed a TypeScript literal, and that is exactly why it
 * moved: a course file naming `hci` and a TypeScript array defining `hci` are
 * one fact in two languages, and the YAML half is the one an editor touches.
 */

export const TAGS_FILE = "content/tags.yaml";

interface RawTag {
  id?: unknown;
  label?: unknown;
  description?: unknown;
}

export function loadTags(options?: LoadOptions): TagMeta[] {
  const absolute = path.join(repoRoot(options), TAGS_FILE);
  const parsed = parse(readYamlFile(absolute, TAGS_FILE)) as { tags?: unknown } | null;
  const list = parsed?.tags;
  if (!Array.isArray(list)) {
    throw new ContentError(`${TAGS_FILE}: expected a top-level "tags:" list`);
  }

  const tags: TagMeta[] = [];
  const seen = new Set<string>();
  for (const [i, item] of list.entries()) {
    const where = `${TAGS_FILE} tags[${i}]`;
    const id = requireText((item as RawTag)?.id, where, "id");
    if (!KEBAB_SLUG.test(id)) {
      throw new ContentError(`${where}: id "${id}" is not kebab-case`);
    }
    if (seen.has(id)) {
      throw new ContentError(`${TAGS_FILE}: tag id "${id}" appears twice`);
    }
    seen.add(id);
    const at = `${TAGS_FILE} tag "${id}"`;
    tags.push({
      id,
      label: requireText((item as RawTag).label, at, "label"),
      description: requireText((item as RawTag).description, at, "description"),
    });
  }

  if (tags.length === 0) {
    throw new ContentError(`${TAGS_FILE}: no tags defined`);
  }
  return tags;
}
