import {
  appendEvent,
  assetsByIds,
  readPreference,
  StateError,
  withLearnerLock,
  writePreference,
} from "@self-learn/catalog/state";

import { MAX_ASSET_ID_CHARS } from "@/app/api/learner/watched/route";
import { appTimeZone } from "@/lib/time-zone";
import { dayKey } from "@/lib/days";
import { BadRequest, handler } from "@/lib/learner-api";
import { ownerScope } from "@/lib/owner";
import {
  applySave,
  coverage,
  isRange,
  MAX_DURATION_SECONDS,
  MAX_RANGES,
  parsePlayback,
  playbackKey,
  type Range,
} from "@/lib/playback";

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
 */
export const POST = handler(
  "playback",
  (body) => {
    const assetId = body.assetId;
    if (typeof assetId !== "string" || assetId.trim() === "") {
      throw new BadRequest('"assetId" is required and must be a non-empty string.');
    }
    if (assetId.length > MAX_ASSET_ID_CHARS) {
      throw new BadRequest(`"assetId" is longer than ${MAX_ASSET_ID_CHARS} characters.`);
    }
    const duration = seconds(body.duration, "duration");
    if (duration <= 0) throw new BadRequest('"duration" must be more than zero.');
    const position = seconds(body.position, "position");
    const ranges = body.ranges ?? [];
    if (!Array.isArray(ranges) || ranges.length > MAX_RANGES || !ranges.every(isRange)) {
      throw new BadRequest(`"ranges" must be at most ${MAX_RANGES} [start, end] pairs of seconds.`);
    }
    return { assetId, duration, position, ranges: ranges as Range[] };
  },
  async (db, save, owner) => {
    const [row] = await assetsByIds(db, [save.assetId], ownerScope(owner));
    if (row === undefined) throw new StateError(`no asset in the catalog for "${save.assetId}"`);
    if (row.kind !== "video") throw new StateError(`"${row.id}" is a ${row.kind}, not a video`);

    const key = playbackKey(row.id);
    const { playback, crossed } = await withLearnerLock(db, owner, async (tx) => {
      const stored = parsePlayback(await readPreference(tx, key, owner));
      const next = applySave(stored, save, new Date().toISOString());
      // One transaction: the event and the stored `watchedAt` land together
      // or not at all.
      if (next.crossed) await appendEvent(tx, { type: "watched", asset: row.id, kind: row.kind }, owner);
      await writePreference(tx, key, next.playback, owner);
      return next;
    });
    return {
      assetId: row.id,
      coverage: coverage(playback.ranges, playback.duration),
      watchedAt: playback.watchedAt,
      // The same day the page prints, made where the app's time zone is known.
      watchedDay: playback.watchedAt === null ? null : dayKey(playback.watchedAt, appTimeZone()),
      // What is stored now, which a slower overlapping save may have written.
      position: playback.position,
      crossed,
    };
  },
);

function seconds(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_DURATION_SECONDS) {
    throw new BadRequest(`"${field}" must be a number of seconds from 0 to ${MAX_DURATION_SECONDS}.`);
  }
  return value;
}
