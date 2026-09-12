-- Make the append-only guard fire per row instead of per statement.
--
-- As written in 0001 the triggers were `FOR EACH STATEMENT`, which fires on the
-- statement whether or not it touches a single row. `event.concept_slug` is a
-- foreign key with ON DELETE SET NULL, so deleting any concept makes Postgres
-- run its referential action, `UPDATE ONLY event SET concept_slug = NULL WHERE
-- $1 = concept_slug`, once per deleted parent row. The statement-level trigger
-- fired on that UPDATE even when `event` was completely empty.
--
-- The effect was that no row could ever be deleted from `concept`, at all, on a
-- database with no events in it:
--
--     ERROR:  event is append-only: UPDATE is not allowed
--     SQL statement "UPDATE ONLY "public"."event" SET "concept_slug" = NULL ..."
--
-- That blocks the indexers, whose whole contract is that a derived row is
-- removed when the file it came from is. It was invisible until something tried
-- to delete a concept, which nothing did until now.
--
-- `FOR EACH ROW` keeps the guarantee exactly and drops the false positive: the
-- trigger fires for every event row actually being updated or deleted, and for
-- none that is not. A statement matching no rows changes nothing, so letting it
-- through costs nothing. An UPDATE or DELETE that would really modify the log
-- still raises, including the referential SET NULL when events for that concept
-- do exist — which is the right answer there too, since an event is the record
-- that something happened and silently forgetting what it was about is the one
-- thing this table is meant to prevent.

DROP TRIGGER IF EXISTS event_no_update ON "event";
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_no_delete ON "event";
--> statement-breakpoint
CREATE TRIGGER event_no_update
	BEFORE UPDATE ON "event"
	FOR EACH ROW EXECUTE FUNCTION event_append_only();
--> statement-breakpoint
CREATE TRIGGER event_no_delete
	BEFORE DELETE ON "event"
	FOR EACH ROW EXECUTE FUNCTION event_append_only();
