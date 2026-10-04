-- A learner's own names for assets: `asset_name`, read in place of
-- `asset.title` wherever that learner sees the asset. State, so no import
-- writes it; no foreign key on `asset_id`, so a name outlives an import that
-- prunes its asset and writes it back under the same id.
--
-- drizzle-kit's own output is everything between this header and the block
-- at the end, unedited. The block is the copy guard of 0010 (D2, edge case
-- 14), which every table since carries through its own migration, as 0020 did.

CREATE TABLE "asset_name" (
	"learner_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_name_learner_id_asset_id_pk" PRIMARY KEY("learner_id","asset_id"),
	CONSTRAINT "asset_name_title_check" CHECK (char_length(title) between 1 and 200 and title = btrim(title) and title !~ '\s{2}|[\n\r\t]')
);
--> statement-breakpoint
ALTER TABLE "asset_name" ADD CONSTRAINT "asset_name_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_name_asset_id_idx" ON "asset_name" USING btree ("asset_id");
--> statement-breakpoint
CREATE TRIGGER "asset_name_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "asset_name" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
