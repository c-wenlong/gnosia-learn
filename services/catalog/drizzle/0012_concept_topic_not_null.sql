-- Track C's contract migration (docs/CONTENT-MIGRATION.md, "Integrity the
-- database enforces"): every concept is filed under a topic.
--
-- drizzle-kit's own output is everything after the hand-written block,
-- unedited. The block is the guard the plan asks for: `ON DELETE SET NULL`,
-- which this migration replaces, means a pruned topic can have left a null
-- behind, and `SET NOT NULL` on such a table fails naming the column but not
-- the rows. So the migration counts them first and refuses with every slug.
-- `catalog doctor` reports the same query ("concepts with no topic"), archived
-- concepts included, and is how the owner sees the distance to zero before
-- migrating. The fix for a listed concept is to file it under a topic: for
-- one with a note, list it in a topic's `maps.concepts` in
-- content/topics.yaml and run `catalog index`, which sets the column; for one
-- no note produces (an archived concept), set `concept.topic_slug` to a live
-- topic directly. Archiving does not help: the check below counts archived
-- rows, since `NOT NULL` binds them too.

DO $$
DECLARE
	orphans text;
BEGIN
	SELECT string_agg(slug, ', ' ORDER BY slug) INTO orphans FROM "concept" WHERE topic_slug IS NULL;
	IF orphans IS NOT NULL THEN
		RAISE EXCEPTION 'concept.topic_slug cannot be made NOT NULL: these concepts have no topic: %. File each under a topic, then migrate again.', orphans
			USING HINT = 'npm run catalog -- doctor lists them.';
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "concept" DROP CONSTRAINT "concept_topic_slug_topic_slug_fk";
--> statement-breakpoint
ALTER TABLE "concept" ALTER COLUMN "topic_slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "concept" ADD CONSTRAINT "concept_topic_slug_topic_slug_fk" FOREIGN KEY ("topic_slug") REFERENCES "public"."topic"("slug") ON DELETE restrict ON UPDATE cascade;