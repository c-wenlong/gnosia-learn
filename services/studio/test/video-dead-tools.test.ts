import { describe, expect, it } from "vitest";

import { WrapperOutputTracker, type CallStep, type WrapperCall } from "../src/video/calls";
import { DEAD_CALLS, DEAD_START_MS, deadTools, deadToolsMessage, diedAtStart } from "../src/video/dead-tools";
import { VideoDoctor, type VideoDoctorReport } from "../src/video/doctor";
import { toolsHealth } from "../src/video/tools";

import { until } from "./wait";

/**
 * The rule that stops a job whose tools cannot start (V26 of
 * docs/STUDIO-VIDEOS.md), over sequences of wrapper calls as `calls.ndjson`
 * records them. The runner's half, with an agent, is
 * `video-dead-tools-runner.test.ts`.
 */

let clock = Date.parse("2026-10-03T18:16:44.000Z");
function call(verb: WrapperCall["verb"], steps: CallStep[] | undefined, over: Partial<WrapperCall> = {}): WrapperCall {
  const startedAt = new Date((clock += 3_000)).toISOString();
  const last = steps?.[steps.length - 1];
  return { verb, startedAt, endedAt: new Date(clock + 25).toISOString(), exitCode: last === undefined ? 0 : last.exitCode, ...(steps === undefined ? {} : { steps }), ...over };
}
/** The incident's step: node aborting as it started inside the profile, measured at 20 to 26 ms. */
const dead = (step: CallStep["step"] = "render", signal: string | null = "SIGABRT", ms = 21): CallStep => ({ step, exitCode: null, signal, ms });
const ran = (step: CallStep["step"] = "render", exitCode = 0, ms = 4_000): CallStep => ({ step, exitCode, signal: null, ms });
const refused = (): WrapperCall => call("refused", undefined, { exitCode: 2 });

describe("a step that died at start", () => {
  it("is no exit code inside the start window, and nothing else", () => {
    expect(diedAtStart(dead())).toBe(true);
    // A spawn the OS refused: both wrappers record it with no signal.
    expect(diedAtStart(dead("render", null, 1))).toBe(true);
    // Any exit code, however fast and however bad, is a step that ran.
    expect(diedAtStart(ran("render", 1, 30))).toBe(false);
    expect(diedAtStart(ran("render", 0, 30))).toBe(false);
    // A render the Bash tool's ceiling killed after it had worked.
    expect(diedAtStart({ exitCode: null, ms: 600_000 })).toBe(false);
    expect(diedAtStart({ exitCode: null, ms: DEAD_START_MS })).toBe(false);
    // A record it cannot read counts as started, never as dead.
    expect(diedAtStart({ exitCode: null } as unknown as CallStep)).toBe(false);
    expect(diedAtStart({ exitCode: undefined, ms: 20 } as unknown as CallStep)).toBe(false);
  });
});

describe("the rule over a job's calls", () => {
  it("stops the 2026-10-03 job at its third call, every one dead in the render step", () => {
    // The first eleven of that job's calls, verbs and steps as recorded.
    const log = [
      call("api", [dead("render", "SIGABRT", 22)]),
      call("api", [dead("render", "SIGABRT", 21)]),
      call("api", [dead("render", "SIGABRT", 21)]),
      call("api", [dead("render", "SIGABRT", 22)]),
      call("lint", [dead("render", "SIGABRT", 21)]),
      call("lint", [dead("render", "SIGABRT", 20)]),
      call("still", [dead("narrate", "SIGABRT", 26)]),
      call("lint", [dead("render", "SIGABRT", 21)]),
      call("build", [dead("narrate", "SIGABRT", 20)]),
      call("api", [dead("render", "SIGABRT", 21)]),
      call("build", [dead("narrate", "SIGABRT", 20)]),
    ];
    const verdict = deadTools(log);
    expect(verdict).not.toBeNull();
    expect(verdict!.rule).toBe("same-step");
    expect(verdict!.step).toBe("render");
    expect(verdict!.calls).toHaveLength(DEAD_CALLS);
    expect(verdict!.calls.map((dead) => dead.endedAt)).toEqual(log.slice(0, 3).map((made) => made.endedAt));
    // Two of them are not enough.
    expect(deadTools(log.slice(0, 2))).toBeNull();
    // And reading the log again later, after more lines, gives the same answer.
    expect(deadTools(log)).toEqual(deadTools(log.slice(0, 3)));
  });

  it("is reset by a call in which the step started", () => {
    const log = [call("api", [dead()]), call("api", [dead()]), call("api", [ran("render", 0, 40)]), call("lint", [dead()]), call("api", [dead()])];
    expect(deadTools(log)).toBeNull();
    expect(deadTools([...log, call("lint", [dead()])])?.calls).toHaveLength(3);
  });

  it("never stops on the agent's own failures: steps that ran and exited non-zero", () => {
    const log = Array.from({ length: 12 }, (_, n) =>
      n % 3 === 0
        ? call("lint", [ran("render", 1, 300)])
        : n % 3 === 1
          ? call("preview", [ran("narrate", 0, 2_500), ran("render", 1, 9_000)])
          : call("build", [ran("narrate", 2, 500)]),
    );
    expect(deadTools(log)).toBeNull();
    // Nor on renders killed after they had worked (the Bash tool's 600 s ceiling).
    expect(deadTools(Array.from({ length: 5 }, () => call("preview", [ran("narrate"), { step: "render", exitCode: null, signal: "SIGTERM", ms: 600_000 }])))).toBeNull();
  });

  it("ignores refused calls and calls that ran nothing, which neither count nor reset", () => {
    // revideokc's held port: a line with no steps.
    const held = call("still", [], { exitCode: 3 });
    expect(deadTools(Array.from({ length: 10 }, (_, n) => (n % 2 === 0 ? refused() : held)))).toBeNull();
    const log = [call("api", [dead()]), refused(), held, call("lint", [dead()]), refused(), refused(), call("api", [dead()])];
    expect(deadTools(log)?.calls.map((made) => made.verb)).toEqual(["api", "lint", "api"]);
  });

  it("stops one dead profile beside a working one: a narrate that passes does not vouch for the render", () => {
    const log = [
      call("still", [ran("narrate", 0, 3_000), dead("render")]),
      call("narrate", [ran("narrate", 0, 1_200)]),
      call("still", [ran("narrate", 0, 300), dead("render")]),
      call("api", [dead("render")]),
    ];
    const verdict = deadTools(log);
    expect(verdict?.rule).toBe("same-step");
    expect(verdict?.step).toBe("render");
    expect(verdict?.calls.map((made) => made.verb)).toEqual(["still", "still", "api"]);
  });

  it("stops calls dead in different steps, when nothing at all has started", () => {
    const log = [call("api", [dead("render")]), call("still", [dead("narrate")]), call("lint", [dead("render")])];
    const verdict = deadTools(log);
    expect(verdict?.rule).toBe("every-call");
    expect(verdict?.step).toBe("render");
    expect(verdict?.calls.map((made) => made.verb)).toEqual(["api", "still", "lint"]);
    // With a step starting in between, neither clause holds.
    expect(deadTools([log[0]!, call("narrate", [ran("narrate")]), log[1]!, log[2]!])).toBeNull();
  });
});

describe("the job's error", () => {
  it("names the step, the signal, the verbs, and whose problem it is, from the wrapper's records only", () => {
    const verdict = deadTools([call("api", [dead()]), call("lint", [dead("render", "SIGABRT", 20)]), call("api", [dead("render", "SIGABRT", 23)])])!;
    const message = deadToolsMessage(verdict);
    expect(message).toContain("the render step (in the render sandbox) died as it started in 3 calls in a row (video api, video lint, video api)");
    expect(message).toContain("killed by SIGABRT 23 ms after it started");
    expect(message).toContain("the machine's problem, not the agent's");
  });

  it("says a step that could not be spawned at all", () => {
    const verdict = deadTools([call("build", [dead("narrate", null, 1)]), call("build", [dead("narrate", null, 2)]), call("still", [dead("narrate", null, 1)])])!;
    expect(deadToolsMessage(verdict)).toContain("the narration step (in the narration sandbox)");
    expect(deadToolsMessage(verdict)).toContain("with no exit code and no signal after 1 ms, so it could not be started at all");
  });
});

describe("the wrapper's last output", () => {
  const wrapper = "/s/jobs/j/bin/video";
  const use = (id: string, name: string, input: Record<string, unknown>) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
  const result = (id: string, content: unknown) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error: true }] } });

  it("keeps what a call to the job's wrapper printed, and nothing another tool returned", () => {
    const tracker = new WrapperOutputTracker(wrapper, 60);
    tracker.observe(use("a", "Bash", { command: `${wrapper} api` }));
    tracker.observe(result("a", "Exit code 1\n----- Native stack trace -----"));
    expect(tracker.last).toBe("Exit code 1\n----- Native stack trace -----");
    tracker.observe(use("b", "Read", { file_path: "/s/jobs/j/notes.md" }));
    tracker.observe(result("b", "not the wrapper"));
    tracker.observe(use("c", "Bash", { command: "ls" }));
    tracker.observe(result("c", "nor this"));
    expect(tracker.last).toBe("Exit code 1\n----- Native stack trace -----");
    // An array of text parts, cut to its tail.
    tracker.observe(use("d", "Bash", { command: `${wrapper} lint` }));
    tracker.observe(result("d", [{ type: "text", text: "x".repeat(100) }, { type: "text", text: "the end" }]));
    expect(tracker.last).toHaveLength(60);
    expect(tracker.last?.endsWith("the end")).toBe(true);
    // A wrapper call that printed nothing leaves nothing, never the call before's text.
    tracker.observe(use("e", "Bash", { command: `${wrapper} api` }));
    tracker.observe(result("e", ""));
    expect(tracker.last).toBeNull();
    tracker.observe(use("f", "Bash", { command: `${wrapper} api` }));
    tracker.observe(result("f", [{ type: "image", source: {} }]));
    expect(tracker.last).toBeNull();
  });
});

describe("the doctor, told", () => {
  const passing: VideoDoctorReport = { ok: true, sandbox: true, metal: true, kokoro: true, voices: ["af_heart"], checks: [{ name: "toolchain", ok: true, detail: "fine" }], checkedAt: new Date().toISOString() };

  it("carries the last stop beside its verdict, runs its checks again, and stays passing when they pass", async () => {
    let runs = 0;
    const doctor = new VideoDoctor(async () => {
      runs += 1;
      return { ...passing, checkedAt: new Date().toISOString() };
    });
    await doctor.report();
    expect(doctor.current()?.toolchainStop).toBeUndefined();
    const stop = { jobId: "j1", at: new Date().toISOString(), detail: "The video tools could not start on this machine." };
    doctor.noteToolchainStop(stop);
    const report = await doctor.report();
    expect(runs).toBe(2);
    expect(report.ok).toBe(true);
    expect(report.toolchainStop).toEqual(stop);
    expect(doctor.current()?.toolchainStop).toEqual(stop);
    const health = toolsHealth({ manimkc: doctor.current() });
    expect(health.find((tool) => tool.name === "manimkc")).toMatchObject({ available: true, reason: null, toolchainStop: stop });
    expect(toolsHealth({ manimkc: passing }).find((tool) => tool.name === "manimkc")).not.toHaveProperty("toolchainStop");
  });

  it("runs a check that starts after the stop, even with one already in flight", async () => {
    // Each check started is held until the test lets it end, so the order is the test's.
    const started: { at: number; end: () => void }[] = [];
    const doctor = new VideoDoctor(
      () =>
        new Promise<VideoDoctorReport>((resolve) => {
          started.push({ at: Date.now(), end: () => resolve({ ...passing, checkedAt: new Date().toISOString() }) });
        }),
    );
    const first = doctor.report(true);
    expect(started).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const stoppedAt = Date.now();
    doctor.noteToolchainStop({ jobId: "j2", at: new Date(stoppedAt).toISOString(), detail: "dead" });
    // Joining the run in flight would have started nothing new; a second waits for the first.
    expect(started).toHaveLength(1);
    started[0]!.end();
    await first;
    await until(() => started.length === 2, "no check started after the stop");
    expect(started[1]!.at).toBeGreaterThanOrEqual(stoppedAt);
    started[1]!.end();
    await until(() => doctor.current()?.toolchainStop?.jobId === "j2", "the stop never reached the verdict");
  });
});
