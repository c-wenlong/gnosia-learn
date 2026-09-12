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

/**
 * The state half. Unlike the content half these rows are the only copy of the
 * data, with one exception: `mastery` and `review` are derived and can be
 * rebuilt by replaying `event` from the beginning. Bundle 5 backfills all of
 * this from `learn/state/*.json` and the browser's localStorage, so the column
 * names below deliberately mirror `src/lib/types.ts`, the `KNOWLEDGE_LIMITS` in
 * `src/lib/storage.ts` and the constants in `scripts/learn/lib/`.
 */

/** Event types the `learn` CLI writes today (scripts/learn/cli.mjs). */
export const EVENT_TYPES = [
  "session-start",
  "observation",
  "review",
  "session-close",
  "void",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Where a recap came from. Mirrors `KnowledgeSource` in src/lib/types.ts. */
export const RECAP_SOURCES = ["agent", "manual"] as const;
export type RecapSource = (typeof RECAP_SOURCES)[number];

/**
 * Limits copied from `KNOWLEDGE_LIMITS` in src/lib/storage.ts so the database
 * refuses what the web app already clamps. `itemChars` has no CHECK: a
 * per-element length test needs `jsonb_array_elements_text`, which is a
 * subquery, and CHECK constraints cannot contain one. That clamp stays in
 * application code, as it is today.
 */
export const KNOWLEDGE_LIMITS = {
  summaryChars: 1200,
  listItems: 8,
  itemChars: 300,
} as const;

/** Scheduler bounds, copied from scripts/learn/lib/schedule.mjs. */
export const SCHEDULE_LIMITS = {
  minEase: 1.3,
  defaultEase: 2.5,
  maxIntervalDays: 36500,
} as const;

/** BKT prior, copied from scripts/learn/lib/bkt.mjs (`DEFAULT_PARAMS.pL0`). */
export const DEFAULT_P_L = 0.25;

/** The default single learner. One row until auth exists; `id` is not a UUID so it stays readable. */
export const LOCAL_LEARNER_ID = "local";

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
    conceptSlug: text("concept_slug").references(() => concept.slug, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** The `learn` CLI's session id, e.g. `2026-08-20-transformer-block`. Free text, no table yet. */
    sessionId: text("session_id"),
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
 * `LearnerState.notes` from src/lib/types.ts, which are two maps keyed by the
 * same curriculum item id and so are one table here. `completedAt` is nullable
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
 * `TopicKnowledge` in src/lib/types.ts, down to the `sessions` counter.
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
