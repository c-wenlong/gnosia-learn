import { playbackTurn } from "@gnosia/tutor/server/learner-writes";

import { turnRoute } from "@/lib/learner-api";

/**
 * Save where the learner is in a library video, and what of it they watched.
 *
 * The player posts here as it plays (every few seconds of playback, on pause,
 * at the end, and with `sendBeacon` when the page is left), so the next visit
 * resumes where this one stopped. There is no "Mark watched" button any more:
 * the save that takes coverage past `WATCHED_FRACTION` appends the one
 * `watched` event, `{ asset, kind }`, the same event the button used to write,
 * so everything that reads the log reads it unchanged. Later saves do
 * not append again; `watchedAt` on the stored row is what remembers that.
 *
 * `ranges` are the stretches that played since the last save, in seconds. The
 * route merges them into what is stored rather than trusting the browser's
 * total. The read, the event and the write run under the learner's row lock
 * (`withLearnerLock`), so a periodic save racing a pause or a page-exit
 * beacon is merged rather than overwritten, and only one of them can be the
 * save that crosses the threshold.
 *
 * The parse and the write are `playbackTurn` in
 * `@gnosia/tutor/server/learner-writes`, which the sidecar runs too.
 */
export const POST = turnRoute("playback", playbackTurn);
