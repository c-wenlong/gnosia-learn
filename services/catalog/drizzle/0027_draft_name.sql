ALTER TABLE "draft" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_name_check" CHECK (name is null or char_length(name) between 1 and 200);