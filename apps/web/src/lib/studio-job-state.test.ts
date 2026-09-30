import { JOB_KINDS, JOB_STATES } from "@self-learn/schema/shared";
import { describe, expect, it } from "vitest";

import { JOB_STATE_LABEL, jobCardSentence, jobPredicate, jobStateInline, jobStateLabel } from "@/lib/studio-job-state";

describe("job state labels", () => {
  it("has a label for every state the runner has, and only those", () => {
    expect(Object.keys(JOB_STATE_LABEL).sort()).toEqual([...JOB_STATES].sort());
  });

  it.each(JOB_STATES)("labels %s in sentence case with no enum text", (state) => {
    const label = jobStateLabel(state);
    expect(label).toMatch(/^[A-Z][a-z]*( [a-z]+)*$/);
    expect(label).not.toContain("_");
  });

  it("names awaiting_review Ready for review", () => {
    expect(jobStateLabel("awaiting_review")).toBe("Ready for review");
    expect(jobStateInline("awaiting_review")).toBe("ready for review");
  });

  it("humanises a state this build does not know instead of printing it raw", () => {
    expect(jobStateLabel("half_done")).toBe("Half done");
    expect(jobStateLabel("")).toBe("Unknown");
  });
});

describe("job card sentences", () => {
  it.each(JOB_KINDS.flatMap((kind) => JOB_STATES.map((state) => [kind, state] as const)))(
    "says something true for a %s job that is %s, with no enum text",
    (kind, state) => {
      const sentence = jobCardSentence(kind, state);
      expect(sentence).toMatch(/^The (diagram|video) .+\.$/);
      expect(sentence).not.toContain("_");
    },
  );

  it("does not say a job in review is still being drawn or made", () => {
    expect(jobCardSentence("diagram", "awaiting_review")).toBe("The diagram is drawn and ready for review.");
    expect(jobCardSentence("video", "awaiting_review")).toBe("The video is made and ready for review.");
  });

  it("says a running job is in progress and a queued one has not started", () => {
    expect(jobCardSentence("diagram", "running")).toBe("The diagram is still being drawn.");
    expect(jobCardSentence("video", "running")).toBe("The video is still being made.");
    expect(jobCardSentence("diagram", "queued")).toBe("The diagram is waiting to start.");
  });

  it("says a finished job is finished", () => {
    for (const state of ["accepted", "discarded", "failed", "cancelled", "interrupted"] as const) {
      expect(jobPredicate("diagram", state)).not.toMatch(/still|waiting|ready/);
    }
  });
});
