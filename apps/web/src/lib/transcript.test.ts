import { describe, expect, it } from "vitest";
import { parseChapters, parseTranscript } from "./transcript";

/**
 * The fixture is the shape manimkc actually writes, trimmed: a `video`, a
 * `duration`, a `chapters` array and a `segments` array, with seconds measured
 * from the first frame of the joined render.
 */
const REAL = JSON.stringify({
  video: "cs3230_a1.mp4",
  duration: 336.0,
  chapters: [
    { scene: "AA1_Method", title: "Method", start: 0.0, end: 50.43 },
    { scene: "AA2_Logs", title: "Logs", start: 50.43, end: 126.1 },
  ],
  segments: [
    { scene: "AA1_Method", start: 0.2, end: 13.775, text: "This is a walkthrough." },
    { scene: "AA1_Method", start: 15.0, end: 30.9, text: "Take logs and compare." },
  ],
});

describe("parseTranscript", () => {
  it("reads the shape manimkc writes", () => {
    const parsed = parseTranscript(REAL);
    expect(parsed?.chapters).toEqual([
      { scene: "AA1_Method", title: "Method", start: 0, end: 50.43 },
      { scene: "AA2_Logs", title: "Logs", start: 50.43, end: 126.1 },
    ]);
    expect(parsed?.cues).toHaveLength(2);
    expect(parsed?.cues[0]).toEqual({
      scene: "AA1_Method",
      start: 0.2,
      end: 13.775,
      text: "This is a walkthrough.",
    });
    expect(parsed?.dropped).toBe(0);
  });

  it("returns null for bytes that are not a transcript", () => {
    expect(parseTranscript("")).toBeNull();
    expect(parseTranscript("{ truncated")).toBeNull();
    expect(parseTranscript("null")).toBeNull();
    expect(parseTranscript("[1, 2, 3]")).toBeNull();
    expect(parseTranscript('"a string"')).toBeNull();
  });

  it("distinguishes a transcript that says nothing from one that is not a transcript", () => {
    // Both keys missing is still a transcript file, so the panel can say "no
    // lines" rather than "could not read this".
    expect(parseTranscript("{}")).toEqual({ chapters: [], cues: [], dropped: 0 });
    expect(parseTranscript('{"segments": []}')).toEqual({ chapters: [], cues: [], dropped: 0 });
    expect(parseTranscript('{"segments": "soon"}')).toEqual({ chapters: [], cues: [], dropped: 0 });
  });

  it("drops an entry with no usable timecode, and counts it", () => {
    const parsed = parseTranscript(
      JSON.stringify({
        segments: [
          { start: 1, text: "kept" },
          { start: "1", text: "a string start" },
          { start: Number.NaN, text: "not a number" },
          { start: -2, text: "before the video began" },
          { text: "no start at all" },
          null,
          "not an object",
        ],
      }),
    );
    expect(parsed?.cues.map((c) => c.text)).toEqual(["kept"]);
    expect(parsed?.dropped).toBe(6);
  });

  it("drops an entry with no words, and a chapter with no title", () => {
    const parsed = parseTranscript(
      JSON.stringify({
        chapters: [
          { title: "  ", start: 0 },
          { title: "Real", start: 4 },
        ],
        segments: [
          { start: 0, text: "   " },
          { start: 1, text: 42 },
        ],
      }),
    );
    expect(parsed?.chapters.map((c) => c.title)).toEqual(["Real"]);
    expect(parsed?.cues).toEqual([]);
    expect(parsed?.dropped).toBe(3);
  });

  it("keeps an entry whose end is missing or backwards, collapsing it to its start", () => {
    // Nothing reads `end`: both highlight functions use "the latest entry that
    // has started". Refusing a line over a field nobody reads would lose a line
    // that has everything that matters.
    const parsed = parseTranscript(
      JSON.stringify({
        segments: [
          { start: 10, text: "no end" },
          { start: 20, end: 12, text: "end before start" },
          { start: 30, end: Number.POSITIVE_INFINITY, text: "infinite end" },
        ],
      }),
    );
    expect(parsed?.cues).toEqual([
      { scene: undefined, start: 10, end: 10, text: "no end" },
      { scene: undefined, start: 20, end: 20, text: "end before start" },
      { scene: undefined, start: 30, end: 30, text: "infinite end" },
    ]);
    expect(parsed?.dropped).toBe(0);
  });

  it("trims the text it keeps", () => {
    const parsed = parseTranscript(
      JSON.stringify({ segments: [{ start: 0, text: "  spoken line  " }] }),
    );
    expect(parsed?.cues[0].text).toBe("spoken line");
  });
});

describe("parseChapters", () => {
  it("reads the bare array chapters.json holds", () => {
    expect(parseChapters('[{"title": "Method", "start": 0, "end": 50.43}]')).toEqual([
      { scene: undefined, title: "Method", start: 0, end: 50.43 },
    ]);
  });

  it("returns null when the bytes are not an array", () => {
    expect(parseChapters("{ truncated")).toBeNull();
    // The transcript's own object is not a chapter list, even though it holds
    // one: this parser is for the separate sidecar, and guessing between the
    // two shapes is how a caller stops being able to tell which file it read.
    expect(parseChapters(REAL)).toBeNull();
  });

  it("drops the entries it cannot use", () => {
    expect(parseChapters('[{"title": "Kept", "start": 0}, {"start": 5}, 7]')).toEqual([
      { scene: undefined, title: "Kept", start: 0 , end: 0 },
    ]);
  });
});
