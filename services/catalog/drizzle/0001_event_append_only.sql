-- Make `event` append-only.
--
-- Every other state table is a projection of this one: `mastery` and `review`
-- are rebuilt by replaying it. An UPDATE here would silently change a number
-- that the projections cannot explain, and a DELETE would make a rebuild
-- disagree with the row that was already derived from the deleted event.
--
-- A trigger rather than a revoked privilege. REVOKE UPDATE, DELETE ON event
-- does not bind the table's owner or a superuser, and the owner is precisely
-- who runs the migrations, the CLI and psql on a laptop — so it would read as
-- enforced and enforce nothing where it matters most. A trigger fires for
-- everyone (only ALTER TABLE ... DISABLE TRIGGER gets past it, which is an
-- explicit, auditable act), and it is dumped and restored with the schema, so
-- the guarantee survives the eventual pg_dump move to a cloud database.
--
-- Written as a statement-level trigger: it needs no row data, so this costs one
-- call per statement instead of one per row.

CREATE OR REPLACE FUNCTION event_append_only() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION
		'event is append-only: % is not allowed', TG_OP
		USING ERRCODE = 'restrict_violation',
		      HINT = 'Record a correcting event instead. Type "void" exists for exactly this.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER event_no_update
	BEFORE UPDATE ON "event"
	FOR EACH STATEMENT EXECUTE FUNCTION event_append_only();
--> statement-breakpoint
CREATE TRIGGER event_no_delete
	BEFORE DELETE ON "event"
	FOR EACH STATEMENT EXECUTE FUNCTION event_append_only();
