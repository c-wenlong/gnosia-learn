-- Phase 2's contract migration (docs/CONTENT-MIGRATION.md, "Contract
-- migration"): a video, a sidecar, a poster or a diagram SVG is in the blob
-- store, and its `asset` row names the blob; and a blob key is the key
-- `@gnosia/blob` makes (packages/blob/src/key.ts), which is stricter than
-- 0010's check.
--
-- drizzle-kit's own output is everything after the hand-written block,
-- unedited. The block is the guard: `ADD CONSTRAINT ... CHECK` on a table
-- with a violating row fails naming the constraint and not the rows, and
-- rolls back every migration applied in the same run. So it lists the rows
-- first and refuses with every id. `catalog doctor` reports the same two
-- queries ("stored assets with no blob", "blob keys the package would not
-- make"), and `catalog migrate` holds this migration back, applying
-- everything before it, while either is not empty, so a database at 0009
-- still migrates to 0012 and can run the upload. On flip day it applies after
-- `catalog import` (which stores each diagram SVG) and `catalog asset upload
-- --source manimkc` (videos, sidecars, posters); a diagram SVG left without a
-- blob is stored with `catalog diagram put`.

DO $$
DECLARE
	unstored text;
	unkeyed text;
BEGIN
	SELECT string_agg(id || ' (' || kind || ')', ', ' ORDER BY id) INTO unstored FROM "asset"
		WHERE kind IN ('video', 'transcript', 'chapters', 'captions', 'poster', 'diagram_svg') AND blob_key IS NULL;
	SELECT string_agg(key, ', ' ORDER BY key) INTO unkeyed FROM "blob_object"
		WHERE key !~ '^[a-z0-9][a-z0-9_-]{0,63}/[0-9a-f]{64}[.][a-z0-9]{1,16}$';
	IF unstored IS NOT NULL THEN
		RAISE EXCEPTION 'asset_stored_blob_check cannot be added: these assets have no blob: %. Run catalog asset upload --source manimkc (and catalog import for diagram SVGs), then migrate again.', unstored
			USING HINT = 'npm run catalog -- doctor lists them.';
	END IF;
	IF unkeyed IS NOT NULL THEN
		RAISE EXCEPTION 'blob_object_key_check cannot be tightened: these keys are not keys @gnosia/blob makes: %.', unkeyed
			USING HINT = 'npm run catalog -- doctor lists them.';
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "blob_object" DROP CONSTRAINT "blob_object_key_check";--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_stored_blob_check" CHECK (kind not in ('video', 'transcript', 'chapters', 'captions', 'poster', 'diagram_svg') or blob_key is not null);--> statement-breakpoint
ALTER TABLE "blob_object" ADD CONSTRAINT "blob_object_key_check" CHECK (key ~ '^[a-z0-9][a-z0-9_-]{0,63}/[0-9a-f]{64}[.][a-z0-9]{1,16}$' and starts_with(key, owner_id || '/' || sha256));