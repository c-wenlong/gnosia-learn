-- Videos through the studio's chat, phase 1 (docs/STUDIO-VIDEOS.md, "Schema"):
-- the `video` table, a studio video's source and its rendered cut (D49);
-- `video` as a job kind and a draft kind; and `video` as a revision entity
-- type. `job` and `draft` gain no columns, and the two studio agent
-- preferences are rows of `preference`, which needs no migration (D53).
--
-- drizzle-kit's own output is everything between this header and the block
-- at the end, unedited. The block adds the copy guard of 0010 (D2, edge case
-- 14), which every table but `catalog_instance` carries and a new table gets
-- only from its own migration, and the write-seam guard of 0010 (D4). The
-- older content tables were created with that guard disabled, to be armed by
-- their type's flip; `video` has had no writer outside the seam, so its guard
-- is armed here.

CREATE TABLE "video" (
	"slug" text PRIMARY KEY NOT NULL,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"title" text,
	"topic_slug" text NOT NULL,
	"source" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"mp4_blob_key" text,
	"rendered_source_hash" text,
	"duration_seconds" numeric,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "video_source_object_check" CHECK (jsonb_typeof(source) = 'object'),
	CONSTRAINT "video_source_hash_check" CHECK (source_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "video_mp4_pair_check" CHECK ((mp4_blob_key is null) = (rendered_source_hash is null)),
	CONSTRAINT "video_duration_check" CHECK (duration_seconds is null or duration_seconds > 0)
);
--> statement-breakpoint
ALTER TABLE "draft" DROP CONSTRAINT "draft_kind_check";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_kind_check";--> statement-breakpoint
ALTER TABLE "content_revision" DROP CONSTRAINT "content_revision_entity_type_check";--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_mp4_blob_key_blob_object_key_fk" FOREIGN KEY ("mp4_blob_key") REFERENCES "public"."blob_object"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "video_owner_id_idx" ON "video" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "video_topic_slug_idx" ON "video" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "video_mp4_blob_key_idx" ON "video" USING btree ("mp4_blob_key");--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_kind_check" CHECK (kind in ('diagram', 'video'));--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_kind_check" CHECK (kind in ('diagram', 'video'));--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_entity_type_check" CHECK (entity_type in ('topic', 'tag', 'collection', 'curriculum_item', 'concept', 'diagram', 'asset', 'video'));

--> statement-breakpoint
CREATE TRIGGER "video_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "video" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
--> statement-breakpoint
CREATE TRIGGER "video_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "video" FOR EACH ROW EXECUTE FUNCTION content_write_guard();
