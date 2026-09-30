import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { isNarrated } from "../brief";
import { safeRead } from "../copy";
import type { SourceCheck, SourceCheckInput, GateReport, VideoGateChecks } from "../gate";
import { compareLines, inOrder } from "../lines";
import { sheetPath } from "../paths";
import { sceneClasses, voicedLines, type ScannedClass } from "../scan";
import type { LineChange } from "../types";

/**
 * manimkc's part of the gate (D75, D77 of docs/STUDIO-VIDEO-TOOLS.md): the
 * steps that read a ManimGL scene file. Step 1 parses it with Python's `ast`
 * in the render profile, step 2 is `manimkc lint`, step 3 matches the scene
 * classes, the `voiceover` literals and the labels against the brief. The
 * other seven steps are the gate's own, the same for every tool.
 *
 * A module of its own, not part of `manimkc.ts`, because the gate falls back
 * to it when a caller names no backend (a test's recorded fixtures), and the
 * backend imports the gate's sandboxed tools, which import the gate.
 */

async function checkSource(input: SourceCheckInput, report: GateReport): Promise<SourceCheck> {
  const { brief, paths, tools } = input;
  const narrated = isNarrated(brief);

  /* 1. Source: exists, parses, newer than the job, and on a change, changed. */
  let source: string;
  try {
    source = (await safeRead(paths.sceneFile, 2 * 2 ** 20)).toString("utf8");
  } catch (error) {
    report.step("source", false, (error as Error).message);
    report.finding(`The scene file ${path.basename(paths.sceneFile)} could not be read: ${(error as Error).message}.`);
    return { ok: false, script: null };
  }
  const facts = await stat(paths.sceneFile);
  const scan = await tools.scan(source);
  if (!scan.ok) {
    report.step("source", false, scan.error ?? "does not parse");
    report.finding(`The scene file does not parse: ${scan.error ?? "no reason given"}. Fix it, preview and build again.`);
    return { ok: false, script: null };
  }
  if (facts.mtimeMs + 1000 < input.startedAtMs) {
    report.step("source", false, "older than the job");
    report.finding("The scene file was not written during this job. Write the scenes, preview them, look, and build.");
    return { ok: false, script: null };
  }
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (input.sourceHashBefore !== null && sourceHash === input.sourceHashBefore) {
    report.step("source", false, "unchanged from the source the job started from");
    report.finding("The scene file is exactly the source this change started from. Make the change the brief asks for, then preview and build.");
    return { ok: false, script: null };
  }
  report.step("source", true, `${source.length} characters, parses`);

  /* 2. Lint: no errors. Warnings are kept for the card. */
  const lint = await tools.lint();
  if (lint === null) {
    report.step("lint", false, "manimkc lint did not answer");
    report.finding("manimkc lint did not answer. Run video lint yourself and fix what it says.");
    return { ok: false, script: null };
  }
  for (const warning of lint.warnings) report.warning(`lint: ${warning.msg}`);
  if (lint.errors.length > 0) {
    report.step("lint", false, `${lint.errors.length} error(s)`);
    report.finding(`video lint reports ${lint.errors.length} error(s): ${lint.errors.map((error) => `line ${error.line ?? "?"}: ${error.msg}`).join("; ")}.`);
    return { ok: false, script: null };
  }
  report.step("lint", true, `no errors, ${lint.warnings.length} warning(s)`);

  /* 3. The script: the classes, the labels, and the lines. */
  const classes = sceneClasses(scan);
  const names = classes.map((entry) => entry.name);
  const scriptProblems: string[] = [];
  if (names.join(",") !== input.classes.join(",")) {
    scriptProblems.push(`the scene classes must be exactly ${input.classes.join(", ")}, in that order; the file has ${names.join(", ") || "none"}`);
  }
  const byName = new Map<string, ScannedClass>(classes.map((entry) => [entry.name, entry]));
  const changes: LineChange[] = [];
  brief.scenes.forEach((scene, i) => {
    const cls = byName.get(input.classes[i] ?? "");
    if (cls === undefined) return;
    const literals = cls.strings.map((value) => value.toLowerCase());
    for (const beat of scene.beats) {
      for (const label of beat.labels) {
        if (!literals.some((value) => value.includes(label.toLowerCase()))) {
          scriptProblems.push(`${cls.name} never shows the label "${label}": it must appear in a string literal in that class`);
        }
      }
    }
    if (narrated) {
      if (cls.voiceovers.some((voice) => voice.text === null)) {
        scriptProblems.push(`${cls.name} has a voiceover whose argument is not a plain double-quoted string, which the narration step cannot read`);
      }
      const voiced = cls.voiceovers.flatMap((voice) => (voice.text === null ? [] : [voice.text]));
      if (voiced.length === 0) scriptProblems.push(`${cls.name} has no voiceover at all`);
      changes.push(...compareLines(cls.name, scene.beats.map((beat) => beat.say), voiced));
    } else {
      if (cls.voiceovers.length > 0) scriptProblems.push(`${cls.name} has a voiceover, and this video is silent`);
      const missing = inOrder(scene.beats.map((beat) => beat.say), cls.captions);
      if (missing !== null) {
        scriptProblems.push(`${cls.name} must show each beat's caption, as written and in order, as the first argument of a CaptionBar set or say call; "${missing}" is not there`);
      }
    }
  });
  const script = { classes: names, changes };
  if (scriptProblems.length > 0) {
    report.step("script", false, scriptProblems.join("; "));
    report.finding(...scriptProblems.map((problem) => `The script: ${problem}.`));
    return { ok: false, script };
  }
  const changed = changes.filter((change) => change.kind !== "unchanged").length;
  report.step("script", true, narrated ? `${names.length} scenes; ${changed} line(s) differ from the brief` : `${names.length} scenes, every caption in place`);
  return { ok: true, script, sourceHash, voiced: voicedLines(scan) };
}

export const MANIMKC_GATE: VideoGateChecks = {
  checkSource,
  sheet: sheetPath,
};
