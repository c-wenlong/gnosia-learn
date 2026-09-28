import {
  asset,
  assetConcept,
  event,
  assetDerivation,
  assetTopic,
  collection,
  collectionItem,
  collectionTag,
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  curriculumItem,
  curriculumItemTopic,
  diagram,
  indexRun,
  manimkcTopic,
  mirror,
  type RevisionEntityType,
  tag,
  topic,
  topicRelation,
} from "@self-learn/schema";
import { and, eq, getTableName, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import {
  appendRevisions,
  deriveOp,
  latestRevisions,
  lockTypes,
  markSeam,
  needsRevision,
  reserveRevisionIds,
  type PendingRevision,
} from "../content/revisions";
import { placePositions, PositionGapError } from "../content/positions";
import { readSnapshots, type SnapshotRead } from "../content/snapshot";
import { updateSet } from "../content/upsert";
import type { CatalogDatabase } from "../db";
import { sqlstate } from "../state/errors";
import { importLogs, type ImportedLog } from "../content/session-logs";
import { keepBlobKeys } from "./blob-keys";
import { IndexError, IndexErrors } from "./errors";
import type { Indexer, ReplaceScope, SourceRows } from "./source";

/** Postgres SQLSTATE for a foreign key violation. */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Turning one source's rows into SQL, in one transaction.
 *
 * Two rules shape everything here.
 *
 * **The content half is derived, so a row the source no longer produces is a
 * bug.** Every write is an upsert followed by a prune, and the prune is scoped
 * to what this source owns: a tree that vanishes from `learn/` takes its rows
 * with it, and a stale row cannot outlive its file the way
 * `out/networking/adguard-home` outlived its source once already.
 *
 * **Entities are upserted, links are replaced.** A `concept` or
 * `curriculum_item` row is the target of foreign keys from the state tables —
 * `mastery` and `review` cascade, `progress` and `recap` restrict, so
 * deleting and reinserting one destroys or blocks on the learner's record of
 * it. Link rows are the target of nothing, so for them delete-then-insert is
 * both simpler and exactly right: it is the only way a link the source
 * *stopped* producing goes away, which an upsert would silently keep forever.
 *
 * **Courses and their items are archived, never pruned** (D12 of
 * docs/CONTENT-MIGRATION.md). A module or checklist row the course files stop
 * listing gets `archived_at`, and a source that lists it again clears it, so
 * a learner's tick and recap on a dropped row survive the edit.
 *
 * **Every entity the run touched gets an `import` revision when its snapshot
 * changed**, through the same revision writer the seam in `../content/` uses,
 * and every entity it deleted gets a `delete` revision holding its last state.
 * A re-index of an unchanged tree therefore appends nothing.
 *
 * One transaction per source, not one for the whole run. A source either lands
 * whole or not at all, and a manimkc checkout that cannot be read must not roll
 * back the concepts that were already indexed correctly.
 */

/** Everything one `catalog import` run did to one source. */
export interface SourceWrite {
  source: string;
  /** Rows inserted or updated, per SQL table name. */
  written: Record<string, number>;
  /**
   * Rows that went away, per SQL table name. Link tables are replaced wholesale
   * on every run, so this counts the *net* loss rather than the churn — a run
   * that rewrites the same 61 links reports nothing, which is the truth.
   */
  deleted: Record<string, number>;
  /**
   * Which entity rows were pruned, capped at 25. A deletion here cascades into
   * the learner's mastery, review and progress, so `index` prints the keys
   * rather than a bare count: "3 concepts deleted" is not something anyone
   * notices, three slugs is.
   */
  deletedKeys: string[];
  notes: string[];
  totalWritten: number;
  totalDeleted: number;
  /**
   * Rows the source stopped producing that were archived rather than deleted,
   * per SQL table name. Only `collection` and `curriculum_item` are archived.
   */
  archived: Record<string, number>;
  /** Topics the vocabulary dropped that were held, untouched, because concepts were still filed under them. */
  deferred?: string[];
  /** Which, capped like `deletedKeys`: an archive hides a row a learner may have ticked. */
  archivedKeys: string[];
  /** `import` revisions appended, per entity type. An unchanged tree appends none. */
  revisions: Record<string, number>;
}

const DELETED_KEYS_SHOWN = 25;

/** Entity tables whose rows are archived instead of deleted when a source stops producing them. */
const ARCHIVED_NOT_PRUNED = new Set<EntityName>(["collection", "curriculumItem"]);

/** The revision entity type of each entity table. */
const REVISION_TYPE: Record<EntityName, RevisionEntityType> = {
  topic: "topic",
  tag: "tag",
  concept: "concept",
  collection: "collection",
  curriculumItem: "curriculum_item",
  asset: "asset",
  diagram: "diagram",
};

/** The entity tables an indexer may own, and the column identifying a row. */
const ENTITY_KEY = {
  topic: "slug",
  tag: "id",
  concept: "slug",
  collection: "id",
  curriculumItem: "id",
  asset: "id",
  diagram: "slug",
} as const;

/** Entity tables, in the order a foreign key needs them written. */
const ENTITY_ORDER = ["topic", "tag", "concept", "collection", "curriculumItem", "asset", "diagram"] as const;
type EntityName = (typeof ENTITY_ORDER)[number];

/** Link tables, written after every entity they point at exists. */
const LINK_ORDER = [
  "topicRelation",
  "manimkcTopic",
  "collectionTag",
  "assetTopic",
  "assetConcept",
  "conceptPrerequisite",
  "collectionItem",
  "assetDerivation",
  "curriculumItemTopic",
  "conceptCurriculumItem",
  "mirror",
] as const;
type LinkName = (typeof LINK_ORDER)[number];

/**
 * Link tables hanging off an asset. These are scoped by the writing source's
 * asset id prefix rather than owned outright, because three different sources
 * write `asset_concept` and each may only prune its own rows.
 */
const ASSET_LINKED = new Set<LinkName>(["assetTopic", "assetConcept", "assetDerivation"]);

const TABLES = {
  topic,
  tag,
  concept,
  collection,
  curriculumItem,
  asset,
  diagram,
  assetTopic,
  assetConcept,
  conceptPrerequisite,
  collectionItem,
  assetDerivation,
  curriculumItemTopic,
  conceptCurriculumItem,
  topicRelation,
  manimkcTopic,
  collectionTag,
  mirror,
} as const satisfies Record<keyof SourceRows, PgTable>;

/** Conflict targets for the entity upserts, matching each table's primary key. */
const CONFLICT_TARGET = {
  topic: topic.slug,
  tag: tag.id,
  concept: concept.slug,
  collection: collection.id,
  curriculumItem: curriculumItem.id,
  asset: asset.id,
  diagram: diagram.slug,
} as const;


type AnyRow = Record<string, unknown>;

/*
 * The two places this file admits it is generic.
 *
 * drizzle types `.values()` and every column against one specific table. This
 * writer is deliberately generic over every table in `SourceRows`, and the row shapes are
 * already guaranteed at the indexer boundary by `SourceRows`, which is built
 * from drizzle's own `$inferInsert` types. Two narrow casts here beat sixteen
 * near-identical copies of the same forty lines, each free to drift.
 */

/** Rows for a table chosen at runtime. Checked by `SourceRows`, not by drizzle. */
function rowsFor(rows: AnyRow[]): never {
  return rows as never;
}

/** One column off a table chosen at runtime. Throws rather than passing undefined on. */
function columnOf(table: PgTable, name: string): PgColumn {
  const column = (table as unknown as Record<string, PgColumn | undefined>)[name];
  if (column === undefined) {
    throw new IndexError(`table ${getTableName(table)} has no column "${name}"`);
  }
  return column;
}

/** The scope of everything one source owns in a table keyed by asset id. */
function inNamespace(column: unknown, prefix: string): SQL {
  return sql`starts_with(${column as SQL}, ${prefix})`;
}

/**
 * Postgres caps a statement at 65535 bind parameters and an asset row carries
 * ten columns, so a large source would otherwise fail on a limit that has
 * nothing to do with its data being wrong.
 */
function chunked<T>(rows: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function writeSource(
  db: CatalogDatabase,
  indexer: Indexer,
  rows: SourceRows,
  notes: string[],
  root: string,
  options: {
    scope?: ReplaceScope;
    metadata?: Record<string, unknown>;
    /** The revision author, `import:<git sha>` of the tree read. */
    author?: string;
    /** The revision reason. Defaults to naming the source and what it read. */
    reason?: string;
    /**
     * The courses source runs later in the same import and rewrites every
     * course's `collection_tag` rows, so a tag this run prunes may take its
     * links with it. False when courses is not running (the database owns
     * it), and then a pruned tag a course still wears is refused.
     */
    tagLinksRewritten?: boolean;
    /** Session logs to append, for the sessions source (`importLogs`). */
    logs?: readonly ImportedLog[];
    /**
     * The concepts source runs later in the same import. A topic the
     * vocabulary dropped while concepts are still filed under it is then
     * held: left exactly as it is, row and links, and named in `deferred`,
     * since that source is about to move or prune those concepts;
     * `runIndex` then prunes it with `pruneHeldTopics`. False when nothing
     * will move them, and then the drop is refused by name before anything
     * is written.
     */
    conceptsFollow?: boolean;
  } = {},
): Promise<SourceWrite> {
  assertNamespaced(indexer, rows);
  assertInScope(rows, options.scope);

  const startedAt = new Date();
  const written: Record<string, number> = {};
  const deleted: Record<string, number> = {};
  const deletedKeys: string[] = [];
  const archived: Record<string, number> = {};
  const archivedKeys: string[] = [];
  const revisions: Record<string, number> = {};
  let deferred: string[] = [];

  const record = (table: PgTable, into: Record<string, number>, count: number) => {
    if (count > 0) into[getTableName(table)] = (into[getTableName(table)] ?? 0) + count;
  };

  await db.transaction(async (tx) => {
    // 0. Take the revision locks for every entity type this source may touch,
    //    before any row lock, so a seam write in flight finishes first and
    //    none starts until this commits (see `lockTypes`). Then say these
    //    writes come through the seam, so a table whose type has flipped and
    //    whose guard is armed (D4) still takes an import.
    await lockTypes(
      tx,
      ENTITY_ORDER.filter(
        (name) =>
          ((rows[name] ?? []) as AnyRow[]).length > 0 ||
          (indexer.owns as readonly string[]).includes(name) ||
          (name === "asset" && indexer.assetPrefix !== undefined),
      ).map((name) => REVISION_TYPE[name]),
    );
    await markSeam(tx, `import:${indexer.source}`);

    // A topic the vocabulary dropped while concepts are still filed under it
    // cannot be deleted (`concept.topic_slug` is NOT NULL and RESTRICT since
    // 0012). With the concepts source to follow it is held, untouched, for
    // `pruneHeldTopics`; without, the run is refused before anything moves.
    if ((indexer.owns as readonly string[]).includes("topic")) {
      const stale = await staleKeys(tx, indexer, "topic", rows);
      const filed = stale.length === 0 ? [] : await filedTopics(tx, stale);
      if (filed.length > 0 && options.conceptsFollow !== true) throw topicsFiledError(filed);
      deferred = [...new Set(filed.map((f) => f.topic))];
    }
    const held = new Set(deferred);

    // Sparse positions (D22): the indexers hand over each list's order as a
    // rank, and the stored numbers are placed here, under the locks, against
    // what the rows hold now, so a row whose place did not change keeps its
    // number and its snapshot.
    // A blob an asset already points at stays hooked up while its bytes are
    // the ones just read (`./blob-keys.ts`).
    const placed = await keepBlobKeys(tx, await placeSparsePositions(tx, rows));

    // The last state of every entity this run will delete, read before step 1
    // clears the link rows it owns, so a `delete` revision records the entity
    // as it was and not half stripped.
    const lastStates = new Map<EntityName, Map<string, SnapshotRead>>();
    for (const name of ENTITY_ORDER) {
      if (ARCHIVED_NOT_PRUNED.has(name)) continue;
      const keys = (await staleKeys(tx, indexer, name, rows)).filter((key) => name !== "topic" || !held.has(key));
      if (keys.length > 0) lastStates.set(name, await readSnapshots(tx, REVISION_TYPE[name], keys));
    }

    // 1. Clear the link rows this source owns, and remember how many there
    //    were so step 4 can report the net change rather than the churn.
    const clearedLinks: Partial<Record<LinkName, number>> = {};
    for (const name of LINK_ORDER) {
      const scope = linkScope(indexer, name, options.scope);
      if (scope === null) continue;
      // A held topic keeps its own links, so its eventual delete revision
      // records it whole, and a failed run leaves it as it was; except a
      // manimkc path this run files under another topic, whose primary key
      // the new row needs (the path has moved, so it is no longer the held
      // topic's to record).
      const where = held.size === 0 ? (scope ?? sql`true`) : and(scope ?? sql`true`, heldLinksKept(name, held, rows));
      const result = await tx.delete(TABLES[name]).where(where);
      clearedLinks[name] = result.rowCount ?? 0;
    }

    // 2. Archive the courses and items this source owns and stopped
    //    producing, before the upsert: a module that replaced an archived one
    //    may reuse its slug, and the live-slug index must not see both.
    const archivedIds = new Map<EntityName, string[]>();
    for (const name of ARCHIVED_NOT_PRUNED) {
      const table = TABLES[name];
      const keys = await archiveEntity(tx, indexer, name, rows);
      if (keys.length === 0) continue;
      archivedIds.set(name, keys);
      record(table, archived, keys.length);
      for (const key of keys) {
        if (archivedKeys.length < DELETED_KEYS_SHOWN) {
          archivedKeys.push(`${getTableName(table)} ${key}`);
        }
      }
    }

    // 3. Upsert the entities, parents before children.
    for (const name of ENTITY_ORDER) {
      const batch = (placed[name] ?? []) as AnyRow[];
      if (batch.length === 0) continue;
      const table = TABLES[name];
      for (const part of chunked(batch)) {
        await tx
          .insert(table)
          .values(rowsFor(part))
          .onConflictDoUpdate({ target: CONFLICT_TARGET[name], set: updateSet(table) });
      }
      record(table, written, batch.length);
    }

    // 4. Prune entities the source no longer produces, children before parents
    //    so a cascade never double-counts. Courses and items were archived in
    //    step 2 instead.
    const prunedReads = new Map<EntityName, Map<string, SnapshotRead>>();
    for (const name of [...ENTITY_ORDER].reverse()) {
      if (ARCHIVED_NOT_PRUNED.has(name)) continue;
      const table = TABLES[name];
      const pruned = await pruneEntity(tx, indexer, name, rows, {
        tagLinksRewritten: options.tagLinksRewritten ?? false,
        held,
      });
      if (pruned.length === 0) continue;
      const before = lastStates.get(name);
      prunedReads.set(
        name,
        new Map(pruned.flatMap((key) => {
          const read = before?.get(key);
          return read === undefined ? [] : [[key, read] as const];
        })),
      );
      record(table, deleted, pruned.length);
      for (const key of pruned) {
        if (deletedKeys.length < DELETED_KEYS_SHOWN) {
          deletedKeys.push(`${getTableName(table)} ${key}`);
        }
      }
    }

    // 5. Insert the links, now that everything they point at exists.
    for (const name of LINK_ORDER) {
      const batch = (placed[name] ?? []) as AnyRow[];
      const table = TABLES[name];
      for (const part of chunked(batch)) await tx.insert(table).values(rowsFor(part));
      if (batch.length > 0) record(table, written, batch.length);
      const cleared = clearedLinks[name];
      if (cleared !== undefined) record(table, deleted, Math.max(0, cleared - batch.length));
    }

    // 5b. Session logs: what each file holds beyond the entries stored. The
    //     table is append-only, so this appends or refuses; it never replaces.
    if (options.logs !== undefined) {
      const logs = await importLogs(tx, options.logs);
      if (logs.problems.length > 0) {
        const problems = new IndexErrors();
        for (const problem of logs.problems) problems.add(problem);
        problems.throwIfAny(root);
      }
      if (logs.appended > 0) written["session_log_entry"] = logs.appended;
      if (logs.sessions > 0) written["session"] = logs.sessions;
    }

    // 6. One `import` revision per entity whose snapshot changed: what it
    //    produced, and what it archived. And one `delete` revision per entity
    //    it deleted, holding the state it was deleted in, so the history ends
    //    with a word and an entity that comes back later starts a new line.
    const by = {
      author: options.author ?? "import:unknown",
      reason: options.reason ?? `catalog import of ${root} (${indexer.source})`,
    };
    for (const name of ENTITY_ORDER) {
      const key = ENTITY_KEY[name];
      const ids = [
        ...((rows[name] ?? []) as AnyRow[]).map((row) => String(row[key])),
        ...(archivedIds.get(name) ?? []),
      ];
      const count =
        (await recordImport(tx, REVISION_TYPE[name], ids, by)) +
        (await recordDeletes(tx, REVISION_TYPE[name], prunedReads.get(name), by));
      if (count > 0) revisions[REVISION_TYPE[name]] = count;
    }

    const finishedAt = new Date();
    const run = {
      sourceRoot: root,
      startedAt,
      finishedAt,
      written: sum(written),
      deleted: sum(deleted),
      counts: written,
      metadata: options.metadata ?? {},
    };
    await tx
      .insert(indexRun)
      .values({ source: indexer.source, ...run })
      .onConflictDoUpdate({
        target: indexRun.source,
        set: { ...run, updatedAt: sql`now()` },
      });
  });

  return {
    source: indexer.source,
    written,
    deleted,
    deletedKeys,
    notes,
    totalWritten: sum(written),
    totalDeleted: sum(deleted),
    archived,
    archivedKeys,
    ...(deferred.length > 0 ? { deferred } : {}),
    revisions,
  };
}

/**
 * A list whose stored positions are sparse (D22): the rows of one table, cut
 * into lists by `group`, each row named within its list by `key`.
 *
 * `entity` and `entityKey` say whose revision a row's position is part of. A
 * position is kept only when that entity already has a revision: one with
 * none was written before revisions existed (dense `1, 2, 3`, or the
 * column's default), and its first revision is being written now whatever
 * the number is, so it is placed afresh at no cost.
 */
interface SparseList {
  table: "topic" | "tag" | "concept" | "curriculumItem" | "collectionItem";
  column: "position" | "topicPosition";
  key: string;
  group: string | null;
  /** Only these rows of the table are in a list; the rest keep what they were given. */
  inList: (row: AnyRow) => boolean;
  inListSql: SQL | undefined;
  entity: RevisionEntityType;
  /** What the list is, for a refusal: "the topics in content/topics.yaml". */
  describe: (group: string | null) => string;
  /** The command that spreads the list out again. */
  renumber: (group: string | null) => string;
}

const SPARSE_LISTS: readonly SparseList[] = [
  {
    table: "topic",
    column: "position",
    key: "slug",
    group: null,
    inList: () => true,
    inListSql: undefined,
    entity: "topic",
    describe: () => "the topics in content/topics.yaml",
    renumber: () => "renumber topics",
  },
  {
    table: "tag",
    column: "position",
    key: "id",
    group: null,
    inList: () => true,
    inListSql: undefined,
    entity: "tag",
    describe: () => "the tags in content/tags.yaml",
    renumber: () => "renumber tags",
  },
  {
    table: "concept",
    column: "topicPosition",
    key: "slug",
    group: "topicSlug",
    inList: () => true,
    inListSql: undefined,
    entity: "concept",
    describe: (topicSlug) => `maps.concepts of topic "${String(topicSlug)}"`,
    renumber: (topicSlug) => `renumber concepts --topic ${String(topicSlug)}`,
  },
  {
    table: "curriculumItem",
    column: "position",
    key: "id",
    group: "collectionId",
    inList: () => true,
    inListSql: undefined,
    entity: "curriculum_item",
    describe: (moduleId) => `the items of module "${String(moduleId)}"`,
    renumber: (moduleId) => `renumber items --module ${String(moduleId)}`,
  },
  {
    // A module's topic row: its place in the topic's `maps.courses`. The row
    // belongs to the module's snapshot, so the module is the entity.
    table: "collectionItem",
    column: "topicPosition",
    key: "collectionId",
    group: "topicSlug",
    inList: (row) => row["topicSlug"] !== null && row["topicSlug"] !== undefined,
    inListSql: sql`${collectionItem.topicSlug} is not null`,
    entity: "collection",
    describe: (topicSlug) => `maps.courses of topic "${String(topicSlug)}"`,
    renumber: (topicSlug) => `renumber modules --topic ${String(topicSlug)}`,
  },
];

/**
 * `rows` with every sparse list's positions placed: each list's rows ordered
 * by the rank the indexer gave (file order), then numbered by
 * `placePositions` against the positions stored now. Returns a copy; the
 * indexer's rows are left as they were.
 */
async function placeSparsePositions(tx: CatalogDatabase, rows: SourceRows): Promise<SourceRows> {
  const out: SourceRows = { ...rows };
  for (const list of SPARSE_LISTS) {
    const given = (rows[list.table] ?? []) as AnyRow[];
    if (!given.some(list.inList)) continue;
    const table = TABLES[list.table];
    const keyColumn = columnOf(table, list.key);
    const positionColumn = columnOf(table, list.column);
    const groupColumn = list.group === null ? null : columnOf(table, list.group);

    const stored = (await tx
      .select({
        key: keyColumn,
        position: positionColumn,
        group: groupColumn ?? sql<null>`null`,
      })
      .from(table)
      .where(list.inListSql)) as { key: string; position: number; group: string | null }[];
    const revised = await entitiesWithRevisions(
      tx,
      list.entity,
      stored.map((row) => row.key),
    );

    const groups = new Map<string | null, { index: number; row: AnyRow }[]>();
    given.forEach((row, index) => {
      if (!list.inList(row)) return;
      const group = list.group === null ? null : (row[list.group] as string | null);
      const members = groups.get(group);
      if (members === undefined) groups.set(group, [{ index, row }]);
      else members.push({ index, row });
    });

    const copy = [...given];
    for (const [group, members] of groups) {
      const rank = (entry: { index: number; row: AnyRow }) => Number(entry.row[list.column] ?? 0);
      const ordered = [...members].sort((a, b) => rank(a) - rank(b) || a.index - b.index);
      const existing = new Map(
        stored
          .filter((row) => row.group === group && revised.has(row.key))
          .map((row) => [row.key, row.position] as const),
      );
      let positions: Map<string, number>;
      try {
        positions = placePositions(
          ordered.map((entry) => String(entry.row[list.key])),
          existing,
        );
      } catch (error) {
        if (!(error instanceof PositionGapError)) throw error;
        throw new IndexError(
          `${list.describe(group)}: ${error.message}. The rows around them are kept where they ` +
            `are so their revisions do not change, and here that leaves no whole number free. Run ` +
            `\`npm run catalog -- ${list.renumber(group)} --reason "<why>"\`, which spreads the ` +
            `list out again with one revision per row it moves, then import again.`,
        );
      }
      for (const entry of ordered) {
        copy[entry.index] = { ...entry.row, [list.column]: positions.get(String(entry.row[list.key])) };
      }
    }
    (out as Record<string, AnyRow[]>)[list.table] = copy;
  }
  return out;
}

/** The ids of `type` among `ids` that have at least one revision. */
async function entitiesWithRevisions(
  tx: CatalogDatabase,
  type: RevisionEntityType,
  ids: readonly string[],
): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const { rows } = await tx.execute<{ entity_id: string }>(sql`
    select distinct entity_id from content_revision
    where entity_type = ${type} and entity_id = any(${sql.param(unique)}::text[])
  `);
  return new Set(rows.map((row) => row.entity_id));
}

/**
 * Append an `import` revision for each entity whose snapshot differs from its
 * latest revision, or that has none yet. Returns how many were appended.
 */
async function recordImport(
  tx: CatalogDatabase,
  type: RevisionEntityType,
  ids: readonly string[],
  by: { author: string; reason: string },
): Promise<number> {
  if (ids.length === 0) return 0;
  const reads = await readSnapshots(tx, type, ids);
  const latest = await latestRevisions(tx, type, [...reads.keys()]);
  const changed = [...reads].filter(([id, read]) => needsRevision(latest.get(id), read));
  if (changed.length === 0) return 0;
  const revisionIds = await reserveRevisionIds(tx, changed.length);
  const pending: PendingRevision[] = changed.map(([id, read], index) => {
    const previous = latest.get(id);
    return {
      id: revisionIds[index] as number,
      type,
      entityId: id,
      read,
      latest: previous,
      op: deriveOp(previous, read, "import", true),
      authorKind: "import",
      author: by.author,
      reason: by.reason,
    };
  });
  await appendRevisions(tx, pending);
  return pending.length;
}

/**
 * Append a `delete` revision for each entity this run deleted, with the
 * snapshot read just before the delete. Returns how many were appended.
 */
async function recordDeletes(
  tx: CatalogDatabase,
  type: RevisionEntityType,
  reads: ReadonlyMap<string, SnapshotRead> | undefined,
  by: { author: string; reason: string },
): Promise<number> {
  if (reads === undefined || reads.size === 0) return 0;
  const latest = await latestRevisions(tx, type, [...reads.keys()]);
  const revisionIds = await reserveRevisionIds(tx, reads.size);
  const pending: PendingRevision[] = [...reads].map(([id, read], index) => ({
    id: revisionIds[index] as number,
    type,
    entityId: id,
    read,
    latest: latest.get(id),
    op: "delete",
    authorKind: "import",
    author: by.author,
    reason: by.reason,
  }));
  await appendRevisions(tx, pending);
  return pending.length;
}

function sum(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/**
 * Every asset id a source produces must sit in that source's namespace.
 * Without this an indexer could mint `manimkc:` ids from `learn/`, and the
 * manimkc prune would then delete them on its next run — a bug that shows up as
 * rows vanishing at random, days later, nowhere near the code that caused it.
 */
function assertNamespaced(indexer: Indexer, rows: SourceRows): void {
  const prefix = indexer.assetPrefix;
  const assets = rows.asset ?? [];
  if (assets.length > 0 && prefix === undefined) {
    throw new IndexError(`indexer "${indexer.source}" produced assets but declares no assetPrefix`);
  }
  if (prefix === undefined) return;
  for (const row of assets) {
    if (!row.id.startsWith(prefix)) {
      throw new IndexError(
        `indexer "${indexer.source}" produced asset id "${row.id}", outside its ` +
          `"${prefix}" namespace. Asset ids are how the writer knows which rows a ` +
          `source may delete.`,
      );
    }
  }
}

/**
 * The rows of a link table this source may clear: `undefined` for all of them
 * (it is the only writer), a predicate for the ones hanging off its own assets,
 * `null` for none — this source does not write here.
 */
function linkScope(
  indexer: Indexer,
  name: LinkName,
  replace: ReplaceScope | undefined,
): SQL | undefined | null {
  // `mirror` is nobody's outright: rows for a destination this run could not
  // reach are not stale, they are unaudited, and deleting them would turn "I
  // did not look" into "there is nothing there". So only the named
  // destinations are cleared, and a run that named none clears nothing.
  if (name === "mirror") {
    const destinations = replace?.mirrorDestinations;
    if (destinations === undefined || destinations.length === 0) return null;
    return inArray(mirror.destination, [...destinations]);
  }
  if ((indexer.owns as readonly string[]).includes(name)) return undefined;
  const prefix = indexer.assetPrefix;
  if (prefix === undefined || !ASSET_LINKED.has(name)) return null;
  const assetId = (TABLES[name] as unknown as Record<string, unknown>)["assetId"];
  return inNamespace(assetId, prefix);
}

/**
 * Every `mirror` row must belong to a destination the run declared it audited.
 * Without this a source could insert a row for a destination it never cleared,
 * which would then survive every future run: the delete is scoped by
 * destination, so nothing would ever be able to reach it again.
 */
function assertInScope(rows: SourceRows, replace: ReplaceScope | undefined): void {
  const produced = rows.mirror ?? [];
  if (produced.length === 0) return;
  const declared = new Set(replace?.mirrorDestinations ?? []);
  for (const row of produced) {
    if (declared.has(row.destination)) continue;
    throw new IndexError(
      `a mirror row was produced for destination "${row.destination}", which the run did ` +
        `not declare it audited. Rows outside the declared scope are never cleared, so ` +
        `this one could never be corrected.`,
    );
  }
}

/**
 * The keys of one entity table that are in this source's scope and were not
 * produced this run: what a prune would delete. Empty for a table the source
 * does not own.
 */
async function staleKeys(
  tx: CatalogDatabase,
  indexer: Indexer,
  name: EntityName,
  rows: SourceRows,
): Promise<string[]> {
  let scope: SQL | undefined;
  if (name === "asset") {
    const prefix = indexer.assetPrefix;
    if (prefix === undefined) return [];
    scope = inNamespace(asset.id, prefix);
  } else if (!(indexer.owns as readonly string[]).includes(name)) {
    return [];
  }

  const table = TABLES[name];
  const key = ENTITY_KEY[name];
  const column = columnOf(table, key);
  const produced = ((rows[name] ?? []) as AnyRow[]).map((row) => String(row[key]));

  const notProduced = produced.length === 0 ? sql`true` : notInArray(column, produced);
  const where = scope === undefined ? notProduced : and(scope, notProduced);
  const stale = (await tx.select({ key: column }).from(table).where(where)) as { key: string }[];
  return stale.map((row) => row.key);
}

/**
 * Delete the rows of one entity table that are in this source's scope and were
 * not produced this run. Returns the keys deleted; a table the source does not
 * own is left entirely alone.
 */
async function pruneEntity(
  tx: CatalogDatabase,
  indexer: Indexer,
  name: EntityName,
  rows: SourceRows,
  context: { tagLinksRewritten: boolean; held: ReadonlySet<string> },
): Promise<string[]> {
  const { tagLinksRewritten } = context;
  const keys = (await staleKeys(tx, indexer, name, rows)).filter((key) => name !== "topic" || !context.held.has(key));
  if (keys.length === 0) return [];

  const table = TABLES[name];
  const column = columnOf(table, ENTITY_KEY[name]);
  if (name === "concept") await assertNoEvidence(tx, keys);
  // `collection_tag` is RESTRICT on `tag`, so a seam write cannot delete a tag
  // a course still wears. An import that also runs the courses source is
  // different: that source rewrites every course's tags from the files later
  // in this run, so a tag gone from tags.yaml takes its links with it here,
  // the way a pruned topic's links go by cascade, and a course file that still
  // names it is refused by the course reader. When the database owns courses
  // nothing would put the links back, so the prune is refused by name instead.
  if (name === "tag") {
    if (tagLinksRewritten) {
      await tx.delete(collectionTag).where(inArray(collectionTag.tagId, keys));
    } else {
      await assertTagsUnworn(tx, keys);
    }
  }
  try {
    await tx.delete(table).where(inArray(column, keys));
  } catch (error) {
    // The lock in `assertNoEvidence` closes the window this catches, so
    // reaching it means something took a path that check did not cover. Better
    // the sentence than the constraint either way.
    if (name === "concept" && sqlstate(error) === FOREIGN_KEY_VIOLATION) {
      throw evidenceError(keys);
    }
    throw error;
  }
  return keys;
}

/**
 * Archive the rows of `collection` or `curriculum_item` this source owns and
 * did not produce this run. Returns the keys newly archived; a row already
 * archived is left with the instant it was first archived at.
 *
 * Archived, not deleted (D12): `progress` and `recap` are RESTRICT on
 * `curriculum_item`, and the learner's tick on a row a course file dropped is
 * the learner's, not the course file's.
 */
async function archiveEntity(
  tx: CatalogDatabase,
  indexer: Indexer,
  name: EntityName,
  rows: SourceRows,
): Promise<string[]> {
  if (!(indexer.owns as readonly string[]).includes(name)) return [];
  const table = TABLES[name];
  const key = ENTITY_KEY[name];
  const keyColumn = columnOf(table, key);
  const archivedColumn = columnOf(table, "archivedAt");
  const produced = ((rows[name] ?? []) as AnyRow[]).map((row) => String(row[key]));
  const notProduced = produced.length === 0 ? sql`true` : notInArray(keyColumn, produced);
  const updated = (await tx
    .update(table)
    .set({ archivedAt: sql`now()` } as never)
    .where(and(notProduced, isNull(archivedColumn)))
    .returning({ key: keyColumn })) as { key: string }[];
  return updated.map((row) => row.key).sort();
}

/**
 * Refuse to prune a concept the learner has been observed on, and say which.
 *
 * `event.concept_slug` is `ON DELETE RESTRICT`, so the delete below would fail
 * anyway — with `insert or update on table "event" violates foreign key
 * constraint "event_concept_slug_concept_slug_fk"`, which names neither the
 * concept nor the thing to do about it. Checking first turns that into a
 * sentence, and it is the one refusal in this file that is not about a typo:
 * the note really is gone from the tree, and the answer is that an event is
 * the record of something that happened and forgetting what it was about is
 * exactly what an append-only log exists to prevent.
 *
 * `mastery` and `review` are not checked. They cascade, and they are
 * projections this log rebuilds.
 */
async function assertNoEvidence(tx: CatalogDatabase, slugs: string[]): Promise<void> {
  // Lock the candidates first, or the check is a read that a concurrent
  // `learn observe` can invalidate before the delete runs. Inserting an event
  // takes a FOR KEY SHARE lock on the concept it references, which conflicts
  // with FOR UPDATE, so this either waits for that insert to commit — and then
  // sees its event — or holds the row until this transaction ends.
  await tx.select({ slug: concept.slug }).from(concept).where(inArray(concept.slug, slugs)).for("update");

  const observed = await tx
    .selectDistinct({ slug: event.conceptSlug })
    .from(event)
    .where(inArray(event.conceptSlug, slugs));
  const blocked = observed
    .map((row) => row.slug)
    .filter((slug): slug is string => slug !== null)
    .sort();
  if (blocked.length === 0) return;

  throw evidenceError(blocked);
}

/**
 * Refuse to prune a tag a course still wears, naming both, when the courses
 * source is not running to rewrite the links: the database owns courses, and
 * silently dropping a tag from one would be an edit nobody made.
 */
/**
 * The concepts filed under topics the vocabulary dropped.
 *
 * `concept.topic_slug` is `NOT NULL` and `RESTRICT` since migration 0012, so
 * deleting such a topic would fail on the constraint. The topics source runs
 * before the concepts source, so an edit that moves those concepts to another
 * topic, or removes their notes, in the same breath reaches the prune first.
 * When the concepts source follows in the same import, the topic is held for
 * that source to empty and `runIndex` prunes it with `pruneHeldTopics`;
 * otherwise the drop is refused by name, archived concepts included, since the
 * constraint binds them too.
 */
async function filedTopics(tx: CatalogDatabase, topics: string[]): Promise<{ topic: string; slug: string }[]> {
  return tx
    .select({ topic: concept.topicSlug, slug: concept.slug })
    .from(concept)
    .where(inArray(concept.topicSlug, topics))
    .orderBy(concept.topicSlug, concept.slug);
}

/**
 * The link rows a held topic keeps through the topics pass, as a condition
 * for the rows the pass may clear: its outgoing relations, and its manimkc
 * paths other than any this run files under a surviving topic.
 */
function heldLinksKept(name: LinkName, held: ReadonlySet<string>, rows: SourceRows): SQL | undefined {
  const topics = [...held];
  if (name === "topicRelation") return notInArray(topicRelation.fromSlug, topics);
  if (name === "manimkcTopic") {
    const moved = (rows.manimkcTopic ?? []).map((row) => row.path);
    const keep = and(inArray(manimkcTopic.topicSlug, topics), moved.length === 0 ? sql`true` : notInArray(manimkcTopic.path, moved));
    return sql`not (${keep})`;
  }
  return undefined;
}

/**
 * Delete the topics the topics source held, now that the concepts source has
 * moved or pruned what was filed under them: the step that source's own prune
 * would have taken. One transaction under the topic lock, a `delete` revision
 * each from the state the held topic kept, and the topics run's `deleted`
 * count brought up to date. A topic that still has a concept (the edit moved
 * it nowhere) is refused by name, and nothing is deleted.
 */
export async function pruneHeldTopics(
  db: CatalogDatabase,
  topics: readonly string[],
  by: { author: string; reason: string },
): Promise<{ deleted: string[]; revisions: number }> {
  if (topics.length === 0) return { deleted: [], revisions: 0 };
  return db.transaction(async (tx) => {
    await lockTypes(tx, ["topic"]);
    await markSeam(tx, "import:topics");
    const filed = await filedTopics(tx, [...topics]);
    if (filed.length > 0) throw topicsFiledError(filed);
    const reads = await readSnapshots(tx, "topic", topics);
    const keys = [...reads.keys()].sort();
    if (keys.length === 0) return { deleted: [], revisions: 0 };
    // Its own links first, which the topics pass kept for this revision:
    // `topic_relation` is RESTRICT on its topics and would refuse the delete.
    await tx.delete(topicRelation).where(inArray(topicRelation.fromSlug, keys));
    await tx.delete(manimkcTopic).where(inArray(manimkcTopic.topicSlug, keys));
    await tx.delete(topic).where(inArray(topic.slug, keys));
    const revisions = await recordDeletes(tx, "topic", reads, by);
    await tx
      .update(indexRun)
      .set({ deleted: sql`${indexRun.deleted} + ${keys.length}`, updatedAt: sql`now()` })
      .where(eq(indexRun.source, "topics"));
    return { deleted: keys, revisions };
  });
}

function topicsFiledError(filed: readonly { topic: string; slug: string }[]): IndexError {
  return new IndexError(
    `content/topics.yaml no longer lists topics that concepts are still filed under: ` +
      `${filed.map((f) => `${f.topic} (${f.slug})`).join(", ")}. Every concept needs a topic, and ` +
      `this import will not move them (the concepts source is not part of it, or has already run). ` +
      `List each under its new topic's maps.concepts, or remove its note, and index again.`,
  );
}

async function assertTagsUnworn(tx: CatalogDatabase, tags: string[]): Promise<void> {
  const worn = await tx
    .select({ tag: collectionTag.tagId, course: collectionTag.collectionId })
    .from(collectionTag)
    .where(inArray(collectionTag.tagId, tags))
    .orderBy(collectionTag.tagId, collectionTag.collectionId);
  if (worn.length === 0) return;
  throw new IndexError(
    `content/tags.yaml no longer lists tags that courses still wear: ` +
      `${worn.map((w) => `${w.tag} (${w.course})`).join(", ")}. The database owns courses, so ` +
      `this import will not rewrite them. Remove the tag from those courses through the catalog ` +
      `first, or put it back in tags.yaml.`,
  );
}

function evidenceError(slugs: string[]): IndexError {
  return new IndexError(
    `these concept notes are gone from learn/concepts/, but the event log records ` +
      `answers about them: ${slugs.join(", ")}. The log is append-only, so the ` +
      `catalog cannot forget what those events were about. Put the note back (an ` +
      `empty stub is enough), or rename the concept by moving its events first — ` +
      `deleting the study record is not something an index run will do for you.`,
  );
}
