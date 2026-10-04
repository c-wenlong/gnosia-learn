import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
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
  ASSET_NAME_MAX,
  AVATARS,
  CUSTOM_PROVIDER_ID_SQL,
  CUSTOM_PROVIDER_LIMITS,
  DEFAULT_P_L,
  EVENT_TYPES,
  KNOWLEDGE_LIMITS,
  LOCAL_LEARNER_ID,
  PROVIDER_IDS,
  PROVIDER_KEY_LIMITS,
  RECAP_SOURCES,
  SCHEDULE_LIMITS,
  TUTOR_MODEL_LIMITS,
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

/** A `provider` column: a built-in provider, or a custom one's id (docs/TUTOR-MODELS.md, T14). */
const providerName = (column: string) =>
  sql.raw(`(${column} in (${PROVIDER_IDS.map((v) => `'${v}'`).join(", ")}) or ${column} ~ '${CUSTOM_PROVIDER_ID_SQL}')`);

/** One of `values` at random, each as likely as the next: `random()` is in [0, 1), so the index is 1 to n. */
const randomAvatar = () =>
  sql.raw(`(array[${AVATARS.map((v) => `'${v}'`).join(", ")}])[1 + floor(random() * ${AVATARS.length})::int]`);

const boundedList = (column: string) =>
  sql.raw(
    `jsonb_typeof(${column}) = 'array' and jsonb_array_length(${column}) <= ${KNOWLEDGE_LIMITS.listItems}`,
  );

/**
 * One row for now, id `local`. Kept as a real table rather than an implicit
 * global so every state row below can carry a foreign key, which is what makes
 * a second learner a data change instead of a migration.
 */
export const learner = pgTable(
  "learner",
  {
    id: text("id").primaryKey().default(LOCAL_LEARNER_ID),
    displayName: text("display_name"),
    /**
     * The learner's pixel sprite, one of `AVATARS`. Drawn at random by the
     * database when the row is made, so every way a learner row comes to
     * exist (`ensureLearner`, migration 0010's seed, an import, a test's
     * bare insert) gets one without the writer knowing about avatars, and
     * the migration that added the column gave each existing row its own
     * draw: Postgres evaluates a volatile default once per row.
     */
    avatar: text("avatar").notNull().default(randomAvatar()),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("learner_avatar_check", inList("avatar", AVATARS))],
);

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
      // Restrict, not cascade (D12): a course edit archives the item, and a
      // delete that took the learner's tick and note with it would be the loss SCHEMA.md
      // "Still open" recorded. Purging an item with learner rows is explicit.
      .references(() => curriculumItem.id, { onDelete: "restrict", onUpdate: "cascade" }),
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
      // Restrict, not cascade (D12): a course edit archives the item, and a
      // delete that took the learner's recap with it would be the loss SCHEMA.md
      // "Still open" recorded. Purging an item with learner rows is explicit.
      .references(() => curriculumItem.id, { onDelete: "restrict", onUpdate: "cascade" }),
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

/** `bytea`, which drizzle's pg-core has no builder for. The driver hands it back as a Buffer. */
const bytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * An owner's own model provider API key, encrypted (docs/BYOK.md).
 *
 * AES-256-GCM under a key derived from `AUTH_SECRET` with HKDF-SHA256, so a
 * dump of this table alone reads as noise. `key_version` names the
 * derivation, so a dedicated secret can come later without a migration; the
 * GCM additional data binds each row to its owner, provider and version, so a
 * ciphertext moved to another owner's row fails to decrypt rather than
 * spending their quota.
 *
 * `last4` is the only part of the key stored in the clear, for Settings to
 * show which key is saved. No `owner_id` default, unlike the content tables:
 * a secret is never filed under `local` by omission. `cascade` on delete,
 * unlike them too: deleting an owner must take their keys with them.
 *
 * Read and written only by `services/catalog/src/state/provider-keys.ts`, and
 * `services/catalog/test/provider-keys.test.ts` fails a reference anywhere
 * else, which is what keeps it out of every export.
 */
export const providerKey = pgTable(
  "provider_key",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: bytes("ciphertext").notNull(),
    iv: bytes("iv").notNull(),
    authTag: bytes("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    last4: text("last4").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.provider] }),
    check("provider_key_provider_check", providerName("provider")),
    // GCM's 96-bit nonce and 128-bit tag, the only sizes the code writes.
    check("provider_key_iv_check", sql`octet_length(iv) = 12`),
    check("provider_key_auth_tag_check", sql`octet_length(auth_tag) = 16`),
    // GCM adds no padding, so the ciphertext is as long as the key's UTF-8 bytes.
    check(
      "provider_key_ciphertext_check",
      sql.raw(`octet_length(ciphertext) between 1 and ${PROVIDER_KEY_LIMITS.maxChars * 4}`),
    ),
    check("provider_key_key_version_check", sql`key_version >= 1`),
    check("provider_key_last4_check", sql`char_length(last4) = 4`),
  ],
);

/**
 * The tutor's model chain (docs/TUTOR-MODELS.md): an owner's ordered list of
 * provider and model pairs, tried top to bottom on every tutor turn until one
 * answers. An owner with no rows gets the built-in defaults, in the
 * provider order, exactly as before the chain existed.
 *
 * No secret here: a provider name and a model id. The key each entry calls
 * with is resolved per request from `provider_key` or the environment.
 *
 * `position` is 0 to n-1 with no gaps, which the unique index and the range
 * CHECK hold together with the one writer,
 * `services/catalog/src/state/tutor-models.ts`, that rewrites an owner's rows
 * as a whole under the learner lock. No `owner_id` default and `cascade` on
 * delete, as `provider_key`: owner configuration is never filed under `local`
 * by omission, and goes with its owner.
 */
export const tutorModel = pgTable(
  "tutor_model",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    position: integer("position").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.provider, t.model] }),
    uniqueIndex("tutor_model_owner_position_idx").on(t.ownerId, t.position),
    check("tutor_model_provider_check", providerName("provider")),
    check(
      "tutor_model_position_check",
      sql.raw(`position between 0 and ${TUTOR_MODEL_LIMITS.maxEntries - 1}`),
    ),
    // Printable ASCII with no space, as `checkModelId` says: `!` to `~`.
    check(
      "tutor_model_model_check",
      sql.raw(`char_length(model) between 1 and ${TUTOR_MODEL_LIMITS.maxModelChars} and model ~ '^[!-~]+$'`),
    ),
  ],
);

/**
 * The providers an owner added themselves (docs/TUTOR-MODELS.md, T14): any
 * OpenAI-compatible endpoint, by a name and a base URL. `id` is
 * `custom-<slug>` and is what `provider_key.provider` and
 * `tutor_model.provider` hold for it, so its key and its models are rows
 * there like a built-in's. No secret here: the key is in `provider_key`.
 *
 * No `owner_id` default and `cascade` on delete, as `provider_key`. Written
 * only by `services/catalog/src/state/custom-providers.ts`, and a provider's
 * Delete removes this row, its key and its models in one transaction
 * (`deleteTutorProvider`).
 */
export const customProvider = pgTable(
  "custom_provider",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    id: text("id").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.id] }),
    check("custom_provider_id_check", sql.raw(`id ~ '${CUSTOM_PROVIDER_ID_SQL}'`)),
    check("custom_provider_label_check", sql.raw(`char_length(label) between 1 and ${CUSTOM_PROVIDER_LIMITS.maxLabelChars}`)),
    check(
      "custom_provider_base_url_check",
      sql.raw(
        `char_length(base_url) between 1 and ${CUSTOM_PROVIDER_LIMITS.maxBaseUrlChars} and (base_url ~ '^https://' or base_url ~ '^http://(localhost|127[.]0[.]0[.]1|\\[::1\\])(:[0-9]+)?(/|$)')`,
      ),
    ),
  ],
);

/**
 * A learner's own name for an asset: a video, a diagram, a link, anything in
 * the library. Read in place of `asset.title` wherever that learner sees the
 * asset (`services/catalog/src/state/assets.ts`), and written only by
 * `services/catalog/src/state/asset-names.ts`.
 *
 * **State, not content.** `asset.title` belongs to the asset's source: the
 * video tool's `topic.yml`, the course file, the `.tldr`. Every import writes
 * the whole row again (`updateSet` in `content/upsert.ts`), so a title edited
 * in place would be undone by the next `catalog import`. A row here is never
 * touched by an import, and it is the learner's, like a bookmark's label, so
 * the web app may write it (ARCHITECTURE.md rule 11) and one learner's name
 * for a commons video is nobody else's.
 *
 * **No foreign key on `asset_id`**, as `content_revision.entity_id` has none:
 * an import that prunes an asset and later writes it back under the same id
 * (a reindex from a worktree without the renders, then the fix) keeps the
 * name. An orphan row is read by nothing, since every reader starts from an
 * `asset` row. The writer checks the asset exists and is readable before it
 * names it. `cascade` on the learner, as `tutor_model`.
 */
export const assetName = pgTable(
  "asset_name",
  {
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade", onUpdate: "cascade" }),
    assetId: text("asset_id").notNull(),
    title: text("title").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.assetId] }),
    index("asset_name_asset_id_idx").on(t.assetId),
    // Stored cleaned (`cleanAssetName`): never blank, never padded, no line breaks.
    check(
      "asset_name_title_check",
      sql.raw(`char_length(title) between 1 and ${ASSET_NAME_MAX} and title = btrim(title) and title !~ '\\s{2}|[\\n\\r\\t]'`),
    ),
  ],
);
