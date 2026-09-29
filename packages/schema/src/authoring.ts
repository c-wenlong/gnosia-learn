import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { createdAt, instant, ownerId, updatedAt } from "./columns";
import { learner } from "./state";
import { job, session } from "./studio";

/**
 * Where content is authored, and the record of every write to it
 * (docs/CONTENT-MIGRATION.md, "The new tables").
 *
 * `content_revision` is what the database gives back for leaving git: the
 * diff, the history and the author of every content write. `content_source`
 * records which content types the database owns, and `catalog_instance` says
 * whether this database is the one writes belong in.
 */

const quoted = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");
const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${quoted(values)})`);

/**
 * The entities a revision can be about. Link rows have no type of their own:
 * they are part of their parent's snapshot, so a change to a link is a
 * revision of the parent. Which link belongs to which parent is written down
 * once, in `services/catalog/src/content/entities.ts`.
 */
export const REVISION_ENTITY_TYPES = [
  "topic",
  "tag",
  "collection",
  "curriculum_item",
  "concept",
  "diagram",
  "asset",
  // A studio video (docs/STUDIO-VIDEOS.md, D49): its source and brief, with
  // the rendered cut as a blob. Its asset rows are revisions of `asset`.
  "video",
] as const;
export type RevisionEntityType = (typeof REVISION_ENTITY_TYPES)[number];

/**
 * What kind of write produced a revision. `delete` is an import pruning an
 * entity its files no longer produce: the snapshot is the entity as it was, so
 * the history ends with its last state rather than stopping without a word,
 * and an entity that comes back after it is always a new revision.
 */
export const REVISION_OPS = [
  "create",
  "update",
  "archive",
  "restore",
  "rename",
  "import",
  "delete",
] as const;
export type RevisionOp = (typeof REVISION_OPS)[number];

/** Who made a write: a person, an agent acting for one, or an import of the files. */
export const AUTHOR_KINDS = ["person", "agent", "import"] as const;
export type AuthorKind = (typeof AUTHOR_KINDS)[number];

/**
 * The content types a database can own, named as `catalog import --only`
 * names them so a `content_source` row and an import source are the same
 * word. `manimkc` is the videos and their sidecars.
 */
export const CONTENT_TYPES = [
  "topics",
  "tags",
  "courses",
  "concepts",
  "sessions",
  "diagrams",
  "manimkc",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Where a content type is read from: the files, or the database after its flip. */
export const CONTENT_SOURCES = ["files", "db"] as const;
export type ContentSourceName = (typeof CONTENT_SOURCES)[number];

/** Whether this database takes writes. Exactly one database is `primary` at any time (D2). */
export const INSTANCE_ROLES = ["primary", "copy"] as const;
export type InstanceRole = (typeof INSTANCE_ROLES)[number];

/**
 * The history of record: one row per content write, append-only by a per-row
 * trigger created in the migration, the same guard `event` has and for the
 * same reason (a revoked privilege does not bind the owner who runs psql).
 *
 * Written only by the write seam in `services/catalog/src/content/`, which
 * also sets the `self_learn.revision_id` setting the per-table guard triggers
 * check once a type flips (D4).
 *
 * `snapshot` is the whole entity after the write, with its owned links under
 * it in a canonical order, so a diff is a comparison of two rows and a restore
 * is one write. `snapshot_hash` is how an import that changes nothing writes
 * nothing.
 *
 * The id is supplied by the seam from the identity's own sequence, so the
 * setting can name the revision before the entity write it authorises; that
 * is why the identity is BY DEFAULT rather than ALWAYS.
 */
export const contentRevision = pgTable(
  "content_revision",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    ownerId: ownerId(() => learner.id),
    entityType: text("entity_type").notNull(),
    /** The entity's primary key, as text. Not a foreign key: history outlives the row. */
    entityId: text("entity_id").notNull(),
    /** 1, 2, 3 per entity. */
    seq: integer("seq").notNull(),
    /** The revision this one replaced. Null on the first revision of an entity. */
    previousId: bigint("previous_id", { mode: "number" }).references(
      (): AnyPgColumn => contentRevision.id,
      { onDelete: "restrict", onUpdate: "cascade" },
    ),
    op: text("op").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    /** Lowercase hex sha256 of the canonical snapshot. */
    snapshotHash: text("snapshot_hash").notNull(),
    authorKind: text("author_kind").notNull(),
    /** A learner id, an agent label such as `planner`, or `import:<git sha>`. */
    author: text("author").notNull(),
    /** What a commit message used to say. Empty is refused, here and in the seam. */
    reason: text("reason").notNull(),
    jobId: text("job_id").references(() => job.id, { onDelete: "restrict", onUpdate: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("content_revision_entity_seq_key").on(t.entityType, t.entityId, t.seq),
    check("content_revision_entity_type_check", inList("entity_type", REVISION_ENTITY_TYPES)),
    check("content_revision_op_check", inList("op", REVISION_OPS)),
    check("content_revision_author_kind_check", inList("author_kind", AUTHOR_KINDS)),
    check("content_revision_seq_check", sql`seq >= 1`),
    // Every revision after the first says what it replaced. The first may too:
    // a rename starts a new id's chain from the old id's last revision.
    check("content_revision_previous_check", sql`seq = 1 or previous_id is not null`),
    check("content_revision_not_own_previous_check", sql`previous_id is distinct from id`),
    check("content_revision_snapshot_object_check", sql`jsonb_typeof(snapshot) = 'object'`),
    check("content_revision_snapshot_hash_check", sql`snapshot_hash ~ '^[0-9a-f]{64}$'`),
    check("content_revision_author_check", sql`btrim(author) <> ''`),
    check("content_revision_reason_check", sql`btrim(reason) <> ''`),
    index("content_revision_owner_id_idx").on(t.ownerId),
    index("content_revision_previous_id_idx").on(t.previousId),
    index("content_revision_job_id_idx").on(t.jobId),
    index("content_revision_session_id_idx").on(t.sessionId),
    index("content_revision_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Which content types the database owns (D18). One row per type once `catalog
 * flip <type>` has run; a type with no row is read from the files, which is
 * every type until phase 1. Importers and writers obey the row;
 * `CONTENT_SOURCE` overrides readers only.
 *
 * `export_hash` is the hash of the files the last `catalog export` wrote for
 * the type, so an import can refuse a hand-edited export (edge case 12).
 * `waivers` holds `catalog flip --waive <rule> --reason` entries, which
 * `catalog doctor` reports on every run (phase 3).
 */
export const contentSource = pgTable(
  "content_source",
  {
    type: text("type").primaryKey(),
    source: text("source").notNull().default("files"),
    flippedAt: instant("flipped_at"),
    parityReport: jsonb("parity_report"),
    exportHash: text("export_hash"),
    exportedAt: instant("exported_at"),
    waivers: jsonb("waivers").notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check("content_source_type_check", inList("type", CONTENT_TYPES)),
    check("content_source_source_check", inList("source", CONTENT_SOURCES)),
    check("content_source_flipped_check", sql`source <> 'db' or flipped_at is not null`),
    check(
      "content_source_parity_report_check",
      sql`parity_report is null or jsonb_typeof(parity_report) = 'object'`,
    ),
    check("content_source_waivers_check", sql`jsonb_typeof(waivers) = 'array'`),
  ],
);

/**
 * One row naming this database `primary` or `copy` (D2, edge case 14). The
 * migration seeds `primary`, since the local database is the primary until the
 * deferred cloud move, and a database copied with `createdb -T` inherits the
 * row of the one it was copied from.
 *
 * On a copy every write to every other table is refused by a statement trigger
 * the migration attaches, naming `primary_host`; a connection opened with
 * `self_learn.copy_ok = on` (tests and `scripts/e2e.mjs`, through
 * `CATALOG_COPY_OK=1`) is let through. The boolean key with a CHECK is what
 * makes it a single row.
 */
export const catalogInstance = pgTable(
  "catalog_instance",
  {
    id: boolean("id").primaryKey().default(true),
    role: text("role").notNull().default("primary"),
    /** Where writes go when this is a copy: a host name, never a URL with a password in it. */
    primaryHost: text("primary_host"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check("catalog_instance_single_row_check", sql`id`),
    check("catalog_instance_role_check", inList("role", INSTANCE_ROLES)),
    check("catalog_instance_copy_check", sql`role <> 'copy' or primary_host is not null`),
  ],
);
