import { loadTopics, TOPICS_FILE, type TopicEntry } from "@gnosia/content";

import { IndexError } from "./errors";
import { asIndexError } from "./content-errors";

/**
 * `content/topics.yaml`: the shared topic vocabulary, and the three lookup
 * tables every other indexer resolves against.
 *
 * Reading and shape-checking the file is `@gnosia/content`'s job, because
 * the web app reads the same file and two parsers of one file is how two
 * consumers come to disagree about it. What stays here is the part only the
 * catalog needs: the reverse indexes, and the rule that each source id belongs
 * to exactly one topic. A manimkc path or a module id claimed by two topics
 * would otherwise produce a catalog where the same video is filed under two
 * subjects depending on which row won the upsert.
 */

export { TOPICS_FILE as VOCABULARY_FILE };

export type VocabularyEntry = TopicEntry;

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
  return vocabularyOf(asIndexError(() => loadTopics({ root: repoRoot })));
}

/**
 * The lookup tables over entries from anywhere: the file above, or the topic
 * rows once the database owns topics (`readTopicEntries`, the same entries
 * the export writes), which is where an import after the cut-over takes
 * them, since the tree it reads may hold no `content/topics.yaml` at all.
 */
export function vocabularyOf(entries: VocabularyEntry[]): Vocabulary {
  const bySlug = new Map<string, VocabularyEntry>();
  const byManimkcPath = new Map<string, string>();
  const byCourseModule = new Map<string, string>();
  const byConcept = new Map<string, string>();

  for (const entry of entries) {
    bySlug.set(entry.slug, entry);
    for (const p of entry.maps.manimkc) {
      claim(byManimkcPath, p, entry.slug, TOPICS_FILE, "manimkc topic");
    }
    for (const m of entry.maps.courses) {
      claim(byCourseModule, m, entry.slug, TOPICS_FILE, "course module");
    }
    for (const c of entry.maps.concepts) {
      claim(byConcept, c, entry.slug, TOPICS_FILE, "concept");
    }
  }

  return { file: TOPICS_FILE, entries, bySlug, byManimkcPath, byCourseModule, byConcept };
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
      `${context.file}: ${context.kind} "${key}" has no topic in ${TOPICS_FILE}. ` +
        (context.hint ??
          `Add it to a topic's maps, or remove it. Refusing to index a source ` +
            `with no subject, because nothing would ever find it.`),
    );
  }
  return slug;
}
