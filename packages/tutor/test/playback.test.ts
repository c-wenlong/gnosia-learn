import { describe, expect, it } from "vitest";

import {
  applySave,
  coverage,
  mergeRanges,
  parsePlayback,
  resumeAt,
  WATCHED_FRACTION,
  type Playback,
} from "../src/playback";

const NOW = "2026-09-29T10:00:00.000Z";

describe("mergeRanges", () => {
  it("sorts, merges overlaps and joins touching ranges", () => {
    expect(
      mergeRanges([
        [50, 60],
        [0, 10],
        [10, 20],
        [15, 30],
      ]),
    ).toEqual([
      [0, 30],
      [50, 60],
    ]);
  });

  it("drops empty and reversed ranges", () => {
    expect(
      mergeRanges([
        [5, 5],
        [9, 3],
        [1, 2],
      ]),
    ).toEqual([[1, 2]]);
  });
});

describe("coverage", () => {
  it("counts each second once, however often it played", () => {
    expect(
      coverage(
        [
          [0, 50],
          [0, 50],
          [25, 75],
        ],
        100,
      ),
    ).toBe(0.75);
  });

  it("ignores anything past the end", () => {
    expect(coverage([[0, 500]], 100)).toBe(1);
  });

  it("is zero for a video with no known length", () => {
    expect(coverage([[0, 10]], 0)).toBe(0);
  });
});

describe("resumeAt", () => {
  it("resumes where the reader stopped", () => {
    expect(resumeAt({ position: 192, duration: 349 })).toBe(192);
  });

  it("starts from the top near either end", () => {
    expect(resumeAt({ position: 2, duration: 349 })).toBe(0);
    expect(resumeAt({ position: 345, duration: 349 })).toBe(0);
    expect(resumeAt(null)).toBe(0);
  });
});

describe("applySave", () => {
  it("does not call a scrub to the end watched", () => {
    const { playback, crossed } = applySave(
      null,
      {
        position: 99,
        duration: 100,
        ranges: [
          [0, 5],
          [95, 99],
        ],
      },
      NOW,
    );
    expect(crossed).toBe(false);
    expect(playback.watchedAt).toBeNull();
    expect(playback.position).toBe(99);
  });

  it("crosses once, when the stored and new ranges together reach the threshold", () => {
    const first = applySave(null, { position: 60, duration: 100, ranges: [[0, 60]] }, NOW);
    expect(first.crossed).toBe(false);

    const second = applySave(
      first.playback,
      { position: 95, duration: 100, ranges: [[60, 100 * WATCHED_FRACTION]] },
      NOW,
    );
    expect(second.crossed).toBe(true);
    expect(second.playback.watchedAt).toBe(NOW);

    const third = applySave(
      second.playback,
      { position: 99, duration: 100, ranges: [[90, 99]] },
      "2026-09-30T00:00:00.000Z",
    );
    expect(third.crossed).toBe(false);
    expect(third.playback.watchedAt).toBe(NOW);
  });
});

describe("parsePlayback", () => {
  it("reads back what applySave wrote", () => {
    const { playback } = applySave(null, { position: 10, duration: 100, ranges: [[0, 10]] }, NOW);
    expect(parsePlayback(JSON.parse(JSON.stringify(playback)))).toEqual(playback);
  });

  it("refuses a value with no usable position or length", () => {
    expect(parsePlayback(null)).toBeNull();
    expect(parsePlayback({ position: "3", duration: 10 })).toBeNull();
    expect(parsePlayback({ position: 3, duration: 0 })).toBeNull();
  });

  it("drops malformed ranges rather than the row", () => {
    const parsed = parsePlayback({
      position: 3,
      duration: 10,
      ranges: [[0, 3], "x", [1]],
    }) as Playback;
    expect(parsed.ranges).toEqual([[0, 3]]);
    expect(parsed.watchedAt).toBeNull();
  });
});
