/**
 * The shapes manimkc writes beside a narrated video, and the arithmetic the
 * media components do over them.
 *
 * `manimkc build` lays every scene of a deliverable end to end and writes
 * three sidecars next to `<name>.mp4`:
 *
 * ```
 * <name>.transcript.json  { video, duration, chapters: [...], segments: [...] }
 * <name>.chapters.json    the same chapter list on its own
 * <name>.vtt              the segments as WebVTT cues, split to player width
 * ```
 *
 * A segment is `{ scene, start, end, text }` and a chapter is
 * `{ scene, title, start, end }`, every time in seconds from the first frame
 * of the joined video. Those are the shapes below; nothing here invents a
 * field the tool does not write.
 *
 * This module is deliberately pure and React-free. The components are the
 * only thing in this directory that renders, so the index arithmetic can be
 * tested without a DOM.
 */

/**
 * One spoken line, from `transcript.json`'s `segments`.
 *
 * `scene` is optional even though manimkc always writes it: the panel never
 * reads it, and a caller that built its cues from the `.vtt` track instead has
 * no scene to give.
 */
export interface TranscriptCue {
  scene?: string;
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
}

/** One scene of the joined video, from `chapters.json`. */
export interface VideoChapter {
  scene?: string;
  title: string;
  /** Seconds from the start of the video. */
  start: number;
  end: number;
}

/**
 * `m:ss`, or `h:mm:ss` once a video runs past an hour. Anything that is not a
 * finite, non-negative number reads as the start, which is what a missing or
 * half-loaded `currentTime` should look like rather than `NaN:aN`.
 */
export function formatTimecode(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * Which entry is current at `time`: the latest one that has already started.
 *
 * Deliberately not "the entry whose span contains `time`". Narration leaves
 * gaps between lines, and a highlight that blinks out during every pause is
 * worse to read along with than one that rests on the line just spoken. The
 * answer is `-1` only before the first entry starts.
 *
 * Reads the whole list rather than trusting it to be sorted: the files are
 * written in playback order, but a caller that filtered or concatenated two of
 * them should not get a silently wrong highlight.
 */
function currentIndex(entries: readonly { start: number }[], time: number): number {
  const at = Number.isFinite(time) ? time : 0;
  let best = -1;
  let bestStart = -Infinity;
  for (let i = 0; i < entries.length; i += 1) {
    const start = entries[i].start;
    if (start <= at && start >= bestStart) {
      best = i;
      bestStart = start;
    }
  }
  return best;
}

/** The transcript line to highlight at `time`, or `-1` before the first one. */
export function activeCueIndex(cues: readonly TranscriptCue[], time: number): number {
  return currentIndex(cues, time);
}

/** The chapter playing at `time`, or `-1` before the first one starts. */
export function activeChapterIndex(
  chapters: readonly VideoChapter[],
  time: number,
): number {
  return currentIndex(chapters, time);
}
