import { lstat, stat } from "node:fs/promises";

import type { GateReport, LookInput, LookResult, SceneParse, SourceCheck, SourceCheckInput, VideoGateChecks } from "../gate";
import { compareLines } from "../lines";
import type { VideoPaths } from "../paths";
import type { LineChange } from "../types";
import { revideokcPaths } from "./paths";
import { combinedHash, readSources, SOURCE_BYTES_MAX, SourceRefused, type SourceFile } from "./source";

/**
 * revideokc's part of the gate (D77 of docs/STUDIO-VIDEO-TOOLS.md): steps 1
 * to 3 over a topic folder of TypeScript and a `narration.json`, and the two
 * sheets step 10 wants Read. The other seven steps are the gate's own.
 *
 * 1. **Source**: every source file read the careful way, `scene.tsx` and
 *    `narration.json` present, each TypeScript file parsed by the TypeScript
 *    compiler's parser in the gate profile, `scene.tsx` with a default
 *    export, the whole source within what Accept stores, and on a change,
 *    the source changed. The hash is the combined one the wrapper records.
 * 2. **Lint**: `tsc --noEmit` in the render profile, no errors.
 * 3. **Script**: `narration.json` is one chapter per scene of the brief,
 *    named by its class and in its order, each line one plain line; the
 *    lines are compared with the brief's (`compareLines`, the respellings and
 *    splits D47 allows, reported to the person); `hold` is at most three
 *    seconds; and each beat's labels appear in a string of a file the scene
 *    reaches (`scene.tsx` and what it imports from the topic folder).
 *
 * Why the labels are not tied to their scene, as manimkc ties them to its
 * scene class: every chapter of a revideokc video plays in one generator,
 * and nothing in the source says which code runs during which chapter.
 * Scenes are told apart at run time by cues on the clock (`t.at(...)`), and
 * idiomatic code puts its data in constants above the generator, loops over
 * the chapters (the stub does), and calls helpers from several of them, so
 * the place a string is written says nothing about when it is on screen. A
 * span of text between one chapter's first cue and the next's would fail
 * that code while still passing a label drawn in the wrong chapter. The
 * honest static check is the narrower one here, that the label is in code
 * the video runs, not in an unused helper; whether it is on screen in its
 * chapter is what the agent's look at the stills sheet and the person's
 * review are for.
 *
 * Step 10 is this tool's own (`looked`): a still of every scene, of the
 * source the gate checked, whose sheet was Read before anything rewrote it,
 * and the build's sheet Read after the build the gate copied.
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
  // The catalog's limit on the whole source, topic.yml included, so a video
  // the gate passes is one Accept can store.
  const topicBytes = (await lstat(paths.topicYml).catch(() => null))?.size ?? 0;
  const bytes = files.reduce((sum, file) => sum + file.body.length, 0) + topicBytes;
  if (bytes > SOURCE_BYTES_MAX) {
    return fail(
      "source",
      `${bytes} bytes of source, over the ${SOURCE_BYTES_MAX} Accept stores`,
      `The source is ${bytes} bytes with topic.yml, and a video is stored with at most ${SOURCE_BYTES_MAX}: make it smaller (data belongs in fewer, shorter literals).`,
    );
  }
  const parses = new Map<string, SceneParse>();
  for (const entry of files.filter((file) => /\.tsx?$/.test(file.name))) {
    const parsed = await tools.parseScene(entry.body.toString("utf8"));
    if (!parsed.ok) {
      return fail("source", `${entry.name}: ${parsed.error ?? "does not parse"}`, `${entry.name} does not parse: ${parsed.error ?? "no reason given"}. Fix it, still and build again.`);
    }
    if (entry.name === "scene.tsx" && !parsed.defaultExport) {
      return fail("source", "scene.tsx has no default export", "scene.tsx must `export default defineTopic(...)`: it is what the project loads.");
    }
    parses.set(entry.name, parsed);
  }
  const strings = reachable(parses).flatMap((name) => parses.get(name)?.strings ?? []);
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
          problems.push(`the source never shows the label "${label}" of ${name}: it must appear in a string in scene.tsx or a file it imports`);
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

/**
 * The files `scene.tsx` reaches through relative imports of the topic folder
 * (`./parts`, `./parts.ts`), itself first: the files whose strings can be on
 * screen. A file nothing imports is not among them.
 */
export function reachable(parses: ReadonlyMap<string, SceneParse>): string[] {
  const seen: string[] = [];
  const queue = ["scene.tsx"];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.includes(name) || !parses.has(name)) continue;
    seen.push(name);
    for (const specifier of parses.get(name)?.imports ?? []) {
      const match = /^\.\/([A-Za-z0-9_][A-Za-z0-9_.-]*)$/.exec(specifier);
      if (match === null) continue;
      const bare = match[1]!.replace(/\.(?:js|jsx|mjs)$/, "");
      const found = [bare, `${bare}.ts`, `${bare}.tsx`].find((candidate) => parses.has(candidate));
      if (found !== undefined) queue.push(found);
    }
  }
  return seen;
}

/**
 * Step 10 for a revideokc job (D77). Every still writes the one stills sheet,
 * and a still of chosen moments rewrites it with those moments only, so:
 *
 * - the still that counts is the last successful one of every scene (no
 *   moments named), and it must be of the source the gate checked, so a look
 *   before the last edit of any source file does not count;
 * - its sheet must have been Read after it ended and before any later still
 *   that ran started, since that still replaced the sheet (one refused before
 *   any step, for a held port, wrote nothing);
 * - the build's sheet must have been Read after the build the gate copied.
 */
function looked(input: LookInput): LookResult {
  const own = revideokcPaths(input.paths);
  const problems: string[] = [];
  const stills = input.calls.filter((call) => call.verb === "still");
  const full = [...stills].reverse().find((call) => call.exitCode === 0 && input.classes.every((scene) => (call.rendered ?? []).includes(scene)));
  let readAt: string | null = null;
  if (full === undefined) {
    problems.push(`there is no still of every scene to look at: run still with no moments, and Read its sheet, ${own.stillsSheet}`);
  } else if (full.sceneSha256 !== input.sourceHash) {
    problems.push(`the source changed after the last still of every scene, at ${full.endedAt}: run still with no moments again, and Read its sheet, ${own.stillsSheet}`);
  } else {
    const ended = Date.parse(full.endedAt);
    // A still the wrapper refused before any step ran (a held port: `steps`
    // empty) wrote nothing, so it did not replace the sheet. A record with no
    // `steps` at all is counted as a replacement, the safe reading.
    const next = stills.find((call) => Date.parse(call.startedAt) >= ended && call !== full && (call.steps === undefined || call.steps.length > 0));
    const until = next === undefined ? Infinity : Date.parse(next.startedAt);
    const read = [...input.reads].reverse().find((entry) => entry.path === own.stillsSheet && Date.parse(entry.at) >= ended && Date.parse(entry.at) < until);
    readAt = read?.at ?? null;
    if (read === undefined) {
      problems.push(
        next === undefined
          ? `look at the stills sheet, rendered at ${full.endedAt}: ${own.stillsSheet}`
          : `the stills sheet of every scene, rendered at ${full.endedAt}, was replaced by a later still before it was Read: run still with no moments again, and Read ${own.stillsSheet}`,
      );
    }
  }
  const out: LookResult["looked"] = {};
  for (const scene of input.classes) out[scene] = { renderedAt: full?.endedAt ?? null, readAt };
  const buildRead = [...input.reads].reverse().find((entry) => entry.path === own.buildSheet && Date.parse(entry.at) >= Date.parse(input.build.endedAt));
  out.build = { renderedAt: input.build.endedAt, readAt: buildRead?.at ?? null };
  if (buildRead === undefined) problems.push(`look at the build's sheet, written at ${input.build.endedAt}: ${own.buildSheet}`);
  return { looked: out, problems };
}

export const REVIDEOKC_GATE: VideoGateChecks = {
  checkSource,
  // One stills sheet shows every scene, so each scene's sheet is that one.
  sheet: (paths: VideoPaths) => revideokcPaths(paths).stillsSheet,
  looked,
};
