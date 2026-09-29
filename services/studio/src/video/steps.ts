import type { WrapperCall, SheetRead } from "./calls";
import type { VideoGateResult, VideoStep } from "./types";

/**
 * The job view's list of steps (docs/STUDIO-VIDEOS.md, "The job view"): the
 * manimkc-video skill's order, each advanced by what the runner can see
 * rather than by anything the agent says about itself (D24). The wrapper's
 * call log says what ran; the stream says what was edited and read; the
 * gate says what was checked.
 */

export interface StepFacts {
  narrated: boolean;
  /** The runner's seeding, before the agent starts. */
  seeded: { wanted: number; seeded: number } | null;
  setupDone: boolean;
  /** Edits of the scene file the stream showed. */
  edits: number;
  calls: WrapperCall[];
  reads: SheetRead[];
  /** Scene class to sheet path. */
  sheets: Record<string, string>;
  /** The gate, while it runs or when it ran; null before. */
  gate: VideoGateResult | null;
  gateRunning: boolean;
  /** True once the job reached `awaiting_review`. */
  ready: boolean;
  /** True while the agent is running. */
  agentRunning: boolean;
}

function step(name: VideoStep["name"], state: VideoStep["state"], rounds = 0, note: string | null = null): VideoStep {
  return { name, state, rounds, note };
}

/** The calls of one verb that ran something (a refusal is not a round). */
function rounds(calls: WrapperCall[], verb: WrapperCall["verb"]): WrapperCall[] {
  return calls.filter((call) => call.verb === verb);
}

function stateOf(list: WrapperCall[]): VideoStep["state"] {
  const last = list.at(-1);
  if (last === undefined) return "pending";
  return last.exitCode === 0 ? "done" : "failed";
}

export function deriveSteps(facts: StepFacts): VideoStep[] {
  const steps: VideoStep[] = [step("storyboard", "done", 1, "the brief is the storyboard")];

  if (facts.narrated) {
    const voicing = facts.calls.filter((call) => (call.steps ?? []).some((entry) => entry.step === "narrate"));
    const failed = voicing.at(-1)?.steps?.find((entry) => entry.step === "narrate")?.exitCode;
    const seededNote =
      facts.seeded === null ? null : `${facts.seeded.seeded} of ${facts.seeded.wanted} lines already voiced`;
    steps.push(
      step(
        "narration",
        voicing.length === 0 ? (facts.seeded === null ? "pending" : "running") : failed === 0 ? "done" : "failed",
        voicing.length,
        voicing.length === 0 ? seededNote : `${voicing.length} narration step${voicing.length === 1 ? "" : "s"}${seededNote === null ? "" : `; ${seededNote}`}`,
      ),
    );
  }

  steps.push(step("setup", facts.setupDone ? "done" : "running", facts.setupDone ? 1 : 0));
  steps.push(step("scene-code", facts.edits === 0 ? (facts.setupDone && facts.agentRunning ? "running" : "pending") : "done", facts.edits));

  const lints = rounds(facts.calls, "lint");
  steps.push(step("lint", stateOf(lints), lints.length));

  const previews = rounds(facts.calls, "preview");
  const lastScenes = previews.at(-1)?.rendered ?? [];
  steps.push(step("preview", stateOf(previews), previews.length, previews.length === 0 ? null : `round ${previews.length}: ${lastScenes.length} scene(s) rendered`));

  // Sheets read since each one's last render.
  const scenes = Object.keys(facts.sheets);
  let current = 0;
  let rendered = 0;
  for (const scene of scenes) {
    const render = [...previews].reverse().find((call) => (call.rendered ?? []).includes(scene));
    if (render === undefined) continue;
    rendered += 1;
    const sheet = facts.sheets[scene];
    if (facts.reads.some((read) => read.path === sheet && Date.parse(read.at) >= Date.parse(render.endedAt))) current += 1;
  }
  steps.push(
    step(
      "look",
      rendered === 0 ? "pending" : current === scenes.length ? "done" : "running",
      current,
      rendered === 0 ? null : `${current} of ${scenes.length} sheets read since their last render`,
    ),
  );

  const builds = rounds(facts.calls, "build");
  steps.push(step("build", stateOf(builds), builds.length));

  const gate = facts.gate;
  const check = gate?.steps.filter((entry) => entry.name !== "poster") ?? [];
  steps.push(
    step(
      "check",
      facts.gateRunning ? "running" : gate === null ? "pending" : check.every((entry) => entry.ok) && gate.ok ? "done" : check.some((entry) => !entry.ok) ? "failed" : "running",
      gate === null ? 0 : 1,
      gate === null ? null : `${check.filter((entry) => entry.ok).length} of ten checks passed`,
    ),
  );
  const poster = gate?.steps.find((entry) => entry.name === "poster");
  steps.push(step("poster", poster === undefined ? "pending" : poster.ok ? "done" : "failed", poster === undefined ? 0 : 1));
  steps.push(step("ready", facts.ready ? "done" : "pending", facts.ready ? 1 : 0));
  return steps;
}
