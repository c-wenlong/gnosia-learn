import { describe, expect, it } from "vitest";

import type { Job } from "./studio-jobs";
import {
  adoptPicture,
  failureLine,
  NO_PICTURES,
  retiredUrls,
  rowJobLabel,
  rowWords,
  settlePicture,
  showsThumbnail,
  jobForTarget,
  liveShotHref,
  loaderHeadline,
  loaderStep,
  newDiagramJobs,
  shownOnGrid,
  tileStage,
  wantsLivePicture,
} from "./studio-tile-jobs";

/**
 * Where the grid shows a job, and what the loader over it says.
 *
 * The tile loader and the new-diagram card are view code; every decision they
 * make is one of these functions of the runner's own record.
 */

const T0 = Date.parse("2026-09-29T10:00:00.000Z");
const at = (seconds: number): string => new Date(T0 + seconds * 1000).toISOString();

function job(over: Partial<Job> = {}): Job {
  return {
    jobId: "job-1",
    kind: "diagram",
    state: "running",
    phase: "drawing",
    title: "Dot product",
    topic: "vector-and-linear-algebra-basics",
    target: "learn/assets/dot-product.tldr",
    candidate: "/Users/you/.studio/jobs/job-1/candidate/dot-product.tldr",
    attempt: 1,
    turns: null,
    costUsd: null,
    costSource: null,
    exitCode: null,
    gate: null,
    written: [],
    indexed: false,
    error: null,
    errorKind: null,
    requested: at(0),
    started: at(1),
    finished: null,
    updated: at(30),
    cancelRequestedAt: null,
    note: "drawing on the canvas, attempt 1",
    ...over,
  };
}

const EXISTING = new Set(["learn/assets/dot-product.tldr", "learn/assets/matrix.tldr"]);

describe("which jobs the grid shows", () => {
  it("shows a queued, running or waiting job whether or not this tab watched it", () => {
    for (const state of ["queued", "running", "awaiting_review"] as const) {
      expect(shownOnGrid(job({ state }), [], [])).toBe(true);
    }
  });

  it("shows a failure only when this tab watched it happen, until it is dismissed", () => {
    const failed = job({ state: "failed" });
    expect(shownOnGrid(failed, [], [])).toBe(false);
    expect(shownOnGrid(failed, ["job-1"], [])).toBe(true);
    expect(shownOnGrid(failed, ["job-1"], ["job-1"])).toBe(false);
    expect(shownOnGrid(job({ state: "interrupted" }), ["job-1"], [])).toBe(true);
  });

  it("never shows a cancel, an accept or a discard", () => {
    for (const state of ["cancelled", "accepted", "discarded"] as const) {
      expect(shownOnGrid(job({ state }), ["job-1"], [])).toBe(false);
    }
  });
});

describe("a job on an existing diagram's tile", () => {
  it("is the newest job whose target is that diagram", () => {
    const jobs = [
      job({ jobId: "newer", state: "queued" }),
      job({ jobId: "older", state: "running" }),
      job({ jobId: "other", target: "learn/assets/matrix.tldr" }),
    ];
    expect(jobForTarget(jobs, "learn/assets/dot-product.tldr", [], [])?.jobId).toBe("newer");
    expect(jobForTarget(jobs, "learn/assets/matrix.tldr", [], [])?.jobId).toBe("other");
    expect(jobForTarget(jobs, "learn/assets/none.tldr", [], [])).toBeNull();
  });

  it("is only ever the newest job: a later accept, cancel or discard hides an older failure", () => {
    for (const state of ["accepted", "cancelled", "discarded"] as const) {
      const jobs = [job({ jobId: "retry", state }), job({ jobId: "failed", state: "failed" })];
      // The failure was watched and never dismissed, so on its own it would show.
      expect(jobForTarget(jobs, "learn/assets/dot-product.tldr", ["failed", "retry"], [])).toBeNull();
    }
    // With nothing newer, the same failure does show.
    expect(
      jobForTarget([job({ jobId: "failed", state: "failed" })], "learn/assets/dot-product.tldr", ["failed"], [])?.jobId,
    ).toBe("failed");
  });

  it("skips a finished job to reach nothing, so the tile is plain again", () => {
    const jobs = [job({ state: "accepted" }), job({ jobId: "old", state: "discarded" })];
    expect(jobForTarget(jobs, "learn/assets/dot-product.tldr", [], [])).toBeNull();
  });
});

describe("a new diagram's card", () => {
  it("is every shown job whose target the listing does not have", () => {
    const jobs = [
      job({ jobId: "new-a", target: "learn/assets/eigenvectors.tldr" }),
      job({ jobId: "extend", target: "learn/assets/dot-product.tldr" }),
      job({ jobId: "new-b", target: "learn/assets/span.tldr", state: "awaiting_review" }),
    ];
    expect(newDiagramJobs(jobs, EXISTING, [], []).map((entry) => entry.jobId)).toEqual(["new-a", "new-b"]);
  });

  it("is one card per target: a retry replaces its failed card, not stands beside it", () => {
    const jobs = [
      job({ jobId: "retry", target: "learn/assets/span.tldr", state: "queued" }),
      job({ jobId: "first", target: "learn/assets/span.tldr", state: "failed" }),
    ];
    expect(newDiagramJobs(jobs, EXISTING, ["first"], []).map((entry) => entry.jobId)).toEqual(["retry"]);
  });

  it("goes when the newest job for the target is accepted, even before the listing has it", () => {
    const jobs = [
      job({ jobId: "done", target: "learn/assets/span.tldr", state: "accepted" }),
      job({ jobId: "earlier", target: "learn/assets/span.tldr", state: "failed" }),
    ];
    expect(newDiagramJobs(jobs, EXISTING, ["earlier"], [])).toEqual([]);
  });

  it("is never an extend job whose diagram a filter hides, which the strip covers", () => {
    // `EXISTING` is the whole listing, not the filtered view.
    const jobs = [job({ target: "learn/assets/matrix.tldr" })];
    expect(newDiagramJobs(jobs, EXISTING, [], [])).toEqual([]);
  });
});

describe("what the loader says", () => {
  it("names what is happening now, in sentence case", () => {
    expect(loaderHeadline(job({ state: "queued", phase: null }))).toBe("Waiting to start");
    expect(loaderHeadline(job({ phase: null }))).toBe("Starting");
    expect(loaderHeadline(job({ phase: "reading" }))).toBe("Reading the brief");
    expect(loaderHeadline(job({ phase: "drawing" }))).toBe("Drawing");
    expect(loaderHeadline(job({ phase: "exporting" }))).toBe("Exporting the SVG");
    expect(loaderHeadline(job({ state: "awaiting_review", phase: "ready" }))).toBe("Ready to review");
    expect(loaderHeadline(job({ phase: "something-new" }))).toBe("Starting");
  });

  it("counts steps while running, and never a percentage", () => {
    expect(loaderStep(job({ phase: "drawing" }))).toBe("Step 3 of 7");
    expect(loaderStep(job({ phase: "verifying" }))).toBe("Step 6 of 7");
    expect(loaderStep(job({ state: "queued", phase: null }))).toBeNull();
    expect(loaderStep(job({ phase: null }))).toBeNull();
  });

  it("says a failure in one capitalised sentence", () => {
    expect(failureLine(job({ state: "failed", errorKind: "timeout" }))).toBe("It ran out of time");
    expect(failureLine(job({ state: "failed" }))).toBe("Nothing was written");
  });

  it("stages a job as working, ready or failed", () => {
    expect(tileStage(job({ state: "queued" }))).toBe("working");
    expect(tileStage(job())).toBe("working");
    expect(tileStage(job({ state: "awaiting_review" }))).toBe("review");
    expect(tileStage(job({ state: "interrupted" }))).toBe("failed");
  });
});

describe("the live picture", () => {
  it("is asked for only while the job runs, the tile is on screen and the tab is showing", () => {
    expect(wantsLivePicture(job(), true, false)).toBe(true);
    expect(wantsLivePicture(job(), false, false)).toBe(false);
    expect(wantsLivePicture(job(), true, true)).toBe(false);
    expect(wantsLivePicture(job({ state: "queued" }), true, false)).toBe(false);
    expect(wantsLivePicture(job({ state: "awaiting_review" }), true, false)).toBe(false);
  });

  it("goes through the studio proxy, with the job id escaped", () => {
    expect(liveShotHref("a/b")).toBe("/studio/api/jobs/a%2Fb/shot?which=live");
  });
});

describe("swapping live pictures", () => {
  it("fades a new picture in over the old, then drops the old one", () => {
    const first = adoptPicture(NO_PICTURES, "blob:1", 1, false)!;
    expect(first).toEqual({ current: "blob:1", previous: null, settled: false, seq: 1 });
    // The thumbnail stays under the first picture until it has faded in.
    expect(showsThumbnail(first)).toBe(true);
    const shown = settlePicture(first);
    expect(showsThumbnail(shown)).toBe(false);
    const second = adoptPicture(shown, "blob:2", 2, false)!;
    expect(second.previous).toBe("blob:1");
    expect(settlePicture(second)).toEqual({ current: "blob:2", previous: null, settled: true, seq: 2 });
  });

  it("replaces at once when less motion was asked for", () => {
    const first = adoptPicture(NO_PICTURES, "blob:1", 1, true)!;
    expect(adoptPicture(first, "blob:2", 2, true)).toEqual({ current: "blob:2", previous: null, settled: true, seq: 2 });
  });

  it("refuses an answer to an older poll, so the preview never steps backwards", () => {
    const newer = adoptPicture(NO_PICTURES, "blob:new", 5, false)!;
    expect(adoptPicture(newer, "blob:old", 4, false)).toBeNull();
    expect(adoptPicture(newer, "blob:same", 5, false)).toBeNull();
  });

  it("names every URL nothing shows any more, for revoking", () => {
    const held = { current: "blob:3", previous: "blob:2", settled: false, seq: 3 };
    expect(retiredUrls(["blob:1", "blob:2", "blob:3"], held)).toEqual(["blob:1"]);
    expect(retiredUrls(["blob:2", "blob:3"], settlePicture(held))).toEqual(["blob:2"]);
  });
});

describe("a list row's job link", () => {
  it("says what the row shows, the failure included, not the phase it failed in", () => {
    expect(rowWords(job({ phase: "linting" }))).toBe("Checking the layout");
    expect(rowJobLabel(job({ phase: "drawing" }), "Dot product")).toBe("Drawing: open the job on Dot product");
    const failed = job({ state: "failed", phase: "drawing", errorKind: "timeout" });
    expect(rowWords(failed)).toBe("It ran out of time");
    expect(rowJobLabel(failed, "Dot product")).toBe("It ran out of time: open the job on Dot product");
    expect(rowJobLabel(job({ state: "interrupted", phase: "drawing", errorKind: "interrupted" }), "Dot product")).toBe(
      "The runner died while this was running: open the job on Dot product",
    );
  });
});
