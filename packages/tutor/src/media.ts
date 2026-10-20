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

/**
 * The label beside the transcript's heading: "3 / 25" once a line is being spoken, and
 * "25 lines" before any has been.
 *
 * `active` is `-1` until the first cue starts, which on a video at rest is
 * every page load. There is no position to report then, and each number that
 * could stand in for one says something false: "0 / 25" names a line that does
 * not exist, "1 / 25" says the reader is on a line nobody has heard yet, and a
 * dash in the slot reads as a value that failed to load. So before playback
 * the label describes the transcript instead of a place in it, and turns into
 * a position the moment there is one. Hiding it would work too, but the length
 * is worth knowing before pressing play.
 *
 * `TranscriptPanel` renders it; `TranscriptPanel.test.ts` pins both shapes.
 */
export function transcriptCounter(active: number, total: number): string {
  if (active < 0) return `${total} ${total === 1 ? "line" : "lines"}`;
  return `${active + 1} / ${total}`;
}

/** The chapter playing at `time`, or `-1` before the first one starts. */
export function activeChapterIndex(
  chapters: readonly VideoChapter[],
  time: number,
): number {
  return currentIndex(chapters, time);
}

/** One stretch of the scrub bar: a chapter, or the untitled lead-in before the first. */
export interface BarSegment {
  start: number;
  end: number;
  /** The chapter's title, or null for a stretch no chapter covers. */
  title: string | null;
  /** The chapter's index in the list it came from, or -1. */
  chapter: number;
}

/**
 * The scrub bar cut into chapters, the way YouTube draws it: every second of
 * `[0, duration]` in exactly one segment, in order.
 *
 * Each chapter runs from its own start to the next chapter's start (or the
 * end), so the narration gaps `currentIndex` already tolerates never show as
 * holes in the bar. A chapter that starts past the end is dropped, and a first
 * chapter that starts late leaves an untitled lead-in rather than stretching
 * backwards. With no chapters, or no known duration, the bar is one segment.
 */
export function chapterSegments(
  chapters: readonly VideoChapter[] | undefined,
  duration: number,
): BarSegment[] {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const starts = (chapters ?? [])
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => Number.isFinite(chapter.start) && chapter.start < length)
    .sort((a, b) => a.chapter.start - b.chapter.start);
  if (length === 0 || starts.length === 0) {
    return [{ start: 0, end: length, title: null, chapter: -1 }];
  }
  const out: BarSegment[] = [];
  const first = Math.max(0, starts[0].chapter.start);
  if (first > 0) out.push({ start: 0, end: first, title: null, chapter: -1 });
  starts.forEach(({ chapter, index }, i) => {
    const start = Math.max(0, chapter.start);
    const end = i + 1 < starts.length ? Math.max(0, starts[i + 1].chapter.start) : length;
    if (end > start) out.push({ start, end, title: chapter.title, chapter: index });
  });
  return out;
}

/** The longest caption shown at once, in characters: about two lines. */
export const CAPTION_CHARS = 84;

/**
 * A spoken line cut into captions of at most `maxChars`, each with its share
 * of the line's time.
 *
 * manimkc's transcript cues are whole narrated paragraphs, which as one
 * caption would cover a third of the picture. So the words are packed into
 * captions greedily, closing a caption early at the end of a sentence or
 * clause once it is half full, and the line's span is shared out by length:
 * narration runs at a steady pace, so characters are a fair clock.
 */
export function captionChunks(cue: TranscriptCue, maxChars = CAPTION_CHARS): TranscriptCue[] {
  const words = cue.text.split(/\s+/).filter(Boolean);
  const texts: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current === "" ? word : `${current} ${word}`;
    if (next.length > maxChars && current !== "") {
      texts.push(current);
      current = word;
    } else {
      current = next;
    }
    if (/[.!?;:,]$/.test(word) && current.length >= maxChars / 2) {
      texts.push(current);
      current = "";
    }
  }
  if (current !== "") texts.push(current);

  const total = texts.reduce((sum, text) => sum + text.length, 0);
  const span = cue.end - cue.start;
  let at = cue.start;
  return texts.map((text, i) => {
    const end = i === texts.length - 1 ? cue.end : at + (span * text.length) / total;
    const chunk = { start: at, end, text };
    at = end;
    return chunk;
  });
}

/**
 * The caption to show at `time`, or null between lines.
 *
 * Unlike `activeCueIndex`, this is the cue whose span contains `time`: a
 * caption that stays up through a pause in the narration reads as the video
 * still talking. When two cues overlap, the later start wins. The cue is then
 * cut by `captionChunks` and the piece being spoken is returned.
 */
export function subtitleAt(cues: readonly TranscriptCue[], time: number): string | null {
  let best: TranscriptCue | null = null;
  for (const cue of cues) {
    if (cue.start <= time && time < cue.end && (best === null || cue.start >= best.start)) best = cue;
  }
  if (best === null) return null;
  const chunks = captionChunks(best);
  return (chunks.find((chunk) => time < chunk.end) ?? chunks[chunks.length - 1])?.text ?? null;
}

/** Seconds one arrow press moves the playhead. */
export const SKIP_STEP = 5;

/** How long the skip flash stays up after the last press, in milliseconds. */
export const SKIP_FLASH_MS = 1000;

/**
 * The "+5 ›" or "‹ −5" the player flashes on an arrow press. `shown` goes
 * false when the flash times out, and the rest is kept so it fades out with
 * the number it had rather than blanking first.
 */
export interface SkipFlash {
  direction: 1 | -1;
  /** The total of every press in this run, always a multiple of `SKIP_STEP`. */
  seconds: number;
  shown: boolean;
}

/**
 * The flash after one more press. A press in the same direction while the
 * last flash is still up adds to its total, as a video site does; a press
 * after it went, or the other way, starts a new run at one step.
 */
export function nextSkip(prev: SkipFlash | null, direction: 1 | -1): SkipFlash {
  const running = prev !== null && prev.shown && prev.direction === direction;
  return { direction, seconds: running ? prev.seconds + SKIP_STEP : SKIP_STEP, shown: true };
}

/** What the flash reads: "+ 10" forward, "− 10" back, with a true minus. */
export function skipLabel(flash: SkipFlash): string {
  return `${flash.direction > 0 ? "+" : "−"} ${flash.seconds}`;
}
