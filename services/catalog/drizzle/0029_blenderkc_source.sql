ALTER TABLE "asset" DROP CONSTRAINT "asset_source_repo_check";--> statement-breakpoint
ALTER TABLE "index_run" DROP CONSTRAINT "index_run_source_check";--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_source_repo_check" CHECK (source_repo in ('self-learn', 'manimkc', 'tldrawkc', 'remotionkc', 'revideokc', 'blenderkc'));--> statement-breakpoint
ALTER TABLE "index_run" ADD CONSTRAINT "index_run_source_check" CHECK (source in ('topics', 'tags', 'courses', 'concepts', 'manimkc', 'remotionkc', 'revideokc', 'blenderkc', 'diagrams', 'sessions', 'mirrors'));