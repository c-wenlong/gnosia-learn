import { sql } from "drizzle-orm";
import { type AnyPgColumn, text, timestamp } from "drizzle-orm/pg-core";

import { LOCAL_LEARNER_ID } from "./shared";

/**
 * Every table carries `created_at`. Mutable tables carry `updated_at` too;
 * append-only ones (`event`) deliberately do not, because a row that can be
 * updated is not append-only and a column implying otherwise would lie.
 *
 * `withTimezone` is not optional here. A naive `timestamp` throws away the
 * offset, and the knowledge base already stores ISO instants with a `Z`
 * (`learn/state/events.jsonl`, `reviews.json`). Round-tripping those through
 * a `timestamp without time zone` would silently reinterpret them in whatever
 * the server's TimeZone happens to be.
 */
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`);

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`);

/** A nullable instant. Used for `last_seen`, `last_reviewed`, `completed_at`. */
export const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/**
 * When a row stopped being current, or null while it still is. Readers filter
 * `archived_at is null`; nothing deletes the row, because learner state and the
 * revision history both point at it (docs/CONTENT-MIGRATION.md D12).
 */
export const archivedAt = () => timestamp("archived_at", { withTimezone: true, mode: "date" });

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
export const ownerId = (learnerId: () => AnyPgColumn) =>
  text("owner_id")
    .notNull()
    .default(LOCAL_LEARNER_ID)
    .references(learnerId, { onDelete: "restrict", onUpdate: "cascade" });
