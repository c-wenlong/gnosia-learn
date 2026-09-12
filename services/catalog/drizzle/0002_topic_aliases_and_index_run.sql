CREATE TABLE "index_run" (
	"source" text PRIMARY KEY NOT NULL,
	"source_root" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"written" integer DEFAULT 0 NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "index_run_source_check" CHECK (source in ('topics', 'courses', 'concepts', 'manimkc', 'diagrams', 'sessions')),
	CONSTRAINT "index_run_written_check" CHECK (written >= 0 and deleted >= 0),
	CONSTRAINT "index_run_order_check" CHECK (finished_at >= started_at)
);
--> statement-breakpoint
ALTER TABLE "topic" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;