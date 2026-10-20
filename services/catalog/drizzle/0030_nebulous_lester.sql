ALTER TABLE "asset" DROP CONSTRAINT "asset_kind_check";--> statement-breakpoint
ALTER TABLE "asset" DROP CONSTRAINT "asset_stored_blob_check";--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_kind_check" CHECK (kind in ('video', 'transcript', 'chapters', 'captions', 'diagram_source', 'diagram_svg', 'note', 'session', 'link', 'poster', 'pdf'));--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_stored_blob_check" CHECK (kind not in ('video', 'transcript', 'chapters', 'captions', 'poster', 'pdf', 'diagram_svg') or blob_key is not null);