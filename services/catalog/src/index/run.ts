import path from "node:path";

import { concept, curriculumItem, INDEX_SOURCES, type IndexSource } from "@self-learn/schema";

import type { CatalogDatabase } from "../db";
import { REPO_ROOT } from "../env";
import { conceptsIndexer } from "./concepts";
import { coursesIndexer } from "./courses";
import { diagramsIndexer } from "./diagrams";
import { IndexError } from "./errors";
import { manimkcIndexer } from "./manimkc";
import { sessionsIndexer } from "./sessions";
import type { IndexContext, Indexer } from "./source";
import { topicsIndexer } from "./topics";
import { loadVocabulary } from "./vocabulary";
import { writeSource, type SourceWrite } from "./writer";

/**
 * Running the indexers: dependency order, one transaction each.
 *
 * The order is not the order they are listed in or the order `--only` names
 * them in. It is the order the foreign keys require, and it is enforced here so
 * that `--only sessions,concepts` cannot fail on a constraint just because of
 * how it was typed.
 */

/**
 * What each source's rows are pointed at by, transitively.
 *
 * This is not a nicety. Pruning a `topic` cascades: `asset_topic`,
 * `curriculum_item_topic` and `collection_item` rows referencing it are deleted
 * and `concept.topic_slug` is set to null. So `index --only topics` after a
 * slug is renamed leaves the courses, concepts and assets that pointed at the
 * old slug silently unlinked, and nothing says so until someone notices a
 * `show` that used to return videos and now does not.
 *
 * Selecting a source therefore selects everything downstream of it. Renaming a
 * topic really does touch every other source, so `--only topics` really is a
 * full run; `--only manimkc`, the cheap case worth having, stays cheap because
 * nothing points at what manimkc owns.
 */
const DEPENDENTS: Record<IndexSource, readonly IndexSource[]> = {
  // Every other source resolves a slug from the vocabulary.
  topics: ["courses", "concepts", "manimkc", "diagrams", "sessions"],
  // A note's `topics:` frontmatter references curriculum items.
  courses: ["concepts", "diagrams", "sessions"],
  // Diagrams and sessions link to concepts by slug.
  concepts: ["diagrams", "sessions"],
  manimkc: [],
  diagrams: [],
  sessions: [],
};

/** Every indexer, in the order they must run. */
export const INDEXERS: readonly Indexer[] = [
  topicsIndexer,
  coursesIndexer,
  conceptsIndexer,
  manimkcIndexer,
  diagramsIndexer,
  sessionsIndexer,
];

/** Where the manimkc checkout is unless `--manimkc-root` says otherwise. */
export function defaultManimkcRoot(repoRoot = REPO_ROOT): string {
  return path.join(repoRoot, "manimkc");
}

export interface RunOptions {
  repoRoot?: string;
  manimkcRoot?: string;
  /** Sources to run. Defaults to all of them; always reordered to dependency order. */
  only?: readonly IndexSource[];
}

export interface RunResult {
  repoRoot: string;
  manimkcRoot: string;
  sources: SourceWrite[];
  /** Sources `--only` did not name but that had to run anyway. */
  addedForSafety: IndexSource[];
  totals: { written: number; deleted: number };
}

/**
 * The requested sources plus everything downstream of them. Running a source
 * without its dependents would leave rows the prune's cascades had already
 * unlinked, which is worse than not running at all: the catalog would look
 * fine and quietly answer with fewer rows.
 */
export function withDependents(requested: readonly IndexSource[]): Set<IndexSource> {
  const selected = new Set<IndexSource>();
  const visit = (source: IndexSource) => {
    if (selected.has(source)) return;
    selected.add(source);
    for (const dependent of DEPENDENTS[source]) visit(dependent);
  };
  for (const source of requested) visit(source);
  return selected;
}

export function parseSources(raw: string): IndexSource[] {
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const unknown = names.filter((n) => !(INDEX_SOURCES as readonly string[]).includes(n));
  if (unknown.length > 0) {
    throw new IndexError(
      `unknown source(s): ${unknown.join(", ")}. Known: ${INDEX_SOURCES.join(", ")}`,
    );
  }
  return names as IndexSource[];
}

export async function runIndex(
  db: CatalogDatabase,
  options: RunOptions = {},
): Promise<RunResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const manimkcRoot = options.manimkcRoot ?? defaultManimkcRoot(repoRoot);
  const requested = options.only ?? INDEX_SOURCES;
  const wanted = withDependents(requested);
  const addedForSafety = [...wanted].filter((s) => !requested.includes(s));
  const selected = INDEXERS.filter((i) => wanted.has(i.source));

  const vocabulary = await loadVocabulary(repoRoot);

  // Sources produced earlier in this run answer the cross-source lookups; a
  // partial run falls back to the database, which holds what the last full run
  // left. Memoised, because three sources ask and the answer cannot change
  // while the run is in flight.
  const producedConcepts = new Set<string>();
  const producedCurriculumItems = new Set<string>();
  let ranConcepts = false;
  let ranCourses = false;

  let conceptCache: Promise<ReadonlySet<string>> | null = null;
  let curriculumCache: Promise<ReadonlySet<string>> | null = null;

  const context: IndexContext = {
    repoRoot,
    manimkcRoot,
    vocabulary,
    knownConcepts: () => {
      conceptCache ??= ranConcepts
        ? Promise.resolve(producedConcepts)
        : db
            .select({ slug: concept.slug })
            .from(concept)
            .then((rows) => new Set(rows.map((r) => r.slug)));
      return conceptCache;
    },
    knownCurriculumItems: () => {
      curriculumCache ??= ranCourses
        ? Promise.resolve(producedCurriculumItems)
        : db
            .select({ id: curriculumItem.id })
            .from(curriculumItem)
            .then((rows) => new Set(rows.map((r) => r.id)));
      return curriculumCache;
    },
  };

  const sources: SourceWrite[] = [];
  for (const indexer of selected) {
    const { rows, notes = [] } = await indexer.read(context);
    const write = await writeSource(db, indexer, rows, notes, indexer.root(context));
    sources.push(write);

    if (indexer.source === "courses") {
      for (const row of rows.curriculumItem ?? []) producedCurriculumItems.add(row.id);
      ranCourses = true;
      curriculumCache = null;
    }
    if (indexer.source === "concepts") {
      for (const row of rows.concept ?? []) producedConcepts.add(row.slug);
      ranConcepts = true;
      conceptCache = null;
    }
  }

  return {
    repoRoot,
    manimkcRoot,
    sources,
    // Sorted into run order, so the reported list reads the way it ran.
    addedForSafety: INDEXERS.map((i) => i.source).filter((s) => addedForSafety.includes(s)),
    totals: {
      written: sources.reduce((a, s) => a + s.totalWritten, 0),
      deleted: sources.reduce((a, s) => a + s.totalDeleted, 0),
    },
  };
}
