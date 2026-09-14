import {
  canTransition,
  LOCAL_LEARNER_ID,
  session,
  SESSION_TRANSITIONS,
  type Session,
  type SessionKind,
  type SessionState,
} from "@self-learn/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { ensureLearner } from "./learner";

/**
 * The `session` row behind `event.session_id`.
 *
 * That column was free text until migration `0006`, because `learn session
 * start` wrote its event before there was anything to point at. Now the same
 * command writes the session row, so the referent exists at write time and the
 * foreign key can hold.
 *
 * `ensureSession` is create-on-first-reference, for the same reason
 * `ensureLearner` is: a foreign key that fails with a 23503 nobody can act on
 * is worse than a row that appears when it is first mentioned. It is also the
 * runtime form of the `0006` backfill, which reconstructs exactly this row for
 * every session id the log already held.
 */

export interface SessionInput {
  id: string;
  kind?: SessionKind;
  title?: string | null;
  goal?: string | null;
  agentSessionId?: string | null;
  /** When it began. Defaults to now, and is never moved once set. */
  startedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * The session exists after this returns, whether or not it did before.
 *
 * `onConflictDoNothing`, so a second `session start` on the same id neither
 * fails nor rewrites what the first one said. Reopening a closed session is
 * deliberately not a thing this does: the state machine has no way back out of
 * a terminal state, and quietly resurrecting one would make "closed" mean
 * nothing.
 */
export async function ensureSession(
  db: CatalogDatabase,
  input: SessionInput,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<string> {
  const id = input.id.trim();
  if (id === "") throw new StateError("a session needs an id");
  await ensureLearner(db, learnerId);
  await db
    .insert(session)
    .values({
      id,
      kind: input.kind ?? "tutor",
      learnerId,
      state: "running",
      title: input.title ?? null,
      goal: input.goal ?? null,
      agentSessionId: input.agentSessionId ?? null,
      startedAt: input.startedAt ?? new Date(),
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing();
  return id;
}

export async function readSession(
  db: CatalogDatabase,
  id: string,
): Promise<Session | undefined> {
  const rows = await db.select().from(session).where(eq(session.id, id)).limit(1);
  return rows[0];
}

export interface SessionEndInput {
  errorKind?: string | null;
  error?: string | null;
}

/**
 * Move a session to a terminal state, as a conditional update.
 *
 * `WHERE state IN (<the states that can reach this one>)`, so a replayed close
 * against a session that already ended writes nothing and says so, rather than
 * moving `ended_at` to whenever the replay happened. `interrupted` is reachable
 * the same way and is never written by the process itself: it is what a
 * reconcile pass concludes about one that stopped writing heartbeats.
 */
export async function endSession(
  db: CatalogDatabase,
  id: string,
  state: SessionState,
  input: SessionEndInput = {},
): Promise<{ moved: boolean; from: string | null }> {
  const from = (Object.keys(SESSION_TRANSITIONS) as SessionState[]).filter((candidate) =>
    canTransition(SESSION_TRANSITIONS, candidate, state),
  );
  if (from.length === 0) {
    throw new StateError(`nothing can transition to session state "${state}"`);
  }
  const before = await readSession(db, id);
  const updated = await db
    .update(session)
    .set({
      state,
      endedAt: sql`now()`,
      errorKind: input.errorKind ?? null,
      error: input.error ?? null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(session.id, id), inArray(session.state, from)))
    .returning({ id: session.id });
  return { moved: updated.length > 0, from: before?.state ?? null };
}

/** A heartbeat, so a reconcile pass can tell a live process from a dead one. */
export async function touchSession(db: CatalogDatabase, id: string): Promise<void> {
  await db
    .update(session)
    .set({ heartbeatAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(session.id, id));
}
