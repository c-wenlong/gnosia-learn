import { stat } from "node:fs/promises";

import { loadVocabulary } from "./brief";
import { canvas, EXIT, explainExit, type InspectReport, type VerifyReport } from "./canvas";
import { absolute } from "./paths";
import type { GateResult, GateStep } from "./store";

/**
 * The gate: the runner's own five subprocess calls, after the agent exits.
 *
 * Layering rule 4, and the reason the whole phase exists: **the agent's word is
 * never enough.** It reports what it believes it drew; the runner establishes
 * what is on disk. Every narration line a person reads afterwards comes from
 * one of these calls rather than from the agent's summary (D24), which is the
 * same rule one layer down as tldrawkc's own "look at the screenshot".
 *
 * The exit-code reading is D4 and it is the part that is easy to get wrong.
 * Exit 3 is a finished document with lints left: sending that to the failure
 * state would train a person to ignore the failure state. Exit 4 is a document
 * that saved while its export did not, which costs a picture and never the
 * work, so the job still reaches `awaiting_review` and Accept does the export
 * that was missed.
 */

export interface GateInput {
  slug: string;
  topic: string;
  candidatePath: string;
  candidateSvgPath: string;
  /** The job's start, in ms. A candidate older than this is not this job's. */
  startedAtMs: number;
  /** Called as each step finishes, for the narration. */
  onStep?: (step: GateStep) => void;
}

export async function runGate(input: GateInput): Promise<GateResult> {
  const steps: GateStep[] = [];
  const findings: string[] = [];
  let shapes: number | null = null;
  let lints: number | null = null;
  let svg: { path: string; bytes: number | null } | null = null;
  let exportFailed = false;

  const record = (step: GateStep): GateStep => {
    steps.push(step);
    input.onStep?.(step);
    return step;
  };

  const finish = (): GateResult => ({
    ok: findings.length === 0,
    steps,
    findings,
    shapes,
    lints,
    svg,
    exportFailed,
    checkedAt: new Date().toISOString(),
  });

  /* 1. The candidate exists, and this job wrote it. */
  const candidate = absolute(input.candidatePath);
  const facts = await stat(candidate).catch(() => null);
  if (facts === null || !facts.isFile()) {
    record({ name: "candidate", ok: false, detail: `${input.candidatePath} does not exist` });
    findings.push(
      `Nothing was written to ${input.candidatePath}. That is the file the diagram has to be ` +
        `drawn into; no other path counts as output.`,
    );
    return finish();
  }
  if (facts.mtimeMs < input.startedAtMs) {
    // An older file is a candidate left behind by something else. Treating it
    // as this job's output would attribute a drawing to a session that never
    // made it, which is the one thing `asset_job` exists to get right.
    record({
      name: "candidate",
      ok: false,
      detail: `${input.candidatePath} was last written before this attempt started`,
    });
    findings.push(
      `${input.candidatePath} is older than this attempt, so nothing was drawn this time. ` +
        `Draw into that file.`,
    );
    return finish();
  }
  record({ name: "candidate", ok: true, detail: `${input.candidatePath}, ${facts.size} bytes` });

  /* 2. It parses, it has shapes, and its lints are survivable. */
  const inspected = await canvas(["inspect", input.candidatePath, "--json"]);
  const report = (inspected.json ?? {}) as InspectReport;
  const shapeCount = Array.isArray(report.shapes) ? report.shapes.length : 0;
  const lintList = Array.isArray(report.lints) ? report.lints : [];
  shapes = shapeCount;
  lints = lintList.length;
  if (inspected.code !== EXIT.ok && inspected.code !== EXIT.lintsRemain) {
    record({
      name: "inspect",
      ok: false,
      detail: explainExit(inspected.code),
      exitCode: inspected.code,
    });
    findings.push(
      `\`canvas inspect\` exited ${inspected.code} (${explainExit(inspected.code)}): ` +
        `${inspected.stderr.trim().split("\n").slice(-2).join(" ") || "no detail"}`,
    );
    return finish();
  }
  if (shapeCount === 0) {
    record({ name: "inspect", ok: false, detail: "no shapes", exitCode: inspected.code });
    findings.push(`${input.candidatePath} parses but holds no shapes, so nothing was drawn.`);
    return finish();
  }
  record({
    name: "inspect",
    ok: true,
    detail: `${shapeCount} shape${shapeCount === 1 ? "" : "s"}, ${lintList.length} lint${lintList.length === 1 ? "" : "s"}`,
    exitCode: inspected.code,
  });

  /* 3. The stamp names the topic the job was enqueued under. */
  const stamped = report.meta?.topic;
  const vocabulary = await loadVocabulary();
  if (typeof stamped !== "string" || stamped === "") {
    record({ name: "topic", ok: false, detail: "no topic in the document metadata" });
    findings.push(
      `The document carries no topic. Stamp it: \`npm run --silent canvas -- meta set ` +
        `${input.candidatePath} --topic ${input.topic}\`, then re-export the SVG, because ` +
        `\`export --svg\` writes the topic onto it.`,
    );
    return finish();
  }
  if (!vocabulary.topics.has(stamped)) {
    record({ name: "topic", ok: false, detail: `"${stamped}" is not in content/topics.yaml` });
    findings.push(
      `The document is stamped with topic "${stamped}", which is not in content/topics.yaml. ` +
        `The indexer refuses a file by name for exactly that, so it has to be "${input.topic}".`,
    );
    return finish();
  }
  if (stamped !== input.topic) {
    record({ name: "topic", ok: false, detail: `stamped "${stamped}", enqueued "${input.topic}"` });
    findings.push(
      `The document is stamped with topic "${stamped}" but this job was enqueued under ` +
        `"${input.topic}". Restamp it with \`meta set --topic ${input.topic}\` and re-export.`,
    );
    return finish();
  }
  record({ name: "topic", ok: true, detail: stamped });

  /* 4. The export. Exit 4 is recorded and is not fatal: D4. */
  const exported = await canvas([
    "export",
    input.candidatePath,
    "--svg",
    input.candidateSvgPath,
  ]);
  if (exported.code === EXIT.exportFailed || exported.code !== EXIT.ok) {
    exportFailed = true;
    record({
      name: "export",
      ok: false,
      detail: explainExit(exported.code),
      exitCode: exported.code,
    });
    // Deliberately not a finding. A finding sends the job back for another paid
    // attempt, and an export failure costs a picture the accept step re-runs
    // anyway. The job still reaches awaiting_review, and the panel says so.
    return finish();
  }
  const svgFacts = await stat(absolute(input.candidateSvgPath)).catch(() => null);
  svg = { path: input.candidateSvgPath, bytes: svgFacts?.size ?? null };
  record({
    name: "export",
    ok: true,
    detail: `${input.candidateSvgPath}, ${svgFacts?.size ?? "?"} bytes`,
    exitCode: exported.code,
  });

  /* 5. The SVG is self-contained, its fonts applied, its text visible. */
  const verified = await canvas(["verify", input.candidateSvgPath, "--json"]);
  const verifyReport = (verified.json ?? {}) as VerifyReport;
  const failed = (verifyReport.checks ?? []).filter((check) => !check.ok);
  if (verified.code !== EXIT.ok) {
    record({
      name: "verify",
      ok: false,
      detail:
        failed.length > 0
          ? failed.map((check) => `${check.rule}: ${check.detail}`).join("; ")
          : explainExit(verified.code),
      exitCode: verified.code,
    });
    findings.push(
      ...(failed.length > 0
        ? failed.map((check) => `\`canvas verify\` failed "${check.rule}": ${check.detail}`)
        : [`\`canvas verify\` exited ${verified.code} (${explainExit(verified.code)}).`]),
    );
    return finish();
  }
  record({
    name: "verify",
    ok: true,
    detail: `${(verifyReport.checks ?? []).length} checks passed`,
    exitCode: verified.code,
  });

  return finish();
}

/** The narration line for one gate step, derived from the tool's own numbers. */
export function narrate(step: GateStep): string {
  switch (step.name) {
    case "candidate":
      return step.ok ? `wrote ${step.detail}` : `nothing to check: ${step.detail}`;
    case "inspect":
      return step.ok ? `drew ${step.detail}` : `the document did not pass inspect: ${step.detail}`;
    case "topic":
      return step.ok ? `filed under ${step.detail}` : `the topic stamp is wrong: ${step.detail}`;
    case "export":
      return step.ok ? `exported ${step.detail}` : `the export failed: ${step.detail}`;
    case "verify":
      return step.ok ? `verified: ${step.detail}` : `verify refused it: ${step.detail}`;
    default:
      return `${step.name}: ${step.detail}`;
  }
}
