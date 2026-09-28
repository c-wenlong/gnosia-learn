import type {
  IndexSource,
  NewAsset,
  NewAssetConcept,
  NewAssetDerivation,
  NewAssetTopic,
  NewCollection,
  NewCollectionItem,
  NewCollectionTag,
  NewConcept,
  NewConceptCurriculumItem,
  NewConceptPrerequisite,
  NewCurriculumItem,
  NewCurriculumItemTopic,
  NewDiagram,
  NewManimkcTopic,
  NewMirror,
  NewTag,
  NewTopic,
  NewTopicRelation,
  SourceRepo,
} from "@self-learn/schema";

import type { ImportedLog } from "../content/session-logs";
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
  /**
   * Absolute path to the root the content is read from: the repository for
   * `catalog import` with no directory, else the directory it was given, in
   * the same layout.
   */
  repoRoot: string;
  /**
   * Where the pinned tool checkouts (tools/manimkc, tools/tldrawkc) resolve
   * from, when that is not `repoRoot`. `catalog import <dir>` reads content
   * from an export directory that holds no tools, so it points this at the
   * repository. Absent means `repoRoot`, which is what every test and
   * `catalog import` want.
   */
  toolsRoot?: string;
  /** Absolute path to the manimkc checkout to read. Only the manimkc source uses it. */
  manimkcRoot: string;
  /**
   * Whether this database is under phase 2's contract (migration 0013): a
   * stored-kind asset row must name its blob, so the manimkc source hands
   * each file to the runner to store before the row that names it, as the
   * diagrams source does for SVGs. Absent or false before 0013, when rows go
   * in first and `catalog asset upload` stores the bytes.
   */
  blobsRequired?: boolean;
  /**
   * Whose rows the run writes (phase 4, D23): a source that names an owner
   * itself (a diagram's row, a blob key's prefix) names this one. Absent
   * means the CLIs' owner, `local`; the writer stamps it on every row either
   * way.
   */
  owner?: string;
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
  /**
   * Asset ids by repo-relative path, for one source repository. `mirrors` is
   * the only caller: it joins a ledger onto asset rows the `manimkc` source
   * wrote earlier in the same run, and it owns none of them. Memoised by the
   * runner alongside the other two.
   */
  knownAssets: (sourceRepo: SourceRepo) => Promise<ReadonlyMap<string, string>>;
  /**
   * Each stored diagram's SVG key and the document hash that SVG was exported
   * from, by slug. The diagrams source reads it because a file cannot say
   * which document an SVG came from and the database can: an SVG on disk whose
   * bytes are the stored one keeps the export record it has, so an SVG left
   * stale by a put stays stale through the next import. Empty for a database
   * that has none.
   */
  knownDiagrams: () => Promise<ReadonlyMap<string, { svgBlobKey: string | null; svgDocumentHash: string | null }>>;
}

/** Rows produced by one source, keyed by the table they belong in. */
export interface SourceRows {
  topic?: NewTopic[];
  tag?: NewTag[];
  concept?: NewConcept[];
  collection?: NewCollection[];
  curriculumItem?: NewCurriculumItem[];
  asset?: NewAsset[];
  diagram?: NewDiagram[];
  assetTopic?: NewAssetTopic[];
  assetConcept?: NewAssetConcept[];
  conceptPrerequisite?: NewConceptPrerequisite[];
  collectionItem?: NewCollectionItem[];
  assetDerivation?: NewAssetDerivation[];
  curriculumItemTopic?: NewCurriculumItemTopic[];
  conceptCurriculumItem?: NewConceptCurriculumItem[];
  topicRelation?: NewTopicRelation[];
  manimkcTopic?: NewManimkcTopic[];
  collectionTag?: NewCollectionTag[];
  mirror?: NewMirror[];
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

/**
 * Tables replaced within a scope narrower than "everything this source owns".
 *
 * Only `mirror` needs one. A run that could not reach Google Drive has nothing
 * to say about Drive, and clearing its rows would turn "I did not look" into
 * "there is nothing there". So the run names the destinations it actually
 * audited, and the writer clears only those.
 */
export interface ReplaceScope {
  /** Destination slugs whose `mirror` rows this run may replace. */
  mirrorDestinations?: readonly string[];
}

/**
 * A file the run must put in the blob store before its rows are written,
 * because a row it produced names the key (`asset.blob_key`,
 * `diagram.svg_blob_key`) and the foreign key needs the `blob_object` row
 * first. The runner uploads each one through `uploadBlob`, which skips a key
 * already present, so an unchanged tree uploads nothing.
 */
export interface SourceBlob {
  /** Absolute path to the bytes. */
  file: string;
  ownerId: string;
  mime: string;
  ext: string;
  sha256: string;
  bytes: number;
}

export interface SourceResult extends SourceNotes {
  rows: SourceRows;
  /** Files to store before the rows are written; see `SourceBlob`. */
  blobs?: SourceBlob[];
  scope?: ReplaceScope;
  /**
   * Anything about the run worth keeping that is not a row or a count. Stored
   * on `index_run.metadata`, and overwritten every run like the rest of it.
   */
  metadata?: Record<string, unknown>;
  /**
   * Session logs read whole, for `session_log_entry` (Track C). Not rows: the
   * table is append-only, so the writer appends what each file holds beyond
   * the entries already stored, rather than replacing anything.
   */
  logs?: ImportedLog[];
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
  | "tag"
  | "concept"
  | "collection"
  | "curriculumItem"
  | "conceptPrerequisite"
  | "collectionItem"
  | "curriculumItemTopic"
  | "conceptCurriculumItem"
  | "topicRelation"
  | "manimkcTopic"
  | "collectionTag"
  | "diagram";

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
