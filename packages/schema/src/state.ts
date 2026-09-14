import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

import { createdAt, instant, updatedAt } from "./columns";
import { concept, curriculumItem } from "./content";
// `state` and `studio` reference each other: `event.session_id` points at
// `session`, and `session.learner_id` points back at `learner`. Both are
// declared inside `() => …` callbacks, which drizzle only calls once every
// module has finished evaluating, so the cycle never dereferences a binding
// that is still in its temporal dead zone.
import { session } from "./studio";
import {
  DEFAULT_P_L,
  EVENT_TYPES,
  KNOWLEDGE_LIMITS,
  LOCAL_LEARNER_ID,
  RECAP_SOURCES,
  SCHEDULE_LIMITS,
} from "./shared";

/**
 * The state half. Unlike the content half these rows are the only copy of the
 * data, with one exception: `mastery` and `review` are derived and can be
 * rebuilt by replaying `event` from the beginning. Bundle 5 backfills all of
 * this from `learn/state/*.json` and the browser's localStorage, so the column
 * names below deliberately mirror `apps/web/src/lib/types.ts`, the
 * `KNOWLEDGE_LIMITS` in `apps/web/src/lib/storage.ts` and the constants in
 * `scripts/learn/lib/`.
 */

/*
 * The vocabularies and the numeric bounds live in `./shared`, which imports
 * nothing, and reach consumers through `./index`'s `export * from "./shared"`.
 * They are not re-exported here as well: two `export *` paths to the same name
 * make it ambiguous, and ESM resolves an ambiguous star-export by dropping the
 * name entirely rather than by erroring. The web app takes them from the
 * `@self-learn/schema/shared` subpath instead, which is drizzle-free and
 * therefore safe in a client component.
 */

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);

const boundedList = (column: string) =>
  sql.raw(
    `jsonb_typeof(${column}) = 'array' and jsonb_array_length(${column}) <= ${KNOWLEDGE_LIMITS.listItems}`,
  );

/**
 * One row for now, id `local`. Kept as a real table rather than an implicit
 * global so every state row below can carry a foreign key, which is what makes
 * a second learner a data change instead of a migration.
 */
export const learner = pgTable("learner", {
  id: text("id").primaryKey().default(LOCAL_LEARNER_ID),
  displayName: text("display_name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Append-only. Every other state table is a projection of this one, so an
 * UPDATE here would rewrite history and leave the projections unexplainable.
 *
 * The ban is enforced by a BEFORE UPDATE OR DELETE trigger, added in the same
 * migration that creates the table (see services/catalog/drizzle/). A revoked
 * privilege was the alternative and is weaker: REVOKE does not bind the table
 * owner or a superuser, which is exactly who runs the migrations and the CLI
 * locally, so it would look enforced and not be. A trigger binds everyone
 * short of `ALTER TABLE ... DISABLE TRIGGER`, and survives pg_dump/pg_restore
 * with the schema.
 *
 * No `updated_at`: a column that can never change would only invite an UPDATE.
 */
export const event = pgTable(
  "event",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    /** When it happened, from the emitter. Not the same as `created_at`, which is when it landed. */
    at: instant("at").notNull().default(sql`now()`),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "restrict", onUpdate: "cascade" }),
    type: text("type").notNull(),
    /**
     * `restrict`, not `set null`. Forgetting what an event was about is exactly
     * what an append-only log exists to prevent, and `set null` made that
     * forgetting automatic: deleting a concept fired an UPDATE on `event`,
     * which the append-only trigger then refused, so the real behaviour was
     * "no concept with events can ever be pruned" delivered as a
     * `restrict_violation` about a trigger nobody was thinking about. This says
     * the same thing directly, with the foreign key's own name in the error,
     * and `pruneEntity` in the indexer turns it into a sentence naming the
     * slugs. `mastery` and `review` still cascade, because they are projections
     * this log can rebuild.
     */
    conceptSlug: text("concept_slug").references(() => concept.slug, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /**
     * The session this happened inside, e.g. `2026-08-20-transformer-block`.
     *
     * A foreign key since migration `0006`, and `restrict` for the same reason
     * `concept_slug` is: forgetting what an event was about is what an
     * append-only log exists to prevent, and `set null` is not even available
     * here — the referential UPDATE it fires is exactly what the per-row
     * trigger from `0003` refuses.
     *
     * It was free text until then because `learn session start` wrote the event
     * before there was anything to point at. There is now: the same command
     * writes a `session` row beside the event, so the referent exists at write
     * time.
     */
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /** Everything type-specific: grade, correct, pLBefore/pLAfter, question, reason, propagated. */
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    check("event_type_check", inList("type", EVENT_TYPES)),
    check("event_payload_object_check", sql`jsonb_typeof(payload) = 'object'`),
    index("event_at_idx").on(t.at),
    index("event_learner_id_idx").on(t.learnerId),
    index("event_concept_slug_idx").on(t.conceptSlug),
    index("event_session_id_idx").on(t.sessionId),
  ],
);

/**
 * Bayesian Knowledge Tracing state per concept. Derived: replaying `event`
 * rebuilds it exactly, which is why a wrong row is a bug to recompute rather
 * than data to recover.
 */
export const mastery = pgTable(
  "mastery",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    conceptSlug: text("concept_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    pL: doublePrecision("p_l").notNull().default(DEFAULT_P_L),
    observations: integer("observations").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    lastSeen: instant("last_seen"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.conceptSlug] }),
    check("mastery_p_l_check", sql`p_l >= 0 and p_l <= 1`),
    check(
      "mastery_counts_check",
      sql`observations >= 0 and correct >= 0 and correct <= observations`,
    ),
    index("mastery_concept_slug_idx").on(t.conceptSlug),
  ],
);

/**
 * SM-2 card per concept, mirroring `learn/state/reviews.json`. `history` is not
 * a column: every grade is already an `event` of type `review`, and duplicating
 * it here would create a second version of the truth.
 */
export const review = pgTable(
  "review",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    conceptSlug: text("concept_slug")
      .notNull()
      .references(() => concept.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    repetitions: integer("repetitions").notNull().default(0),
    ease: doublePrecision("ease").notNull().default(SCHEDULE_LIMITS.defaultEase),
    intervalDays: integer("interval_days").notNull().default(1),
    lapses: integer("lapses").notNull().default(0),
    due: instant("due").notNull(),
    lastReviewed: instant("last_reviewed"),
    leech: boolean("leech").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.conceptSlug] }),
    check("review_ease_check", sql.raw(`ease >= ${SCHEDULE_LIMITS.minEase}`)),
    check(
      "review_interval_days_check",
      sql.raw(`interval_days >= 1 and interval_days <= ${SCHEDULE_LIMITS.maxIntervalDays}`),
    ),
    check("review_counts_check", sql`repetitions >= 0 and lapses >= 0`),
    index("review_due_idx").on(t.due),
    index("review_concept_slug_idx").on(t.conceptSlug),
  ],
);

/**
 * A ticked checklist row. Mirrors `LearnerState.completed` and
 * `LearnerState.notes` from `apps/web/src/lib/types.ts`, which are two maps
 * keyed by the same curriculum item id and so are one table here. `completedAt` is nullable
 * because a note without a tick is a real state the web app already allows.
 */
export const progress = pgTable(
  "progress",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    curriculumItemId: text("curriculum_item_id")
      .notNull()
      .references(() => curriculumItem.id, { onDelete: "cascade", onUpdate: "cascade" }),
    completedAt: instant("completed_at"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.curriculumItemId] }),
    index("progress_curriculum_item_id_idx").on(t.curriculumItemId),
  ],
);

/**
 * The durable "remind me what I learnt" record. One-for-one with
 * `TopicKnowledge` in `apps/web/src/lib/types.ts`, down to the `sessions`
 * counter.
 */
export const recap = pgTable(
  "recap",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    curriculumItemId: text("curriculum_item_id")
      .notNull()
      .references(() => curriculumItem.id, { onDelete: "cascade", onUpdate: "cascade" }),
    summary: text("summary").notNull().default(""),
    keyPoints: jsonb("key_points").notNull().default(sql`'[]'::jsonb`),
    misconceptions: jsonb("misconceptions").notNull().default(sql`'[]'::jsonb`),
    openQuestions: jsonb("open_questions").notNull().default(sql`'[]'::jsonb`),
    source: text("source").notNull(),
    /** How many agent sessions have been folded in. */
    sessions: integer("sessions").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.curriculumItemId] }),
    check("recap_source_check", inList("source", RECAP_SOURCES)),
    check(
      "recap_summary_length_check",
      sql.raw(`char_length(summary) <= ${KNOWLEDGE_LIMITS.summaryChars}`),
    ),
    check("recap_key_points_check", boundedList("key_points")),
    check("recap_misconceptions_check", boundedList("misconceptions")),
    check("recap_open_questions_check", boundedList("open_questions")),
    check("recap_sessions_check", sql`sessions >= 0`),
    index("recap_curriculum_item_id_idx").on(t.curriculumItemId),
  ],
);

/**
 * Everything else the learner state carries and nothing joins on: `theme`,
 * `epoch`, `lastVisited`. A key/value table rather than columns, because these
 * change with the UI and a migration per preference is not worth it.
 */
export const preference = pgTable(
  "preference",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.key] })],
);
