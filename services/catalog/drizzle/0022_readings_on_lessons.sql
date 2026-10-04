-- Phase 2 of docs/proposals/module-learning-path.md: a reading names the
-- lessons it goes with, and a module and a lesson list videos.
--
-- `curriculum_item_asset` is a reading's `lessons:`: a typed link from a
-- curated `link` asset to a curriculum item, owned by the item (its snapshot
-- holds it, as it holds `concept_curriculum_item`) and written by the courses
-- source and `course import` only. `curriculum_item.videos` is a lesson's
-- `videos:`, asset ids kept as data rather than a foreign key, since the
-- video tools index after the courses source and a clone may have none; a
-- module's list is `collection.metadata.videos`. `practice` joins the
-- resource types.
--
-- drizzle-kit's own output is everything between this header and the block
-- at the end, unedited. The block is the copy guard of 0010 (D2, edge case
-- 14), and the write-seam guard of 0010 (D4), created disabled as every one
-- is: `catalog flip courses` arms it with the other course tables, and on a
-- database that already owns courses `catalog flip courses --rearm` does.

CREATE TABLE "curriculum_item_asset" (
	"curriculum_item_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_item_asset_curriculum_item_id_asset_id_pk" PRIMARY KEY("curriculum_item_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "asset" DROP CONSTRAINT "asset_resource_type_check";--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD COLUMN "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "curriculum_item_asset" ADD CONSTRAINT "curriculum_item_asset_curriculum_item_id_curriculum_item_id_fk" FOREIGN KEY ("curriculum_item_id") REFERENCES "public"."curriculum_item"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "curriculum_item_asset" ADD CONSTRAINT "curriculum_item_asset_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "curriculum_item_asset_asset_id_idx" ON "curriculum_item_asset" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_resource_type_check" CHECK (resource_type is null or (kind = 'link' and resource_type in ('paper', 'docs', 'video', 'book', 'other', 'practice')));--> statement-breakpoint
ALTER TABLE "curriculum_item" ADD CONSTRAINT "curriculum_item_videos_array_check" CHECK (jsonb_typeof(videos) = 'array');

--> statement-breakpoint
CREATE TRIGGER "curriculum_item_asset_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "curriculum_item_asset" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
--> statement-breakpoint
CREATE TRIGGER "curriculum_item_asset_write_guard" BEFORE INSERT OR UPDATE OR DELETE ON "curriculum_item_asset" FOR EACH ROW EXECUTE FUNCTION content_write_guard();
--> statement-breakpoint
ALTER TABLE "curriculum_item_asset" DISABLE TRIGGER "curriculum_item_asset_write_guard";
