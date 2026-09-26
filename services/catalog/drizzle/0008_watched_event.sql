-- Allow the `watched` event type.
--
-- The library asset page's Mark watched button appends one when the learner
-- has watched a video or read a note (payload `{ asset, kind }`). It counts as
-- a study day for the streak and is never evidence: both replays read only
-- `observation` and `review`, so it moves no p(L) and schedules no card. The
-- type list lives in `EVENT_TYPES` in `packages/schema/src/shared.ts`.
ALTER TABLE "event" DROP CONSTRAINT "event_type_check";--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_type_check" CHECK (type in ('session-start', 'observation', 'review', 'session-close', 'void', 'watched'));