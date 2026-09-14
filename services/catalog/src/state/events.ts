import {
  event,
  EVENT_TYPES,
  LOCAL_LEARNER_ID,
  type EventType,
} from "@self-learn/schema";
import { asc, eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ensureLearner } from "./learner";
import { ensureSession } from "./sessions";
import { StateError } from "./errors";

/**
 * The trajectory log: `learn/state/events.jsonl` as a table.
 *
 * The file was flat — one JSON object per line, every field at the top level.
 * The table is not: `at`, `type`, `concept_slug` and `session_id` are columns
 * because they are what anything queries by, and everything else lives in a
 * `payload` jsonb. This module is the only place that translation happens, so
 * every caller still reads and writes the flat record the CLI has always used
 * and nothing outside here has to know which fields were promoted.
 *
 * Append-only is enforced by a trigger in the database, not by discipline
 * here. There is deliberately no update and no delete: a correction is a `void`
 * event with a reason, which is a new row.
 */

/** One line of the old `events.jsonl`, and still the shape every caller uses. */
export interface EventRecord {
  /** ISO instant from the emitter. */
  at: string;
  type: EventType;
  /** Present on observations and reviews. */
  concept?: string | null;
  /** The session this happened inside, when there was one. */
  session?: string | null;
  /** Everything type-specific: correct, grade, pLBefore, propagated, reason, … */
  [key: string]: unknown;
}

/**
 * An event on the way in. `at` is optional because the CLI has always let
 * `appendEvent` stamp it; backfill supplies it, since replaying a log with
 * today's timestamps would destroy the only ordering the log has.
 *
 * Declared apart from `EventRecord` rather than as `Omit<EventRecord, "at">`:
 * `Omit` over a type with an index signature collapses every known key into
 * the signature, so `type` would stop being required.
 */
export interface EventInput {
  at?: string;
  type: EventType;
  concept?: string | null;
  session?: string | null;
  [key: string]: unknown;
}

/** The columns promoted out of the payload. Everything else stays in it. */
const PROMOTED = new Set(["at", "type", "concept", "session"]);

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

/** A flat record split into the row the table wants. */
export function toRow(record: EventRecord, learnerId: string) {
  if (!isEventType(record.type)) {
    throw new StateError(
      `unknown event type "${String(record.type)}". Known: ${EVENT_TYPES.join(", ")}`,
    );
  }
  const at = new Date(record.at);
  if (Number.isNaN(at.getTime())) {
    throw new StateError(`event has an unparseable "at": ${JSON.stringify(record.at)}`);
  }

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (PROMOTED.has(key)) continue;
    // `undefined` has no JSON representation, so it would land as a missing key
    // on the way in and be indistinguishable from never having been set. The
    // CLI writes explicit nulls for "asked but not recorded", so keep those.
    if (value === undefined) continue;
    payload[key] = value;
  }

  return {
    at,
    learnerId,
    type: record.type,
    conceptSlug: record.concept ?? null,
    sessionId: record.session ?? null,
    payload,
  };
}

/** A row flattened back into the record shape. */
export function toRecord(row: typeof event.$inferSelect): EventRecord {
  const payload =
    row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  const record: EventRecord = { at: row.at.toISOString(), type: row.type as EventType };
  if (row.conceptSlug !== null) record.concept = row.conceptSlug;
  if (row.sessionId !== null) record.session = row.sessionId;
  return { ...record, ...payload };
}

/**
 * Append one event. Stamps `at` when the caller did not, exactly as
 * `store.mjs` did, so the CLI's call sites are unchanged.
 */
export async function appendEvent(
  db: CatalogDatabase,
  record: EventInput,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<EventRecord> {
  const stamped: EventRecord = { ...record, at: record.at ?? new Date().toISOString() };
  await ensureLearner(db, learnerId);
  // `session_id` has been a foreign key since migration `0006`, so a session
  // named here has to exist before the row lands. `learn session start`
  // normally created it already; this covers `learn observe --session x` run
  // against a session nobody opened, which was legal while the column was free
  // text and would otherwise now fail on a 23503 mid-loop. It is the same
  // reconstruction the `0006` backfill does, one row at a time.
  const session = stamped.session;
  if (typeof session === "string" && session.trim() !== "") {
    await ensureSession(db, { id: session, startedAt: new Date(stamped.at) }, learnerId);
  }
  await db.insert(event).values(toRow(stamped, learnerId));
  return stamped;
}

/** Every event for this learner, oldest first. */
export async function readEvents(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<EventRecord[]> {
  const rows = await db
    .select()
    .from(event)
    .where(eq(event.learnerId, learnerId))
    // `at` then `id`: two events can share an instant (the CLI writes an
    // observation and its propagation in the same millisecond), and replay has
    // to be deterministic. `id` is a generated identity, so it is insertion
    // order, which is the tie-break the file's line order used to provide.
    .orderBy(asc(event.at), asc(event.id));
  return rows.map(toRecord);
}

/** Sessions a `void` event has retracted. Used by every replay. */
export function voidedSessions(events: readonly EventRecord[]): Set<string> {
  return new Set(
    events
      .filter((e) => e.type === "void" && typeof e.session === "string" && e.session !== "")
      .map((e) => e.session as string),
  );
}
