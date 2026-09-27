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
import { execFileSync } from "node:child_process";

import type { CatalogDatabase } from "../db";
import { MANIMKC_DIR, MANIMKC_ROOT_ENV, REPO_ROOT, resolveManimkcRoot } from "../env";
import { conceptsIndexer } from "./concepts";
import { coursesIndexer } from "./courses";
import { diagramsIndexer } from "./diagrams";
import { IndexError } from "./errors";
import { hasManimkcCli, manimkcIndexer } from "./manimkc";
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
  // Nothing another source owns points at a collection or a curriculum item:
  // the concept link is the courses source's own row, and progress and recap
  // are learner state, not index output.
  courses: [],
  // A course row's `concepts:` list, diagrams and sessions all link to
  // concepts by slug.
  concepts: ["courses", "diagrams", "sessions"],
  // `mirror` rows hang off manimkc's asset rows and cascade when one is
  // pruned, so re-reading manimkc alone would silently empty the ledger for a
  // renamed video. `topics` reaches mirrors through here, transitively.
  manimkc: ["mirrors"],
  diagrams: [],
  sessions: [],
  mirrors: [],
};

/**
 * The other direction: sources that cannot run correctly on their own.
 *
 * `mirrors` matches ledger keys against the `asset.path` values `manimkc`
 * stored, and those strings are relative to manimkc's `$MANIMKC_HOME`, which
 * is a machine setting rather than something either report carries into the
 * key. So `--only mirrors` with a different data root than the last `manimkc`
 * run would match every path — the strings are identical — and attach a fresh
 * audit to assets hashed from somewhere else, silently. Re-reading `manimkc`
 * first makes that unrepresentable: both reports then come from one process
 * with one environment, which is the only thing that makes the string join
 * sound. It costs a rehash of two dozen videos.
 */
const REQUIRES: Record<IndexSource, readonly IndexSource[]> = {
  topics: [],
  // A course row's `concepts:` list resolves against concept rows. Run alone,
  // courses would check a note added since the last run against rows that do
  // not have it yet, and refuse a course file that is correct. Re-reading the
  // notes first costs a pass over a few dozen files.
  courses: ["concepts"],
  concepts: [],
  manimkc: [],
  diagrams: [],
  sessions: [],
  mirrors: ["manimkc"],
};

/**
 * Every indexer, in the order they must run. Concepts before courses, because
 * a course row's `concepts:` list is written as `concept_curriculum_item`
 * rows that point at concept rows, and the courses source refuses an id no
 * note defines by checking what the concepts source just produced.
 */
export const INDEXERS: readonly Indexer[] = [
  topicsIndexer,
  conceptsIndexer,
  coursesIndexer,
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

export interface RunOptions {
  repoRoot?: string;
  manimkcRoot?: string;
  /** Sources to run. Defaults to all of them; always reordered to dependency order. */
  only?: readonly IndexSource[];
  /** The author the run's `import` revisions carry. Defaults to `import:<git sha>` of the tree. */
  author?: string;
}

/**
 * `import:<sha>` of the commit the tree is at, or `import:unknown` when it is
 * not a git checkout (a test fixture) or git is missing. The sha is what makes
 * an import revision traceable to the files it read; a tree with uncommitted
 * edits still names its commit, which is the nearest honest answer.
 */
export function importAuthor(repoRoot: string): string {
  try {
    const sha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? `import:${sha}` : "import:unknown";
  } catch {
    return "import:unknown";
  }
}

export interface RunResult {
  repoRoot: string;
  manimkcRoot: string;
  sources: SourceWrite[];
  /**
   * Sources `--only` did not name but that had to run anyway, and which of the
   * two reasons applies. They want opposite explanations: a dependent runs
   * because a prune cascades into rows it owns, a prerequisite runs because
   * the requested source reads what it wrote.
   */
  addedForSafety: IndexSource[];
  addedAsPrerequisite: IndexSource[];
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

/**
 * The requested sources plus everything they cannot be correct without. Kept
 * separate from `withDependents` because the two close over opposite edges and
 * conflating them would make either one hard to reason about; `runIndex`
 * applies this first, then that, so a prerequisite's own dependents come along
 * too.
 */
export function withPrerequisites(requested: readonly IndexSource[]): Set<IndexSource> {
  const selected = new Set<IndexSource>();
  const visit = (source: IndexSource) => {
    if (selected.has(source)) return;
    selected.add(source);
    for (const required of REQUIRES[source]) visit(required);
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
  // The flag, else $MANIMKC_ROOT, else the submodule. The middle step is the
  // resolver's, so this line is the whole precedence rule.
  const manimkcRoot = options.manimkcRoot ?? resolveManimkcRoot(repoRoot);
  const requested = options.only ?? INDEX_SOURCES;
  const required = withPrerequisites(requested);
  const wanted = withDependents([...required]);
  const addedAsPrerequisite = [...required].filter((s) => !requested.includes(s));
  const addedForSafety = [...wanted].filter(
    (s) => !requested.includes(s) && !addedAsPrerequisite.includes(s),
  );
  const selected = INDEXERS.filter((i) => wanted.has(i.source));

  const vocabulary = await loadVocabulary(repoRoot);
  const author = options.author ?? importAuthor(repoRoot);

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
          `. Run \`git submodule update --init ${MANIMKC_DIR}\`, or set ${MANIMKC_ROOT_ENV} ` +
          `to a checkout.`,
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
      author,
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
    // Sorted into run order, so the reported lists read the way they ran.
    addedForSafety: INDEXERS.map((i) => i.source).filter(
      (s) => addedForSafety.includes(s) && !skipped.some((k) => k.source === s),
    ),
    addedAsPrerequisite: INDEXERS.map((i) => i.source).filter(
      (s) => addedAsPrerequisite.includes(s) && !skipped.some((k) => k.source === s),
    ),
    skipped,
    totals: {
      written: sources.reduce((a, s) => a + s.totalWritten, 0),
      deleted: sources.reduce((a, s) => a + s.totalDeleted, 0),
    },
  };
}
