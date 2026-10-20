import { readFile } from "node:fs/promises";

import { assemblePdf, type PdfPageInput } from "./document";
import { extractPageFrame, probeDuration } from "./extract";
import { pagePlan, type PdfSegment } from "./recipe";

/**
 * Making one video's PDF on the laptop: read its transcript sidecar for the
 * beats, cut one frame per page, set the pages in a document.
 *
 * The caller (`catalog asset upload`, `catalog video put`) hands over the
 * video file and where its transcript would sit; everything the recipe
 * decides — page timestamps, frame size, page geometry — lives in
 * `recipe.ts`. A video whose transcript cannot be read or parsed gets the
 * silent cadence rather than a refusal: a PDF with bare frames is a worse
 * read than a narrated one, but it is the same PDF the video is.
 */

export const PDF_MAX_BYTES = 128 * 1024 * 1024;

export type PdfResult =
  | { ok: true; body: Buffer; pages: number }
  | { ok: false; reason: string };

/** The transcript sidecar's `segments[]`, as far as this feature reads them. */
function segmentsOf(raw: unknown): PdfSegment[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const segments = (raw as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return null;
  const out: PdfSegment[] = [];
  for (const s of segments) {
    if (typeof s !== "object" || s === null) continue;
    const seg = s as { start?: unknown; end?: unknown; text?: unknown };
    if (typeof seg.start !== "number" || typeof seg.end !== "number") continue;
    out.push({ start: seg.start, end: seg.end, text: typeof seg.text === "string" ? seg.text.trim() : "" });
  }
  return out;
}

/** The segments a transcript's text lists, or null when it does not parse as one. */
export function segmentsFromText(text: string): PdfSegment[] | null {
  try {
    return segmentsOf(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The segments a transcript file lists, or null when there is no readable one. */
export async function readSegments(transcriptFile: string | null): Promise<PdfSegment[] | null> {
  if (transcriptFile === null) return null;
  try {
    return segmentsFromText(await readFile(transcriptFile, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The PDF for `videoFile`: pages from `segments` (null for a silent cut's
 * cadence), one frame each, assembled with `title` in the header. Returns
 * `ok: false` with the reason when no frame could be cut or the document
 * could not be written.
 */
export async function buildVideoPdf(
  ffmpeg: string,
  videoFile: string,
  title: string,
  segments: readonly PdfSegment[] | null,
): Promise<PdfResult> {
  // The plan needs a duration only for a silent cut; probe lazily so a
  // narrated video never waits on a second ffmpeg spawn. A failed probe is
  // `ok: false` like a failed frame, never a thrown failure — the PDF is a
  // companion whose absence is a note, not a stopped upload.
  let duration: number | null = null;
  if (segments === null || segments.length === 0) {
    try {
      duration = await probeDuration(ffmpeg, videoFile);
    } catch (error) {
      return { ok: false, reason: `the duration could not be probed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  const plan = pagePlan(segments, duration);
  if (plan.length === 0) {
    return {
      ok: false,
      reason:
        segments === null || segments.length === 0
          ? "no transcript to page on and no duration to spread frames over"
          : "no usable segment timestamps",
    };
  }

  const pages: PdfPageInput[] = [];
  let bytes = 0;
  for (const { at, caption } of plan) {
    const frame = await extractPageFrame(ffmpeg, videoFile, at);
    if (!frame.ok) return { ok: false, reason: `page ${pages.length + 1} (${at}s): ${frame.reason}` };
    bytes += frame.body.length;
    if (bytes > PDF_MAX_BYTES) {
      return { ok: false, reason: `frames pass ${PDF_MAX_BYTES} bytes at page ${pages.length + 1}; the rest is not cut` };
    }
    pages.push({ jpeg: frame.body, caption });
  }

  try {
    return { ok: true, body: await assemblePdf(title, pages), pages: pages.length };
  } catch (error) {
    return { ok: false, reason: `the document could not be written: ${error instanceof Error ? error.message : String(error)}` };
  }
}
