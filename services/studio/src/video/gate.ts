import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// The catalog's own poster recipe, one implementation (docs/STUDIO-VIDEOS.md,
// the gate, step 9). A pure module with no imports, so reaching it by path
// pulls nothing of the catalog's into this service.
import { ffmpegArgs, POSTER_OFFSETS_SECONDS } from "../../../catalog/src/poster/recipe";
import type { GateStep } from "../data/store";
import { MANIMKC_GATE } from "./backends/manimkc-gate";
import { isNarrated, predictedSeconds, secondsForLines, type ValidVideoBrief } from "./brief";
import { isLook, type WrapperCall, type SheetRead } from "./calls";
import { topicOf } from "./checkout";
import { CopyRefused, safeCopy, safeRead } from "./copy";
import { candidateNames, type VideoPaths } from "./paths";
import type { Scan } from "./scan";
import type { CopyRecord, VideoGateResult } from "./types";

export { compareLines } from "./lines";

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
 *
 * Steps 1 to 3 and the sheet step 10 looks for are the tool's own (D75 and
 * D77 of docs/STUDIO-VIDEO-TOOLS.md), asked of the job's backend through
 * `VideoGateChecks`; the other steps are the same code for every tool.
 */

/** A TypeScript source read by the TypeScript compiler's parser, without running it (revideokc's step 1, D77). */
export interface SceneParse {
  ok: boolean;
  /** The first syntax error, with its line, when `ok` is false. */
  error: string | null;
  /** Every string in the file: literals, template pieces and JSX text, in source order. */
  strings: string[];
  /** Whether the file has an `export default`, which `src/project.ts` loads. */
  defaultExport: boolean;
  /** The relative module specifiers it imports (`./parts`), so the gate counts only files the scene reaches. Absent from an older parse. */
  imports?: string[];
}

/**
 * The sandboxed operations the gate needs, injectable so a test can supply
 * recorded answers. `scan` is manimkc's and `parseScene` revideokc's, each
 * read only by its own tool's source steps; `lint` is the job's tool's own
 * check; the probe and the poster serve every tool.
 */
export interface GateTools {
  /** Python's `ast` over the scene file, in the render profile. */
  scan(source: string): Promise<Scan>;
  /** The tool's lint on the source, in the render profile (`manimkc lint --json`, revideokc's `tsc --noEmit`); null when it did not answer. */
  lint(): Promise<{ errors: { line?: number; msg: string }[]; warnings: { line?: number; msg: string }[] } | null>;
  /** revideokc: the TypeScript parser over one source file, in the gate profile. Absent for a tool whose source is not TypeScript. */
  parseScene?(source: string): Promise<SceneParse>;
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
  /** The tool's own steps, from the job's backend; manimkc's, the default tool's (D72), when left out. */
  backend?: VideoGateChecks;
  onStep?: (step: GateStep) => void;
}

/** What the source steps are given: the job, and the sandboxed tools to parse and lint with. */
export type SourceCheckInput = Pick<VideoGateInput, "brief" | "paths" | "classes" | "startedAtMs" | "sourceHashBefore" | "tools">;

/** How a backend's steps report: each step as it finishes, what the agent must fix, and what the card warns of. */
export interface GateReport {
  step(name: string, ok: boolean, detail: string): void;
  finding(...lines: string[]): void;
  warning(line: string): void;
}

/**
 * Steps 1 to 3 as far as they got. Failed, the gate stops and keeps the
 * script when step 3 was the one that failed; passed, it carries the
 * source's sha256 (the build must be of it) and the lines it voices, in play
 * order (step 7's transcript and step 8's prediction).
 */
export type SourceCheck =
  | { ok: false; script: VideoGateResult["script"] }
  | {
      ok: true;
      script: NonNullable<VideoGateResult["script"]>;
      sourceHash: string;
      voiced: string[];
      /**
       * The source files step 5 copies beside the video, each with the
       * sha256 it was read with, when the source is more than one file
       * (revideokc's scene, its narration and the files beside them, whose
       * combined hash is `sourceHash`). Absent, step 5 copies the scene file
       * alone and holds it to `sourceHash`. `topic.yml` is copied either way.
       */
      files?: { path: string; sha256: string }[];
    };

/** What the gate asks of a video tool's backend. */
export interface VideoGateChecks {
  /** Steps 1 to 3: the source read and parsed, its lint, and its structure against the brief. */
  checkSource(input: SourceCheckInput, report: GateReport): Promise<SourceCheck>;
  /** A scene's contact sheet: what step 10 wants Read after the scene's last render. */
  sheet(paths: VideoPaths, scene: string): string;
  /**
   * Step 10 in the tool's own terms, when its sheets are not one per scene
   * per look call (revideokc's, D77: one stills sheet for every scene, which
   * a still of chosen moments rewrites, and the build's sheet). Absent, the
   * gate's own per-scene check runs, which is manimkc's.
   */
  looked?(input: LookInput): LookResult;
  /**
   * For the gate's own step 10: whether a scene's last look, of an older
   * source, still shows that scene in the source the gate checked (manimkc's,
   * whose manual has the agent preview only the scenes it changed). Absent,
   * or false, a look counts only when it was of the checked source.
   */
  sceneUnchanged?(input: SceneUnchangedInput): Promise<boolean>;
  /** Called by the runner as each tool result arrives, so the backend can keep what its look calls rendered from (manimkc's previewed files). */
  keepPreviewed?(paths: VideoPaths, calls: readonly WrapperCall[]): Promise<void>;
}

/** What `sceneUnchanged` is asked about one scene. */
export interface SceneUnchangedInput {
  paths: VideoPaths;
  scene: string;
  classes: readonly string[];
  /** The source the scene's last look rendered from, as the wrapper recorded it (`sceneSha256`); null when it recorded none. */
  renderedFrom: string | null;
  /** The source the gate checked. Its copy is in `candidate/source/` by step 10. */
  sourceHash: string;
}

/** What a tool's own step 10 is given: the job, its logs, the checked source and the build the gate copied. */
export interface LookInput {
  paths: VideoPaths;
  classes: readonly string[];
  calls: readonly WrapperCall[];
  reads: readonly SheetRead[];
  /** The source the gate checked, as the wrapper records it (`sceneSha256`). */
  sourceHash: string;
  build: WrapperCall;
}

export interface LookResult {
  looked: NonNullable<VideoGateResult["looked"]>;
  /** One sentence each, without the "Looked: " the gate puts in front. */
  problems: string[];
}

/** A held frame: seconds of picture a scene may run after its last line ends (the skill's rule). */
export const HELD_TAIL_SECONDS = 4;
/** Step 8's tolerance on the voiced lines' prediction. */
export const LENGTH_CHECK = 0.15;
/** Beyond this from the brief's target, the length is a warning on the card. */
export const TARGET_WARNING = 0.25;
/** manimkc's deliverables run at 30 to 35 kB a second (measured); three times that is worth a warning. */
export const LARGE_BYTES_PER_SECOND = 3 * 35_000;

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

  /* 1 to 3. The source, its lint and its script: the tool's own (D77). */
  const checks = input.backend ?? MANIMKC_GATE;
  const checked = await checks.checkSource(input, {
    step: record,
    finding: (...lines) => findings.push(...lines),
    warning: (line) => warnings.push(line),
  });
  script = checked.script;
  if (!checked.ok) return finish();
  const { sourceHash, voiced } = checked;

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
    const sources = checked.files ?? [{ path: paths.sceneFile, sha256: sourceHash }];
    for (const source of sources) {
      const name = path.basename(source.path);
      const copied = await safeCopy(source.path, path.join(paths.candidateSource, name));
      if (copied.sha256 !== source.sha256) {
        throw new CopyRefused("not-regular", `${name} changed while it was being copied`);
      }
      copies[`source/${name}`] = copied;
    }
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
      if (texts.join("\u0000") !== voiced.join("\u0000")) {
        syncProblems.push(`the transcript's ${texts.length} lines are not the scene file's ${voiced.length} voiceover lines, in order`);
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
  const predicted = narrated ? secondsForLines(voiced) : predictedSeconds(brief);
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

  /* 10. Looked: every scene's latest sheet, of the checked source, was Read after the render that made it. */
  if (checks.looked !== undefined) {
    const own = checks.looked({ paths, classes: input.classes, calls: input.calls, reads: input.reads, sourceHash, build });
    looked = own.looked;
    if (own.problems.length > 0) {
      record("looked", false, own.problems.join("; "));
      findings.push(...own.problems.map((problem) => `Looked: ${problem}.`));
      return finish();
    }
    record("looked", true, "every sheet read after its last render");
    return finish();
  }
  // The sheet on disk is the one the scene's last render wrote, so that is
  // the look that counts, read after it ended. A later call wrote no sheet
  // unless the wrapper saw it written (`rendered`), and one whose render step
  // never ran (a refused call, a narration that failed) wrote none whatever
  // `rendered` says: it is not the scene's render, and replaced nothing. The
  // render must also be of the source the gate checked, or of one that
  // differs from it only where it cannot change this scene.
  looked = {};
  const lookProblems: string[] = [];
  for (const scene of input.classes) {
    const render = [...input.calls].reverse().find((call) => isLook(call) && (call.rendered ?? []).includes(scene) && renderRan(call));
    const sheet = checks.sheet(paths, scene);
    const renderedAt = render?.endedAt ?? null;
    const current =
      render !== undefined &&
      (render.sceneSha256 === sourceHash ||
        (checks.sceneUnchanged !== undefined &&
          (await checks.sceneUnchanged({ paths, scene, classes: input.classes, renderedFrom: render.sceneSha256 ?? null, sourceHash }))));
    const read =
      renderedAt === null || !current
        ? undefined
        : [...input.reads].reverse().find((entry) => entry.path === sheet && Date.parse(entry.at) >= Date.parse(renderedAt));
    looked[scene] = { renderedAt, readAt: read?.at ?? null };
    if (renderedAt === null) lookProblems.push(`${scene} was never previewed, so it has no sheet to look at`);
    else if (!current) lookProblems.push(`the scene file changed after ${scene}'s last preview, at ${renderedAt}, in a way that can change ${scene}: preview it again and Read its sheet, ${sheet}`);
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

/** Whether a look call's render step ran. A record with no `steps` (an older wrapper's) is taken at its word. */
function renderRan(call: WrapperCall): boolean {
  return call.steps === undefined || call.steps.some((step) => step.step === "render");
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
