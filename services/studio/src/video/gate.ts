import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// The catalog's own poster recipe, one implementation (docs/STUDIO-VIDEOS.md,
// the gate, step 9). A pure module with no imports, so reaching it by path
// pulls nothing of the catalog's into this service.
import { ffmpegArgs, POSTER_OFFSETS_SECONDS } from "../../../catalog/src/poster/recipe";
import type { GateStep } from "../store";
import { isNarrated, predictedSeconds, secondsForLines, type ValidVideoBrief } from "./brief";
import type { WrapperCall, SheetRead } from "./calls";
import { topicOf } from "./checkout";
import { CopyRefused, safeCopy, safeRead } from "./copy";
import { candidateNames, sheetPath, type VideoPaths } from "./paths";
import { sceneClasses, voicedLines, type Scan, type ScannedClass } from "./scan";
import type { CopyRecord, LineChange, VideoGateResult } from "./types";

/**
 * The gate: the runner's own checks after the agent exits
 * (docs/STUDIO-VIDEOS.md, "The gate"). The agent built the video; the gate
 * renders nothing. It checks the source the video came from and the finished
 * artefact, and it reads the artefact only through copies it took once.
 *
 * Every step that makes a program read something agent code wrote runs that
 * program in a sandbox: the lint and the parse in the render profile, the
 * probe and the poster cut in the gate profile. The steps in Node read JSON
 * and eight-byte box headers from the copies, never a file in `render/`.
 */

/** The sandboxed operations the gate needs, injectable so a test can supply recorded answers. */
export interface GateTools {
  scan(source: string): Promise<Scan>;
  /** `manimkc lint --json` on the scene file, in the render profile; null when it did not answer. */
  lint(): Promise<{ errors: { line?: number; msg: string }[]; warnings: { line?: number; msg: string }[] } | null>;
  /** `ffprobe -f mov` on a copy, in the gate profile; null when it could not read it. */
  probe(file: string): Promise<{ streams: string[]; duration: number | null } | null>;
  /** Cut the poster from the copy into `out`, in the gate profile, at one offset. True when a file was written. */
  poster(input: string, out: string, offsetSeconds: number): Promise<boolean>;
}

export interface VideoGateInput {
  brief: ValidVideoBrief;
  paths: VideoPaths;
  /** The brief's scenes as classes, in order. */
  classes: string[];
  /** When the job's source had to be newer than, in ms: the job's start (a resume, the parent's). */
  startedAtMs: number;
  /** The scene file's sha256 when a change job started from it; null for a new video. */
  sourceHashBefore: string | null;
  calls: WrapperCall[];
  reads: SheetRead[];
  tools: GateTools;
  onStep?: (step: GateStep) => void;
}

/** A held frame: seconds of picture a scene may run after its last line ends (the skill's rule). */
export const HELD_TAIL_SECONDS = 4;
/** Step 8's tolerance on the voiced lines' prediction. */
export const LENGTH_CHECK = 0.15;
/** Beyond this from the brief's target, the length is a warning on the card. */
export const TARGET_WARNING = 0.25;
/** manimkc's deliverables run at 30 to 35 kB a second (measured); three times that is worth a warning. */
export const LARGE_BYTES_PER_SECOND = 3 * 35_000;

/** Sequence the brief's lines for one scene against the voiced ones: equal lines anchor, gaps are changes. */
export function compareLines(scene: string, brief: readonly string[], voiced: readonly string[]): LineChange[] {
  // Longest common subsequence on exact equality.
  const n = brief.length;
  const m = voiced.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i]![j] = brief[i] === voiced[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const changes: LineChange[] = [];
  let gapBrief: string[] = [];
  let gapVoiced: string[] = [];
  const flush = (): void => {
    if (gapBrief.length === 1 && gapVoiced.length > 1) {
      changes.push({ scene, kind: "split", brief: gapBrief[0]!, voiced: gapVoiced });
    } else {
      const paired = Math.min(gapBrief.length, gapVoiced.length);
      for (let k = 0; k < paired; k += 1) changes.push({ scene, kind: "reworded", brief: gapBrief[k]!, voiced: [gapVoiced[k]!] });
      for (const line of gapBrief.slice(paired)) changes.push({ scene, kind: "dropped", brief: line, voiced: [] });
      for (const line of gapVoiced.slice(paired)) changes.push({ scene, kind: "added", brief: null, voiced: [line] });
    }
    gapBrief = [];
    gapVoiced = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && brief[i] === voiced[j]) {
      flush();
      changes.push({ scene, kind: "unchanged", brief: brief[i]!, voiced: [voiced[j]!] });
      i += 1;
      j += 1;
    } else if (j < m && (i === n || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      gapVoiced.push(voiced[j]!);
      j += 1;
    } else {
      gapBrief.push(brief[i]!);
      i += 1;
    }
  }
  flush();
  return changes;
}

/** Is `needle` in order, as whole literals, inside `haystack`? */
function inOrder(needles: readonly string[], haystack: readonly string[]): string | null {
  let at = 0;
  for (const needle of needles) {
    while (at < haystack.length && haystack[at] !== needle) at += 1;
    if (at === haystack.length) return needle;
    at += 1;
  }
  return null;
}

/** The ten steps. */
export async function runVideoGate(input: VideoGateInput): Promise<VideoGateResult> {
  const { brief, paths, tools } = input;
  const narrated = isNarrated(brief);
  const steps: GateStep[] = [];
  const findings: string[] = [];
  const warnings: string[] = [];
  let script: VideoGateResult["script"] = null;
  let sync: VideoGateResult["sync"] = null;
  let length: VideoGateResult["length"] = null;
  let looked: VideoGateResult["looked"] = null;
  let copies: Record<string, CopyRecord> | null = null;
  let durationSeconds: number | null = null;

  const record = (name: string, ok: boolean, detail: string): void => {
    const step = { name, ok, detail };
    steps.push(step);
    input.onStep?.(step);
  };
  const finish = (): VideoGateResult => ({
    ok: findings.length === 0,
    steps,
    findings,
    warnings,
    script,
    sync,
    length,
    looked,
    copies,
    durationSeconds,
    checkedAt: new Date().toISOString(),
  });

  /* 1. Source: exists, parses, newer than the job, and on a change, changed. */
  let source: string;
  try {
    source = (await safeRead(paths.sceneFile, 2 * 2 ** 20)).toString("utf8");
  } catch (error) {
    record("source", false, (error as Error).message);
    findings.push(`The scene file ${path.basename(paths.sceneFile)} could not be read: ${(error as Error).message}.`);
    return finish();
  }
  const facts = await stat(paths.sceneFile);
  const scan = await tools.scan(source);
  if (!scan.ok) {
    record("source", false, scan.error ?? "does not parse");
    findings.push(`The scene file does not parse: ${scan.error ?? "no reason given"}. Fix it, preview and build again.`);
    return finish();
  }
  if (facts.mtimeMs + 1000 < input.startedAtMs) {
    record("source", false, "older than the job");
    findings.push("The scene file was not written during this job. Write the scenes, preview them, look, and build.");
    return finish();
  }
  const { createHash } = await import("node:crypto");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (input.sourceHashBefore !== null && sourceHash === input.sourceHashBefore) {
    record("source", false, "unchanged from the source the job started from");
    findings.push("The scene file is exactly the source this change started from. Make the change the brief asks for, then preview and build.");
    return finish();
  }
  record("source", true, `${source.length} characters, parses`);

  /* 2. Lint: no errors. Warnings are kept for the card. */
  const lint = await tools.lint();
  if (lint === null) {
    record("lint", false, "manimkc lint did not answer");
    findings.push("manimkc lint did not answer. Run video lint yourself and fix what it says.");
    return finish();
  }
  for (const warning of lint.warnings) warnings.push(`lint: ${warning.msg}`);
  if (lint.errors.length > 0) {
    record("lint", false, `${lint.errors.length} error(s)`);
    findings.push(`video lint reports ${lint.errors.length} error(s): ${lint.errors.map((error) => `line ${error.line ?? "?"}: ${error.msg}`).join("; ")}.`);
    return finish();
  }
  record("lint", true, `no errors, ${lint.warnings.length} warning(s)`);

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
  script = { classes: names, changes };
  if (scriptProblems.length > 0) {
    record("script", false, scriptProblems.join("; "));
    findings.push(...scriptProblems.map((problem) => `The script: ${problem}.`));
    return finish();
  }
  const changed = changes.filter((change) => change.kind !== "unchanged").length;
  record("script", true, narrated ? `${names.length} scenes; ${changed} line(s) differ from the brief` : `${names.length} scenes, every caption in place`);

  /* 4. The topic, which the runner wrote and the agent may not edit. */
  let topicYml = "";
  try {
    topicYml = (await safeRead(paths.topicYml, 256 * 1024)).toString("utf8");
  } catch {
    /* reported below */
  }
  if (topicOf(topicYml) !== brief.topic) {
    record("topic", false, `topic.yml names ${topicOf(topicYml) ?? "no topic"}`);
    findings.push(`topic.yml must name the topic ${brief.topic}.`);
    return finish();
  }
  record("topic", true, brief.topic);

  /* 5. The finished video: a build after the last change, copied once. */
  const build = [...input.calls].reverse().find((call) => call.verb === "build" && call.exitCode === 0);
  if (build === undefined || build.sceneSha256 !== sourceHash || build.deliverable?.written !== true) {
    record("build", false, build === undefined ? "no build" : "the scene file changed after the last build");
    findings.push(
      build === undefined
        ? "There is no successful build. Run video build and read its report."
        : "The scene file changed after the last successful build, so the video is not the source. Run video build again.",
    );
    return finish();
  }
  await rm(paths.candidate, { recursive: true, force: true });
  await mkdir(paths.candidateSource, { recursive: true });
  const names_ = candidateNames(brief.slug);
  const wanted: [string, string][] = [[paths.deliverable, names_.mp4]];
  if (narrated) {
    wanted.push([paths.transcript, names_.transcript], [paths.chapters, names_.chapters], [paths.vtt, names_.vtt]);
  }
  copies = {};
  try {
    for (const [from, name] of wanted) copies[name] = await safeCopy(from, path.join(paths.candidate, name));
    // The source travels with the video: what Accept stores as the row, each
    // file hashed here so `video put` can check it is the source the build
    // came from (a `source/<name>` record for each).
    const sceneName = path.basename(paths.sceneFile);
    const sceneCopy = await safeCopy(paths.sceneFile, path.join(paths.candidateSource, sceneName));
    if (sceneCopy.sha256 !== sourceHash) {
      throw new CopyRefused("not-regular", `${sceneName} changed while it was being copied`);
    }
    copies[`source/${sceneName}`] = sceneCopy;
    copies["source/topic.yml"] = await safeCopy(paths.topicYml, path.join(paths.candidateSource, "topic.yml"));
  } catch (error) {
    const detail = error instanceof CopyRefused ? error.message : `the copy failed: ${(error as Error).message}`;
    record("build", false, detail);
    findings.push(`The build's output could not be taken: ${detail}. Run video build again.`);
    copies = null;
    return finish();
  }
  await writeFile(path.join(paths.candidateSource, "brief.json"), `${JSON.stringify(brief, null, 1)}\n`, "utf8");
  record("build", true, `built at ${build.endedAt}; ${Object.keys(copies).length} file(s) copied and hashed`);
  const mp4 = path.join(paths.candidate, names_.mp4);

  /* 6. Probe the copy, in the gate profile, format pinned. */
  const probe = await tools.probe(mp4);
  const faststart = await moovFirst(mp4);
  const probeProblems: string[] = [];
  if (probe === null) probeProblems.push("ffprobe could not read it");
  else {
    if (!probe.streams.includes("video")) probeProblems.push("it has no video stream");
    if (narrated && !probe.streams.includes("audio")) probeProblems.push("a narrated video has no audio stream");
    if (!narrated && probe.streams.includes("audio")) probeProblems.push("a silent video has an audio stream");
    if (probe.duration === null) probeProblems.push("it has no duration");
  }
  if (!faststart) probeProblems.push("its index is not at the front (faststart)");
  if (probeProblems.length > 0) {
    record("probe", false, probeProblems.join("; "));
    findings.push(`The finished video: ${probeProblems.join("; ")}. Run video build again and read its report.`);
    return finish();
  }
  durationSeconds = probe!.duration;
  record("probe", true, `${durationSeconds}s, ${probe!.streams.join(" and ")}, faststart`);

  /* 7. Sync: the transcript is the source's lines, and no scene holds its last frame too long. */
  if (!narrated) {
    record("sync", true, "silent: no transcript");
  } else {
    const transcript = await readJson(path.join(paths.candidate, names_.transcript));
    const chapters = await readJson(path.join(paths.candidate, names_.chapters));
    const segments = Array.isArray((transcript as { segments?: unknown } | null)?.segments)
      ? ((transcript as { segments: unknown[] }).segments as { scene?: unknown; end?: unknown; text?: unknown }[])
      : null;
    const chapterList = Array.isArray(chapters) ? (chapters as { scene?: unknown; end?: unknown }[]) : Array.isArray((chapters as { chapters?: unknown } | null)?.chapters) ? ((chapters as { chapters: unknown[] }).chapters as { scene?: unknown; end?: unknown }[]) : null;
    const syncProblems: string[] = [];
    const heldTail: Record<string, number> = {};
    if (segments === null) syncProblems.push("the transcript has no segments");
    else {
      const texts = segments.map((segment) => (typeof segment.text === "string" ? segment.text : ""));
      const lines = voicedLines(scan);
      if (texts.join("\u0000") !== lines.join("\u0000")) {
        syncProblems.push(`the transcript's ${texts.length} lines are not the scene file's ${lines.length} voiceover lines, in order`);
      }
      // One chapter per scene, in the brief's order, each with an end and at
      // least one line of the transcript: a chapter that is missing,
      // malformed or lineless fails here rather than being skipped (Greptile
      // on #201), since the library's chapter list is built from this file.
      if (chapterList === null) syncProblems.push("the chapters file has no chapters");
      else {
        const named = chapterList.map((chapter) => (typeof chapter.scene === "string" ? chapter.scene : "(no scene)"));
        if (named.join(",") !== input.classes.join(",")) {
          syncProblems.push(`the chapters must be one per scene, ${input.classes.join(", ")}, in that order; the file has ${named.join(", ") || "none"}`);
        }
        for (const chapter of chapterList) {
          if (typeof chapter.scene !== "string") continue;
          if (typeof chapter.end !== "number" || !Number.isFinite(chapter.end)) {
            syncProblems.push(`the chapter for ${chapter.scene} has no end time`);
            continue;
          }
          const ends = segments.filter((segment) => segment.scene === chapter.scene && typeof segment.end === "number").map((segment) => segment.end as number);
          if (ends.length === 0) {
            syncProblems.push(`the chapter for ${chapter.scene} has no line in the transcript`);
            continue;
          }
          const tail = Math.round((chapter.end - Math.max(...ends)) * 100) / 100;
          heldTail[chapter.scene] = tail;
          if (tail > HELD_TAIL_SECONDS) syncProblems.push(`${chapter.scene} holds ${tail}s of picture after its last line; four is the most`);
        }
      }
    }
    sync = { segments: segments?.length ?? 0, heldTail };
    if (syncProblems.length > 0) {
      record("sync", false, syncProblems.join("; "));
      findings.push(...syncProblems.map((problem) => `Sync: ${problem}.`));
      return finish();
    }
    record("sync", true, `${segments!.length} lines, every one voiced`);
  }

  /* 8. Length, against the script's prediction. */
  const predicted = narrated ? secondsForLines(voicedLines(scan)) : predictedSeconds(brief);
  const tolerance = narrated ? LENGTH_CHECK : 0.2;
  const bytes = copies[names_.mp4]!.bytes;
  length = { durationSeconds: durationSeconds!, predictedSeconds: Math.round(predicted * 10) / 10, targetSeconds: brief.targetSeconds, bytes };
  if (Math.abs(durationSeconds! - predicted) > predicted * tolerance) {
    record("length", false, `${durationSeconds}s against ${Math.round(predicted)}s predicted`);
    findings.push(
      `The video runs ${Math.round(durationSeconds!)} seconds and its lines predict about ${Math.round(predicted)}: ` +
        (durationSeconds! > predicted ? "there is dead air, a held frame or a wait the voice does not fill." : "something is cut short."),
    );
    return finish();
  }
  if (narrated && Math.abs(durationSeconds! - brief.targetSeconds) > brief.targetSeconds * TARGET_WARNING) {
    warnings.push(`the video runs ${Math.round(durationSeconds!)} seconds against a target of ${brief.targetSeconds}`);
  }
  if (bytes > LARGE_BYTES_PER_SECOND * durationSeconds!) {
    warnings.push(`the file is ${Math.round(bytes / 1000)} kB, over three times what manimkc's videos usually take for this length`);
  }
  record("length", true, `${durationSeconds}s, ${Math.round(predicted)}s predicted`);

  /* 9. Poster, cut from the copy in the gate profile with the catalog's recipe. */
  let cut = false;
  for (const offset of POSTER_OFFSETS_SECONDS) {
    await rm(paths.poster, { force: true });
    if (await tools.poster(mp4, paths.poster, offset)) {
      const jpeg = await safeRead(paths.poster, 16 * 2 ** 20).catch(() => null);
      if (jpeg !== null && jpeg.length > 2 && jpeg[0] === 0xff && jpeg[1] === 0xd8) {
        cut = true;
        copies["poster.jpg"] = await hashOf(paths.poster);
        break;
      }
    }
  }
  if (!cut) {
    record("poster", false, "no frame could be cut");
    findings.push("No poster frame could be cut from the finished video. Build it again.");
    return finish();
  }
  record("poster", true, `${copies["poster.jpg"]!.bytes} bytes`);
  await writeFile(paths.copies, `${JSON.stringify({ files: copies, durationSeconds }, null, 1)}\n`, "utf8");

  /* 10. Looked: every scene's latest sheet was Read after the render that made it. */
  looked = {};
  const lookProblems: string[] = [];
  for (const scene of input.classes) {
    const render = [...input.calls].reverse().find((call) => call.verb === "preview" && (call.rendered ?? []).includes(scene));
    const sheet = sheetPath(paths, scene);
    const renderedAt = render?.endedAt ?? null;
    const read =
      renderedAt === null ? undefined : [...input.reads].reverse().find((entry) => entry.path === sheet && Date.parse(entry.at) >= Date.parse(renderedAt));
    looked[scene] = { renderedAt, readAt: read?.at ?? null };
    if (renderedAt === null) lookProblems.push(`${scene} was never previewed, so it has no sheet to look at`);
    else if (read === undefined) lookProblems.push(`look at the sheet for ${scene}, rendered at ${renderedAt}: ${sheet}`);
  }
  if (lookProblems.length > 0) {
    record("looked", false, lookProblems.join("; "));
    findings.push(...lookProblems.map((problem) => `Looked: ${problem}.`));
    return finish();
  }
  record("looked", true, `every sheet read after its last render`);
  return finish();
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse((await safeRead(file, 8 * 2 ** 20)).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

async function hashOf(file: string): Promise<CopyRecord> {
  const body = await safeRead(file, 64 * 2 ** 20);
  const { createHash } = await import("node:crypto");
  return { sha256: createHash("sha256").update(body).digest("hex"), bytes: body.length };
}

/**
 * Whether the `moov` box comes before the `mdat` box: faststart, so a player
 * streaming over HTTP starts without downloading the whole file. Walks the
 * top-level box headers only, eight bytes (sixteen for a large box) at a time.
 */
export async function moovFirst(file: string): Promise<boolean> {
  const { open } = await import("node:fs/promises");
  const { constants } = await import("node:fs");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
  if (handle === null) return false;
  try {
    const size = (await handle.stat()).size;
    let offset = 0;
    const header = Buffer.alloc(16);
    for (let boxes = 0; boxes < 64 && offset + 8 <= size; boxes += 1) {
      await handle.read(header, 0, 16, offset);
      let length = header.readUInt32BE(0);
      const type = header.subarray(4, 8).toString("latin1");
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (length === 1) length = Number(header.readBigUInt64BE(8));
      if (length < 8) return false;
      offset += length;
    }
    return false;
  } finally {
    await handle.close();
  }
}

/** The recipe's argv, writing to a file rather than a pipe, for the gate profile's one allowed write. */
export function posterArgs(input: string, out: string, offsetSeconds: number): string[] {
  const args = ffmpegArgs(input, offsetSeconds);
  return [...args.slice(0, -1), "-y", out];
}
