import path from "node:path";

import { parse } from "yaml";

import { ContentError } from "./errors";
import {
  KEBAB_SLUG,
  mappingList,
  readYamlFile,
  repoRoot,
  requireText,
  stringList,
  type LoadOptions,
} from "./read";
import type { TopicEntry, TopicRelation, TopicRelationKind } from "./types";

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

/**
 * The relation kinds, as `topic_relation.kind`'s CHECK has them
 * (`TOPIC_RELATION_KINDS` in `@self-learn/schema`, which this package does not
 * depend on). A test holds the two lists equal.
 */
export const TOPIC_RELATION_KINDS: readonly TopicRelationKind[] = ["broader", "related", "precedes"];

interface RawEntry {
  slug?: unknown;
  title?: unknown;
  domain?: unknown;
  summary?: unknown;
  aliases?: unknown;
  relations?: unknown;
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
      relations: readRelations(rawEntry.relations, at),
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

  checkRelations(entries, seen);
  return entries;
}

/**
 * One topic's `relations:` list, shape only: `- {kind: broader, to: <slug>}`.
 * Whether `to` exists is `checkRelations`'s question, since it needs every
 * entry read first.
 */
function readRelations(value: unknown, at: string): TopicRelation[] {
  const relations: TopicRelation[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of mappingList(value, at, "relations").entries()) {
    const where = `${at} relations[${i}]`;
    const kind = requireText(raw["kind"], where, "kind");
    if (!(TOPIC_RELATION_KINDS as readonly string[]).includes(kind)) {
      throw new ContentError(
        `${where}: kind "${kind}" is not one of ${TOPIC_RELATION_KINDS.join(", ")}`,
      );
    }
    const to = requireText(raw["to"], where, "to");
    const key = `${kind} ${to}`;
    if (seen.has(key)) {
      throw new ContentError(`${at}: relations lists "${kind}" to "${to}" twice`);
    }
    seen.add(key);
    relations.push({ kind: kind as TopicRelationKind, to });
  }
  return relations;
}

/**
 * The rules a relation has in the database (`topic_relation`), checked here so
 * the file cannot say something the table would refuse, or say one thing two
 * ways.
 *
 * `related` is symmetric and stored once, under the smaller slug, so it is
 * written once, under that topic. Listing it under the other one would make
 * the export move it, and the file that came back would not be the file that
 * went in. Every topic has 0 relations until Track A, so nothing is refused
 * today.
 */
function checkRelations(entries: readonly TopicEntry[], slugs: ReadonlySet<string>): void {
  for (const entry of entries) {
    const at = `${TOPICS_FILE} topic "${entry.slug}"`;
    for (const relation of entry.relations) {
      if (relation.to === entry.slug) {
        throw new ContentError(`${at}: relations points at the topic itself`);
      }
      if (!slugs.has(relation.to)) {
        throw new ContentError(
          `${at}: relations names "${relation.to}", which is not a topic in ${TOPICS_FILE}`,
        );
      }
      if (relation.kind === "related" && !(entry.slug < relation.to)) {
        throw new ContentError(
          `${at}: "related" to "${relation.to}" belongs under "${relation.to}", the ` +
            `alphabetically smaller slug. A related edge is symmetric and is written once, there.`,
        );
      }
    }
  }
}
