ALTER TABLE "job" ADD COLUMN "cost_source" text;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_cost_source_check" CHECK (cost_source is null or cost_source in ('result', 'stream'));--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_cost_source_paired_check" CHECK (cost_source is null or cost_usd is not null);