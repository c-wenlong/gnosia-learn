import { describe, expect, it } from "vitest";

import { jobVerbPath, verbOutcome } from "./studio-job-verb";

describe("verbOutcome", () => {
  it("says the runner's note on success and names the job it queued", () => {
    expect(verbOutcome({ ok: true, status: 202, data: { note: "Resumed as j2", jobId: "j2" } }, "resume")).toMatchObject({
      ok: true,
      text: "Resumed as j2",
      next: "j2",
    });
  });

  it("says the runner's error first on a refusal, even when a note came too", () => {
    expect(verbOutcome({ ok: false, status: 409, data: { note: "n", error: "already accepted" } }, "accept").text).toBe(
      "already accepted",
    );
  });

  it("falls back to the verb and the status when the runner said nothing", () => {
    expect(verbOutcome({ ok: false, status: 502, data: {} }, "resume").text).toBe("Resume answered 502.");
  });

  it("says the runner is not answering, with the fetch's reason", () => {
    const outcome = verbOutcome(
      { ok: false, status: 0, data: { error: "the studio runner is not answering", detail: "ECONNREFUSED" } },
      "cancel",
    );
    expect(outcome.text).toBe("The studio runner is not answering: ECONNREFUSED");
    expect(outcome.next).toBeNull();
  });

  it("builds the verb's route with the id escaped", () => {
    expect(jobVerbPath("a/b", "cancel")).toBe("/studio/api/jobs/a%2Fb/cancel");
  });
});
