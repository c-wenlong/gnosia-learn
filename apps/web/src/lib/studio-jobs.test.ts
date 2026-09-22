import { describe, expect, it } from "vitest";

import {
  activeJob,
  announcement,
  candidatePathFor,
  draftErrors,
  draftFromBrief,
  draftToBrief,
  elapsedMs,
  emptyDraft,
  failureReport,
  finishedHeadline,
  formatDuration,
  isActive,
  lastGateCode,
  narration,
  PHASES,
  phaseRows,
  refusalReport,
  slugFromTitle,
  stepLabel,
  type Brief,
  type GateResult,
  type GateStep,
  type Job,
  type StudioEvent,
} from "./studio-jobs";

/**
 * The judgements the running panel makes, on this side of the view line.
 *
 * `apps/web/src/app` and `apps/web/src/components` are untested by design, so
 * the tests that matter for phase 3 are the ones about what the screen *says*:
 * which phase is current after a reload, how long each one took across a retry
 * loop, and which sentence a failure gets. Every one of them is a pure function
 * of the runner's own record.
 */

const T0 = Date.parse("2026-09-18T10:00:00.000Z");
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
    candidate: "learn/assets/.candidates/dot-product.tldr",
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

function phaseEvent(seq: number, phase: string, seconds: number): StudioEvent {
  return { type: "phase", seq, at: at(seconds), job: "job-1", note: phase, phase, state: "running" };
}

function gate(over: Partial<GateResult> = {}): GateResult {
  return {
    ok: true,
    steps: [],
    findings: [],
    shapes: 44,
    lints: 0,
    svg: { path: "learn/assets/.candidates/dot-product.svg", bytes: 213_000 },
    exportFailed: false,
    checkedAt: at(200),
    ...over,
  };
}

function step(name: string, exitCode: number | null, detail: string): GateStep {
  return { name, ok: false, detail, exitCode };
}

describe("which job the strip is about", () => {
  it("is the newest one that still holds its target", () => {
    const jobs = [job({ jobId: "new", state: "failed" }), job({ jobId: "held", state: "queued" })];
    expect(activeJob(jobs)?.jobId).toBe("held");
  });

  it("is nothing when everything has finished", () => {
    expect(activeJob([job({ state: "accepted" }), job({ state: "discarded" })])).toBeNull();
  });

  it.each([
    ["queued", true],
    ["running", true],
    ["awaiting_review", true],
    ["accepted", false],
    ["failed", false],
    ["interrupted", false],
  ] as const)("counts %s as active: %s", (state, expected) => {
    expect(isActive(state)).toBe(expected);
  });
});

describe("the phase list", () => {
  it("shows all seven from the first second, with the current one marked", () => {
    const rows = phaseRows(job({ phase: "drawing" }), [], T0 + 30_000);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.status)).toEqual([
      "done",
      "done",
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(rows.map((row) => row.key)).toEqual(PHASES.map((phase) => phase.key));
  });

  /**
   * The reload case from the phase's own "done when", as a unit.
   *
   * A page that came back mid-job has the record and no events at all, and the
   * phase it shows has to be the record's. That is rule 8 in one assertion: the
   * stream is a cache, so a client that never connected is still right.
   */
  it("takes the current phase from the record when there are no events", () => {
    const rows = phaseRows(job({ phase: "exporting" }), []);
    expect(rows.find((row) => row.status === "current")?.key).toBe("exporting");
    expect(stepLabel(job({ phase: "exporting" }))).toBe("step 5 of 7");
  });

  it("adds up the time a phase held, rather than the span it was first in", () => {
    // A retry loop: drawing, linting, back to drawing, linting again. Reading
    // "first entered until first left" would report the first lint as lasting
    // through the redraw in the middle of it.
    const events = [
      phaseEvent(1, "drawing", 0),
      phaseEvent(2, "linting", 10),
      phaseEvent(3, "drawing", 20),
      phaseEvent(4, "linting", 50),
      phaseEvent(5, "exporting", 60),
    ];
    const rows = phaseRows(job({ phase: "exporting" }), events, T0 + 70_000);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    expect(byKey.get("drawing")?.durationMs).toBe(40_000);
    expect(byKey.get("linting")?.durationMs).toBe(20_000);
    expect(byKey.get("exporting")?.durationMs).toBe(10_000);
  });

  it("stops counting at the finish rather than at now", () => {
    const events = [phaseEvent(1, "drawing", 0)];
    const finished = job({ state: "failed", phase: null, finished: at(30) });
    const rows = phaseRows(finished, events, T0 + 5_000_000);
    expect(rows.find((row) => row.key === "drawing")?.durationMs).toBe(30_000);
  });

  it("stops counting a job that is waiting to be reviewed, which has also stopped", () => {
    // Seen on the first real job: `awaiting_review` is not one of the terminal
    // states, so reading only those as stopped left Verify counting upwards
    // for as long as the panel stayed open — saying the runner was still
    // verifying a diagram it had finished with minutes earlier.
    const events = [phaseEvent(1, "verifying", 0)];
    const waiting = job({ state: "awaiting_review", phase: "ready", finished: at(2) });
    const rows = phaseRows(waiting, events, T0 + 600_000);
    expect(rows.find((row) => row.key === "verifying")?.durationMs).toBe(2_000);
  });

  it("marks the phase a failed job stopped in, and leaves the rest unreached", () => {
    const rows = phaseRows(
      job({ state: "failed", phase: null, finished: at(60), errorKind: "gate" }),
      [phaseEvent(1, "drawing", 0), phaseEvent(2, "linting", 30)],
    );
    expect(rows.find((row) => row.key === "linting")?.status).toBe("failed");
    expect(rows.find((row) => row.key === "exporting")?.status).toBe("pending");
  });

  it("calls every row done once the job is waiting to be reviewed", () => {
    const rows = phaseRows(job({ state: "awaiting_review", phase: "ready", finished: at(200) }));
    expect(rows.every((row) => row.status === "done")).toBe(true);
    expect(stepLabel(job({ state: "awaiting_review", phase: "ready" }))).toBe("step 7 of 7");
  });

  it("leaves a queued job with nothing marked, because nothing has happened", () => {
    const rows = phaseRows(job({ state: "queued", phase: null, started: null }));
    expect(rows.every((row) => row.status === "pending")).toBe(true);
    expect(stepLabel(job({ state: "queued", phase: null }))).toBe("step 0 of 7");
  });
});

describe("elapsed", () => {
  it("counts from the start to now while it runs, and to the finish afterwards", () => {
    expect(elapsedMs(job(), T0 + 61_000)).toBe(60_000);
    expect(elapsedMs(job({ finished: at(31) }), T0 + 5_000_000)).toBe(30_000);
  });

  it("counts from the request when nothing has started", () => {
    expect(elapsedMs(job({ started: null, state: "queued" }), T0 + 10_000)).toBe(10_000);
  });

  it.each([
    [0, "0s"],
    [9_400, "9s"],
    [64_000, "1:04"],
    [750_000, "12:30"],
    [null, ""],
  ])("formats %s as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("the narration", () => {
  it("is the runner's own checks and not the agent's account of itself", () => {
    const events: StudioEvent[] = [
      phaseEvent(1, "drawing", 0),
      { type: "step", seq: 2, at: at(10), job: "job-1", note: "drew 44 shapes" },
      { type: "step", seq: 3, at: at(11), job: "job-1", note: "exported 213 kB" },
    ];
    expect(narration(events).map((line) => line.note)).toEqual(["drew 44 shapes", "exported 213 kB"]);
  });

  it("keeps the newest twenty", () => {
    const events: StudioEvent[] = Array.from({ length: 30 }, (_, i) => ({
      type: "step" as const,
      seq: i,
      at: at(i),
      job: "job-1",
      note: `line ${i}`,
    }));
    const lines = narration(events);
    expect(lines).toHaveLength(20);
    expect(lines[19]?.note).toBe("line 29");
  });
});

describe("what a failure says", () => {
  /**
   * The design's table keys on the last tldrawkc code the gate recorded, and
   * that is not the agent's exit code: the agent runs the CLI many times and
   * the runner sees only the session's own exit.
   */
  it("reads the last failing gate step's code, not the first", () => {
    const failed = job({
      state: "failed",
      gate: gate({
        ok: false,
        steps: [step("inspect", 2, "the snippet threw at line 4"), step("verify", 1, "no such file")],
      }),
    });
    expect(lastGateCode(failed)).toBe(1);
  });

  it("gives exit 2 the snippet's own stack line", () => {
    const failed = job({
      state: "failed",
      errorKind: "gate",
      gate: gate({ ok: false, steps: [step("inspect", 2, "TypeError: x is not a function (snippet:4)")] }),
    });
    const report = failureReport(failed);
    expect(report.code).toBe(2);
    expect(report.headline).toBe("the snippet threw");
    expect(report.detail).toContain("snippet:4");
    expect(report.actions).toEqual(["retry", "edit"]);
  });

  it("offers doctor on exit 1, because the message is the only thing that says why", () => {
    const failed = job({
      state: "failed",
      errorKind: "gate",
      error: "chromium is not installed. Run doctor.",
      gate: gate({ ok: false, steps: [step("export", 1, "chromium is not installed")] }),
    });
    expect(failureReport(failed).actions).toContain("doctor");
  });

  it("gives an interrupted job Resume and nothing else", () => {
    const interrupted = job({
      state: "interrupted",
      errorKind: "interrupted",
      error: "the runner died while this job was running",
    });
    const report = failureReport(interrupted);
    expect(report.actions).toEqual(["resume"]);
    expect(report.code).toBeNull();
  });

  it("refuses to offer a retry on a job that wrote outside its paths", () => {
    // A9's backstop fired: something is dirty in the tree and a person has to
    // look at it before another agent runs over the same paths.
    const strayed = job({ state: "failed", errorKind: "wrote-outside", error: "left tools/x dirty" });
    expect(failureReport(strayed).actions).toEqual([]);
  });

  it("falls back to the gate's own finding when no code was recorded", () => {
    const failed = job({
      state: "failed",
      errorKind: "gate",
      gate: gate({ ok: false, steps: [], findings: ["the agent exited 0 and wrote nothing"] }),
    });
    const report = failureReport(failed);
    expect(report.code).toBeNull();
    expect(report.detail).toContain("wrote nothing");
  });
});

describe("what a finished job says", () => {
  it("counts the lints rather than calling them a failure (D4)", () => {
    expect(finishedHeadline(job({ state: "awaiting_review", gate: gate({ lints: 2 }) }))).toBe(
      "finished with 2 lints",
    );
  });

  it("says the export failed and not that the job did (exit 4)", () => {
    expect(
      finishedHeadline(job({ state: "awaiting_review", gate: gate({ exportFailed: true }) })),
    ).toBe("the document was saved, the export failed");
  });
});

describe("what is said when nobody is looking", () => {
  it("announces the three endings a person is waiting on", () => {
    expect(announcement(job({ state: "awaiting_review", gate: gate() }))?.title).toContain("ready to review");
    expect(announcement(job({ state: "failed", errorKind: "timeout" }))?.title).toContain("failed");
    expect(announcement(job({ state: "interrupted", errorKind: "interrupted" }))?.title).toContain(
      "interrupted",
    );
  });

  it("says nothing about a job that is still going", () => {
    expect(announcement(job({ state: "running" }))).toBeNull();
    expect(announcement(job({ state: "queued" }))).toBeNull();
  });
});

describe("the brief a form fills in", () => {
  const filled = () => ({
    ...emptyDraft(),
    intent: "show how a projection falls out of the dot product",
    topic: "vector-and-linear-algebra-basics",
    slug: "dot-product-projection",
    title: "Dot product projection",
    elements: [
      { label: "vector a", note: "the one being projected" },
      { label: "vector b", note: "" },
    ],
  });

  it("asks for every required field rather than posting a brief to be guessed at", () => {
    const errors = draftErrors(emptyDraft());
    expect(Object.keys(errors).sort()).toEqual(["elements", "intent", "slug", "title", "topic"]);
  });

  it("accepts a complete one", () => {
    expect(draftErrors(filled())).toEqual({});
  });

  it.each(["Dot Product", "dot_product", "dot--product", "dot-product-"])(
    "refuses %j as a slug, because it is a file name",
    (slug) => {
      expect(draftErrors({ ...filled(), slug }).slug).toBeDefined();
    },
  );

  it("refuses two elements with the same label, since a relation names its ends by label", () => {
    const draft = filled();
    draft.elements = [
      { label: "vector a", note: "" },
      { label: "vector a", note: "" },
    ];
    expect(draftErrors(draft).elements).toContain("share a label");
  });

  it("refuses an arrow whose end is not an element", () => {
    const draft = filled();
    draft.relations = [{ from: "vector a", to: "vector c", label: "" }];
    expect(draftErrors(draft)["relations.0"]).toBeDefined();
  });

  it("posts a structured brief, dropping the empty optionals rather than sending blanks", () => {
    const brief = draftToBrief(filled(), "key-1");
    expect(brief).toMatchObject({
      intent: "show how a projection falls out of the dot product",
      topic: "vector-and-linear-algebra-basics",
      slug: "dot-product-projection",
      mode: "new",
      model: "sonnet",
      relations: [],
      idempotencyKey: "key-1",
    });
    expect(brief.elements).toEqual([
      { label: "vector a", note: "the one being projected" },
      { label: "vector b" },
    ]);
    expect("layout" in brief).toBe(false);
    expect("mermaid" in brief).toBe(false);
    expect("notes" in brief).toBe(false);
  });

  it("keeps the mermaid source as a field, which is the only way it reaches the runner", () => {
    // A5: it is written to the job's scratch directory and lifted with
    // `from-mermaid --source`. A form that pasted it into any text would be a
    // second path around the one structural defence the design has.
    const draft = { ...filled(), mermaid: "flowchart LR\n  a --> b" };
    expect(draftToBrief(draft, "k").mermaid).toBe("flowchart LR\n  a --> b");
  });

  it("drops a relation whose ends stopped being elements, rather than posting a broken one", () => {
    const draft = filled();
    draft.relations = [{ from: "vector a", to: "gone", label: "projects onto" }];
    expect(draftToBrief(draft, "k").relations).toEqual([]);
  });

  it("round-trips a brief into a draft, which is what Edit brief does", () => {
    const brief: Brief = {
      intent: "i",
      topic: "t",
      slug: "s",
      title: "T",
      mode: "extend",
      elements: [{ label: "one" }],
      relations: [{ from: "one", to: "one" }],
      concepts: ["c"],
      model: "opus",
    };
    const draft = draftFromBrief(brief);
    expect(draft.mode).toBe("extend");
    expect(draft.model).toBe("opus");
    expect(draft.elements).toEqual([{ label: "one", note: "" }]);
    expect(draft.relations).toEqual([{ from: "one", to: "one", label: "" }]);
  });

  it("names the candidate path the result will be written to", () => {
    expect(candidatePathFor("dot-product")).toBe("learn/assets/.candidates/dot-product.tldr");
    expect(candidatePathFor("")).toContain("<slug>");
  });

  it.each([
    ["Dot product projection", "dot-product-projection"],
    ["  Gram–Schmidt, step 1  ", "gram-schmidt-step-1"],
  ])("suggests a slug from %j", (title, expected) => {
    expect(slugFromTitle(title)).toBe(expected);
  });
});

describe("a refused enqueue", () => {
  /** The 429 body the runner sends, as `refuseOverCap` builds it. */
  const capBody = {
    error:
      "the studio has spent $0.52 in the last 24 hours, which is at or over the $0.50 " +
      "STUDIO_DAILY_USD cap. Nothing was queued.",
    detail: {
      reason: "daily-cap",
      totalUsd: 0.5231,
      capUsd: 0.5,
      jobs: 4,
      windowHours: 24,
      oldestCountedAt: "2026-09-21T22:00:00.000Z",
      oldestAgesOutAt: "2026-09-22T22:00:00.000Z",
    },
  };

  it("offers no action at all on the daily cap", () => {
    const report = refusalReport(429, capBody);
    expect(report.code).toBe("daily-cap");
    // Retrying is the one thing that is certainly wrong: the answer does not
    // change until the window moves or a person raises the number, and this
    // screen can do neither.
    expect(report.actions).toEqual([]);
  });

  it("says what was spent against what", () => {
    const report = refusalReport(429, capBody);
    expect(report.headline).toBe("$0.52 of the $0.50 daily cap is spent");
    expect(report.detail).toContain("Nothing was queued");
  });

  it("falls back to the runner's own sentence when the body carries no figures", () => {
    const report = refusalReport(429, { error: "over the cap" });
    expect(report.code).toBe("daily-cap");
    expect(report.headline).toBe("the daily spend cap is reached");
    expect(report.detail).toBe("over the cap");
    expect(report.actions).toEqual([]);
  });

  it("keeps the other refusals distinguishable, and their actions", () => {
    // One guard on top of five: a cap must not make "that path is spoken for"
    // read like "come back tomorrow".
    expect(refusalReport(409, { error: "already held by job x" }).code).toBe("target-held");
    expect(refusalReport(400, { error: "elements is required" }).actions).toEqual(["edit"]);
    expect(refusalReport(503, { error: "no runner" }).actions).toEqual(["doctor"]);
    expect(refusalReport(418, {}).headline).toBe("the runner answered 418");
  });
});
