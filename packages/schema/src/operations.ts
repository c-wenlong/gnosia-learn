import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { createdAt, instant, updatedAt } from "./columns";

/**
 * The operational half: what the indexers did, rather than what they found.
 *
 * Neither content nor state. It is not derived *from* files the way the content
 * tables are, and it is not the only copy of anything the way the state tables
 * are — drop it and the next `catalog index` writes it back, minus the history
 * of when each source was last read. That is exactly why it exists: without it,
 * "is the manimkc half of this database stale?" has no answer short of
 * re-indexing and diffing.
 */

/**
 * The indexers, one per source tree, in dependency order: courses before
 * concepts because a note's `topics:` frontmatter names curriculum items, and
 * everything after `topics` because every other source resolves a slug from the
 * shared vocabulary.
 */
export const INDEX_SOURCES = [
  "topics",
  "courses",
  "concepts",
  "manimkc",
  "diagrams",
  "sessions",
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
