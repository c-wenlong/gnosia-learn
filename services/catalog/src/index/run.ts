import {
  asset,
  concept,
  type ContentType,
  curriculumItem,
  diagram,
  indexRun,
  INDEX_SOURCES,
  readableOwners,
  type IndexSource,
  type SourceRepo,
} from "@self-learn/schema";
import { loadCourses } from "@self-learn/content";
import { and, eq, inArray } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

import type { BlobStore } from "@self-learn/blob";

import { openBlobStore, uploadBlob } from "../content/blob";
import { unhookPosters } from "../content/asset-upload";
import { blobContractInForce } from "../content/blob-contract";
import { databaseIdentity, recordRoot } from "../content/import-root";
import { exportHash, isExportType, readTypeFiles, TYPE_LOCATION } from "../content/layout";
import { readContentSources } from "../content/ownership";
import { renderType } from "../content/export";
import { CLI_OWNER } from "../content/scope";
import type { CatalogDatabase } from "../db";
import { MANIMKC_DIR, MANIMKC_ROOT_ENV, REPO_ROOT, resolveManimkcRoot } from "../env";
import { conceptsIndexer } from "./concepts";
import { asIndexError } from "./content-errors";
import { coursesIndexer } from "./courses";
import { diagramsIndexer } from "./diagrams";
import { IndexError } from "./errors";
import { hasManimkcCli, manimkcIndexer } from "./manimkc";
import { mirrorsIndexer } from "./mirrors";
import { sessionsIndexer } from "./sessions";
import { tagsIndexer } from "./tags";
import type { IndexContext, Indexer } from "./source";
import { topicsIndexer } from "./topics";
import { loadVocabulary } from "./vocabulary";
import { pruneHeldTopics, writeSource, type SourceWrite } from "./writer";

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
  // A course's `collection_tag` rows point at tags, and pruning a tag clears
  // them (`pruneEntity`), so the courses source has to write them back.
  tags: ["courses"],
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
  tags: [],
  // A course row's `concepts:` list resolves against concept rows. Run alone,
  // courses would check a note added since the last run against rows that do
  // not have it yet, and refuse a course file that is correct. Re-reading the
  // notes first costs a pass over a few dozen files. Its `tags:` become
  // `collection_tag` rows, whose foreign key needs the tag rows written first,
  // and a database migrated to 0011 has none until the tags source runs.
  courses: ["concepts", "tags"],
  concepts: [],
  manimkc: [],
  diagrams: [],
  sessions: [],
  mirrors: ["manimkc"],
};

/** The content type each source reads, for its `content_source` row. `mirrors` reads none. */
const CONTENT_TYPE: Partial<Record<IndexSource, ContentType>> = {
  topics: "topics",
  tags: "tags",
  courses: "courses",
  concepts: "concepts",
  manimkc: "manimkc",
  diagrams: "diagrams",
  sessions: "sessions",
};

/**
 * Every indexer, in the order they must run. Concepts before courses, because
 * a course row's `concepts:` list is written as `concept_curriculum_item`
 * rows that point at concept rows, and the courses source refuses an id no
 * note defines by checking what the concepts source just produced.
 */
export const INDEXERS: readonly Indexer[] = [
  topicsIndexer,
  tagsIndexer,
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
  /** The root the content is read from. Defaults to the repository. */
  repoRoot?: string;
  /**
   * Where the pinned tools resolve from, when the content root holds none:
   * `catalog import <dir>` sets it to the repository. Defaults to `repoRoot`.
   */
  toolsRoot?: string;
  manimkcRoot?: string;
  /** Sources to run. Defaults to all of them; always reordered to dependency order. */
  only?: readonly IndexSource[];
  /** The author the run's `import` revisions carry. Defaults to `import:<git sha>` of the tree. */
  author?: string;
  /**
   * Whose rows the import writes, and the only owner whose rows it may
   * prune, archive or unlink (phase 4, D23). Defaults to the CLIs' owner.
   */
  owner?: string;
}

/** The folders an import reads under its root, as git pathspecs. */
const CONTENT_PATHSPECS = ["content", "learn"];

/**
 * The revision author for an import of `root`: `import:<sha>` of the commit
 * its content files are tracked at, which is what makes an import revision
 * traceable to the files it read.
 *
 * Only the files under `root` count, not whatever repository happens to
 * enclose it. An export written to a scratch folder inside the checkout is
 * not the checkout's commit, and nothing under it is tracked, so it is
 * `import:unknown`, as is a folder in no repository or a machine with no git.
 * A tracked tree with local changes under `content/` or `learn/`, untracked
 * files included, is `import:<sha>-dirty`: the nearest commit, marked as not
 * quite it.
 */
export function importAuthor(root: string): string {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    const sha = git("rev-parse", "HEAD").trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) return "import:unknown";
    if (git("ls-files", "--", ...CONTENT_PATHSPECS).trim() === "") return "import:unknown";
    const dirty = git("status", "--porcelain", "--", ...CONTENT_PATHSPECS).trim() !== "";
    return `import:${sha}${dirty ? "-dirty" : ""}`;
  } catch {
    return "import:unknown";
  }
}

/**
 * A path as a revision's reason should carry it: relative to the repository
 * when inside it, `~/...` when inside the home directory, as given otherwise.
 * A reason is read on another machine, or after the laptop is gone, and an
 * absolute home path says who ran it and nothing about what was read.
 */
export function displayPath(target: string): string {
  if (!path.isAbsolute(target)) return target.split(path.sep).join("/");
  const inside = (base: string) => {
    const relative = path.relative(base, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)) ? relative : null;
  };
  const inRepo = inside(REPO_ROOT);
  if (inRepo !== null) return inRepo === "" ? "the repository" : inRepo.split(path.sep).join("/");
  const inHome = inside(homedir());
  if (inHome !== null) return inHome === "" ? "~" : `~/${inHome.split(path.sep).join("/")}`;
  return target;
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
  /**
   * Sources left out, and why: the manimkc CLI is absent and they were safe
   * to leave out, or the database owns the type and its files match the last
   * export.
   */
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

/**
 * Both closures, repeated until neither adds anything. One pass of each is
 * not enough once a dependent has a prerequisite of its own: `--only
 * concepts` pulls in courses as a dependent, and courses needs tags written
 * first, which neither single pass would have added.
 */
export function selection(requested: readonly IndexSource[]): Set<IndexSource> {
  let current = new Set(requested);
  for (;;) {
    const next = withDependents([...withPrerequisites([...current])]);
    if (next.size === current.size) return next;
    current = next;
  }
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
  const toolsRoot = options.toolsRoot ?? repoRoot;
  // The flag, else $MANIMKC_ROOT, else the submodule. The middle step is the
  // resolver's, so this line is the whole precedence rule.
  const manimkcRoot = options.manimkcRoot ?? resolveManimkcRoot(toolsRoot);
  const requested = options.only ?? INDEX_SOURCES;
  const wanted = selection(requested);
  const prerequisites = new Set([...wanted].flatMap((source) => REQUIRES[source]));
  const addedAsPrerequisite = [...wanted].filter((s) => !requested.includes(s) && prerequisites.has(s));
  const addedForSafety = [...wanted].filter(
    (s) => !requested.includes(s) && !addedAsPrerequisite.includes(s),
  );
  const selected = INDEXERS.filter((i) => wanted.has(i.source));

  // The types the database owns are not read from files (D18): skipped when
  // the files are the database's own last export, refused when they are not
  // (edge case 12). Checked before anything is written, so a refusal leaves
  // every source as it was.
  const owned = await ownedSkips(db, repoRoot, selected);

  const vocabulary = await loadVocabulary(repoRoot);
  const author = options.author ?? importAuthor(repoRoot);
  const owner = options.owner ?? CLI_OWNER;
  // A tree may point at its own rows and the commons', never another
  // owner's: the lookups below answer only for those, so a slug another
  // owner holds reads as one that does not exist.
  const readable = [...readableOwners(owner)];
  // Which database recorded each root: a `createdb -T` copy inherits the
  // rows, and a root is only this database's when this database wrote it
  // (content/import-root.ts).
  const database = await databaseIdentity(db);

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
  let diagramCache: ReturnType<IndexContext["knownDiagrams"]> | null = null;

  const context: IndexContext = {
    repoRoot,
    toolsRoot,
    manimkcRoot,
    vocabulary,
    owner,
    blobsRequired: await blobContractInForce(db),
    knownConcepts: () => {
      conceptCache ??= ranConcepts
        ? Promise.resolve(producedConcepts)
        : db
            .select({ slug: concept.slug })
            .from(concept)
            .where(inArray(concept.ownerId, readable))
            .then((rows) => new Set(rows.map((r) => r.slug)));
      return conceptCache;
    },
    knownCurriculumItems: () => {
      curriculumCache ??= ranCourses
        ? Promise.resolve(producedCurriculumItems)
        : db
            .select({ id: curriculumItem.id })
            .from(curriculumItem)
            .where(inArray(curriculumItem.ownerId, readable))
            .then((rows) => new Set(rows.map((r) => r.id)));
      return curriculumCache;
    },
    // Straight from the database rather than from what a source produced in
    // memory. The only caller runs after `manimkc`, whose transaction has
    // committed by then, so the rows are already there and reading them keeps
    // `--only mirrors` working without re-reading a whole manimkc checkout.
    knownDiagrams: () => {
      diagramCache ??= db
        .select({ slug: diagram.slug, svgBlobKey: diagram.svgBlobKey, svgDocumentHash: diagram.svgDocumentHash })
        .from(diagram)
        .where(eq(diagram.ownerId, owner))
        .then((rows) => new Map(rows.map((r) => [r.slug, { svgBlobKey: r.svgBlobKey, svgDocumentHash: r.svgDocumentHash }])));
      return diagramCache;
    },
    knownAssets: (sourceRepo) => {
      let cached = assetCache.get(sourceRepo);
      if (cached === undefined) {
        cached = db
          .select({ id: asset.id, path: asset.path })
          .from(asset)
          // The owner's own: a mirror row hangs off its asset and is that
          // asset's owner's (D24), so another owner's video is not matched.
          .where(and(eq(asset.sourceRepo, sourceRepo), eq(asset.ownerId, owner)))
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
  const skipped: { source: IndexSource; reason: string }[] = [...owned.values()];
  const runnable: Indexer[] = [];
  const haveCli = hasManimkcCli(toolsRoot);
  for (const indexer of selected) {
    if (owned.has(indexer.source)) continue;
    if (!NEEDS_MANIMKC_CLI.has(indexer.source) || haveCli) {
      runnable.push(indexer);
      continue;
    }
    // `--only manimkc` is asking for it; a default full run is not. Without
    // that distinction `catalog import` on a clone with no submodule fails
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

  // The tags source clears the links to a tag it prunes, trusting the
  // courses source to write back the ones the course files still name. It
  // commits first, so a course file still naming a pruned tag would fail the
  // courses source only after the links were gone. Reading the course files
  // here, before anything is written, refuses that run while nothing has
  // moved: the same reader, so the same sentence the courses source would say.
  const running = new Set(runnable.map((i) => i.source));
  if (running.has("tags") && running.has("courses")) {
    asIndexError(() => loadCourses({ root: repoRoot, topics: vocabulary.entries }));
  }

  // The notes are read before anything is written when the topics source
  // runs ahead of them: a topic that source holds for the concepts source to
  // empty (see `conceptsFollow`) must not be left waiting on notes that were
  // going to be refused anyway.
  const preread = new Map<IndexSource, Awaited<ReturnType<Indexer["read"]>>>();
  if (running.has("topics") && running.has("concepts")) {
    preread.set("concepts", await conceptsIndexer.read(context));
  }

  const sources: SourceWrite[] = [];
  let store: BlobStore | undefined;
  for (const indexer of runnable) {
    const { rows, notes = [], scope, metadata, logs, blobs = [] } =
      preread.get(indexer.source) ?? (await indexer.read(context));
    // The bytes before the rows that name them, each upload committed on its
    // own: a run that fails after this leaves present objects and no row
    // pointing at them, which the next run finds already there.
    if (blobs.length > 0) {
      store ??= openBlobStore();
      let uploaded = 0;
      for (const blob of blobs) {
        if ((await uploadBlob(db, store, blob)).uploaded) uploaded += 1;
      }
      notes.push(`${blobs.length} file(s) in the blob store, ${uploaded} uploaded by this run`);
    }
    const options: Parameters<typeof writeSource>[5] = {
      scope,
      logs,
      // A topic dropped while concepts are filed under it is kept for the
      // concepts source to empty, when that source runs later in this import.
      conceptsFollow: indexer.source === "topics" && running.has("concepts"),
      tagLinksRewritten: running.has("courses"),
      // The absolute root the repo-relative paths in these rows resolve
      // against: what `catalog flip` runs parity against, and where a seam
      // write rewrites the type's files (D17), with the database that read
      // it. The manimkc sources resolve against their report's `outRoot`
      // instead.
      metadata: NEEDS_MANIMKC_CLI.has(indexer.source) ? metadata : { ...metadata, root: repoRoot, database },
      author,
      owner,
      reason: `catalog import of ${displayPath(repoRoot)}: ${displayPath(indexer.root(context))} (${indexer.source})`,
    };
    const write = await writeSource(db, indexer, rows, notes, indexer.root(context), options);
    sources.push(write);
    // Under the contract the import links a re-render's bytes itself, so a
    // poster cut from a video's earlier bytes is unhooked here, for the next
    // upload to recut. Every video in the run is asked, not only the ones this
    // write changed, so a run that failed between the two is repaired.
    if (indexer.source === "manimkc" && context.blobsRequired === true) {
      const videos = (rows.asset ?? []).filter((row) => row.kind === "video").map((row) => row.id);
      const { unhooked, moved } = await unhookPosters(db, videos, {
        author,
        reason: `catalog import of ${displayPath(repoRoot)}: a re-render replaced the video the poster was cut from`,
      });
      if (unhooked.length > 0) {
        write.notes.push(
          `${unhooked.length} poster(s) unhooked from a re-rendered video; the next \`catalog asset upload\` cuts new ones`,
        );
      }
      if (moved.length > 0) {
        // Written since this import read them, by an upload that recut them:
        // left as that write made them, and the next import asks again.
        write.notes.push(`${moved.length} poster(s) changed while this import ran, so left as they are: ${moved.join(", ")}`);
      }
    }

    // The concepts source has now moved or pruned what was filed under the
    // topics the topics source held, so they go, before any later source
    // runs: a failure further on cannot leave them standing.
    const topicsWrite = sources.find((s) => s.source === "topics");
    if (indexer.source === "concepts" && topicsWrite?.deferred !== undefined) {
      const pruned = await pruneHeldTopics(
        db,
        topicsWrite.deferred,
        {
          author,
          reason: `catalog import of ${displayPath(repoRoot)}: ${displayPath(topicsIndexer.root(context))} (topics)`,
        },
        owner,
      );
      foldPrune(topicsWrite, pruned);
    }

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

/** Count the held topics' prune in the topics source's report, which is where it belongs. */
function foldPrune(into: SourceWrite, pruned: { deleted: string[]; revisions: number }): void {
  if (pruned.deleted.length > 0) {
    into.deleted["topic"] = (into.deleted["topic"] ?? 0) + pruned.deleted.length;
    into.deletedKeys.push(...pruned.deleted.map((slug) => `topic ${slug}`));
    into.totalDeleted += pruned.deleted.length;
  }
  if (pruned.revisions > 0) into.revisions["topic"] = (into.revisions["topic"] ?? 0) + pruned.revisions;
  delete into.deferred;
}

/**
 * The selected sources whose type the database owns, each with the line that
 * says why it is not read. Throws, naming the files, when a `db` type's files
 * are not the database's own last export: someone edited an export, and
 * importing it would bypass the reason every write carries while overwriting
 * it on the next export would lose the edit (edge case 12).
 *
 * `mirrors` follows `manimkc`: its rows hang off manimkc's assets, and a run
 * that left one out must leave out the other.
 */
async function ownedSkips(
  db: CatalogDatabase,
  root: string,
  selected: readonly Indexer[],
): Promise<Map<IndexSource, { source: IndexSource; reason: string }>> {
  const out = new Map<IndexSource, { source: IndexSource; reason: string }>();
  // Recorded only once every owned type has been checked: a later type's
  // refusal refuses the whole import, which must then have written nothing.
  const roots: Parameters<typeof recordRoot>[1][] = [];
  const rows = await readContentSources(db);
  for (const indexer of selected) {
    const type = CONTENT_TYPE[indexer.source];
    const row = type === undefined ? undefined : rows.get(type);
    if (type === undefined || row?.source !== "db") continue;
    const since = row.flippedAt?.toISOString() ?? "its flip";
    if (!isExportType(type)) {
      out.set(indexer.source, {
        source: indexer.source,
        reason: `the database owns ${type} (since ${since}); it is written through the catalog, not read from files`,
      });
      continue;
    }
    const files = await readTypeFiles(root, type);
    const hash = exportHash(files);
    // The database's own export either way: the files its last export or
    // write-through left (an untouched export the rows have since moved past,
    // which is a type that does not write through, C's and D's), or the files
    // it would export now, wherever they were written. Only a file that is
    // neither is an edit.
    const recorded = row.exportHash !== null && row.exportHash === hash;
    const current = recorded ? false : await renderType(db, type).then((f) => exportHash(f) === hash, () => false);
    if (recorded || current) {
      out.set(indexer.source, {
        source: indexer.source,
        reason:
          `the database owns ${type} (since ${since}), and ${TYPE_LOCATION[type]} is its own ` +
          `${recorded ? "last" : "current"} export, so there is nothing to read`,
      });
      // This tree is where the type's files are now, for this database: a
      // copy imported from an export folder writes through to that folder,
      // not to the tree its template was imported from.
      roots.push(type);
      continue;
    }
    throw new IndexError(await editedExport(db, type, root, files, row.exportHash === null));
  }
  for (const type of roots) await recordRoot(db, type, root);
  if (out.has("manimkc") && !out.has("mirrors") && selected.some((i) => i.source === "mirrors")) {
    out.set("mirrors", {
      source: "mirrors",
      reason: "its rows hang off manimkc's assets, and the database owns manimkc",
    });
  }
  return out;
}

/** The refusal for a hand-edited export, naming the files that differ from the database. */
async function editedExport(
  db: CatalogDatabase,
  type: Parameters<typeof renderType>[1],
  root: string,
  files: readonly { path: string; bytes: Buffer }[],
  neverExported: boolean,
): Promise<string> {
  const head =
    `${TYPE_LOCATION[type]}: the database owns ${type}, so these files are an export and ` +
    `are not read. `;
  let differing: string[];
  try {
    const expected = new Map((await renderType(db, type)).map((f) => [f.path, f.bytes]));
    const paths = new Set([...expected.keys(), ...files.map((f) => f.path)]);
    const actual = new Map(files.map((f) => [f.path, f.bytes]));
    // A file the export would write and the tree lacks was deleted, one the
    // tree has and the export would not write was added: neither is an edit.
    const change = (p: string): string | null => {
      const want = expected.get(p);
      const got = actual.get(p);
      if (want === undefined) return `${p} (added)`;
      if (got === undefined) return `${p} (deleted)`;
      return want.equals(got) ? null : `${p} (edited)`;
    };
    differing = [...paths]
      .sort()
      .map(change)
      .filter((c): c is string => c !== null);
  } catch {
    differing = [];
  }
  const which = differing.length === 0 ? "" : `: ${differing.join(", ")}`;
  if (neverExported) {
    return (
      head +
      `No export of ${type} is recorded, and they are not what the database would export now${which}. ` +
      `Run \`catalog export --only ${type} --out ${root}\` to write them from the database, or ` +
      `apply the change through the catalog's ${type} command first.`
    );
  }
  return (
    head +
    (differing.length === 0 ? "" : `Changed since the last export${which}. `) +
    `Apply the change through the catalog's ${type} command, which records who made it and why, ` +
    `then \`catalog export --only ${type} --out ${root}\` rewrites these files; or discard the edit.`
  );
}
