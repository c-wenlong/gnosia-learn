import { describe, expect, it } from "vitest";
import {
  activeChapterIndex,
  activeCueIndex,
  captionChunks,
  chapterSegments,
  formatTimecode,
  nextSkip,
  skipLabel,
  subtitleAt,
  type TranscriptCue,
  type VideoChapter,
} from "../src/media";

const cues: TranscriptCue[] = [
  { scene: "T1_Intro", start: 0, end: 3.5, text: "First line." },
  { scene: "T1_Intro", start: 4, end: 7.25, text: "Second line." },
  { scene: "T2_Body", start: 12, end: 15, text: "Third line, after a pause." },
];

const chapters: VideoChapter[] = [
  { scene: "T1_Intro", title: "Intro", start: 0, end: 8 },
  { scene: "T2_Body", title: "The body", start: 8, end: 20 },
];

describe("formatTimecode", () => {
  it("reads as m:ss under an hour", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(7.9)).toBe("0:07");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(600)).toBe("10:00");
  });

  it("grows a padded hours field past an hour", () => {
    expect(formatTimecode(3600)).toBe("1:00:00");
    expect(formatTimecode(3725)).toBe("1:02:05");
  });

  it("treats a missing or broken time as the start", () => {
    expect(formatTimecode(Number.NaN)).toBe("0:00");
    expect(formatTimecode(-4)).toBe("0:00");
    expect(formatTimecode(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("activeCueIndex", () => {
  it("is -1 before the first line is spoken", () => {
    expect(activeCueIndex(cues, -1)).toBe(-1);
    expect(activeCueIndex([], 12)).toBe(-1);
  });

  it("follows playback line by line", () => {
    expect(activeCueIndex(cues, 0)).toBe(0);
    expect(activeCueIndex(cues, 3.4)).toBe(0);
    expect(activeCueIndex(cues, 4)).toBe(1);
    expect(activeCueIndex(cues, 13)).toBe(2);
  });

  it("rests on the last line spoken through a pause", () => {
    // 7.25 to 12 is silence. The highlight holds rather than blinking out.
    expect(activeCueIndex(cues, 9)).toBe(1);
    expect(activeCueIndex(cues, 999)).toBe(2);
  });

  it("does not assume the list is sorted", () => {
    const shuffled = [cues[2], cues[0], cues[1]];
    expect(activeCueIndex(shuffled, 13)).toBe(0);
    expect(activeCueIndex(shuffled, 4.5)).toBe(2);
  });
});

describe("activeChapterIndex", () => {
  it("names the chapter playing now", () => {
    expect(activeChapterIndex(chapters, -1)).toBe(-1);
    expect(activeChapterIndex(chapters, 0)).toBe(0);
    expect(activeChapterIndex(chapters, 7.99)).toBe(0);
    expect(activeChapterIndex(chapters, 8)).toBe(1);
    expect(activeChapterIndex(chapters, 100)).toBe(1);
  });
});

describe("chapterSegments", () => {
  const chapters = [
    { title: "Intro", start: 0, end: 8 },
    { title: "Body", start: 10, end: 20 },
    { title: "Close", start: 20, end: 25 },
  ];

  it("covers the whole bar, each chapter running to the next one's start", () => {
    expect(chapterSegments(chapters, 30)).toEqual([
      { start: 0, end: 10, title: "Intro", chapter: 0 },
      { start: 10, end: 20, title: "Body", chapter: 1 },
      { start: 20, end: 30, title: "Close", chapter: 2 },
    ]);
  });

  it("leaves an untitled lead-in before a late first chapter", () => {
    expect(chapterSegments([{ title: "Late", start: 5, end: 9 }], 10)).toEqual([
      { start: 0, end: 5, title: null, chapter: -1 },
      { start: 5, end: 10, title: "Late", chapter: 0 },
    ]);
  });

  it("is one segment with no chapters or no duration, and drops chapters past the end", () => {
    expect(chapterSegments(undefined, 30)).toEqual([{ start: 0, end: 30, title: null, chapter: -1 }]);
    expect(chapterSegments(chapters, Number.NaN)).toEqual([{ start: 0, end: 0, title: null, chapter: -1 }]);
    expect(chapterSegments(chapters, 15).map((s) => s.title)).toEqual(["Intro", "Body"]);
  });
});

describe("subtitleAt", () => {
  const lines = [
    { start: 0, end: 3, text: "One." },
    { start: 5, end: 8, text: "Two." },
  ];

  it("is the line whose span holds the time, and nothing in a gap", () => {
    expect(subtitleAt(lines, 1)).toBe("One.");
    expect(subtitleAt(lines, 4)).toBeNull();
    expect(subtitleAt(lines, 5)).toBe("Two.");
    expect(subtitleAt(lines, 8)).toBeNull();
  });
});

describe("captionChunks", () => {
  const paragraph = {
    start: 10,
    end: 20,
    text:
      "Every coding agent is a loop around a model. The model reads the conversation, " +
      "asks for tool calls, the harness runs them, appends the results, and sends it all back.",
  };

  it("cuts a paragraph into captions no longer than the limit, words intact", () => {
    const chunks = captionChunks(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(84);
    expect(chunks.map((c) => c.text).join(" ")).toBe(paragraph.text);
    expect(chunks[0].text).toBe("Every coding agent is a loop around a model.");
  });

  it("shares the line's time out end to end", () => {
    const chunks = captionChunks(paragraph);
    expect(chunks[0].start).toBe(10);
    expect(chunks[chunks.length - 1].end).toBe(20);
    for (let i = 1; i < chunks.length; i += 1) expect(chunks[i].start).toBe(chunks[i - 1].end);
  });

  it("leaves a short line whole, and subtitleAt follows the pieces", () => {
    expect(captionChunks({ start: 0, end: 2, text: "Short." })).toEqual([{ start: 0, end: 2, text: "Short." }]);
    expect(subtitleAt([paragraph], 10.1)).toBe("Every coding agent is a loop around a model.");
    expect(subtitleAt([paragraph], 19.9)).not.toBe("Every coding agent is a loop around a model.");
  });
});

describe("nextSkip", () => {
  it("adds a press to a flash still up in the same direction", () => {
    const one = nextSkip(null, 1);
    const two = nextSkip(one, 1);
    expect(nextSkip(two, 1)).toEqual({ direction: 1, seconds: 15, shown: true });
  });

  it("starts over once the flash has gone, or when the direction turns", () => {
    const ten = nextSkip(nextSkip(null, 1), 1);
    expect(nextSkip({ ...ten, shown: false }, 1).seconds).toBe(5);
    expect(nextSkip(ten, -1)).toEqual({ direction: -1, seconds: 5, shown: true });
  });

  it("reads with a sign and a true minus", () => {
    expect(skipLabel({ direction: 1, seconds: 170, shown: true })).toBe("+ 170");
    expect(skipLabel({ direction: -1, seconds: 5, shown: true })).toBe("\u2212 5");
  });
});
