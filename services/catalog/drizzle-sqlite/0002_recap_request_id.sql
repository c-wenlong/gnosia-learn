-- The id of the write that last stored a recap, so a write sent again after
-- its answer was lost counts no second session (`upsertRecap` in
-- src/state/recap.ts). Nullable: rows written before it, and callers that
-- send no id, have none.
ALTER TABLE `recap` ADD `request_id` text;
