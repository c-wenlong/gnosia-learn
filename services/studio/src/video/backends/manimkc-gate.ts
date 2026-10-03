import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

// The catalog's limit on a video's source, one constant for both sides. A
// pure module with no imports, reached by path as the poster recipe is.
import { VIDEO_SOURCE_BYTES_MAX } from "../../../../catalog/src/content/video-source-limits";
import { isNarrated } from "../brief";
import { isLook, type WrapperCall } from "../calls";
import { CopyRefused, safeRead } from "../copy";
import type { SourceCheck, SourceCheckInput, GateReport, SceneUnchangedInput, VideoGateChecks } from "../gate";
import { compareLines, inOrder } from "../lines";
import { sheetPath, type VideoPaths } from "../paths";
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

  /* 1. Source: exists, parses, within what Accept stores, newer than the job, and on a change, changed. */
  let body: Buffer;
  try {
    body = await safeRead(paths.sceneFile, VIDEO_SOURCE_BYTES_MAX);
  } catch (error) {
    if (error instanceof CopyRefused && error.reason === "too-large") {
      const size = (await lstat(paths.sceneFile).catch(() => null))?.size;
      return tooLarge(report, `${size ?? "too many"} bytes in the scene file alone`);
    }
    report.step("source", false, (error as Error).message);
    report.finding(`The scene file ${path.basename(paths.sceneFile)} could not be read: ${(error as Error).message}.`);
    return { ok: false, script: null };
  }
  // Accept stores the scene file and topic.yml, at most this much together
  // (`catalog video put`), so a video the gate passes is one it can store.
  const topicBytes = (await lstat(paths.topicYml).catch(() => null))?.size ?? 0;
  const bytes = body.length + topicBytes;
  if (bytes > VIDEO_SOURCE_BYTES_MAX) return tooLarge(report, `${bytes} bytes of source with topic.yml`);
  const source = body.toString("utf8");
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

function tooLarge(report: GateReport, detail: string): SourceCheck {
  report.step("source", false, `${detail}, over the ${VIDEO_SOURCE_BYTES_MAX} Accept stores`);
  report.finding(
    `The scene file is too large: ${detail}, and a video is stored with at most ${VIDEO_SOURCE_BYTES_MAX} bytes of source, topic.yml included. Make it smaller (data belongs in fewer, shorter literals), then preview and build again.`,
  );
  return { ok: false, script: null };
}

/* ------------------------------------------------------------------ */
/* Step 10: which scenes an edit after their last preview could touch  */
/* ------------------------------------------------------------------ */

/**
 * The wrapper records the scene file's sha256 with every preview, of the
 * whole file, and the manual tells the agent to preview only the scenes it
 * changed. So a scene previewed before an edit to another scene has a sheet
 * of an older file, and step 10 must tell an edit that could change that
 * scene from one that could not. The runner keeps the file each preview
 * rendered, by its hash (`keepPreviewed`); the gate compares that file with
 * the one it checked, scene by scene (`sceneFingerprint`).
 */

/** Where the runner keeps each previewed scene file, named by its sha256. Outside the topic folder, so nothing it holds is source. */
export function previewedDir(paths: VideoPaths): string {
  return path.join(paths.job, "previewed");
}

const SHA256 = /^[0-9a-f]{64}$/;
/** A previewed file may be larger than what Accept stores, as the final one may not: the old read limit. */
const PREVIEWED_BYTES_MAX = 2 * 2 ** 20;
/** Enough for every preview of a long job; past it the oldest go, and a scene last previewed from one has to be previewed again. */
const PREVIEWED_FILES_MAX = 64;

/**
 * Keep the scene file as it is now when it is the file a preview rendered:
 * the runner calls this as each tool result arrives, which is when a
 * wrapper call has just ended, so the file is almost always the one it
 * hashed. When the agent edited it in between, the hash does not match and
 * nothing is kept, and that scene's look counts only against the identical
 * file, which is the safe reading. Named by its own sha256 and checked
 * against it on every read, so a file put there by anything else is never
 * taken for a preview's source.
 */
export async function keepPreviewed(paths: VideoPaths, calls: readonly WrapperCall[], limit = PREVIEWED_FILES_MAX): Promise<void> {
  const dir = previewedDir(paths);
  // Each source with the time its latest preview ended: that time, not the
  // moment the runner got round to it, is what orders the kept files, so a
  // batch of calls handled together keeps the order they were made in.
  const wanted = new Map<string, Date>();
  for (const call of calls) {
    const hash = call.sceneSha256;
    if (!isLook(call) || typeof hash !== "string" || !SHA256.test(hash)) continue;
    const ended = new Date(Date.parse(call.endedAt) || Date.now());
    const seen = wanted.get(hash);
    if (seen === undefined || ended > seen) wanted.set(hash, ended);
  }
  // A source previewed again is already kept: mark it as recent as that
  // preview, since the limit below drops the least recently previewed first.
  for (const [hash, ended] of [...wanted]) {
    const file = path.join(dir, `${hash}.py`);
    const st = await lstat(file).catch(() => null);
    if (st === null) continue;
    wanted.delete(hash);
    if (ended.getTime() > st.mtimeMs) await utimes(file, ended, ended).catch(() => undefined);
  }
  if (wanted.size === 0) return;
  let body: Buffer;
  try {
    body = await safeRead(paths.sceneFile, PREVIEWED_BYTES_MAX);
  } catch {
    return;
  }
  const hash = createHash("sha256").update(body).digest("hex");
  if (!wanted.has(hash)) return;
  await mkdir(dir, { recursive: true });
  // At the limit, the least recently previewed files go to make room: a recent preview is
  // the one a later edit is compared against. Dropping one only means a scene
  // last previewed from it is previewed again, the strict reading.
  const kept = (await readdir(dir).catch(() => [] as string[])).filter((name) => SHA256.test(name.replace(/\.py$/, "")) && name.endsWith(".py"));
  if (kept.length >= limit) {
    const aged = await Promise.all(kept.map(async (name) => ({ name, at: (await lstat(path.join(dir, name)).catch(() => null))?.mtimeMs ?? 0 })));
    aged.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
    for (const { name } of aged.slice(0, kept.length - limit + 1)) await rm(path.join(dir, name), { force: true });
  }
  const pending = path.join(dir, `.${hash}.${process.pid}.tmp`);
  await writeFile(pending, body, { mode: 0o644 });
  const ended = wanted.get(hash)!;
  await utimes(pending, ended, ended).catch(() => undefined);
  await rename(pending, path.join(dir, `${hash}.py`));
}

/** A file kept by `keepPreviewed`, or a copy the gate took, read back only when its bytes still have the hash it is known by. */
async function readByHash(file: string, hash: string, maxBytes: number): Promise<string | null> {
  try {
    const body = await safeRead(file, maxBytes);
    if (createHash("sha256").update(body).digest("hex") !== hash) return null;
    return body.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Whether a scene's last preview, of an older scene file, still shows the
 * scene in the file the gate checked: both files are known, and they are
 * the same once every other scene class is set aside (`sceneFingerprint`).
 * Unknown is no: the scene is previewed again.
 */
async function sceneUnchanged(input: SceneUnchangedInput): Promise<boolean> {
  if (input.renderedFrom === null || !SHA256.test(input.renderedFrom)) return false;
  const before = await readByHash(path.join(previewedDir(input.paths), `${input.renderedFrom}.py`), input.renderedFrom, PREVIEWED_BYTES_MAX);
  // Step 5's copy of the checked file, held to the hash steps 1 to 3 read it with.
  const now = await readByHash(path.join(input.paths.candidateSource, path.basename(input.paths.sceneFile)), input.sourceHash, PREVIEWED_BYTES_MAX);
  if (before === null || now === null) return false;
  const a = sceneFingerprint(before, input.scene, input.classes);
  const b = sceneFingerprint(now, input.scene, input.classes);
  return a !== null && a === b;
}

/** A line that starts a top-level statement: not blank, not indented, not a comment. */
const TOP_LEVEL = /^[^\s#]/;
const CLASS_LINE = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\b/;

/**
 * The scene file as one scene sees it: every line but those of the other
 * scene classes, each of which is left as one placeholder line where it
 * stood. Two files with the same fingerprint for a scene differ only inside
 * the other scenes' classes, so a sheet of that scene from one is a sheet of
 * it from the other. Null when that cannot be said.
 *
 * A class runs from its `class` line to the next line that starts at the
 * margin and is not a comment. That is read from the text, not a parse, and
 * every way it can be wrong is the safe way: a line at the margin inside a
 * class (a bracket's continuation, a triple-quoted string) ends the class
 * early, and the rest of it then counts as code every scene shares, so an
 * edit there makes every scene's look out of date. A decorator line above a
 * class counts as shared code for the same reason.
 *
 * Null, so the scene's look counts only against the identical file, when the
 * scene is not a class at the margin, when a scene class is defined twice,
 * or when anything the scene sees (its own class, or code outside every
 * scene class) names another scene class: a base, a call or a string
 * lookup, which would make that class's code part of this scene's picture.
 *
 * What it does not see: statements in another scene's class body run when
 * the module is imported, so one that changes shared state between two
 * previews could change this scene without a line of it changing. Scene
 * code does not do that, the agent is not the adversary here, and the
 * person watches the whole video before Accept.
 */
export function sceneFingerprint(source: string, scene: string, classes: readonly string[]): string | null {
  const lines = source.split("\n");
  const spans = new Map<string, { start: number; end: number }>();
  for (let i = 0; i < lines.length; i += 1) {
    const name = CLASS_LINE.exec(lines[i]!)?.[1];
    if (name === undefined || !classes.includes(name)) continue;
    if (spans.has(name)) return null;
    let end = i + 1;
    while (end < lines.length && !TOP_LEVEL.test(lines[end]!)) end += 1;
    spans.set(name, { start: i, end });
  }
  if (!spans.has(scene)) return null;
  const starts = new Map([...spans].filter(([name]) => name !== scene).map(([, span]) => [span.start, span.end]));
  const seen: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const end = starts.get(i);
    if (end !== undefined) {
      seen.push("\u0000another scene\u0000");
      i = end;
    } else {
      seen.push(lines[i]!);
      i += 1;
    }
  }
  const others = classes.filter((name) => name !== scene);
  if (others.length > 0) {
    const named = new RegExp(`\\b(?:${others.map((name) => name.replace(/[^A-Za-z0-9_]/g, "")).join("|")})\\b`);
    if (seen.some((line) => named.test(line))) return null;
  }
  return seen.join("\n");
}

export const MANIMKC_GATE: VideoGateChecks = {
  checkSource,
  sheet: sheetPath,
  sceneUnchanged,
  keepPreviewed,
};
