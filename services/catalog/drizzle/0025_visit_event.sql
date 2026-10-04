-- Allow the `visit` event type.
--
-- The web app appends one each time the owner opens a course or module page
-- (payload `{ course, module? }`, no concept, no session), beside the
-- `lastVisited` and `recentModules` preferences it already kept. The sidebar's
-- Recent and Home's "Pick up where you left off" read it, so a visit older
-- than the five the preference keeps still shows (L7 of
-- docs/proposals/library-by-type-and-day.md). It is neither study nor
-- evidence: both replays read only `observation` and `review`. The type list
-- lives in `EVENT_TYPES` in `packages/schema/src/shared.ts`.
ALTER TABLE "event" DROP CONSTRAINT "event_type_check";--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_type_check" CHECK (type in ('session-start', 'observation', 'review', 'session-close', 'void', 'watched', 'visit'));