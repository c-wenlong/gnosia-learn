/**
 * The video-as-document recipe: which frames become pages, how big, encoded
 * how. `catalog asset upload` and `catalog video put` each make one PDF per
 * video on the laptop with it and store it as a blob (the poster's sibling,
 * docs/CONTENT-MIGRATION.md Track E), and the web app serves that blob inline.
 *
 * Pure: no spawn, no filesystem. The web app takes `PDF_CONTENT_TYPE`
 * through `@gnosia/catalog/state`, the package's one door.
 */

/**
 * One page per narration beat, not per scene and not per second.
 *
 * A narrated render's transcript sidecar already cuts the video into beats:
 * every `voiceover(...)` block one segment, each with the seconds it speaks
 * and the words spoken. That is exactly what a slide is — the screen while a
 * line plays — so a segment is the page unit, and the words are its caption.
 * `chapters.json` is too coarse (one row per scene, often a single row for a
 * whole render) and a fixed cadence ignores where the beats land, so the
 * transcript is the source and chapters are never consulted.
 *
 * The frame is the segment's **midpoint**. A beat opens with a fade or a
 * transform still settling (the poster recipe's "not the first frame" argues
 * the same), and its end is the next beat's fade; the middle is the screen
 * the words describe. `thumbnail=n=60` then picks the least average frame of
 * about two seconds around it, which is what keeps a page off a cross-fade
 * even when the beat is short.
 *
 * A **silent cut has no transcript and no beats to page on**, so it gets a
 * fixed cadence instead: one frame every `PDF_SILENT_EVERY_SECONDS`, up to
 * `PDF_MAX_PAGES` pages — a storyboard rather than a reading, and the honest
 * answer for a video with no words.
 */
export const PDF_SILENT_EVERY_SECONDS = 15;
export const PDF_MAX_PAGES = 120;

/** A transcript sidecar's one narration beat: when it plays, what it says. */
export interface PdfSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * The page plan for a video: the timestamp to frame and the caption under it.
 * `segments` comes from the transcript sidecar; null or empty means a silent
 * cut, paged on the cadence above for `durationSeconds` (null when even that
 * cannot be known — no pages, and no PDF).
 */
export function pagePlan(
  segments: readonly PdfSegment[] | null,
  durationSeconds: number | null,
): { at: number; caption: string }[] {
  if (segments !== null && segments.length > 0) {
    const pages = segments.slice(0, PDF_MAX_PAGES).map((s) => ({
      at: s.start + (s.end - s.start) / 2,
      caption: s.text,
    }));
    return pages.filter((p) => Number.isFinite(p.at));
  }
  if (durationSeconds === null || !(durationSeconds > 0)) return [];
  const every = Math.max(PDF_SILENT_EVERY_SECONDS, durationSeconds / PDF_MAX_PAGES);
  // Shorter than the cadence: one page at the middle, so even a clip of a
  // few seconds is a document of a page rather than none at all.
  if (durationSeconds <= every) return [{ at: durationSeconds / 2, caption: "" }];
  const pages: { at: number; caption: string }[] = [];
  for (let at = every / 2; at < durationSeconds; at += every) pages.push({ at, caption: "" });
  return pages;
}

/**
 * How wide the frame on a page is, and what it is encoded as.
 *
 * The page is 960pt wide and the frame spans it edge to edge, so a pixel is
 * a point at 72dpi and 1280 gives the built-in viewer about 1.3x to zoom into
 * before the JPEG shows grain. Wider costs bytes on every page of every
 * video for sharpness nobody scrolls to; narrower softens the small text a
 * manim frame carries. JPEG for the same reason the poster is: a 1280px PNG
 * of a frame is a megabyte, and sixty of them is a document that does not
 * open; mjpeg is in every ffmpeg, which is what a feature that degrades
 * quietly needs.
 */
export const PDF_FRAME_WIDTH = 1280;
export const PDF_FRAME_QUALITY = 4;
export const PDF_CONTENT_TYPE = "application/pdf";
export const PDF_EXTENSION = ".pdf";

/**
 * Page geometry, in points (1/72"). The frame is full-bleed 16:9 across the
 * top, so the page is the video paused mid-beat with the beat's words under
 * it: `PAGE_HEIGHT` is the frame's 540 plus the strip below it. The caption
 * is clipped after `CAPTION_MAX_LINES` — a beat's line is two to four
 * sentences, and what does not fit in four lines is a wall of text no reader
 * asked a PDF for.
 */
export const PAGE_WIDTH = 960;
export const PAGE_FRAME_HEIGHT = (PAGE_WIDTH * 9) / 16;
export const PAGE_HEIGHT = PAGE_FRAME_HEIGHT + 118;
export const HEADER_Y = PAGE_HEIGHT - 30;
export const CAPTION_X = 28;
export const CAPTION_WIDTH = PAGE_WIDTH - CAPTION_X * 2;
export const CAPTION_TOP = PAGE_HEIGHT - PAGE_FRAME_HEIGHT - 34;
export const CAPTION_SIZE = 11.5;
export const CAPTION_LEADING = 15;
export const CAPTION_MAX_LINES = 5;
export const HEADER_SIZE = 9;

/**
 * The argument array for one page's frame at `at` seconds, to stdout.
 *
 * `file` is a file the caller chose and is passed as its own array element.
 * `-ss` before `-i` is input seeking (keyframes, not a decode from the
 * start), which is what keeps sixty pages of a twenty-minute video from
 * costing sixty full decodes. `thumbnail=n=60` reads about two seconds and
 * keeps the frame least like their average — the poster's defence against
 * landing on a cross-fade or a blank. `format=yuvj420p` is not decoration:
 * without it mjpeg refuses a limited-range source outright and writes
 * nothing at all.
 */
export function ffmpegPageArgs(file: string, atSeconds: number): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(atSeconds),
    "-i",
    file,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-frames:v",
    "1",
    "-vf",
    `thumbnail=n=60,scale=${PDF_FRAME_WIDTH}:-2,format=yuvj420p`,
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-q:v",
    String(PDF_FRAME_QUALITY),
    "-",
  ];
}
