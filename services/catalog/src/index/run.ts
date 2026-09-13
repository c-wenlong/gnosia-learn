import path from "node:path";

import {
  asset,
  concept,
  curriculumItem,
  indexRun,
  INDEX_SOURCES,
  type IndexSource,
  type SourceRepo,
} from "@self-learn/schema";
import { eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { REPO_ROOT } from "../env";
import { conceptsIndexer } from "./concepts";
import { coursesIndexer } from "./courses";
import { diagramsIndexer } from "./diagrams";
import { IndexError } from "./errors";
import { hasManimkcCli, MANIMKC_DIR, manimkcIndexer } from "./manimkc";
import { mirrorsIndexer } from "./mirrors";
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
  // `mirror` rows hang off manimkc's asset rows and cascade when one is
  // pruned, so re-reading manimkc alone would silently empty the ledger for a
  // renamed video. `topics` reaches mirrors through here, transitively.
  manimkc: ["mirrors"],
  diagrams: [],
  sessions: [],
  mirrors: [],
};

/** Every indexer, in the order they must run. */
export const INDEXERS: readonly Indexer[] = [
  topicsIndexer,
  coursesIndexer,
  conceptsIndexer,
  manimkcIndexer,
  diagramsIndexer,
  sessionsIndexer,
  // Last: it reads no content tree, only the ledger and the asset rows manimkc
  // wrote a moment ago in a transaction that has already committed.
  mirrorsIndexer,
];

/**
 * Sources whose reader is the manimkc CLI, and the command each one runs. Both
 * are unrunnable without the submodule, and both are optional for the same
 * reason: a clone that never fetched it should still index everything else.
 */
const MANIMKC_COMMAND = {
  manimkc: "manimkc topics --json",
  mirrors: "manimkc mirrors --json",
} as const satisfies Partial<Record<IndexSource, string>>;

const NEEDS_MANIMKC_CLI = new Set<IndexSource>(
  Object.keys(MANIMKC_COMMAND) as (keyof typeof MANIMKC_COMMAND)[],
);

/** Where the manimkc checkout is unless `--manimkc-root` says otherwise. */
export function defaultManimkcRoot(repoRoot = REPO_ROOT): string {
  return path.join(repoRoot, MANIMKC_DIR);
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
  /** Sources that could not run in this checkout, and were safe to leave out. */
  skipped: { source: IndexSource; reason: string }[];
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
  const assetCache = new Map<SourceRepo, Promise<ReadonlyMap<string, string>>>();

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
    // Straight from the database rather than from what a source produced in
    // memory. The only caller runs after `manimkc`, whose transaction has
    // committed by then, so the rows are already there and reading them keeps
    // `--only mirrors` working without re-reading a whole manimkc checkout.
    knownAssets: (sourceRepo) => {
      let cached = assetCache.get(sourceRepo);
      if (cached === undefined) {
        cached = db
          .select({ id: asset.id, path: asset.path })
          .from(asset)
          .where(eq(asset.sourceRepo, sourceRepo))
          .then(
            (rows) =>
              new Map(
                rows
                  .filter((r): r is { id: string; path: string } => r.path !== null)
                  .map((r) => [r.path, r.id]),
              ),
          );
        assetCache.set(sourceRepo, cached);
      }
      return cached;
    },
  };

  // The two optional sources: their reader is the manimkc CLI at
  // `tools/manimkc/tools/cli/manimkc`, which lives in a submodule that a fresh
  // clone and CI deliberately do not fetch. Leaving one out is safe only when it has never been indexed, because
  // otherwise pruning a topic cascades through its asset_topic and mirror rows
  // and nothing puts them back. So: refuse when it was asked for, refuse when
  // it has rows to lose, and otherwise drop it with a note rather than making a
  // submodule a hard dependency of indexing anything at all.
  const skipped: { source: IndexSource; reason: string }[] = [];
  const runnable: Indexer[] = [];
  const haveCli = hasManimkcCli(repoRoot);
  for (const indexer of selected) {
    if (!NEEDS_MANIMKC_CLI.has(indexer.source) || haveCli) {
      runnable.push(indexer);
      continue;
    }
    // `--only manimkc` is asking for it; a default full run is not. Without
    // that distinction `catalog index` on a clone with no submodule fails
    // outright instead of indexing the sources it can.
    const source = indexer.source as keyof typeof MANIMKC_COMMAND;
    const asked = options.only?.includes(source) ?? false;
    const indexed = await db
      .select({ source: indexRun.source })
      .from(indexRun)
      .where(eq(indexRun.source, source))
      .limit(1);
    if (asked || indexed.length > 0) {
      throw new IndexError(
        `the manimkc submodule is not initialised, so \`${MANIMKC_COMMAND[source]}\` cannot run` +
          (asked
            ? ""
            : `, and ${source} has rows in this database that pruning would orphan`) +
          `. Run \`git submodule update --init ${MANIMKC_DIR}\`, or point --manimkc-root at a checkout.`,
      );
    }
    skipped.push({
      source,
      reason: "the manimkc submodule is not initialised, and it has never been indexed here",
    });
  }

  const sources: SourceWrite[] = [];
  for (const indexer of runnable) {
    const { rows, notes = [], scope, metadata } = await indexer.read(context);
    const write = await writeSource(db, indexer, rows, notes, indexer.root(context), {
      scope,
      metadata,
    });
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
    addedForSafety: INDEXERS.map((i) => i.source).filter(
      (s) => addedForSafety.includes(s) && !skipped.some((k) => k.source === s),
    ),
    skipped,
    totals: {
      written: sources.reduce((a, s) => a + s.totalWritten, 0),
      deleted: sources.reduce((a, s) => a + s.totalDeleted, 0),
    },
  };
}
