import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { IndexError } from "./errors";

/**
 * `content/topics.yaml`: the shared topic vocabulary, and the three lookup
 * tables every other indexer resolves against.
 *
 * The file is authored, so it is validated hard on the way in. A slug that
 * appears twice, a manimkc path claimed by two topics, a module id claimed by
 * two topics — each of those would otherwise produce a catalog where the same
 * video is filed under two subjects depending on which row won the upsert.
 */

export const VOCABULARY_FILE = "content/topics.yaml";

export interface VocabularyEntry {
  slug: string;
  title: string;
  domain: string;
  summary: string | null;
  aliases: string[];
  maps: {
    manimkc: string[];
    courses: string[];
    concepts: string[];
  };
}

export interface Vocabulary {
  /** Where it was read from, repo-relative. Used in every error message. */
  file: string;
  entries: VocabularyEntry[];
  bySlug: Map<string, VocabularyEntry>;
  /** manimkc topic folder (`topics/`-relative) to topic slug. */
  byManimkcPath: Map<string, string>;
  /** Course *module* id to topic slug. */
  byCourseModule: Map<string, string>;
  /** Concept note id to topic slug. */
  byConcept: Map<string, string>;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface RawEntry {
  slug?: unknown;
  title?: unknown;
  domain?: unknown;
  summary?: unknown;
  aliases?: unknown;
  maps?: { manimkc?: unknown; courses?: unknown; concepts?: unknown };
}

function stringList(value: unknown, where: string, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new IndexError(`${where}: ${field} must be a list`);
  }
  return value.map((item, i) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new IndexError(`${where}: ${field}[${i}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function requireString(value: unknown, where: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new IndexError(`${where}: ${field} is required and must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Claims one source id for one topic. The second claimant is the error, and it
 * names both topics: "which one is right" is the question the author has to
 * answer, and it cannot be answered without seeing both.
 */
function claim(
  into: Map<string, string>,
  key: string,
  slug: string,
  file: string,
  kind: string,
): void {
  const existing = into.get(key);
  if (existing !== undefined) {
    throw new IndexError(
      `${file}: ${kind} "${key}" is mapped by two topics, "${existing}" and "${slug}". ` +
        `Each source belongs to exactly one topic; delete the wrong mapping.`,
    );
  }
  into.set(key, slug);
}

export async function loadVocabulary(repoRoot: string): Promise<Vocabulary> {
  const absolute = path.join(repoRoot, VOCABULARY_FILE);
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new IndexError(
        `${VOCABULARY_FILE} does not exist. The shared topic vocabulary is the ` +
          `required join for every other source; nothing can be indexed without it.`,
      );
    }
    throw error;
  }

  const parsed = parse(raw) as { topics?: unknown } | null;
  const list = parsed?.topics;
  if (!Array.isArray(list)) {
    throw new IndexError(`${VOCABULARY_FILE}: expected a top-level "topics:" list`);
  }

  const entries: VocabularyEntry[] = [];
  const bySlug = new Map<string, VocabularyEntry>();
  const byManimkcPath = new Map<string, string>();
  const byCourseModule = new Map<string, string>();
  const byConcept = new Map<string, string>();

  for (const [i, item] of list.entries()) {
    const rawEntry = item as RawEntry;
    const where = `${VOCABULARY_FILE} topics[${i}]`;
    const slug = requireString(rawEntry.slug, where, "slug");
    if (!SLUG_RE.test(slug)) {
      throw new IndexError(`${where}: slug "${slug}" is not kebab-case`);
    }
    if (bySlug.has(slug)) {
      throw new IndexError(`${VOCABULARY_FILE}: topic slug "${slug}" appears twice`);
    }

    const at = `${VOCABULARY_FILE} topic "${slug}"`;
    const summary = typeof rawEntry.summary === "string" ? rawEntry.summary.trim() : "";
    const entry: VocabularyEntry = {
      slug,
      title: requireString(rawEntry.title, at, "title"),
      domain: requireString(rawEntry.domain, at, "domain"),
      summary: summary === "" ? null : summary,
      aliases: stringList(rawEntry.aliases, at, "aliases"),
      maps: {
        manimkc: stringList(rawEntry.maps?.manimkc, at, "maps.manimkc"),
        courses: stringList(rawEntry.maps?.courses, at, "maps.courses"),
        concepts: stringList(rawEntry.maps?.concepts, at, "maps.concepts"),
      },
    };

    entries.push(entry);
    bySlug.set(slug, entry);
    for (const p of entry.maps.manimkc) {
      claim(byManimkcPath, p, slug, VOCABULARY_FILE, "manimkc topic");
    }
    for (const m of entry.maps.courses) {
      claim(byCourseModule, m, slug, VOCABULARY_FILE, "course module");
    }
    for (const c of entry.maps.concepts) {
      claim(byConcept, c, slug, VOCABULARY_FILE, "concept");
    }
  }

  if (entries.length === 0) {
    throw new IndexError(`${VOCABULARY_FILE}: the vocabulary is empty`);
  }

  return { file: VOCABULARY_FILE, entries, bySlug, byManimkcPath, byCourseModule, byConcept };
}

/**
 * The topic slug for one source id, or a refusal naming both the file that
 * referred to it and the id that did not resolve. Every indexer goes through
 * this rather than an `if (!slug) continue`, because a skipped row is a video
 * or a note that silently is not in the catalog.
 */
export function requireTopic(
  lookup: Map<string, string>,
  key: string,
  context: { file: string; kind: string; hint?: string },
): string {
  const slug = lookup.get(key);
  if (slug === undefined) {
    throw new IndexError(
      `${context.file}: ${context.kind} "${key}" has no topic in ${VOCABULARY_FILE}. ` +
        (context.hint ??
          `Add it to a topic's maps, or remove it. Refusing to index a source ` +
            `with no subject, because nothing would ever find it.`),
    );
  }
  return slug;
}
