import {
  clampKnowledgeList,
  clampSummary,
  LOCAL_LEARNER_ID,
  recap,
  RECAP_SOURCES,
  type KnowledgeInput,
  type KnowledgeSource,
  type TopicKnowledge,
} from "@gnosia/schema";
import { and, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { ensureLearner } from "./learner";
import { assertReadableItems, type WriteOptions } from "./progress";

/**
 * The durable "what I learnt" record, one row per curriculum item.
 *
 * Clamped here, not just at the edge. `KNOWLEDGE_LIMITS` is enforced twice on
 * purpose: as CHECK constraints, so nothing can put an unbounded summary in the
 * column whatever wrote it, and as `clampSummary`/`clampKnowledgeList` on the
 * way in, so a long recap is trimmed and saved rather than refused with a
 * 23514 the learner reads as "save failed". Both come from the same constants
 * in `@gnosia/schema/shared`, so they cannot disagree.
 */

function asSource(value: unknown): KnowledgeSource {
  return (RECAP_SOURCES as readonly string[]).includes(String(value))
    ? (value as KnowledgeSource)
    : "agent";
}

function toKnowledge(row: typeof recap.$inferSelect): TopicKnowledge {
  return {
    topicId: row.curriculumItemId,
    summary: row.summary,
    keyPoints: clampKnowledgeList(row.keyPoints),
    misconceptions: clampKnowledgeList(row.misconceptions),
    openQuestions: clampKnowledgeList(row.openQuestions),
    source: asSource(row.source),
    updatedAt: row.updatedAt.toISOString(),
    sessions: row.sessions,
  };
}

/** The request ids the page makes: letters, digits, `-` and `_`, as `recordObservation` takes them. */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function readRecaps(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<TopicKnowledge[]> {
  const rows = await db.select().from(recap).where(eq(recap.learnerId, learnerId));
  return rows.map(toKnowledge);
}

/** True when an input carries nothing worth keeping. */
export function isEmptyRecap(input: KnowledgeInput): boolean {
  return (
    clampSummary(input.summary) === "" &&
    clampKnowledgeList(input.keyPoints).length === 0 &&
    clampKnowledgeList(input.misconceptions).length === 0 &&
    clampKnowledgeList(input.openQuestions).length === 0
  );
}

/**
 * Write or replace one recap, clamped. An entirely empty input clears the
 * record, mirroring `setNote` and the reducer this replaces.
 *
 * `countSession: false` folds an edit into the existing record without
 * claiming another session happened — the "Edit" button in `TopicRecap` uses
 * it, and without it correcting a typo would inflate the session count the
 * card prints.
 *
 * `sessions` is a floor rather than an assignment, and exists for the
 * localStorage import: a recap carried over from the browser already knows how
 * many sessions went into it, and starting it back at 1 would quietly discard
 * that. A floor is the right shape because the row may already exist with a
 * higher count, and the import must never move a counter backwards.
 *
 * `requestId` is the caller's name for this one write. When it matches the id
 * the row was last stored under, the write is a copy of that one sent again
 * after its answer was lost, so it stores the same content and counts no
 * session. Only the last id is kept: the page sends one item's writes in
 * order and drops a kept write once a newer one is made, so a retry always
 * follows the write it repeats. Two tabs can still interleave, as their
 * writes always could. The web app sends one per recap; the import and the
 * CLI send none.
 */
export async function upsertRecap(
  db: CatalogDatabase,
  curriculumItemId: string,
  input: KnowledgeInput,
  options: { learnerId?: string; countSession?: boolean; sessions?: number; requestId?: string } & WriteOptions = {},
): Promise<TopicKnowledge | null> {
  const { learnerId = LOCAL_LEARNER_ID, countSession = true, sessions: floor, requestId } = options;
  if (requestId !== undefined && !REQUEST_ID.test(requestId)) {
    throw new StateError(`requestId must be 1 to 128 letters, digits, "-" or "_".`);
  }
  await assertReadableItems(db, [curriculumItemId], learnerId, options);

  if (isEmptyRecap(input)) {
    await clearRecap(db, curriculumItemId, learnerId);
    return null;
  }

  await ensureLearner(db, learnerId);
  const increment = countSession ? 1 : 0;
  const rows = await db
    .insert(recap)
    .values({
      learnerId,
      curriculumItemId,
      summary: clampSummary(input.summary),
      keyPoints: clampKnowledgeList(input.keyPoints),
      misconceptions: clampKnowledgeList(input.misconceptions),
      openQuestions: clampKnowledgeList(input.openQuestions),
      source: asSource(input.source),
      // A brand-new record counts as one session even when the caller said not
      // to count this one, because "0 sessions" would print as a recap nobody
      // ever wrote. `greatest(..., 1)` on update keeps that floor.
      sessions: Math.max(increment, floor ?? 0, 1),
      requestId: requestId ?? null,
    })
    .onConflictDoUpdate({
      target: [recap.learnerId, recap.curriculumItemId],
      set: {
        summary: sql`excluded.summary`,
        keyPoints: sql`excluded.key_points`,
        misconceptions: sql`excluded.misconceptions`,
        openQuestions: sql`excluded.open_questions`,
        source: sql`excluded.source`,
        // A repeat of the write that last stored the row counts nothing.
        sessions: sql`max(${recap.sessions} + (case when excluded.request_id = ${recap.requestId} then 0 else ${increment} end), ${floor ?? 0}, 1)`,
        requestId: sql`excluded.request_id`,
        updatedAt: sql`cast(unixepoch('subsec') * 1000 as integer)`,
      },
    })
    .returning();

  const row = rows[0];
  return row === undefined ? null : toKnowledge(row);
}

export async function clearRecap(
  db: CatalogDatabase,
  curriculumItemId: string,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
  await db
    .delete(recap)
    .where(
      and(eq(recap.learnerId, learnerId), eq(recap.curriculumItemId, curriculumItemId)),
    );
}
