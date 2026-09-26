import { event, LOCAL_LEARNER_ID, session as sessionTable } from "@self-learn/schema";
import { and, asc, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import {
  DEFAULT_PARAMS,
  MASTERY_THRESHOLD,
  masteryLabel,
  update as bktUpdate,
} from "../../../../scripts/learn/lib/bkt.mjs";
import { gradeFromOutcome, newCard, review as sm2 } from "../../../../scripts/learn/lib/schedule.mjs";
import { StateError } from "./errors";
import { appendEvent, toRecord } from "./events";
import { ensureLearner, withLearnerLock } from "./learner";
import { assertKnownConcepts, ensureEntry, propagateCorrect, readModel, writeModel } from "./mastery";
import { readCards, readReviews, upsertReview, type ReviewCard } from "./review";
import { endSession } from "./sessions";

/**
 * One answered question, recorded: the RL step of the tutoring loop.
 *
 * This is `learn observe`, moved out of the CLI so the web app's
 * `POST /api/learner/observe` records a graded answer by running the same
 * function rather than a copy of it, the way `gradeReview` did for
 * `learn review grade`. The CLI's `observe` is now a call to this plus the
 * parts only a terminal has (the `--force` check against the notes on disk,
 * the markdown session log, the printing), and its `--json` shape is built
 * from what this returns, unchanged.
 */

export interface ObserveInput {
  conceptId: string;
  correct: boolean;
  /**
   * The graph a correct answer propagates along. The CLI passes the one it
   * builds from the notes on disk; the web app passes `readConceptGraph`'s,
   * built from the catalog's edges. Taken as an argument so this module never
   * reads a file.
   */
  graph: { nodes: Map<string, unknown> };
  /** `probe`, `teach` or `review`: which step of the loop asked. Default `probe`. */
  source?: string;
  /**
   * Whether the answer was a learning opportunity, which is what gets the BKT
   * transit step. Defaults to "anything but a probe": a probe measures, it
   * does not teach, so probing alone must not inflate mastery.
   */
  opportunity?: boolean;
  /** Spread a correct answer to the prerequisites. Default true. */
  propagate?: boolean;
  /** Put the concept on the review schedule. Default true. */
  schedule?: boolean;
  /** An SM-2 grade to schedule with, instead of the one `gradeFromOutcome` derives. */
  grade?: number;
  question?: string | null;
  /** The correct answer, as `--answer` has always meant: what the learner should have said. */
  answer?: string | null;
  /**
   * What the learner picked, when the caller knows it; null for "I don't
   * know". Left out of the event when undefined, which is what the CLI does:
   * its `--chosen` goes to the markdown log only.
   */
  chosen?: string | null;
  /** The session this answer belongs to; the row is created if nobody opened it. */
  session?: string | null;
  /** One clock for the event, the model's `lastSeen` and the card. */
  now?: Date;
  learnerId?: string;
  /**
   * The caller's name for this one answer, kept on the event. A second call
   * with the same id records nothing and answers with what the first one
   * wrote, so a retry after a lost response cannot count one answer twice in
   * a log nothing can delete from. The web app sends one per answer; the CLI
   * sends none.
   */
  requestId?: string;
}

export interface Propagation {
  concept: string;
  hops: number;
  /** Absent only on a replayed request: the event keeps the hops, not the numbers. */
  pLBefore?: number;
  pLAfter?: number;
}

export interface ObserveResult {
  concept: string;
  correct: boolean;
  pLBefore: number;
  pLAfter: number;
  /** `masteryLabel(pLAfter)`: mastered, solid, shaky, weak or gap. */
  mastery: string;
  mastered: boolean;
  /** The SM-2 grade the answer scheduled with, or would have. */
  grade: number;
  propagated: Propagation[];
  /** The card this answer wrote, or null when `schedule` was false. */
  card: ReviewCard | null;
  /** True when this answer created the concept's first card. False on a replay. */
  cardCreated: boolean;
  /** The concept's next review: the new card's, or the stored one's when nothing was scheduled. */
  due: string | null;
  /** True when `requestId` had already been recorded and nothing was written. */
  replayed: boolean;
}

/** The request ids the page makes: letters, digits, `-` and `_`. */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

type Params = typeof DEFAULT_PARAMS;

/**
 * Record one answer: an `observation` event, the mastery entry updated (and a
 * correct answer spread to the prerequisites), the review card scheduled, all
 * under the learner lock in one transaction.
 *
 * The lock is the reason this exists as one function. It is a
 * read-modify-write on `mastery`: without it two concurrent answers both read
 * the same prior and the second write silently discards the first, leaving
 * two events in the log and one of them absent from the projection until
 * somebody rebuilds.
 */
export async function recordObservation(
  db: CatalogDatabase,
  input: ObserveInput,
): Promise<ObserveResult> {
  const {
    conceptId: id,
    correct,
    graph,
    source = "probe",
    propagate = true,
    schedule = true,
    now = new Date(),
    learnerId = LOCAL_LEARNER_ID,
    requestId,
  } = input;
  const opportunity = input.opportunity ?? source !== "probe";
  if (requestId !== undefined && !REQUEST_ID.test(requestId)) {
    throw new StateError(`requestId must be 1 to 128 letters, digits, "-" or "_".`);
  }
  if (input.grade !== undefined && !(Number.isFinite(input.grade) && input.grade >= 0 && input.grade <= 5)) {
    throw new StateError(`grade must be between 0 and 5; got ${input.grade}.`);
  }
  // Every state table names the concept through a foreign key, so evidence
  // about a slug the catalog has never seen has nowhere to go. Checked first
  // so the message says what to do rather than naming a constraint.
  await assertKnownConcepts(db, [id]);

  // One clock for the whole write. The card's `now`, the model's `lastSeen`
  // and the event's `at` were three separate `new Date()` calls once, which
  // put them a few milliseconds apart and made a replay of the schedule
  // almost-but-not-quite reproduce the stored due dates.
  const at = now.toISOString();

  return withLearnerLock(db, learnerId, async (tx) => {
    // Inside the lock, so two copies of one request cannot both miss the
    // other: the second waits for the first to commit and then finds it.
    if (requestId !== undefined) {
      const seen = await replayOf(tx, learnerId, id, requestId);
      if (seen !== null) return seen;
    }

    const model = await readModel(tx, learnerId);
    const entry = ensureEntry(model, id);
    const priorPL = entry.pL;
    const nextPL = bktUpdate(priorPL, correct, {
      params: model.params as unknown as Params,
      opportunity,
    }) as number;

    entry.pL = nextPL;
    entry.observations += 1;
    if (correct) entry.correct += 1;
    entry.lastSeen = at;

    const spread = correct && propagate ? propagateCorrect(model, graph, id) : [];

    // Whether an answer teaches and whether it should come back for review
    // are different questions. A probe correctly skips the learning step, but
    // a concept you already knew must still be scheduled or it silently rots,
    // so every answered question earns a review slot, whatever the source.
    const reviews = await readReviews(tx, learnerId);
    const existing = reviews.cards[id];
    const grade = input.grade !== undefined ? input.grade : (gradeFromOutcome(correct, nextPL) as number);
    const card: ReviewCard | null = !schedule
      ? null
      : (sm2(existing ?? newCard(id, now), grade, { now }) as ReviewCard);

    // The event first, then the projections. `event` is the only copy;
    // `mastery` and `review` can be replayed from it, so a failure between
    // the two costs a `model --rebuild` rather than the observation itself.
    await appendEvent(
      tx,
      {
        at,
        type: "observation",
        concept: id,
        correct,
        propagated: spread.map((x) => ({ concept: x.concept, hops: x.hops })),
        source,
        opportunity,
        grade,
        // The reason the schedule is replayable: without it a rebuild cannot
        // tell an answer that scheduled a card from one recorded with
        // `--schedule false`.
        scheduled: schedule,
        pLBefore: priorPL,
        pLAfter: nextPL,
        question: input.question ?? null,
        answer: input.answer ?? null,
        chosen: input.chosen,
        session: input.session ?? null,
        // Undefined for the CLI, and `toRow` drops an undefined key, so a
        // terminal observation's payload is exactly what it always was.
        requestId,
      },
      learnerId,
    );

    await writeModel(tx, model, learnerId);
    if (card !== null) await upsertReview(tx, card, learnerId);

    return {
      concept: id,
      correct,
      pLBefore: priorPL,
      pLAfter: nextPL,
      mastery: masteryLabel(nextPL) as string,
      mastered: nextPL >= MASTERY_THRESHOLD,
      grade,
      propagated: spread,
      card,
      cardCreated: card !== null && existing === undefined,
      due: card?.due ?? existing?.due ?? null,
      replayed: false,
    };
  });
}

/** What the first write of `requestId` recorded, as a result, or null if nothing did. */
async function replayOf(
  tx: CatalogDatabase,
  learnerId: string,
  conceptId: string,
  requestId: string,
): Promise<ObserveResult | null> {
  const [row] = await tx
    .select()
    .from(event)
    .where(
      and(
        eq(event.learnerId, learnerId),
        eq(event.type, "observation"),
        eq(event.conceptSlug, conceptId),
        sql`${event.payload}->>'requestId' = ${requestId}`,
      ),
    )
    .limit(1);
  if (row === undefined) return null;

  const record = toRecord(row);
  const pLAfter = Number(record.pLAfter);
  const [card] = await readCards(tx, [conceptId], learnerId);
  const scheduled = record.scheduled !== false;
  return {
    concept: conceptId,
    correct: Boolean(record.correct),
    pLBefore: Number(record.pLBefore),
    pLAfter,
    mastery: masteryLabel(pLAfter) as string,
    mastered: pLAfter >= MASTERY_THRESHOLD,
    grade: Number(record.grade),
    propagated: Array.isArray(record.propagated)
      ? (record.propagated as { concept: string; hops: number }[]).map((p) => ({ concept: p.concept, hops: p.hops }))
      : [],
    // The card as it stands now, which is the schedule the caller should
    // believe; it is the one the first write produced unless something has
    // graded the concept since.
    card: scheduled ? (card ?? null) : null,
    cardCreated: false,
    due: card?.due ?? null,
    replayed: true,
  };
}

/* -------------------------------------------------------------------------- */
/* A tutor session opened and closed from a page                              */
/* -------------------------------------------------------------------------- */

export interface OpenSessionInput {
  id: string;
  title?: string | null;
  goal?: string | null;
  now?: Date;
  learnerId?: string;
}

/**
 * Open a tutor session: the `session` row and its `session-start` event,
 * together, exactly once.
 *
 * What `learn session start` does, minus the markdown log. The difference is
 * that this is idempotent: the row is inserted with `on conflict do nothing`
 * and the event is appended only when the insert happened, inside one
 * transaction, so a page that retries (or a second tab on the same id) cannot
 * put two `session-start` events in a log that cannot lose one. Reopening a
 * closed session is not a thing this does; the state machine has no way back
 * out of a terminal state.
 */
export async function openTutorSession(
  db: CatalogDatabase,
  input: OpenSessionInput,
): Promise<{ id: string; created: boolean }> {
  const id = input.id.trim();
  if (id === "") throw new StateError("a session needs an id");
  const { now = new Date(), learnerId = LOCAL_LEARNER_ID } = input;
  await ensureLearner(db, learnerId);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(sessionTable)
      .values({
        id,
        kind: "tutor",
        learnerId,
        state: "running",
        title: input.title ?? null,
        goal: input.goal ?? null,
        startedAt: now,
        metadata: {},
      })
      .onConflictDoNothing()
      .returning({ id: sessionTable.id, learnerId: sessionTable.learnerId });
    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ kind: sessionTable.kind, learnerId: sessionTable.learnerId, state: sessionTable.state })
        .from(sessionTable)
        .where(eq(sessionTable.id, id))
        .limit(1);
      // An id is one session. A studio job's id, or another learner's, is not
      // this learner's tutor session to write evidence into; and a closed one
      // has already said which concepts it touched, so an answer arriving
      // after it would contradict its own `session-close`.
      if (existing !== undefined && (existing.kind !== "tutor" || existing.learnerId !== learnerId)) {
        throw new StateError(`session "${id}" is not a tutor session of this learner.`);
      }
      if (existing !== undefined && existing.state !== "running") {
        throw new StateError(`session "${id}" is ${existing.state}; start a new one.`);
      }
      return { id, created: false };
    }
    await appendEvent(
      tx as CatalogDatabase,
      { at: now.toISOString(), type: "session-start", session: id, goal: input.goal ?? null },
      learnerId,
    );
    return { id, created: true };
  });
}

export interface CloseSessionResult {
  session: string;
  /** False when the session was already closed (or never opened): nothing was written. */
  closed: boolean;
  answered: number;
  correct: number;
  /** The concepts the session's observations named, in the order they were first answered. */
  concepts: string[];
}

/**
 * Close a tutor session: a `session-close` event naming the concepts it
 * touched, then the row moved to `closed`.
 *
 * `learn session close` without the file half (the markdown summary and the
 * backlinks it writes into each note, which a page must not do: layering rule
 * 3). Idempotent the other way round from the CLI's: the event is appended
 * only when the row was still running, so a replayed close writes nothing.
 */
export async function closeTutorSession(
  db: CatalogDatabase,
  id: string,
  options: { now?: Date; learnerId?: string } = {},
): Promise<CloseSessionResult> {
  const { now = new Date(), learnerId = LOCAL_LEARNER_ID } = options;
  return withLearnerLock(db, learnerId, async (tx) => {
    const rows = await tx
      .select()
      .from(event)
      .where(and(eq(event.learnerId, learnerId), eq(event.sessionId, id), eq(event.type, "observation")))
      .orderBy(asc(event.at), asc(event.id));
    const mine = rows.map(toRecord);
    const concepts = [...new Set(mine.map((e) => e.concept).filter((c): c is string => typeof c === "string"))];
    const summary = {
      session: id,
      answered: mine.length,
      correct: mine.filter((e) => e.correct === true).length,
      concepts,
    };

    const [row] = await tx
      .select({ state: sessionTable.state, kind: sessionTable.kind, learnerId: sessionTable.learnerId })
      .from(sessionTable)
      .where(eq(sessionTable.id, id))
      .limit(1);
    if (row === undefined || row.state !== "running" || row.kind !== "tutor" || row.learnerId !== learnerId) {
      return { ...summary, closed: false };
    }

    await appendEvent(tx, { at: now.toISOString(), type: "session-close", session: id, concepts }, learnerId);
    const { moved } = await endSession(tx, id, "closed");
    return { ...summary, closed: moved };
  });
}
