-- 0.5 of docs/CONTENT-MIGRATION.md: what the export needs that 0010 did not add.
--
-- `tags` joins the index sources, because content/tags.yaml now has an indexer
-- of its own and `index_run` records every source's last run.
--
-- Three authored orders had nowhere to live, so an export would have sorted
-- them and parity would have failed on the order: a topic's `maps.concepts`
-- (the course path breaks ties by it), its `maps.courses`, and its new
-- `relations:` list. `concept.topic_position`, `collection_item.topic_position`
-- on a module's topic row, and `topic_relation.position` hold them. Every
-- existing row takes 0 until the next `catalog index` fills it in.
ALTER TABLE "index_run" DROP CONSTRAINT "index_run_source_check";--> statement-breakpoint
ALTER TABLE "collection_item" ADD COLUMN "topic_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "concept" ADD COLUMN "topic_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_relation" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "index_run" ADD CONSTRAINT "index_run_source_check" CHECK (source in ('topics', 'tags', 'courses', 'concepts', 'manimkc', 'diagrams', 'sessions', 'mirrors'));