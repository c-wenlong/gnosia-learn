import {
  appendEvent,
  assetsByIds,
  readPreference,
  StateError,
  writePreference,
} from "@self-learn/catalog/state";

import { MAX_ASSET_ID_CHARS } from "@/app/api/learner/watched/route";
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
 * so the streak and Today's activity list read it unchanged. Later saves do
 * not append again; `watchedAt` on the stored row is what remembers that.
 *
 * `ranges` are the stretches that played since the last save, in seconds. The
 * route merges them into what is stored rather than trusting the browser's
 * total, so two tabs or a lost save cost at most the stretch they carried.
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
    const stored = parsePlayback(await readPreference(db, key, owner));
    const { playback, crossed } = applySave(stored, save, new Date().toISOString());
    // The event first: if the preference write then fails, the next save
    // finds no `watchedAt` and appends again, which is a duplicate day of
    // study at worst. The other order could lose the event for good.
    if (crossed) await appendEvent(db, { type: "watched", asset: row.id, kind: row.kind }, owner);
    await writePreference(db, key, playback, owner);
    return {
      assetId: row.id,
      coverage: coverage(playback.ranges, playback.duration),
      watchedAt: playback.watchedAt,
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
