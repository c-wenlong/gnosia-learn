-- The expand migration of docs/CONTENT-MIGRATION.md phase 0 (section 0.2).
--
-- Every table and column the five phase 1 tracks need lands here at once (D10),
-- so no track generates a migration of its own and collides in drizzle's
-- journal. Nothing here changes what any reader sees: the new columns are
-- nullable or defaulted, the new tables start empty, and every trigger that
-- would refuse a write the code makes today is created disabled.
--
-- drizzle-kit's own output is everything between the two hand-written blocks,
-- unedited. The hand-written statements are the ones drizzle cannot express,
-- the same way the triggers of 0001 and 0003 and the backfill of 0006 were:
--
--   before it: `CREATE EXTENSION pg_trgm`, which the trigram indexes need, and
--   the `local` learner row, which every `owner_id` foreign key needs;
--
--   after it: the `catalog_instance` seed, and the trigger functions and
--   triggers (append-only, the write-seam guard, the completeness rules and the
--   copy guard). services/catalog/SCHEMA.md "Triggers" lists every one.

-- `pg_trgm` is a trusted extension since Postgres 13, so the database owner can
-- create it without superuser. Near-duplicate topic detection is its only use
-- (D14).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Before any `owner_id` column. The row is otherwise created on the first state
-- write (`ensureLearner` in services/catalog/src/state/learner.ts), so a
-- database that has been indexed but never studied has no `local` row, and the
-- foreign key below would fail on the first existing content row. `ON CONFLICT
-- DO NOTHING` because a studied database already has it.
INSERT INTO "learner" ("id") VALUES ('local') ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE "blob_object" (
	"key" text PRIMARY KEY NOT NULL,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"sha256" text NOT NULL,
	"bytes" bigint NOT NULL,
	"mime" text NOT NULL,
	"provider" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "blob_object_sha256_check" CHECK (sha256 ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "blob_object_key_check" CHECK (key ~ '^[^/]+/[0-9a-f]{64}([.][a-z0-9]+)?$' and starts_with(key, owner_id || '/' || sha256)),
	CONSTRAINT "blob_object_bytes_check" CHECK (bytes >= 0),
	CONSTRAINT "blob_object_provider_check" CHECK (provider in ('fs', 'vercel-blob', 'r2')),
	CONSTRAINT "blob_object_state_check" CHECK (state in ('pending', 'present')),
	CONSTRAINT "blob_object_confirmed_check" CHECK (state <> 'present' or confirmed_at is not null)
);
--> statement-breakpoint
CREATE TABLE "collection_tag" (
	"collection_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_tag_collection_id_tag_id_pk" PRIMARY KEY("collection_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "diagram" (
	"slug" text PRIMARY KEY NOT NULL,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"title" text,
	"topic_slug" text NOT NULL,
	"document" jsonb NOT NULL,
	"document_hash" text NOT NULL,
	"svg_blob_key" text,
	"svg_document_hash" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagram_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "diagram_document_object_check" CHECK (jsonb_typeof(document) = 'object'),
	CONSTRAINT "diagram_svg_pair_check" CHECK ((svg_blob_key is null) = (svg_document_hash is null))
);
--> statement-breakpoint
CREATE TABLE "manimkc_topic" (
	"path" text PRIMARY KEY NOT NULL,
	"topic_slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_log_entry" (
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_log_entry_session_id_seq_pk" PRIMARY KEY("session_id","seq"),
	CONSTRAINT "session_log_entry_seq_check" CHECK (seq >= 1)
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_id_check" CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "topic_relation" (
	"from_slug" text NOT NULL,
	"to_slug" text NOT NULL,
	"kind" text NOT NULL,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_relation_from_slug_to_slug_kind_pk" PRIMARY KEY("from_slug","to_slug","kind"),
	CONSTRAINT "topic_relation_kind_check" CHECK (kind in ('broader', 'related', 'precedes')),
	CONSTRAINT "topic_relation_no_self_check" CHECK (from_slug <> to_slug),
	CONSTRAINT "topic_relation_related_order_check" CHECK (kind <> 'related' or from_slug collate "C" < to_slug collate "C")
);
--> statement-breakpoint
CREATE TABLE "catalog_instance" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"primary_host" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_instance_single_row_check" CHECK (id),
	CONSTRAINT "catalog_instance_role_check" CHECK (role in ('primary', 'copy')),
	CONSTRAINT "catalog_instance_copy_check" CHECK (role <> 'copy' or primary_host is not null)
);
--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "content_revision_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"owner_id" text DEFAULT 'local' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"seq" integer NOT NULL,
	"previous_id" bigint,
	"op" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"author_kind" text NOT NULL,
	"author" text NOT NULL,
	"reason" text NOT NULL,
	"job_id" text,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revision_entity_type_check" CHECK (entity_type in ('topic', 'tag', 'collection', 'curriculum_item', 'concept', 'diagram', 'asset')),
	CONSTRAINT "content_revision_op_check" CHECK (op in ('create', 'update', 'archive', 'restore', 'rename', 'import')),
	CONSTRAINT "content_revision_author_kind_check" CHECK (author_kind in ('person', 'agent', 'import')),
	CONSTRAINT "content_revision_seq_check" CHECK (seq >= 1),
	CONSTRAINT "content_revision_previous_check" CHECK (seq = 1 or previous_id is not null),
	CONSTRAINT "content_revision_not_own_previous_check" CHECK (previous_id is distinct from id),
	CONSTRAINT "content_revision_snapshot_object_check" CHECK (jsonb_typeof(snapshot) = 'object'),
	CONSTRAINT "content_revision_snapshot_hash_check" CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_revision_author_check" CHECK (btrim(author) <> ''),
	CONSTRAINT "content_revision_reason_check" CHECK (btrim(reason) <> '')
);
--> statement-breakpoint
CREATE TABLE "content_source" (
	"type" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'files' NOT NULL,
	"flipped_at" timestamp with time zone,
	"parity_report" jsonb,
	"export_hash" text,
	"exported_at" timestamp with time zone,
	"waivers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_source_type_check" CHECK (type in ('topics', 'tags', 'courses', 'concepts', 'sessions', 'diagrams', 'manimkc')),
	CONSTRAINT "content_source_source_check" CHECK (source in ('files', 'db')),
	CONSTRAINT "content_source_flipped_check" CHECK (source <> 'db' or flipped_at is not null),
	CONSTRAINT "content_source_parity_report_check" CHECK (parity_report is null or jsonb_typeof(parity_report) = 'object'),
	CONSTRAINT "content_source_waivers_check" CHECK (jsonb_typeof(waivers) = 'array')
);
--> statement-breakpoint
ALTER TABLE "collection" DROP CONSTRAINT "collection_parent_slug_key";--> statement-breakpoint
ALTER TABLE "asset" DROP CONSTRAINT "asset_kind_check";--> statement-breakpoint
ALTER TABLE "asset" DROP CONSTRAINT "asset_location_check";--> statement-breakpoint
ALTER TABLE "curriculum_item" DROP CONSTRAINT "curriculum_item_collection_id_collection_id_fk";
--> statement-breakpoint
ALTER TABLE "progress" DROP CONSTRAINT "progress_curriculum_item_id_curriculum_item_id_fk";
--> statement-breakpoint
ALTER TABLE "recap" DROP CONSTRAINT "recap_curriculum_item_id_curriculum_item_id_fk";
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "blob_key" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "resource_type" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "authored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept_prerequisite" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "asset_job" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "owner_id" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "blob_object" ADD CONSTRAINT "blob_object_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection_tag" ADD CONSTRAINT "collection_tag_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection_tag" ADD CONSTRAINT "collection_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "diagram" ADD CONSTRAINT "diagram_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "diagram" ADD CONSTRAINT "diagram_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "diagram" ADD CONSTRAINT "diagram_svg_blob_key_blob_object_key_fk" FOREIGN KEY ("svg_blob_key") REFERENCES "public"."blob_object"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "manimkc_topic" ADD CONSTRAINT "manimkc_topic_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "manimkc_topic" ADD CONSTRAINT "manimkc_topic_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session_log_entry" ADD CONSTRAINT "session_log_entry_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "topic_relation" ADD CONSTRAINT "topic_relation_from_slug_topic_slug_fk" FOREIGN KEY ("from_slug") REFERENCES "public"."topic"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "topic_relation" ADD CONSTRAINT "topic_relation_to_slug_topic_slug_fk" FOREIGN KEY ("to_slug") REFERENCES "public"."topic"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "topic_relation" ADD CONSTRAINT "topic_relation_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_previous_id_content_revision_id_fk" FOREIGN KEY ("previous_id") REFERENCES "public"."content_revision"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "blob_object_owner_id_idx" ON "blob_object" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "collection_tag_tag_id_idx" ON "collection_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "diagram_owner_id_idx" ON "diagram" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "diagram_topic_slug_idx" ON "diagram" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "diagram_svg_blob_key_idx" ON "diagram" USING btree ("svg_blob_key");--> statement-breakpoint
CREATE INDEX "manimkc_topic_topic_slug_idx" ON "manimkc_topic" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "manimkc_topic_owner_id_idx" ON "manimkc_topic" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "tag_owner_id_idx" ON "tag" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "topic_relation_to_slug_idx" ON "topic_relation" USING btree ("to_slug");--> statement-breakpoint
CREATE INDEX "topic_relation_owner_id_idx" ON "topic_relation" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revision_entity_seq_key" ON "content_revision" USING btree ("entity_type","entity_id","seq");--> statement-breakpoint
CREATE INDEX "content_revision_owner_id_idx" ON "content_revision" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "content_revision_previous_id_idx" ON "content_revision" USING btree ("previous_id");--> statement-breakpoint
CREATE INDEX "content_revision_job_id_idx" ON "content_revision" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "content_revision_session_id_idx" ON "content_revision" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "content_revision_created_at_idx" ON "content_revision" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_blob_key_blob_object_key_fk" FOREIGN KEY ("blob_key") REFERENCES "public"."blob_object"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD CONSTRAINT "curriculum_item_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD CONSTRAINT "curriculum_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "recap" ADD CONSTRAINT "recap_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_job" ADD CONSTRAINT "asset_job_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_blob_key_idx" ON "asset" USING btree ("blob_key");--> statement-breakpoint
CREATE INDEX "asset_owner_id_idx" ON "asset" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "collection_owner_id_idx" ON "collection" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_parent_slug_key" ON "collection" USING btree (coalesce("parent_id", ''),"slug") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "concept_owner_id_idx" ON "concept" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "curriculum_item_owner_id_idx" ON "curriculum_item" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "topic_owner_id_idx" ON "topic" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "topic_title_trgm_idx" ON "topic" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "topic_aliases_trgm_idx" ON "topic" USING gin (("aliases"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "asset_job_owner_id_idx" ON "asset_job" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "job_owner_id_idx" ON "job" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_resource_type_check" CHECK (resource_type is null or (kind = 'link' and resource_type in ('paper', 'docs', 'video', 'book', 'other')));--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_kind_check" CHECK (kind in ('video', 'transcript', 'chapters', 'captions', 'diagram_source', 'diagram_svg', 'note', 'session', 'link', 'poster'));--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_location_check" CHECK ((url is null) = (path is not null or blob_key is not null));--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_id_check" CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_tags_array_check" CHECK (jsonb_typeof(tags) = 'array');--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_sources_array_check" CHECK (jsonb_typeof(sources) = 'array');--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD CONSTRAINT "curriculum_item_id_check" CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_aliases_array_check" CHECK (jsonb_typeof(aliases) = 'array');--> statement-breakpoint
-- This database is the primary (D2): the local database stays primary until the
-- deferred cloud move of 0.1, which marks it `copy`. A database copied from this
-- one with `createdb -T` inherits the row.
INSERT INTO "catalog_instance" ("id", "role") VALUES (true, 'primary') ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Append-only, for the revision history and the session log entries.
--
-- The same guard `event` has had since 0001, and per row for the reason 0003
-- gives: a statement trigger fires on a referential action that touches no row
-- at all. One function for both tables, naming the table it fired on, with the
-- hint passed as the trigger's argument.
CREATE FUNCTION catalog_append_only() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
		USING ERRCODE = 'restrict_violation', HINT = TG_ARGV[0];
END;
$$;
--> statement-breakpoint
CREATE TRIGGER content_revision_no_update
	BEFORE UPDATE ON "content_revision"
	FOR EACH ROW EXECUTE FUNCTION catalog_append_only('A revision is history. Write a new revision instead.');
--> statement-breakpoint
CREATE TRIGGER content_revision_no_delete
	BEFORE DELETE ON "content_revision"
	FOR EACH ROW EXECUTE FUNCTION catalog_append_only('A revision is history. Write a new revision instead.');
--> statement-breakpoint
CREATE TRIGGER session_log_entry_no_update
	BEFORE UPDATE ON "session_log_entry"
	FOR EACH ROW EXECUTE FUNCTION catalog_append_only('A session log records what happened. Append a correcting entry, or fix the note it touched.');
--> statement-breakpoint
CREATE TRIGGER session_log_entry_no_delete
	BEFORE DELETE ON "session_log_entry"
	FOR EACH ROW EXECUTE FUNCTION catalog_append_only('A session log records what happened. Append a correcting entry, or fix the note it touched.');
--> statement-breakpoint
-- The write-seam guard (D4): a content write is refused unless the transaction
-- has set `self_learn.revision_id`, which only the seam in
-- services/catalog/src/content/ does. Per row, so a referential action that
-- touches nothing is not refused.
--
-- Created on every content table and then DISABLED. `catalog flip <type>`
-- enables it for the type's tables; until track D flips, the studio's Accept
-- still writes `asset` rows through `assert-output` outside the seam, and a
-- guard armed now would fail every acceptance in between. `blob_object` and
-- `session_log_entry` carry no revisions (D5, D20) and so no guard.
CREATE FUNCTION content_write_guard() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	IF coalesce(current_setting('self_learn.revision_id', true), '') = '' THEN
		RAISE EXCEPTION '% is written only through the content write seam: % refused', TG_TABLE_NAME, TG_OP
			USING ERRCODE = 'insufficient_privilege',
			      HINT = 'Write through services/catalog/src/content/write.ts, which records who wrote it and why. A deliberate repair disables this trigger in its own transaction first.';
	END IF;
	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
	t text;
BEGIN
	FOREACH t IN ARRAY ARRAY[
		'topic', 'tag', 'topic_relation', 'manimkc_topic',
		'concept', 'concept_prerequisite',
		'collection', 'collection_tag', 'collection_item',
		'curriculum_item', 'curriculum_item_topic', 'concept_curriculum_item',
		'asset', 'asset_topic', 'asset_concept', 'asset_derivation',
		'diagram'
	] LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION content_write_guard()',
			t || '_write_guard', t);
		EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', t, t || '_write_guard');
	END LOOP;
END;
$$;
--> statement-breakpoint
-- The completeness rules of "Integrity the database enforces" (D21).
--
-- A CHECK sees one row, so "at least one child" is a constraint trigger,
-- deferred to commit so a whole course written in one transaction is never
-- judged half way. Each is attached to the parent, so a new parent is checked,
-- and to the child, so the last child leaving re-checks its parent. Constraint
-- triggers are per row by definition.
--
-- All three are created DISABLED. Nine of the ten courses fail the second one
-- today, and `catalog flip courses --strict` arms them once `catalog doctor`,
-- which runs the same predicates as plain queries, reports no violator.
--
-- Rule 1: every live module has at least one live curriculum item.
CREATE FUNCTION catalog_check_module_has_item() RETURNS trigger
	LANGUAGE plpgsql AS $$
DECLARE
	candidates text[];
	offender text;
BEGIN
	IF TG_TABLE_NAME = 'collection' THEN
		candidates := ARRAY[NEW.id];
	ELSIF TG_OP = 'INSERT' THEN
		candidates := ARRAY[NEW.collection_id];
	ELSIF TG_OP = 'DELETE' THEN
		candidates := ARRAY[OLD.collection_id];
	ELSE
		candidates := ARRAY[OLD.collection_id, NEW.collection_id];
	END IF;
	SELECT c.id INTO offender
	FROM public.collection c
	WHERE c.id = ANY (candidates)
		AND c.kind = 'module'
		AND c.archived_at IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM public.curriculum_item i
			WHERE i.collection_id = c.id AND i.archived_at IS NULL
		)
	LIMIT 1;
	IF offender IS NOT NULL THEN
		RAISE EXCEPTION 'module "%" has no curriculum items', offender
			USING ERRCODE = 'check_violation',
			      HINT = 'A module with no checklist rows is a page with nothing to tick. Add an item, or archive the module. catalog doctor lists every violator.';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_module_has_item
	AFTER INSERT OR UPDATE OF kind, archived_at ON "collection"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_module_has_item();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER curriculum_item_module_has_item
	AFTER INSERT OR UPDATE OF collection_id, archived_at OR DELETE ON "curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_module_has_item();
--> statement-breakpoint
-- Rule 2: every live curriculum item names at least one concept. The rule
-- nothing enforced before, and the one nine courses fail today.
CREATE FUNCTION catalog_check_item_has_concept() RETURNS trigger
	LANGUAGE plpgsql AS $$
DECLARE
	candidates text[];
	offender text;
BEGIN
	IF TG_TABLE_NAME = 'curriculum_item' THEN
		candidates := ARRAY[NEW.id];
	ELSIF TG_OP = 'INSERT' THEN
		candidates := ARRAY[NEW.curriculum_item_id];
	ELSIF TG_OP = 'DELETE' THEN
		candidates := ARRAY[OLD.curriculum_item_id];
	ELSE
		candidates := ARRAY[OLD.curriculum_item_id, NEW.curriculum_item_id];
	END IF;
	SELECT i.id INTO offender
	FROM public.curriculum_item i
	WHERE i.id = ANY (candidates)
		AND i.archived_at IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM public.concept_curriculum_item l WHERE l.curriculum_item_id = i.id
		)
	LIMIT 1;
	IF offender IS NOT NULL THEN
		RAISE EXCEPTION 'curriculum item "%" names no concept', offender
			USING ERRCODE = 'check_violation',
			      HINT = 'A row with no concept is a tick and nothing else: the frontier cannot reach it. List its concepts in the course, or archive it. catalog doctor lists every violator.';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER curriculum_item_item_has_concept
	AFTER INSERT OR UPDATE OF archived_at ON "curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_item_has_concept();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER concept_curriculum_item_item_has_concept
	AFTER INSERT OR UPDATE OR DELETE ON "concept_curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_item_has_concept();
--> statement-breakpoint
-- Rule 3: an item's concepts sit under its module's topic, which is the one
-- `collection_item` topic row of the module. Fired by anything that can move
-- either side: the link itself, a concept changing topic, an item changing
-- module or coming back from the archive, and the module's topic row.
CREATE FUNCTION catalog_check_item_concept_topic() RETURNS trigger
	LANGUAGE plpgsql AS $$
DECLARE
	candidates text[];
	bad_item text;
	bad_concept text;
BEGIN
	IF TG_TABLE_NAME = 'concept_curriculum_item' THEN
		candidates := ARRAY[NEW.curriculum_item_id];
	ELSIF TG_TABLE_NAME = 'curriculum_item' THEN
		candidates := ARRAY[NEW.id];
	ELSIF TG_TABLE_NAME = 'concept' THEN
		SELECT array_agg(l.curriculum_item_id) INTO candidates
		FROM public.concept_curriculum_item l WHERE l.concept_slug = NEW.slug;
	ELSE
		-- collection_item: every item of the module whose topic row moved.
		SELECT array_agg(i.id) INTO candidates
		FROM public.curriculum_item i
		WHERE i.collection_id = ANY (ARRAY[
			CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.collection_id END,
			CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.collection_id END
		]);
	END IF;
	SELECT l.curriculum_item_id, l.concept_slug INTO bad_item, bad_concept
	FROM public.concept_curriculum_item l
	JOIN public.curriculum_item i ON i.id = l.curriculum_item_id
	JOIN public.concept c ON c.slug = l.concept_slug
	WHERE l.curriculum_item_id = ANY (coalesce(candidates, ARRAY[]::text[]))
		AND i.archived_at IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM public.collection_item m
			WHERE m.collection_id = i.collection_id AND m.topic_slug = c.topic_slug
		)
	LIMIT 1;
	IF bad_item IS NOT NULL THEN
		RAISE EXCEPTION 'curriculum item "%" lists concept "%", which is not filed under its module''s topic', bad_item, bad_concept
			USING ERRCODE = 'check_violation',
			      HINT = 'File the concept under the module topic, or list it on a row of a module about its own topic. catalog doctor lists every violator.';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER concept_curriculum_item_concept_topic
	AFTER INSERT OR UPDATE ON "concept_curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_item_concept_topic();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER concept_concept_topic
	AFTER UPDATE OF topic_slug ON "concept"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_item_concept_topic();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER curriculum_item_concept_topic
	AFTER UPDATE OF collection_id, archived_at ON "curriculum_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_item_concept_topic();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_item_concept_topic
	AFTER INSERT OR UPDATE OR DELETE ON "collection_item"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION catalog_check_item_concept_topic();
--> statement-breakpoint
ALTER TABLE "collection" DISABLE TRIGGER collection_module_has_item;
--> statement-breakpoint
ALTER TABLE "curriculum_item" DISABLE TRIGGER curriculum_item_module_has_item;
--> statement-breakpoint
ALTER TABLE "curriculum_item" DISABLE TRIGGER curriculum_item_item_has_concept;
--> statement-breakpoint
ALTER TABLE "concept_curriculum_item" DISABLE TRIGGER concept_curriculum_item_item_has_concept;
--> statement-breakpoint
ALTER TABLE "concept_curriculum_item" DISABLE TRIGGER concept_curriculum_item_concept_topic;
--> statement-breakpoint
ALTER TABLE "concept" DISABLE TRIGGER concept_concept_topic;
--> statement-breakpoint
ALTER TABLE "curriculum_item" DISABLE TRIGGER curriculum_item_concept_topic;
--> statement-breakpoint
ALTER TABLE "collection_item" DISABLE TRIGGER collection_item_concept_topic;
--> statement-breakpoint
-- The copy guard (D2, edge case 14): on a database whose `catalog_instance`
-- says `copy`, every write to every other table is refused, naming the primary.
-- A trigger rather than a check in each writer, for the reason `event` is
-- append-only by trigger: it binds every writer, the web app and psql
-- included, and a writer nobody remembered to change cannot get past it.
--
-- Per statement, because on a copy a statement that would change nothing is
-- still a write aimed at the wrong database, and TRUNCATE has no rows. A
-- connection that sets `self_learn.copy_ok = on` is let through: that is the
-- flag tests and scripts/e2e.mjs pass (`CATALOG_COPY_OK=1`), and `catalog
-- migrate` sets it, since a copy's schema still has to follow the primary's.
-- `catalog_instance` itself is not guarded, so a copy can be promoted.
CREATE FUNCTION catalog_copy_guard() RETURNS trigger
	LANGUAGE plpgsql AS $$
DECLARE
	instance record;
BEGIN
	IF coalesce(current_setting('self_learn.copy_ok', true), '') = 'on' THEN
		RETURN NULL;
	END IF;
	SELECT role, primary_host INTO instance FROM public.catalog_instance WHERE id;
	IF FOUND AND instance.role = 'copy' THEN
		RAISE EXCEPTION 'this database is a copy, so % on % is refused. Writes go to the primary at %.', TG_OP, TG_TABLE_NAME, instance.primary_host
			USING ERRCODE = 'read_only_sql_transaction',
			      HINT = 'Point DATABASE_URL at the primary. Tests and scripts/e2e.mjs write to their own copies with CATALOG_COPY_OK=1.';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
	t text;
BEGIN
	FOREACH t IN ARRAY ARRAY[
		'learner', 'blob_object', 'topic', 'tag', 'topic_relation', 'manimkc_topic',
		'concept', 'collection', 'collection_tag', 'curriculum_item', 'asset', 'diagram',
		'asset_topic', 'asset_concept', 'concept_prerequisite', 'collection_item',
		'asset_derivation', 'curriculum_item_topic', 'concept_curriculum_item',
		'session', 'session_log_entry', 'event', 'mastery', 'review', 'progress', 'recap',
		'preference', 'job', 'asset_job', 'content_revision', 'index_run', 'mirror',
		'content_source'
	] LOOP
		EXECUTE format(
			'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard()',
			t || '_copy_guard', t);
	END LOOP;
END;
$$;
