/**
 * Where a learner is in a library video, and how much of it they have seen.
 *
 * Pure and React-free, so the route that stores it, the page that reads it and
 * the player that records it share one definition of "watched".
 *
 * **Watched is coverage, not position.** A reader who drags the scrubber to the
 * last second has not watched the video, so the store keeps the stretches that
 * actually played (`ranges`, merged, in seconds) and the verdict is how much of
 * the duration they cover. `position` is only where to resume.
 *
 * Stored as one `preference` row per asset, keyed `playback:<asset id>`: the
 * table is the learner state's key/value corner, it already travels with the
 * learner export, and nothing joins on a resume point, so a migration for it
 * would be a table with one reader.
 */

/** Seconds of the video that played, as `[start, end]` with `start < end`. */
export type Range = [number, number];

export type Playback = {
  /** Where the reader was, in seconds. */
  position: number;
  /** The video's length as the browser reported it, in seconds. */
  duration: number;
  /** The stretches that played, merged and sorted. */
  ranges: Range[];
  /** When coverage first reached `WATCHED_FRACTION`, as an ISO instant, or null. */
  watchedAt: string | null;
  /** When this row was last written, as an ISO instant. */
  updatedAt: string;
};

/** How much of a video has to have played before it counts as watched. */
export const WATCHED_FRACTION = 0.9;

/** Within this many seconds of the end, the next visit starts from the top. */
export const RESUME_TAIL_SECONDS = 10;

/** Before this many seconds, there is nothing worth resuming. */
export const RESUME_HEAD_SECONDS = 5;

/** Longest video accepted, in seconds. A bound on a number a browser sends. */
export const MAX_DURATION_SECONDS = 24 * 60 * 60;

/** Most ranges one save may carry, and most the store keeps. */
export const MAX_RANGES = 500;

export function playbackKey(assetId: string): string {
  return `playback:${assetId}`;
}

/** Sort and merge overlapping or touching ranges, dropping empty ones. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = ranges
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .map(([start, end]): Range => [start, end])
    .sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    // Touching counts as one: a save every few seconds ends one range exactly
    // where the next begins, and those are one stretch of watching.
    if (last !== undefined && range[0] <= last[1] + 0.5) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      out.push(range);
    }
  }
  return out;
}

/** Clip every range into `[0, duration]`. */
export function clampRanges(ranges: readonly Range[], duration: number): Range[] {
  return mergeRanges(
    ranges.map(([start, end]): Range => [Math.max(0, start), Math.min(duration, end)]),
  );
}

/** The fraction of `duration` the ranges cover, 0 to 1. */
export function coverage(ranges: readonly Range[], duration: number): number {
  if (!(duration > 0)) return 0;
  let seconds = 0;
  for (const [start, end] of clampRanges(ranges, duration)) seconds += end - start;
  return Math.min(1, seconds / duration);
}

/**
 * Where a video should start: the saved position, unless it is so near either
 * end that resuming there would be a surprise rather than a help.
 */
export function resumeAt(playback: Pick<Playback, "position" | "duration"> | null): number {
  if (playback === null) return 0;
  const { position, duration } = playback;
  if (!(position >= RESUME_HEAD_SECONDS)) return 0;
  if (duration > 0 && position >= duration - RESUME_TAIL_SECONDS) return 0;
  return position;
}

/**
 * A stored value read back as a `Playback`, or null when it is not one. The
 * row is jsonb the route wrote, but a hand-edited or older row is still read
 * rather than trusted.
 */
export function parsePlayback(value: unknown): Playback | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const { position, duration } = raw;
  if (typeof position !== "number" || !Number.isFinite(position) || position < 0) return null;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return null;
  const ranges = Array.isArray(raw.ranges) ? raw.ranges.filter(isRange) : [];
  return {
    position,
    duration,
    ranges: clampRanges(ranges, duration),
    watchedAt: typeof raw.watchedAt === "string" ? raw.watchedAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

export function isRange(value: unknown): value is Range {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * Fold one save into what is stored. `now` is the instant of the save; the
 * result says whether this is the save that crossed `WATCHED_FRACTION`, which
 * is the one moment the caller appends a `watched` event.
 */
export function applySave(
  stored: Playback | null,
  save: { position: number; duration: number; ranges: readonly Range[] },
  now: string,
): { playback: Playback; crossed: boolean } {
  const duration = save.duration;
  const ranges = clampRanges([...(stored?.ranges ?? []), ...save.ranges], duration).slice(
    0,
    MAX_RANGES,
  );
  const fraction = coverage(ranges, duration);
  const crossed = stored?.watchedAt == null && fraction >= WATCHED_FRACTION;
  return {
    playback: {
      position: Math.min(Math.max(0, save.position), duration),
      duration,
      ranges,
      watchedAt: crossed ? now : (stored?.watchedAt ?? null),
      updatedAt: now,
    },
    crossed,
  };
}
