import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { loadVocabulary, type BriefElement, type BriefRelation } from "./brief";
import {
  canvas,
  EXIT,
  explainExit,
  type InspectBinding,
  type InspectReport,
  type InspectShape,
  type VerifyReport,
} from "./canvas";
import { absolute } from "./paths";
import type { GateResult, GateStep } from "./store";

/**
 * The gate: the runner's own checks, after the agent exits.
 *
 * Layering rule 4, and the reason the whole phase exists: **the agent's word is
 * never enough.** It reports what it believes it drew; the runner establishes
 * what is on disk. Every narration line a person reads afterwards comes from
 * one of these calls rather than from the agent's summary (D24), which is the
 * same rule one layer down as tldrawkc's own "look at the screenshot".
 *
 * The design names five steps and there are six. The extra one is `brief`, and
 * it is not an addition so much as the half the first pass left out: the brief
 * table calls `elements` "the agent's checklist and **half the gate**", and a
 * gate that only counted shapes established that *a* diagram existed, never
 * that it was the one asked for. It costs no subprocess — the labels and the
 * bindings are already in the `inspect --json` the step before it ran.
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
  /**
   * What the brief said had to be in the picture.
   *
   * The design's brief table calls `elements` "the agent's checklist and half
   * the gate" and says each relation "becomes a bound arrow through
   * `helpers.connect`". Without them here the gate counted shapes and nothing
   * else, so a correctly stamped diagram of the wrong thing passed every step.
   */
  elements: BriefElement[];
  relations: BriefRelation[];
  /**
   * In `extend` mode, the sha256 of the copy the runner made before the agent
   * started. A candidate still byte-identical to it is a job that drew nothing.
   */
  unchangedHash?: string | null;
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
  if (input.unchangedHash != null) {
    // `extend` copies the committed file to the candidate path before the agent
    // starts, so the candidate exists and is newer than the attempt whether or
    // not a single shape was added. Without this, an agent that never started
    // — or one that started and did nothing — reaches review offering the
    // runner's own copy of the target back as new work, and every step after
    // this one passes, because the committed file was already a good diagram.
    const now = await sha256(candidate);
    if (now !== null && now === input.unchangedHash) {
      record({
        name: "candidate",
        ok: false,
        detail: `${input.candidatePath} is byte-identical to the copy made before the attempt`,
      });
      findings.push(
        `${input.candidatePath} is unchanged: it is still exactly the copy of the committed ` +
          `diagram that was put there for you before you started. Nothing was drawn, so there is ` +
          `nothing to review. Extend it.`,
      );
      return finish();
    }
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

  /* 3. The picture is of the thing that was asked for. */
  const brief = checkBrief(input, report);
  record(brief.step);
  if (!brief.step.ok) {
    findings.push(...brief.findings);
    return finish();
  }

  /* 4. The stamp names the topic the job was enqueued under. */
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

  /* 5. The export. Exit 4 is recorded and is not fatal: D4. */
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

  /* 6. The SVG is self-contained, its fonts applied, its text visible. */
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

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Text as it is compared: lowercased, with everything that is not a letter or a
 * digit flattened to a single space.
 *
 * So `Vector a` matches a shape labelled `vector a (the arrow)`, and `Gram–
 * Schmidt` matches `Gram-Schmidt`. The comparison is deliberately loose in one
 * direction only — the label has to be *inside* the shape's text — because
 * adding to a label is how a good diagram explains itself and replacing one is
 * how it stops being the diagram that was asked for.
 *
 * `\p{L}` and `\p{N}`, not `a-z0-9`. An ASCII class deletes a Cyrillic, Greek
 * or CJK label down to the empty string, and an empty needle is inside every
 * haystack — so the check would have reported every element of a non-ASCII
 * brief as present and let any binding satisfy any relation. A gate that passes
 * whatever it cannot read is worse than no gate, because it is believed.
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The fallback for a label with no letters or digits in it at all: `+`, `→`,
 * `∑`. Rare, legal, and the one case `normalise` cannot represent.
 *
 * Lowercased and trimmed, and nothing else. What it must never do is come back
 * empty, because the caller treats an empty needle as matching everything.
 */
function raw(value: string): string {
  return value.toLowerCase().trim();
}

const MAX_REPORTED = 6;

/**
 * Does the drawing contain what the brief asked for?
 *
 * Elements are matched against shape labels and relations against bindings, so
 * both answers come from `inspect --json` rather than from anything the agent
 * said about its own work — the same rule as every other step (D24).
 *
 * A relation whose endpoints were not drawn is not reported twice: the missing
 * element is the finding, and an arrow it cannot have is a consequence. A
 * binding is accepted in either direction, because an arrow drawn the other way
 * round is a picture worth reviewing and a retry spent on its orientation is a
 * paid attempt spent on nothing.
 */
export function checkBrief(
  input: Pick<GateInput, "elements" | "relations" | "candidatePath">,
  report: InspectReport,
): { step: GateStep; findings: string[] } {
  const shapes: InspectShape[] = Array.isArray(report.shapes) ? report.shapes : [];
  const bindings: InspectBinding[] = Array.isArray(report.bindings) ? report.bindings : [];
  const labelled = shapes
    .filter((shape) => typeof shape.text === "string" && shape.text.trim() !== "")
    .map((shape) => ({
      id: shape.id ?? "",
      text: normalise(shape.text ?? ""),
      raw: raw(shape.text ?? ""),
    }));

  /**
   * Every shape whose label carries this element's words.
   *
   * A label that normalises away — one made entirely of symbols — falls back to
   * the raw text rather than to "everything", which is the answer that would
   * report a missing element as present.
   */
  const shapesFor = (label: string): string[] => {
    const wanted = normalise(label);
    if (wanted !== "") {
      return labelled.filter((shape) => shape.text.includes(wanted)).map((shape) => shape.id);
    }
    const literal = raw(label);
    if (literal === "") return [];
    return labelled.filter((shape) => shape.raw.includes(literal)).map((shape) => shape.id);
  };

  const found = new Map<string, string[]>();
  const missing: string[] = [];
  for (const element of input.elements) {
    const ids = shapesFor(element.label);
    if (ids.length === 0) missing.push(element.label);
    else found.set(element.label, ids);
  }

  const unbound: string[] = [];
  for (const relation of input.relations) {
    const from = found.get(relation.from);
    const to = found.get(relation.to);
    // An endpoint that was never drawn is already a finding of its own.
    if (from === undefined || to === undefined) continue;
    const bound = bindings.some(
      (binding) =>
        (from.includes(binding.from ?? "") && to.includes(binding.to ?? "")) ||
        (to.includes(binding.from ?? "") && from.includes(binding.to ?? "")),
    );
    if (!bound) unbound.push(`${relation.from} → ${relation.to}`);
  }

  if (missing.length === 0 && unbound.length === 0) {
    return {
      step: {
        name: "brief",
        ok: true,
        detail: `${input.elements.length} element${input.elements.length === 1 ? "" : "s"}, ${input.relations.length} bound relation${input.relations.length === 1 ? "" : "s"}`,
      },
      findings: [],
    };
  }

  const findings: string[] = [];
  if (missing.length > 0) {
    findings.push(
      `The brief asked for ${missing.length} element${missing.length === 1 ? "" : "s"} that no ` +
        `shape is labelled with: ${quoteList(missing)}. Every element has to appear as a shape ` +
        `whose label contains those words — add to a label freely, but do not replace it, ` +
        `because the check reads the label text.`,
    );
  }
  if (unbound.length > 0) {
    findings.push(
      `${unbound.length} relation${unbound.length === 1 ? " is" : "s are"} not a bound arrow: ` +
        `${quoteList(unbound)}. A line drawn near two shapes is not a binding; join them with ` +
        `\`helpers.connect\` so the arrow stays attached when either end moves.`,
    );
  }
  return {
    step: {
      name: "brief",
      ok: false,
      detail:
        [
          missing.length > 0 ? `${missing.length} element${missing.length === 1 ? "" : "s"} missing` : "",
          unbound.length > 0 ? `${unbound.length} relation${unbound.length === 1 ? "" : "s"} unbound` : "",
        ]
          .filter((part) => part !== "")
          .join(", "),
    },
    findings,
  };
}

/** A short quoted list, capped so one finding cannot become the whole prompt. */
function quoteList(values: string[]): string {
  const shown = values.slice(0, MAX_REPORTED).map((value) => `"${value}"`);
  const rest = values.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

/** The narration line for one gate step, derived from the tool's own numbers. */
export function narrate(step: GateStep): string {
  switch (step.name) {
    case "candidate":
      return step.ok ? `wrote ${step.detail}` : `nothing to check: ${step.detail}`;
    case "inspect":
      return step.ok ? `drew ${step.detail}` : `the document did not pass inspect: ${step.detail}`;
    case "brief":
      return step.ok ? `covers the brief: ${step.detail}` : `the brief is not covered: ${step.detail}`;
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
