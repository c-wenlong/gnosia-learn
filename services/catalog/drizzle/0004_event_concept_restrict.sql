-- `event.concept_slug` moves from ON DELETE SET NULL to ON DELETE RESTRICT.
--
-- SET NULL was never reachable. `event` carries a BEFORE UPDATE trigger that
-- raises `restrict_violation`, so deleting a concept made Postgres run
-- `UPDATE ONLY event SET concept_slug = NULL WHERE $1 = concept_slug` and the
-- trigger refused it. The effective rule was already "a concept with events
-- cannot be deleted", delivered as an error about a trigger nobody was
-- thinking about, and only for concepts that actually had events (0003 made
-- the trigger per-row precisely so an empty `event` stopped blocking every
-- delete). This states the real rule directly, in the foreign key, so the
-- error names `event_concept_slug_concept_slug_fk` and the indexer can turn a
-- 23503 on that constraint into a sentence naming the slugs.
--
-- `mastery` and `review` keep ON DELETE CASCADE: they are projections of this
-- log, so losing them to a delete costs a `learn model --rebuild`, not history.
ALTER TABLE "event" DROP CONSTRAINT "event_concept_slug_concept_slug_fk";
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_concept_slug_concept_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concept"("slug") ON DELETE restrict ON UPDATE cascade;
