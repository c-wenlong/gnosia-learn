import type { TranscriptCue, VideoChapter } from "@gnosia/tutor/media";

/**
 * A video's captions and chapters as the player's transcript takes them:
 * a WebVTT parser, and a reader for manimkc's `<slug>.transcript.json`.
 * Pure, so the parsing is a test and the player only renders it.
 */

/** `00:01:02.500` or `01:02.500` in seconds, or NaN. */
function vttSeconds(stamp: string): number {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(stamp.trim());
  if (match === null) return Number.NaN;
  const [, h, m, s, ms] = match;
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number((ms ?? "0").padEnd(3, "0")) / 1000;
}

/**
 * The cues of a WebVTT file, as the player's transcript takes them.
 *
 * manimkc writes the `.vtt` from the transcript's segments, split to player
 * width, so it is the transcript when the runner serves nothing richer. Cue
 * identifiers, `NOTE` and `STYLE` blocks and cue settings are skipped, and
 * tags such as `<v Narrator>` are stripped from the text.
 */
export function parseVtt(text: string): TranscriptCue[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    const timing = lines.findIndex((line) => line.includes("-->"));
    if (timing < 0) continue;
    const [from, rest] = (lines[timing] ?? "").split("-->");
    const to = (rest ?? "").trim().split(/\s+/)[0] ?? "";
    const start = vttSeconds(from ?? "");
    const end = vttSeconds(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const words = lines
      .slice(timing + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // Last, or `&amp;lt;` (a literal "&lt;") would decode twice into "<".
      .replace(/&amp;/g, "&")
      .trim();
    if (words === "") continue;
    cues.push({ start, end, text: words });
  }
  return cues;
}

/**
 * The transcript and chapters, from `<slug>.transcript.json` when the runner
 * serves it (`{ chapters, segments }`, manimkc's own shape), or null when the
 * body is not that.
 */
export function readTranscript(body: unknown): { chapters: VideoChapter[]; cues: TranscriptCue[] } | null {
  const raw = body as { chapters?: unknown; segments?: unknown } | null;
  if (raw === null || typeof raw !== "object") return null;
  const chapters = Array.isArray(raw.chapters)
    ? raw.chapters.flatMap((entry): VideoChapter[] => {
        const c = entry as Partial<VideoChapter> | null;
        if (c === null || typeof c.start !== "number" || typeof c.end !== "number") return [];
        return [{ scene: typeof c.scene === "string" ? c.scene : undefined, title: typeof c.title === "string" ? c.title : "", start: c.start, end: c.end }];
      })
    : [];
  const cues = Array.isArray(raw.segments)
    ? raw.segments.flatMap((entry): TranscriptCue[] => {
        const s = entry as Partial<TranscriptCue> | null;
        if (s === null || typeof s.start !== "number" || typeof s.end !== "number" || typeof s.text !== "string") return [];
        return [{ scene: typeof s.scene === "string" ? s.scene : undefined, start: s.start, end: s.end, text: s.text }];
      })
    : [];
  if (chapters.length === 0 && cues.length === 0) return null;
  return { chapters, cues };
}
