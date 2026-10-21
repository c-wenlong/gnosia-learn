-- The self-learn -> gnosia rename, in the database: the source_repo value
-- and the two guard functions' settings names follow the new one. The
-- functions move first so the row update below satisfies the new name, then
-- the write guard is satisfied for this one repair by SET LOCAL.
CREATE OR REPLACE FUNCTION content_write_guard() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	IF coalesce(current_setting('gnosia.revision_id', true), '') = '' THEN
		RAISE EXCEPTION '% is written only through the content write seam: % refused', TG_TABLE_NAME, TG_OP
			USING ERRCODE = 'insufficient_privilege',
			      HINT = 'Write through services/catalog/src/content/write.ts, which records who wrote it and why. A deliberate repair disables this trigger in its own transaction first.';
	END IF;
	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION catalog_copy_guard() RETURNS trigger
	LANGUAGE plpgsql AS $$
DECLARE
	instance record;
BEGIN
	IF coalesce(current_setting('gnosia.copy_ok', true), '') = 'on' THEN
		RETURN NULL;
	END IF;
	SELECT role, primary_host INTO instance FROM public.catalog_instance WHERE id;
	IF FOUND AND instance.role = 'copy' THEN
		RAISE EXCEPTION 'this database is a copy, so % on % is refused. Writes go to the primary at %.', TG_OP, TG_TABLE_NAME, instance.primary_host
			USING ERRCODE = 'read_only_sql_transaction',
		      HINT = 'Point DATABASE_URL at the primary. Tests and scripts/e2e.mjs write to their own copies with CATALOG_COPY_OK=1.';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
SET LOCAL gnosia.revision_id = '0032: self-learn renamed gnosia';--> statement-breakpoint
ALTER TABLE "asset" DROP CONSTRAINT "asset_source_repo_check";--> statement-breakpoint
UPDATE "asset" SET "source_repo" = 'gnosia' WHERE "source_repo" = 'self-learn';--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_source_repo_check" CHECK (source_repo in ('gnosia', 'manimkc', 'tldrawkc', 'remotionkc', 'revideokc', 'blenderkc'));
