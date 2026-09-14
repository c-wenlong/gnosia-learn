import { describe, expect, it } from "vitest";
import {
  activeChapterIndex,
  activeCueIndex,
  formatTimecode,
  type TranscriptCue,
  type VideoChapter,
} from "./media";

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
