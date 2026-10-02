import { stat } from "node:fs/promises";

import type { GateReport, SourceCheck, SourceCheckInput, VideoGateChecks } from "../gate";
import { compareLines } from "../lines";
import type { VideoPaths } from "../paths";
import type { LineChange } from "../types";
import { revideokcPaths } from "./paths";
import { combinedHash, readSources, SourceRefused, type SourceFile } from "./source";

/**
 * revideokc's part of the gate (D77 of docs/STUDIO-VIDEO-TOOLS.md): steps 1
 * to 3 over a topic folder of TypeScript and a `narration.json`, and the two
 * sheets step 10 wants Read. The other seven steps are the gate's own.
 *
 * 1. **Source**: every source file read the careful way, `scene.tsx` and
 *    `narration.json` present, each TypeScript file parsed by the TypeScript
 *    compiler's parser in the gate profile, `scene.tsx` with a default
 *    export, and on a change, the source changed. The hash is the combined
 *    one the wrapper records.
 * 2. **Lint**: `tsc --noEmit` in the render profile, no errors.
 * 3. **Script**: `narration.json` is one chapter per scene of the brief,
 *    named by its class and in its order, each line one plain line; the
 *    lines are compared with the brief's (`compareLines`, the respellings and
 *    splits D47 allows, reported to the person); `hold` is at most three
 *    seconds; and each beat's labels appear in a string of the source.
 */

/** The most a chapter may hold after its last line: with the 0.4 s tail inside the four seconds step 7 allows. */
export const HOLD_MAX_SECONDS = 3;

/** The longest line, as the brief's own `say` limit. */
const LINE_MAX = 600;

interface Chapter {
  scene: string;
  title: string;
  hold?: number;
  lines: string[];
}

/** `narration.json`'s chapters, or the first thing wrong with it. */
export function readNarration(body: Buffer): { chapters: Chapter[] } | { problem: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch (error) {
    return { problem: `narration.json is not JSON: ${(error as Error).message}` };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { problem: "narration.json must be a list of chapters" };
  const chapters: Chapter[] = [];
  for (const [i, raw] of parsed.entries()) {
    const entry = raw as Record<string, unknown> | null;
    if (entry === null || typeof entry !== "object") return { problem: `chapter ${i + 1} of narration.json is not an object` };
    if (typeof entry.scene !== "string") return { problem: `chapter ${i + 1} of narration.json has no "scene"` };
    if (typeof entry.title !== "string" || entry.title.trim() === "" || entry.title.length > 120 || /[\u0000-\u001f]/.test(entry.title)) {
      return { problem: `${entry.scene} in narration.json needs a "title" of one short line` };
    }
    if (entry.hold !== undefined && (typeof entry.hold !== "number" || !Number.isFinite(entry.hold) || entry.hold < 0 || entry.hold > HOLD_MAX_SECONDS)) {
      return { problem: `${entry.scene} in narration.json holds for ${String(entry.hold)} seconds; "hold" is at most ${HOLD_MAX_SECONDS}` };
    }
    if (!Array.isArray(entry.lines) || entry.lines.length === 0) return { problem: `${entry.scene} in narration.json has no "lines"` };
    for (const line of entry.lines) {
      if (typeof line !== "string" || line.trim() === "" || line.length > LINE_MAX || /[\u0000-\u001f\u007f]/.test(line)) {
        return { problem: `${entry.scene} in narration.json has a line that is not one plain line of at most ${LINE_MAX} characters` };
      }
    }
    chapters.push({ scene: entry.scene, title: entry.title, lines: entry.lines as string[], ...(entry.hold === undefined ? {} : { hold: entry.hold as number }) });
  }
  return { chapters };
}

async function checkSource(input: SourceCheckInput, report: GateReport): Promise<SourceCheck> {
  const { brief, paths, tools } = input;
  /* 1. Source. */
  const fail = (step: string, detail: string, finding: string, script: SourceCheck["script"] = null): SourceCheck => {
    report.step(step, false, detail);
    report.finding(finding);
    return { ok: false, script };
  };
  let files: SourceFile[];
  try {
    files = await readSources(paths.topicDir);
  } catch (error) {
    const message = error instanceof SourceRefused ? error.message : (error as Error).message;
    return fail("source", message, `The source could not be read: ${message}.`);
  }
  const scene = files.find((entry) => entry.name === "scene.tsx");
  const narration = files.find((entry) => entry.name === "narration.json");
  if (scene === undefined) return fail("source", "no scene.tsx", "There is no scene.tsx in the topic folder. Write the scene, still it, look, and build.");
  if (narration === undefined) return fail("source", "no narration.json", "There is no narration.json in the topic folder; it is the script, and the video is made from it.");
  if (tools.parseScene === undefined) return fail("source", "no TypeScript parser", "The check could not parse TypeScript on this machine.");
  const strings: string[] = [];
  for (const entry of files.filter((file) => /\.tsx?$/.test(file.name))) {
    const parsed = await tools.parseScene(entry.body.toString("utf8"));
    if (!parsed.ok) {
      return fail("source", `${entry.name}: ${parsed.error ?? "does not parse"}`, `${entry.name} does not parse: ${parsed.error ?? "no reason given"}. Fix it, still and build again.`);
    }
    if (entry.name === "scene.tsx" && !parsed.defaultExport) {
      return fail("source", "scene.tsx has no default export", "scene.tsx must `export default defineTopic(...)`: it is what the project loads.");
    }
    strings.push(...parsed.strings);
  }
  const facts = await stat(scene.path);
  if (facts.mtimeMs + 1000 < input.startedAtMs) {
    return fail("source", "older than the job", "scene.tsx was not written during this job. Write the scene, still it, look, and build.");
  }
  const sourceHash = combinedHash(files);
  if (input.sourceHashBefore !== null && sourceHash === input.sourceHashBefore) {
    return fail(
      "source",
      "unchanged from the source the job started from",
      "The source is exactly what this change started from. Make the change the brief asks for, then still and build.",
    );
  }
  report.step("source", true, `${files.length} file(s), ${files.reduce((sum, file) => sum + file.body.length, 0)} bytes, every TypeScript file parses`);

  /* 2. Lint. */
  const lint = await tools.lint();
  if (lint === null) return fail("lint", "tsc did not answer", "The TypeScript check did not answer. Run video lint yourself and fix what it says.");
  if (lint.errors.length > 0) {
    return fail(
      "lint",
      `${lint.errors.length} error(s)`,
      `video lint reports ${lint.errors.length} error(s): ${lint.errors.slice(0, 10).map((error) => error.msg).join("; ")}.`,
    );
  }
  report.step("lint", true, "tsc reports no errors");

  /* 3. The script. */
  const read = readNarration(narration.body);
  if ("problem" in read) return fail("script", read.problem, `The script: ${read.problem}.`);
  const names = read.chapters.map((chapter) => chapter.scene);
  const problems: string[] = [];
  if (names.join(",") !== input.classes.join(",")) {
    problems.push(`narration.json's chapters must be exactly ${input.classes.join(", ")}, in that order; it has ${names.join(", ") || "none"}`);
  }
  const byName = new Map(read.chapters.map((chapter) => [chapter.scene, chapter]));
  const changes: LineChange[] = [];
  const lowered = strings.map((value) => value.toLowerCase());
  brief.scenes.forEach((briefScene, i) => {
    const name = input.classes[i] ?? "";
    const chapter = byName.get(name);
    if (chapter === undefined) return;
    changes.push(...compareLines(name, briefScene.beats.map((beat) => beat.say), chapter.lines));
    for (const beat of briefScene.beats) {
      for (const label of beat.labels) {
        if (!lowered.some((value) => value.includes(label.toLowerCase()))) {
          problems.push(`the source never shows the label "${label}" of ${name}: it must appear in a string in scene.tsx or a file beside it`);
        }
      }
    }
  });
  const script = { classes: names, changes };
  if (problems.length > 0) {
    report.step("script", false, problems.join("; "));
    report.finding(...problems.map((problem) => `The script: ${problem}.`));
    return { ok: false, script };
  }
  const changed = changes.filter((change) => change.kind !== "unchanged").length;
  report.step("script", true, `${names.length} chapters; ${changed} line(s) differ from the brief`);
  return {
    ok: true,
    script,
    sourceHash,
    voiced: read.chapters.flatMap((chapter) => chapter.lines),
    files: files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  };
}

export const REVIDEOKC_GATE: VideoGateChecks = {
  checkSource,
  // One stills sheet shows every scene, so each scene's sheet is that one.
  sheet: (paths: VideoPaths) => revideokcPaths(paths).stillsSheet,
  buildSheet: (paths: VideoPaths) => revideokcPaths(paths).buildSheet,
};
