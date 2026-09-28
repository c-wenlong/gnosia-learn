-- The chat-first studio's phase 1 (docs/STUDIO-CHAT-FIRST.md, "Schema"): the
-- `draft` table, one conversation with the planner, and `job.draft_id`, the
-- link from each job a draft started back to it (D35).
--
-- drizzle-kit's own output is everything between this header and the block
-- at the end, unedited. The block is the copy guard of 0010 (D2, edge case
-- 14), which that migration put on every table it knew of by name: a table
-- added later carries none unless its own migration adds it, and
-- services/catalog/test/content-seam.test.ts checks every table but
-- `catalog_instance` has one.

CREATE TABLE "draft" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"kind" text DEFAULT 'diagram' NOT NULL,
	"source" text,
	"title" text,
	"planner_session_id" text NOT NULL,
	"transcript_path" text NOT NULL,
	"brief" jsonb,
	"brief_at" timestamp with time zone,
	"pending_topic" jsonb,
	"turns" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision,
	"cost_source" text,
	"error_kind" text,
	"error" text,
	"owner_id" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_state_check" CHECK (state in ('open', 'briefed', 'drawing', 'done', 'abandoned')),
	CONSTRAINT "draft_kind_check" CHECK (kind in ('diagram')),
	CONSTRAINT "draft_brief_object_check" CHECK (brief is null or jsonb_typeof(brief) = 'object'),
	CONSTRAINT "draft_pending_topic_object_check" CHECK (pending_topic is null or jsonb_typeof(pending_topic) = 'object'),
	CONSTRAINT "draft_pending_topic_brief_check" CHECK (pending_topic is null or brief is not null),
	CONSTRAINT "draft_turns_check" CHECK (turns >= 0),
	CONSTRAINT "draft_cost_usd_check" CHECK (cost_usd is null or cost_usd >= 0),
	CONSTRAINT "draft_cost_source_check" CHECK (cost_source is null or cost_source in ('result', 'stream')),
	CONSTRAINT "draft_cost_source_paired_check" CHECK (cost_source is null or cost_usd is not null),
	CONSTRAINT "draft_error_kind_check" CHECK (error_kind is null or error_kind in ('agent', 'brief-invalid', 'timeout', 'interrupted'))
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "draft_id" text;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_owner_id_learner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "draft_owner_id_idx" ON "draft" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "draft_state_idx" ON "draft" USING btree ("state");--> statement-breakpoint
CREATE INDEX "draft_updated_at_idx" ON "draft" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "job_draft_id_idx" ON "job" USING btree ("draft_id");
--> statement-breakpoint
CREATE TRIGGER "draft_copy_guard" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "draft" FOR EACH STATEMENT EXECUTE FUNCTION catalog_copy_guard();
