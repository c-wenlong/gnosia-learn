import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, integer, text } from "drizzle-orm/sqlite-core";

import { LOCAL_LEARNER_ID } from "./shared";

/**
 * Every table carries `created_at`. Mutable tables carry `updated_at` too;
 * append-only ones (`event`) deliberately do not, because a row that can be
 * updated is not append-only and a column implying otherwise would lie.
 *
 * An instant is an `integer` of milliseconds since the epoch
 * (`timestamp_ms`), never a bare `datetime` string: the knowledge base stores
 * ISO instants with a `Z` (`learn/state/events.jsonl`, `reviews.json`), and a
 * text timestamp whose offset is implicit reinterprets them in whatever zone
 * the reader assumes. `unixepoch('subsec')` is a real of seconds, so the
 * expression widens it before the cast keeps the milliseconds.
 *
 * Where `now()` was the default, `cast(unixepoch('subsec') * 1000 as integer)`
 * is: evaluated once per row, which is what the avatar draw relies on too.
 */
const NOW_MS = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW_MS);

export const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" }).notNull().default(NOW_MS);

/** A nullable instant. Used for `last_seen`, `last_reviewed`, `completed_at`. */
export const instant = (name: string) => integer(name, { mode: "timestamp_ms" });

/**
 * When a row stopped being current, or null while it still is. Readers filter
 * `archived_at is null`; nothing deletes the row, because learner state and the
 * revision history both point at it (docs/CONTENT-MIGRATION.md D12).
 */
export const archivedAt = () => integer("archived_at", { mode: "timestamp_ms" });

/**
 * Whose content a row is. Every content entity carries it from the phase 0
 * expand migration on (D3 in docs/CONTENT-MIGRATION.md), defaulting to the one
 * learner there is, so phase 4 can scope, cap and delete by owner without a
 * second migration.
 *
 * The referenced column is passed in rather than imported, because this file
 * is evaluated before `state.ts` and a direct import would put `learner` in its
 * temporal dead zone for every table defined while the cycle resolves.
 * `onDelete: restrict` because deleting an owner must never take their content
 * with it silently. The index is the caller's: every foreign key gets one.
 */
export const ownerId = (learnerId: () => AnySQLiteColumn) =>
  text("owner_id")
    .notNull()
    .default(LOCAL_LEARNER_ID)
    .references(learnerId, { onDelete: "restrict", onUpdate: "cascade" });
