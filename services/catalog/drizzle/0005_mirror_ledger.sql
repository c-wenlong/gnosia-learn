-- The mirror ledger, and the `mirrors` index source that fills it.
--
-- `mirror` is one row per (asset, destination): what `manimkc mirrors --json`
-- saw of a deliverable on Google Drive or Seafile. The video's bytes never
-- enter the database, so this is the only thing the catalog can say about a
-- copy it does not hold.
--
-- `index_run.metadata` arrives with it. A destination the audit could not
-- reach writes no rows and deletes none, so the table alone cannot distinguish
-- "Drive is fine" from "Drive was signed out and these rows are from Tuesday".
-- The run records which destinations it actually looked at, and `catalog
-- status` reads the ages off `mirror.checked_at`.
--
-- The `index_run` source CHECK is dropped and re-added because `mirrors` is a
-- seventh source. A CHECK over a text column is exactly why these vocabularies
-- are not Postgres ENUMs: widening one is two statements in a migration.
CREATE TABLE "mirror" (
	"asset_id" text NOT NULL,
	"destination" text NOT NULL,
	"root" text NOT NULL,
	"status" text NOT NULL,
	"compared" text NOT NULL,
	"bytes" bigint,
	"mtime" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirror_asset_id_destination_pk" PRIMARY KEY("asset_id","destination"),
	CONSTRAINT "mirror_status_check" CHECK (status in ('present', 'stale', 'missing', 'unknown')),
	CONSTRAINT "mirror_compared_check" CHECK (compared in ('sha256', 'bytes', 'size+mtime', 'none')),
	CONSTRAINT "mirror_bytes_check" CHECK (bytes is null or bytes >= 0)
);
--> statement-breakpoint
ALTER TABLE "index_run" DROP CONSTRAINT "index_run_source_check";--> statement-breakpoint
ALTER TABLE "index_run" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mirror" ADD CONSTRAINT "mirror_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "mirror_status_idx" ON "mirror" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mirror_destination_idx" ON "mirror" USING btree ("destination");--> statement-breakpoint
ALTER TABLE "index_run" ADD CONSTRAINT "index_run_source_check" CHECK (source in ('topics', 'courses', 'concepts', 'manimkc', 'diagrams', 'sessions', 'mirrors'));