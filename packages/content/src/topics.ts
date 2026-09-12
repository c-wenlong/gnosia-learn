import path from "node:path";

import { parse } from "yaml";

import { ContentError } from "./errors";
import { KEBAB_SLUG, readYamlFile, repoRoot, requireText, stringList, type LoadOptions } from "./read";
import type { TopicEntry } from "./types";

/**
 * `content/topics.yaml`: the shared topic vocabulary.
 *
 * The slug is the foreign key everything else points at, so the file is
 * validated hard on the way in: a duplicate slug would make the same subject
 * two subjects, and a missing one would make a course module belong to nothing.
 *
 * The catalog builds its `maps` lookups on top of this rather than parsing the
 * file a second time. Two parsers of one file is exactly the drift this package
 * exists to remove.
 */

export const TOPICS_FILE = "content/topics.yaml";

interface RawEntry {
  slug?: unknown;
  title?: unknown;
  domain?: unknown;
  summary?: unknown;
  aliases?: unknown;
  maps?: { manimkc?: unknown; courses?: unknown; concepts?: unknown };
}

export function loadTopics(options?: LoadOptions): TopicEntry[] {
  const absolute = path.join(repoRoot(options), TOPICS_FILE);
  let raw: string;
  try {
    raw = readYamlFile(absolute, TOPICS_FILE);
  } catch (error) {
    if (error instanceof ContentError) {
      throw new ContentError(
        `${TOPICS_FILE} does not exist. The shared topic vocabulary is the ` +
          `required join for every other source; nothing can be indexed without it.`,
      );
    }
    throw error;
  }

  const parsed = parse(raw) as { topics?: unknown } | null;
  const list = parsed?.topics;
  if (!Array.isArray(list)) {
    throw new ContentError(`${TOPICS_FILE}: expected a top-level "topics:" list`);
  }

  const entries: TopicEntry[] = [];
  const seen = new Set<string>();

  for (const [i, item] of list.entries()) {
    const rawEntry = item as RawEntry;
    const where = `${TOPICS_FILE} topics[${i}]`;
    const slug = requireText(rawEntry.slug, where, "slug");
    if (!KEBAB_SLUG.test(slug)) {
      throw new ContentError(`${where}: slug "${slug}" is not kebab-case`);
    }
    if (seen.has(slug)) {
      throw new ContentError(`${TOPICS_FILE}: topic slug "${slug}" appears twice`);
    }
    seen.add(slug);

    const at = `${TOPICS_FILE} topic "${slug}"`;
    const summary = typeof rawEntry.summary === "string" ? rawEntry.summary.trim() : "";
    entries.push({
      slug,
      title: requireText(rawEntry.title, at, "title"),
      domain: requireText(rawEntry.domain, at, "domain"),
      summary: summary === "" ? null : summary,
      aliases: stringList(rawEntry.aliases, at, "aliases"),
      maps: {
        manimkc: stringList(rawEntry.maps?.manimkc, at, "maps.manimkc"),
        courses: stringList(rawEntry.maps?.courses, at, "maps.courses"),
        concepts: stringList(rawEntry.maps?.concepts, at, "maps.concepts"),
      },
    });
  }

  if (entries.length === 0) {
    throw new ContentError(`${TOPICS_FILE}: the vocabulary is empty`);
  }

  return entries;
}
