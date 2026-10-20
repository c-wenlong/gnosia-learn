import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, describe, expect, it } from "vitest";

import { buildVideoPdf, pdfInputs, readSegments, segmentsFromText } from "../src/pdf/build";
import { pdfInputsOf, toWinAnsi, wrapCaption } from "../src/pdf/document";
import { ffmpegPageArgs, pagePlan, PDF_MAX_PAGES, PDF_SILENT_EVERY_SECONDS } from "../src/pdf/recipe";

/**
 * The video-as-document recipe (services/catalog/src/pdf/): the page plan
 * pure and the build against a stand-in ffmpeg, so the suite runs on a
 * machine with no real binary. The stand-in prints a real 64x36 JPEG — the
 * document assembly refuses marker-shaped bytes that do not decode — and a
 * `Duration:` line on stderr for the silent cut's cadence.
 */

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==",
  "base64",
);

const dir = await mkdtemp(path.join(tmpdir(), "pdf-test-"));
const ffmpeg = path.join(dir, "ffmpeg");
await writeFile(
  ffmpeg,
  `#!/bin/sh\necho '  Duration: 00:00:10.00, start: 0.000000, bitrate: 200 kb/s' >&2\necho '${JPEG.toString("base64")}' | base64 -d\n`,
);
chmodSync(ffmpeg, 0o755);
// An ffmpeg that exits 1 and prints nothing: "no frame there".
const noFfmpeg = path.join(dir, "ffmpeg-none");
await writeFile(noFfmpeg, "#!/bin/sh\nexit 1\n");
chmodSync(noFfmpeg, 0o755);
const VIDEO = path.join(dir, "video.mp4");
await writeFile(VIDEO, "the render's bytes");

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("pagePlan", () => {
  it("pages a narrated video at each segment's midpoint", () => {
    const plan = pagePlan(
      [
        { start: 2, end: 8, text: "first" },
        { start: 8, end: 12, text: "second" },
      ],
      60,
    );
    expect(plan).toEqual([
      { at: 5, caption: "first" },
      { at: 10, caption: "second" },
    ]);
  });

  it("caps the beats at the page limit", () => {
    const segments = Array.from({ length: PDF_MAX_PAGES + 10 }, (_, i) => ({
      start: i * 10,
      end: i * 10 + 5,
      text: `beat ${i}`,
    }));
    expect(pagePlan(segments, null)).toHaveLength(PDF_MAX_PAGES);
  });

  it("drops a beat whose midpoint is not a number", () => {
    const plan = pagePlan([{ start: Number.NaN, end: 4, text: "broken" }], 10);
    expect(plan).toEqual([]);
  });

  it("spreads a silent cut's frames over its duration", () => {
    const plan = pagePlan(null, 60);
    // One page every fifteen seconds, centred in each stretch.
    expect(plan.map((p) => p.at)).toEqual([
      PDF_SILENT_EVERY_SECONDS / 2,
      PDF_SILENT_EVERY_SECONDS * 1.5,
      PDF_SILENT_EVERY_SECONDS * 2.5,
      PDF_SILENT_EVERY_SECONDS * 3.5,
    ]);
    expect(plan.every((p) => p.caption === "")).toBe(true);
  });

  it("spreads thin rather than past the cap on a long silent cut", () => {
    const plan = pagePlan(null, PDF_SILENT_EVERY_SECONDS * (PDF_MAX_PAGES + 1) * 2);
    expect(plan.length).toBeLessThanOrEqual(PDF_MAX_PAGES);
  });

  it("makes no pages for a silent cut whose length is not known", () => {
    expect(pagePlan(null, null)).toEqual([]);
    expect(pagePlan([], 0)).toEqual([]);
  });
});

describe("ffmpegPageArgs", () => {
  it("input-seeks to the page's timestamp and writes one mjpeg frame", () => {
    const args = ffmpegPageArgs("/path/to/video.mp4", 42.5);
    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("42.5");
    expect(args).toContain("-i");
    expect(args[args.indexOf("-i") + 1]).toBe("/path/to/video.mp4");
    expect(args).toContain("mjpeg");
    expect(args.at(-1)).toBe("-");
  });
});

describe("wrapCaption", () => {
  const font = async () => (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);

  it("breaks a caption at the given width", async () => {
    const f = await font();
    const lines = wrapCaption(
      "The invariant: the left part of the array is always sorted, and every element there started smaller than the ones to its right.",
      f,
      11.5,
      300,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(f.widthOfTextAtSize(line, 11.5)).toBeLessThanOrEqual(300);
  });

  it("clips a long caption with an ellipsis on its last line", async () => {
    const words = Array.from({ length: 200 }, () => "persistence").join(" ");
    const lines = wrapCaption(words, await font());
    expect(lines).toHaveLength(5);
    expect(lines[4]?.endsWith("…")).toBe(true);
  });
});

describe("readSegments", () => {
  it("reads the transcript sidecar's beats, trimmed", async () => {
    const file = path.join(dir, "video.transcript.json");
    await writeFile(
      file,
      JSON.stringify({
        segments: [
          { start: 0, end: 3, text: "  a line  " },
          { start: 3, end: 6 },
          { start: 6, end: 9, text: "another" },
        ],
      }),
    );
    // A beat with no text is still a beat: its page is the frame alone.
    expect(await readSegments(file)).toEqual([
      { start: 0, end: 3, text: "a line" },
      { start: 3, end: 6, text: "" },
      { start: 6, end: 9, text: "another" },
    ]);
  });

  it("answers null for no file, an unreadable one, or one that is not a transcript", async () => {
    expect(await readSegments(null)).toBeNull();
    expect(await readSegments(path.join(dir, "missing.json"))).toBeNull();
    const bad = path.join(dir, "bad.json");
    await writeFile(bad, "not json {");
    expect(await readSegments(bad)).toBeNull();
    const shapeless = path.join(dir, "shapeless.json");
    await writeFile(shapeless, JSON.stringify({ cues: [] }));
    expect(await readSegments(shapeless)).toBeNull();
  });

  it("skips an item that is not a segment rather than throwing on it", () => {
    // `{"segments":[null]}` reached the field reads before the type check once;
    // a malformed transcript must be a silent plan, never a stopped upload.
    expect(segmentsFromText(JSON.stringify({ segments: [null, { start: 0, end: 4, text: "kept" }, "x", 7] }))).toEqual([
      { start: 0, end: 4, text: "kept" },
    ]);
    expect(segmentsFromText("not json {")).toBeNull();
    expect(segmentsFromText(JSON.stringify({ segments: [null] }))).toEqual([]);
  });
});

describe("buildVideoPdf", () => {
  it("makes a page per narration beat, and the same bytes twice", async () => {
    const segments = [
      { start: 0, end: 4, text: "one" },
      { start: 4, end: 10, text: "two" },
    ];
    const made = await buildVideoPdf(ffmpeg, VIDEO, "aa11", "A demo", segments, "local/bb22.json");
    expect(made.ok).toBe(true);
    if (made.ok !== true) return;
    expect(made.pages).toBe(2);
    expect(made.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const again = await buildVideoPdf(ffmpeg, VIDEO, "aa11", "A demo", segments, "local/bb22.json");
    expect(again.ok && again.body.equals(made.body)).toBe(true);
    const other = await buildVideoPdf(ffmpeg, VIDEO, "aa11", "Another title", segments, "local/bb22.json");
    expect(other.ok && !other.body.equals(made.body)).toBe(true);
  });

  it("writes the inputs it was made from into the document, and reads them back", async () => {
    const segments = [{ start: 0, end: 4, text: "one" }];
    const made = await buildVideoPdf(ffmpeg, VIDEO, "aa11", "A demo", segments, "local/bb22.json");
    expect(made.ok).toBe(true);
    if (made.ok !== true) return;
    // The fingerprint is the document's own word on its inputs: a transcript
    // rewritten to the same segments reads as the same document.
    expect(made.inputs).toBe(pdfInputs("aa11", "A demo", "local/bb22.json"));
    expect(await pdfInputsOf(made.body)).toBe(made.inputs);
    expect(await pdfInputsOf(made.body)).not.toBe(pdfInputs("aa11", "A demo", null));
    expect(await pdfInputsOf(Buffer.from("not a pdf"))).toBeNull();
  });

  it("prints a caption WinAnsi cannot carry rather than refusing the document", async () => {
    // A transcript beat once held a non-breaking hyphen (U+2011), and
    // standard Helvetica's refusal to encode it refused the whole PDF.
    const f = await (async () => (await PDFDocument.create()).embedFont(StandardFonts.Helvetica))();
    expect(toWinAnsi("a non‑breaking hyphen, an arrow →, and an emoji 🎬", f)).toBe(
      "a non-breaking hyphen, an arrow ->, and an emoji ",
    );
    const segments = [{ start: 0, end: 4, text: "a non‑breaking hyphen and an emoji 🎬 →" }];
    const made = await buildVideoPdf(ffmpeg, VIDEO, "aa11", "A démo — already fine", segments, "local/bb22.json");
    expect(made.ok).toBe(true);
  });

  it("pages a silent cut on its duration's cadence", async () => {
    const made = await buildVideoPdf(ffmpeg, VIDEO, "aa11", "Silent", null, null);
    expect(made.ok).toBe(true);
    if (made.ok !== true) return;
    // Ten seconds at fifteen seconds a page: the one centred page.
    expect(made.pages).toBe(1);
  });

  it("says why when no frame can be cut", async () => {
    const made = await buildVideoPdf(noFfmpeg, VIDEO, "aa11", "Broken", [{ start: 0, end: 4, text: "x" }], "local/bb22.json");
    expect(made.ok).toBe(false);
    if (made.ok) return;
    expect(made.reason).toContain("page 1");
  });

  it("says why when the duration probe fails, rather than rejecting", async () => {
    // A silent cut probes first. A dead ffmpeg must be `ok: false` like a
    // dead frame cut, not a thrown failure the upload cannot continue past:
    // a clean exit with no Duration line plans no pages, and a binary that
    // cannot spawn at all comes back as the probe's reason.
    const quiet = await buildVideoPdf(noFfmpeg, VIDEO, "aa11", "Silent", null, null);
    expect(quiet.ok).toBe(false);
    if (quiet.ok) return;
    expect(quiet.reason).toContain("no duration to spread frames over");

    const dead = await buildVideoPdf(path.join(dir, "no-such-ffmpeg"), VIDEO, "aa11", "Silent", null, null);
    expect(dead.ok).toBe(false);
    if (dead.ok) return;
    expect(dead.reason).toContain("duration could not be probed");
  });
});
