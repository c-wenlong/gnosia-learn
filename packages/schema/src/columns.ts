import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

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
