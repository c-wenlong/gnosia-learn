-- The studio: `session`, `job`, `asset_job`, and `event.session_id` becoming a
-- foreign key at last.
--
-- Three new tables and one changed column. Nothing else in the catalog moves:
-- no new asset kind (a diagram is a kind `asset` already has), no new event
-- type (a render failure is not evidence about a learner), and no column on
-- `asset` pointing back at a job.
--
-- `session` carries a `kind` discriminator rather than being two tables,
-- because `event.session_id` needs exactly one foreign key target and a
-- polymorphic column is the shape this schema rejects everywhere else.
--
-- `job_active_target_key` is the one index doing real work. It is partial, over
-- the three states that hold a committed path, so two jobs cannot target the
-- same file at once and an unaccepted candidate keeps holding it. The whole
-- history of a path is jobs that have finished with it, which is why a total
-- unique index would be wrong.
--
-- Everything below this line up to the backfill is drizzle-kit's own output,
-- unedited. The backfill is added by hand because drizzle generates DDL and
-- not DML, the same way the triggers in 0001 and 0003 were, and it is placed
-- immediately before the `event` foreign key because that constraint cannot
-- hold until every existing `session_id` resolves.

CREATE TABLE "asset_job" (
	"asset_id" text NOT NULL,
	"job_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"bytes" bigint NOT NULL,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_job_asset_id_job_id_pk" PRIMARY KEY("asset_id","job_id"),
	CONSTRAINT "asset_job_bytes_check" CHECK (bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"session_id" text,
	"parent_job_id" text,
	"state" text DEFAULT 'queued' NOT NULL,
	"phase" text,
	"topic_slug" text NOT NULL,
	"target_path" text NOT NULL,
	"candidate_path" text,
	"target_hash_before" text,
	"brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gate" jsonb,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"runner" text,
	"runner_job_id" text,
	"exit_code" integer,
	"turns" integer,
	"cost_usd" double precision,
	"error_kind" text,
	"error" text,
	"error_detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_kind_check" CHECK (kind in ('diagram')),
	CONSTRAINT "job_state_check" CHECK (state in ('queued', 'running', 'awaiting_review', 'accepted', 'discarded', 'failed', 'cancelled', 'interrupted')),
	CONSTRAINT "job_brief_object_check" CHECK (jsonb_typeof(brief) = 'object'),
	CONSTRAINT "job_gate_object_check" CHECK (gate is null or jsonb_typeof(gate) = 'object'),
	CONSTRAINT "job_error_detail_object_check" CHECK (error_detail is null or jsonb_typeof(error_detail) = 'object'),
	CONSTRAINT "job_attempt_check" CHECK (attempt >= 0),
	CONSTRAINT "job_turns_check" CHECK (turns is null or turns >= 0),
	CONSTRAINT "job_cost_usd_check" CHECK (cost_usd is null or cost_usd >= 0),
	CONSTRAINT "job_not_own_parent_check" CHECK (parent_job_id is distinct from id),
	CONSTRAINT "job_started_at_check" CHECK (started_at is null or started_at >= requested_at),
	CONSTRAINT "job_finished_at_check" CHECK (finished_at is null or started_at is null or finished_at >= started_at),
	CONSTRAINT "job_queued_check" CHECK (state <> 'queued' or (started_at is null and runner is null))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"learner_id" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"title" text,
	"goal" text,
	"agent_session_id" text,
	"log_asset_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"error_kind" text,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_kind_check" CHECK (kind in ('tutor', 'studio')),
	CONSTRAINT "session_state_check" CHECK (state in ('running', 'closed', 'failed', 'cancelled', 'interrupted')),
	CONSTRAINT "session_metadata_object_check" CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT "session_ended_at_check" CHECK (state <> 'running' or ended_at is null),
	CONSTRAINT "session_order_check" CHECK (ended_at is null or ended_at >= started_at)
);
--> statement-breakpoint
ALTER TABLE "asset_job" ADD CONSTRAINT "asset_job_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "asset_job" ADD CONSTRAINT "asset_job_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_parent_job_id_job_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_log_asset_id_asset_id_fk" FOREIGN KEY ("log_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "asset_job_job_id_idx" ON "asset_job" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_idempotency_key_key" ON "job" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "job_active_target_key" ON "job" USING btree ("target_path") WHERE state in ('queued', 'running', 'awaiting_review');--> statement-breakpoint
CREATE INDEX "job_session_id_idx" ON "job" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "job_state_idx" ON "job" USING btree ("state");--> statement-breakpoint
CREATE INDEX "job_topic_slug_idx" ON "job" USING btree ("topic_slug");--> statement-breakpoint
CREATE INDEX "job_parent_job_id_idx" ON "job" USING btree ("parent_job_id");--> statement-breakpoint
CREATE INDEX "job_requested_at_idx" ON "job" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "session_kind_state_idx" ON "session" USING btree ("kind","state");--> statement-breakpoint
CREATE INDEX "session_started_at_idx" ON "session" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "session_learner_id_idx" ON "session" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "session_log_asset_id_idx" ON "session" USING btree ("log_asset_id");--> statement-breakpoint
-- The backfill `event.session_id` has been waiting for since bundle 5.
--
-- The column has been free text since 0000 and the rows pointing through it are
-- in an append-only table, so they cannot be cleaned up afterwards: either
-- every existing value gets a `session` row before the constraint lands, or the
-- constraint does not land at all.
--
-- `started_at` is the session's earliest event. `ended_at` and the `closed`
-- state come from its `session-close` event when it has one; a session that
-- never closed is `interrupted`, with a null `ended_at`, because nothing in the
-- log says when it stopped and inventing an instant would be worse than saying
-- nothing. `learner_id` is the learner on the earliest event, which is the only
-- one there can be while there is one learner, and the honest choice if that
-- ever stops being true.
--
-- `ON CONFLICT DO NOTHING` rather than an upsert: a `session` row that already
-- exists was written by `learn session start`, and it knows more about itself
-- than a reconstruction from the log does. An empty `event` table inserts
-- nothing and the statement still succeeds, which is the case on a fresh
-- database and in CI.
INSERT INTO "session" ("id", "kind", "learner_id", "state", "started_at", "ended_at", "metadata")
SELECT
	s."session_id",
	'tutor',
	s."learner_id",
	CASE WHEN s."closed_at" IS NULL THEN 'interrupted' ELSE 'closed' END,
	s."started_at",
	s."closed_at",
	'{"backfilled": "0006_studio_jobs"}'::jsonb
FROM (
	SELECT
		"session_id",
		(array_agg("learner_id" ORDER BY "at", "id"))[1] AS "learner_id",
		min("at") AS "started_at",
		max("at") FILTER (WHERE "type" = 'session-close') AS "closed_at"
	FROM "event"
	WHERE "session_id" IS NOT NULL
	GROUP BY "session_id"
) s
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE restrict ON UPDATE cascade;