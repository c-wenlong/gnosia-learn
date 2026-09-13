import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

import { createdAt, instant, updatedAt } from "./columns";
import { asset } from "./content";

/**
 * The operational half: what the indexers did, rather than what they found.
 *
 * Neither content nor state. It is not derived *from* files the way the content
 * tables are, and it is not the only copy of anything the way the state tables
 * are — drop it and the next `catalog index` writes it back, minus the history
 * of when each source was last read. That is exactly why it exists: without it,
 * "is the manimkc half of this database stale?" has no answer short of
 * re-indexing and diffing.
 *
 * `mirror` sits here for the same reason. A mirror row is not a fact about the
 * content, it is what one audit saw on one destination at one moment, and the
 * next audit overwrites it.
 */

/**
 * The indexers, one per source tree, in dependency order: courses before
 * concepts because a note's `topics:` frontmatter names curriculum items, and
 * everything after `topics` because every other source resolves a slug from the
 * shared vocabulary.
 *
 * `mirrors` is last. It reads no content tree at all: it joins a ledger from
 * the manimkc CLI onto asset rows `manimkc` has already written, so it can only
 * run once those exist.
 */
export const INDEX_SOURCES = [
  "topics",
  "courses",
  "concepts",
  "manimkc",
  "diagrams",
  "sessions",
  "mirrors",
] as const;
export type IndexSource = (typeof INDEX_SOURCES)[number];

/**
 * One row per source, overwritten on every successful run. A history table was
 * the alternative and would grow without bound to answer a question nobody
 * asked; the only thing read here is "when was this source last indexed, and
 * what did it produce", which is one row.
 *
 * Failed runs are absent rather than recorded as failures. The whole index of a
 * source happens in one transaction, so a failure leaves the previous run's row
 * — and its older timestamp — in place, which is the honest reading: those rows
 * really are from that earlier run.
 */
export const indexRun = pgTable(
  "index_run",
  {
    source: text("source").primaryKey(),
    /** Where the files were read from. Repo-relative, or absolute for a manimkc root outside it. */
    sourceRoot: text("source_root").notNull(),
    startedAt: instant("started_at").notNull(),
    finishedAt: instant("finished_at").notNull(),
    /** Rows inserted or updated across every table this source writes. */
    written: integer("written").notNull().default(0),
    /** Rows removed because the source no longer produces them. */
    deleted: integer("deleted").notNull().default(0),
    /** Per-table written counts, keyed by SQL table name. Display-only. */
    counts: jsonb("counts").notNull().default(sql`'{}'::jsonb`),
    /**
     * Anything else the source wants remembered about the run that is not a
     * count. Today only `mirrors` writes here, recording which destinations it
     * could reach: a destination it could not reach keeps its old rows, so
     * without this the table would claim an audit that never happened.
     */
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check(
      "index_run_source_check",
      sql.raw(`source in (${INDEX_SOURCES.map((s) => `'${s}'`).join(", ")})`),
    ),
    check("index_run_written_check", sql`written >= 0 and deleted >= 0`),
    check("index_run_order_check", sql`finished_at >= started_at`),
  ],
);

/** What one audit found for one file on one mirror. */
export const MIRROR_STATUSES = ["present", "stale", "missing", "unknown"] as const;
export type MirrorStatus = (typeof MIRROR_STATUSES)[number];

/**
 * Which test the verdict rests on. `none` is the honest answer for a file that
 * was never compared at all: there was nothing local to compare against, or
 * nothing on the mirror to compare with.
 */
export const MIRROR_COMPARISONS = ["sha256", "bytes", "size+mtime", "none"] as const;
export type MirrorComparison = (typeof MIRROR_COMPARISONS)[number];

/**
 * Where a deliverable has reached, one row per (asset, destination).
 *
 * The bytes never enter the database; this is the ledger `manimkc mirrors
 * --json` produces, joined onto the asset rows the manimkc indexer already
 * wrote. A video is tens of megabytes and lives in exactly one place, so what
 * the catalog can usefully say about it is which copies exist elsewhere and
 * whether they are the same file.
 *
 * `compared` is stored beside `status` rather than folded into it because the
 * two answer different questions. A `present` reached by `sha256` is the strong
 * claim; a `present` reached by `size+mtime` is what a cloud placeholder that
 * refuses to be read allows, and a report that could not tell them apart would
 * be quietly overstating what it knows.
 *
 * A destination this run could not reach writes nothing here and deletes
 * nothing: its rows stay, with the older `checked_at` that says when they were
 * last true. Which destinations the run actually looked at is in
 * `index_run.metadata`.
 */
export const mirror = pgTable(
  "mirror",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** The ledger's destination slug, e.g. `drive`, `seafile`. */
    destination: text("destination").notNull(),
    /** The directory that slug pointed at when the audit ran. */
    root: text("root").notNull(),
    status: text("status").notNull(),
    compared: text("compared").notNull(),
    /** Size of the copy on the mirror, or null when there is none. */
    bytes: bigint("bytes", { mode: "number" }),
    /** Modification time of the copy on the mirror. */
    mtime: instant("mtime"),
    /** When the audit that produced this row ran. */
    checkedAt: instant("checked_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.destination] }),
    check(
      "mirror_status_check",
      sql.raw(`status in (${MIRROR_STATUSES.map((s) => `'${s}'`).join(", ")})`),
    ),
    check(
      "mirror_compared_check",
      sql.raw(`compared in (${MIRROR_COMPARISONS.map((c) => `'${c}'`).join(", ")})`),
    ),
    check("mirror_bytes_check", sql`bytes is null or bytes >= 0`),
    // `catalog status` counts by status across every destination, and that is
    // the one query this table exists to answer cheaply.
    index("mirror_status_idx").on(t.status),
    index("mirror_destination_idx").on(t.destination),
  ],
);
