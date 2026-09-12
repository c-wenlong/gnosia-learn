import type {
  IndexSource,
  NewAsset,
  NewAssetConcept,
  NewAssetDerivation,
  NewAssetTopic,
  NewCollection,
  NewCollectionItem,
  NewConcept,
  NewConceptCurriculumItem,
  NewConceptPrerequisite,
  NewCurriculumItem,
  NewCurriculumItemTopic,
  NewTopic,
} from "@self-learn/schema";

import type { Vocabulary } from "./vocabulary";

/**
 * What an indexer is: a pure function from files to rows.
 *
 * `read` touches no database. It returns everything the source produces, the
 * writer decides how that becomes SQL, and the two are testable apart: an
 * indexer test asserts on rows and needs no Postgres, a writer test asserts on
 * upserts and needs no files.
 */

export interface IndexContext {
  /** Absolute path to the repository root. */
  repoRoot: string;
  /** Absolute path to the manimkc checkout to read. Only the manimkc source uses it. */
  manimkcRoot: string;
  /** `content/topics.yaml`, loaded once and shared by every source. */
  vocabulary: Vocabulary;
  /**
   * Concept slugs the catalog knows about, and curriculum item ids it knows
   * about. Injected rather than read, because who can answer depends on how the
   * run was invoked: in a full run the source that produces them has already
   * gone, and with `--only sessions` the answer has to come from the database.
   * Either way an indexer resolves a cross-source reference without reaching
   * for a connection of its own, and a test answers with a literal set.
   *
   * Memoised by the runner: several sources ask, and the answer cannot change
   * mid-run.
   */
  knownConcepts: () => Promise<ReadonlySet<string>>;
  knownCurriculumItems: () => Promise<ReadonlySet<string>>;
}

/** Rows produced by one source, keyed by the table they belong in. */
export interface SourceRows {
  topic?: NewTopic[];
  concept?: NewConcept[];
  collection?: NewCollection[];
  curriculumItem?: NewCurriculumItem[];
  asset?: NewAsset[];
  assetTopic?: NewAssetTopic[];
  assetConcept?: NewAssetConcept[];
  conceptPrerequisite?: NewConceptPrerequisite[];
  collectionItem?: NewCollectionItem[];
  assetDerivation?: NewAssetDerivation[];
  curriculumItemTopic?: NewCurriculumItemTopic[];
  conceptCurriculumItem?: NewConceptCurriculumItem[];
}

/**
 * Anything worth saying about a run that is not a row. Reported by `catalog
 * index` and never stored: these are observations about the sources, and the
 * next run recomputes them.
 */
export interface SourceNotes {
  /** Human-readable lines, e.g. manimkc's drift block. */
  notes?: string[];
}

export interface SourceResult extends SourceNotes {
  rows: SourceRows;
}

/**
 * Every asset id begins with its source's prefix. This is not cosmetic: it is
 * how the writer knows which asset rows a source owns, and therefore which
 * stale ones it may delete. Two sources sharing a prefix would let one delete
 * the other's rows, so the prefixes are declared here, once, and the writer
 * asserts every produced id matches.
 */
export const ASSET_PREFIX = {
  concepts: "note:",
  courses: "link:",
  manimkc: "manimkc:",
  diagrams: "diagram:",
  sessions: "session:",
} as const satisfies Partial<Record<IndexSource, string>>;

export type AssetPrefix = (typeof ASSET_PREFIX)[keyof typeof ASSET_PREFIX];

/**
 * Tables a source is the sole author of, and whose rows it may therefore
 * delete when it stops producing them. `asset` is never listed here — it is
 * shared, and scoped by `assetPrefix` instead.
 */
export type OwnedTable =
  | "topic"
  | "concept"
  | "collection"
  | "curriculumItem"
  | "conceptPrerequisite"
  | "collectionItem"
  | "curriculumItemTopic"
  | "conceptCurriculumItem";

export interface Indexer {
  source: IndexSource;
  /** What the source reads, for the `index_run` row and for error messages. */
  root: (context: IndexContext) => string;
  /** Tables this source is the only writer of. */
  owns: readonly OwnedTable[];
  /** The asset id namespace it owns, if it writes assets at all. */
  assetPrefix?: AssetPrefix;
  read: (context: IndexContext) => Promise<SourceResult>;
}
