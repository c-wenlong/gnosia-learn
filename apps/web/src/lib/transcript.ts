import type { TranscriptCue, VideoChapter } from "@/components/media";

/**
 * Reading manimkc's `transcript.json` and `chapters.json` back, defensively.
 *
 * The shapes themselves are documented in `@/components/media`: a transcript is
 * `{ video, duration, chapters: [...], segments: [...] }`, a segment is
 * `{ scene, start, end, text }`, a chapter is `{ scene, title, start, end }`.
 * That module holds the arithmetic the components do; this one holds the step
 * before it, turning bytes off disk into those shapes or admitting it cannot.
 *
 * **A sidecar is a file, and a file is not a promise.** These land beside a
 * render as JSON written by a tool in another repository, and the catalog rows
 * pointing at them can be older than the files themselves. So nothing below
 * trusts a field to exist, to be a number, or to be finite. The whole point is
 * that a truncated or half-written transcript costs the transcript panel and
 * nothing else: a page that threw on `JSON.parse` would take a working video
 * player down with it, and that trade is never worth making.
 *
 * **Bad entries are dropped, not repaired.** A cue with no text and a chapter
 * with no title carry nothing to show, and inventing `"(untitled)"` for them
 * would put words on screen that are in no file. What is kept is reported
 * alongside what was found, so a caller can say "23 of 25 lines" rather than
 * quietly showing fewer than the file holds.
 *
 * Pure and React-free, like the module it borrows its types from, so the
 * parsing is tested without a DOM, a database or a filesystem.
 */

/** What came out of one sidecar, and how much of it was usable. */
export interface ParsedTranscript {
  chapters: VideoChapter[];
  cues: TranscriptCue[];
  /** Entries the file held that this refused. Zero is the normal answer. */
  dropped: number;
}

/** An empty parse: a file that held nothing usable, as opposed to no file at all. */
export const EMPTY_TRANSCRIPT: ParsedTranscript = { chapters: [], cues: [], dropped: 0 };

/**
 * A finite, non-negative number, or null.
 *
 * Rejects `NaN` and both infinities, which `typeof x === "number"` happily
 * admits and which would reach `formatTimecode` and the highlight arithmetic as
 * a timestamp nothing sorts against. A negative start is a file describing a
 * moment before the video began, so it is refused rather than clamped.
 */
function seconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A non-empty string once trimmed, or null. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** A scene name if the file has one, undefined otherwise. The panel never reads it. */
function scene(value: unknown): string | undefined {
  return text(value) ?? undefined;
}

/**
 * `end` defaults to `start` when the file omits it or writes it backwards.
 *
 * Nothing in the components reads `end` — both `activeCueIndex` and
 * `activeChapterIndex` deliberately use "the latest entry that has started", so
 * that a highlight rests through a pause in the narration rather than blinking
 * out. A missing `end` therefore costs nothing to show, and refusing the whole
 * entry over a field nobody reads would lose a line that has everything that
 * matters. An `end` before its `start` is the same case: it is not usable, so
 * it is not kept.
 */
function span(raw: Record<string, unknown>, start: number): number {
  const end = seconds(raw.end);
  return end !== null && end >= start ? end : start;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One `segments` entry, or null when it has no time or no words. */
function toCue(raw: unknown): TranscriptCue | null {
  if (!isRecord(raw)) return null;
  const start = seconds(raw.start);
  const line = text(raw.text);
  if (start === null || line === null) return null;
  return { scene: scene(raw.scene), start, end: span(raw, start), text: line };
}

/** One `chapters` entry, or null when it has no time or no title. */
function toChapter(raw: unknown): VideoChapter | null {
  if (!isRecord(raw)) return null;
  const start = seconds(raw.start);
  const title = text(raw.title);
  if (start === null || title === null) return null;
  return { scene: scene(raw.scene), title, start, end: span(raw, start) };
}

/** Map, drop the nulls, and count what was dropped. */
function collect<T>(raw: unknown, one: (entry: unknown) => T | null): { kept: T[]; dropped: number } {
  if (!Array.isArray(raw)) return { kept: [], dropped: 0 };
  const kept: T[] = [];
  let dropped = 0;
  for (const entry of raw) {
    const parsed = one(entry);
    if (parsed === null) dropped += 1;
    else kept.push(parsed);
  }
  return { kept, dropped };
}

/**
 * `transcript.json` as a component can use it, or null when the bytes are not
 * that file at all.
 *
 * Null is reserved for "this is not a transcript": unparseable JSON, or a
 * top-level value that is not an object. A transcript whose `segments` is
 * missing, empty or entirely unusable comes back as a real result with no cues,
 * because "the file is here and says nothing" and "there is no file" are
 * different things and the panel already has different words for them.
 *
 * `chapters` is read from the same file rather than from `chapters.json`
 * beside it: manimkc writes the chapter list into both, so one read answers
 * both questions and the two can never be half a version apart on screen.
 */
export function parseTranscript(raw: string): ParsedTranscript | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const chapters = collect(value.chapters, toChapter);
  const cues = collect(value.segments, toCue);
  return {
    chapters: chapters.kept,
    cues: cues.kept,
    dropped: chapters.dropped + cues.dropped,
  };
}

/**
 * `chapters.json` on its own: the same list, as a bare array.
 *
 * The fallback for a video whose `.transcript.json` is missing or unreadable
 * while its `.chapters.json` is fine. Both sidecars are separate `asset` rows
 * and either can be absent, so neither is allowed to be the only way to get a
 * chapter rail.
 */
export function parseChapters(raw: string): VideoChapter[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  return collect(value, toChapter).kept;
}
