import { watchedTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * Mark a library asset watched (a video) or read (anything else).
 *
 * Appends one `watched` event, `{ asset, kind }`, with no concept: watching is
 * study and never evidence, so it moves no p(L) and schedules
 * no card (`EVENT_TYPES` in `packages/schema/src/shared.ts` has the rule).
 * Every press appends, so watching twice is two events, the same way a second
 * review is a second row.
 *
 * The id has to name a row. `event.payload` has no foreign key, so without the
 * lookup a typo would land in an append-only log forever; a missing row is a
 * `StateError`, which the shared handler turns into a 400.
 *
 * The parse and the write are `watchedTurn` in
 * `@gnosia/tutor/server/learner-writes`, which the sidecar runs too.
 */
export const POST = turnRoute("watched", watchedTurn);
