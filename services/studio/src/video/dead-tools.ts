import type { CallStep, WrapperCall } from "./calls";

/**
 * Tools that cannot start (V26 of docs/STUDIO-VIDEOS.md, D54 amended): the
 * one failure the runner names, because the agent cannot fix it.
 *
 * Measured on 2026-10-03: a revideokc job's every wrapper call aborted about
 * 20 ms in, node dying as it started inside the profile (signal SIGABRT, no
 * exit code), before any step did any work. The agent read each failure as
 * its own, retried for 15 minutes and $5.51, and the gate then failed the job
 * with "no successful build". The fix was in the wrapper (#274); this is the
 * guard that would have stopped the job after its third call.
 *
 * Everything here reads `calls.ndjson`, which only the wrapper writes and no
 * profile can, so the agent cannot make a job look dead or alive by printing.
 *
 * The line between the machine's failure and the agent's:
 *
 * - A step **died at start** when it ended with no exit code (a signal, or a
 *   spawn the OS refused, which both wrappers record as `exitCode: null`)
 *   in under `DEAD_START_MS`. Nothing the agent writes runs that early: the
 *   tool's own CLI has to start, parse its arguments and import its renderer
 *   first, and every tool's CLI reports a failing render as an exit code.
 * - A step **started** in every other case: any exit code, zero or not (a
 *   failing lint or render is the agent's to fix, and proves the step runs),
 *   or a signal after `DEAD_START_MS` (a render the Bash tool's timeout or
 *   the OS killed while it worked).
 * - A `refused` call (the agent's arguments) and a call with no steps (a
 *   render port still held, which runs nothing) say nothing either way, and
 *   are skipped: they neither count nor reset.
 *
 * The rule, either clause:
 *
 * 1. **The same step died at start in `DEAD_CALLS` calls in a row** that ran
 *    it, with no call in between in which it started. This is the incident's
 *    shape, and it also catches one profile dead while another works (a dead
 *    render with a working narration), where every still and build dies at
 *    its render step after a narrate that passed.
 * 2. **`DEAD_CALLS` calls in a row each died outright**, some step dying at
 *    start and none starting, with no call in between in which any step
 *    started: a toolchain dead in several steps at once (an `api` dying at
 *    render, then a `still` dying at narrate) is stopped as soon as one dead
 *    in a single step would be.
 */

/** Under this, a step with no exit code never got going. The incident's died in 20 to 26 ms; a tool's CLI takes longer than this to reach agent code. */
export const DEAD_START_MS = 2_000;

/**
 * Three: one dead call can be a moment's trouble (a fork the OS refused under
 * load), and two in a row the agent retrying that same moment; a third, with
 * nothing starting in between, is a pattern, and costs a few turns rather
 * than the attempt. More would buy little certainty: the incident's calls
 * were dead from the first, in every verb.
 */
export const DEAD_CALLS = 3;

export interface DeadCall {
  verb: WrapperCall["verb"];
  step: CallStep["step"];
  signal: string | null;
  ms: number;
  endedAt: string;
}

export interface DeadTools {
  /** Which clause stopped it: one step dead in a row, or every call dead whatever the step. */
  rule: "same-step" | "every-call";
  /** The step that died in the last of those calls. */
  step: CallStep["step"];
  /** The dead calls that made the run, oldest first, `DEAD_CALLS` of them. */
  calls: DeadCall[];
}

/** No exit code, and over within `DEAD_START_MS`: the step never ran. A malformed record counts as started. */
export function diedAtStart(step: Pick<CallStep, "exitCode" | "ms">): boolean {
  return step.exitCode === null && typeof step.ms === "number" && Number.isFinite(step.ms) && step.ms >= 0 && step.ms < DEAD_START_MS;
}

/**
 * Whether a job's wrapper calls, oldest first, show tools that cannot start:
 * the first point at which either clause held, or null. The first point, so a
 * log read again later, after the job was stopped, gives the same answer.
 */
export function deadTools(calls: readonly WrapperCall[], threshold: number = DEAD_CALLS): DeadTools | null {
  const byStep = new Map<CallStep["step"], DeadCall[]>();
  let outright: DeadCall[] = [];
  for (const call of calls) {
    if (call.verb === "refused" || !Array.isArray(call.steps) || call.steps.length === 0) continue;
    let started = false;
    let died: DeadCall | null = null;
    for (const step of call.steps) {
      if (diedAtStart(step)) {
        died = { verb: call.verb, step: step.step, signal: step.signal ?? null, ms: step.ms, endedAt: call.endedAt };
        byStep.set(step.step, [...(byStep.get(step.step) ?? []), died]);
      } else {
        started = true;
        byStep.set(step.step, []);
      }
    }
    if (started) outright = [];
    else if (died !== null) outright.push(died);
    for (const [step, run] of byStep) {
      if (run.length >= threshold) return { rule: "same-step", step, calls: run.slice(-threshold) };
    }
    if (died !== null && outright.length >= threshold) return { rule: "every-call", step: died.step, calls: outright.slice(-threshold) };
  }
  return null;
}

const STEP_WORDS: Record<CallStep["step"], string> = {
  render: "the render step (in the render sandbox)",
  narrate: "the narration step (in the narration sandbox)",
  sidecars: "the sidecars step (in the narration sandbox)",
};

function how(call: DeadCall): string {
  return call.signal !== null ? `killed by ${call.signal} ${call.ms} ms after it started` : `with no exit code and no signal after ${call.ms} ms, so it could not be started at all`;
}

/**
 * The job's error, from the wrapper's own records only. What the wrapper
 * printed is not in it: that text can carry what an earlier step of the call
 * printed from the agent's files, and this sentence reaches the planner as a
 * STUDIO note. The runner logs that output in the job's events instead.
 */
export function deadToolsMessage(verdict: DeadTools): string {
  const last = verdict.calls[verdict.calls.length - 1]!;
  const verbs = verdict.calls.map((call) => `video ${call.verb}`).join(", ");
  const what =
    verdict.rule === "same-step"
      ? `${STEP_WORDS[verdict.step]} died as it started in ${verdict.calls.length} calls in a row (${verbs}), with no call in between in which it ran`
      : `${verdict.calls.length} calls in a row (${verbs}) died as they started, with no step in any of them running`;
  return (
    `The video tools could not start on this machine: ${what}. The last one was ${how(last)}. ` +
    "That is the machine's problem, not the agent's: no change to the scenes can fix a tool that dies before it runs, " +
    "so the job was stopped rather than left to retry. Check the video doctor and the tool's install, then make the video again."
  );
}
