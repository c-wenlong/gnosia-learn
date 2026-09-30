import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { safeCopy, safeRead } from "./copy";
import { runSandboxed } from "./exec";
import type { VideoPaths } from "./paths";
import type { Toolchain } from "./toolchain";

/**
 * The job's own TTS cache (D47, "The TTS cache: per job, seeded by the
 * runner").
 *
 * Every job voices into `render/cache/audio/`, its own. Before the agent
 * starts, the runner copies in the clips the owner's shared cache already
 * holds for the brief's lines, and a change job's parent's kept clips, so
 * the agent's narration step makes only what is missing. Each clip's word
 * times (`<key>.words.json`, which a line bound with `as line` needs for its
 * cues) come with it when the source has them, so a seeded line is not timed
 * again either. Jobs never write the shared cache, and nothing is promoted
 * into it after Accept: that cache is the owner's hand-run one, and audio made
 * from agent-chosen text does not go there under a key whose sound nobody
 * verified.
 *
 * A clip's name is gnosia-audio's key (backend, voice, speed, rate and the
 * spoken form of the line), computed by gnosia-audio itself through its JSON
 * contract, `keys --json` (schema 1), the same code the narration step voices
 * with. It runs in the render profile, with the lines on stdin and nothing
 * written: hashing text is not running it, but the lines of a final source
 * were typed by the agent, so the same rule holds for every call.
 */

/** A clip's file name: gnosia-audio's 16-hex key and `.wav`. */
const CLIP_NAME = /^[0-9a-f]{16}\.wav$/;

/** The word times written beside a clip: `<key>.wav` to `<key>.words.json`. */
export function wordsName(clip: string): string {
  return clip.replace(/\.wav$/, ".words.json");
}

export interface KeyInput {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
}

/**
 * The clip file names these lines are voiced into, in order, as
 * `gnosia-audio keys --json` names them for this job. Its `clip` is the whole
 * path, and it must be in this job's audio cache: a key computed against any
 * other cache (a data root the job's environment did not set) would seed files
 * the narration step never looks at.
 *
 * An empty line is left out, since the contract refuses one and a file's empty
 * `voiceover("")` has no clip anyway; every caller treats the names as a set.
 */
export async function clipKeys(input: KeyInput, allLines: readonly string[]): Promise<string[]> {
  const lines = allLines.filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  const result = await runSandboxed({
    ...input,
    kind: "render",
    profile: input.paths.renderProfile,
    argv: [path.join(input.paths.checkout, ".venv", "bin", "python"), "-I", "-m", "gnosia_audio", "keys", "--json", "--manimkc-root", input.paths.checkout],
    cwd: input.paths.checkout,
    stdin: JSON.stringify({ lines }),
    timeoutMs: 180_000,
  });
  return keysFromReply(result, lines.length, input.paths.audio);
}

/** `keys --json`'s reply, checked: the clip names in order, or an error that says what was wrong. */
export function keysFromReply(result: { code: number | null; stdout: string; stderr: string }, count: number, audio: string): string[] {
  let reply: { schema?: unknown; error?: { message?: unknown }; lines?: { clip?: unknown }[] };
  try {
    reply = JSON.parse(result.stdout) as typeof reply;
  } catch {
    throw new Error(`gnosia-audio would not name the clips (exit ${result.code}): ${result.stderr.trim().split("\n").slice(-2).join(" ")}`);
  }
  if (reply.error !== undefined) throw new Error(`gnosia-audio would not name the clips: ${String(reply.error.message ?? "no message")}`);
  if (reply.schema !== 1) throw new Error(`gnosia-audio speaks schema ${String(reply.schema)}, and this runner reads schema 1`);
  const clips = Array.isArray(reply.lines) ? reply.lines.map((line) => line?.clip) : [];
  if (clips.length !== count || !clips.every((clip): clip is string => typeof clip === "string" && CLIP_NAME.test(path.basename(clip)))) {
    throw new Error("gnosia-audio named the clips in a shape this runner does not recognise");
  }
  const elsewhere = clips.find((clip) => path.dirname(clip) !== audio);
  if (elsewhere !== undefined) {
    throw new Error(`gnosia-audio puts the clips in ${path.dirname(elsewhere)}, not this job's audio cache ${audio}`);
  }
  return clips.map((clip) => path.basename(clip));
}

/** A WAV header: `RIFF`, four bytes of size, `WAVE`. */
async function isWav(file: string): Promise<boolean> {
  try {
    const head = (await safeRead(file, 256 * 2 ** 20)).subarray(0, 12);
    return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WAVE";
  } catch {
    return false;
  }
}

/** The most a word-times file may be: a line of a few hundred words is a few kilobytes. */
const WORDS_MAX_BYTES = 2 ** 20;

/** Whether these bytes are gnosia-audio's word times: `{"source", "duration", "words": [{"word", "start", "end"}]}`. */
export function isWordTimes(body: Buffer): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return false;
  }
  const times = parsed as { source?: unknown; words?: unknown } | null;
  return (
    times !== null &&
    typeof times === "object" &&
    typeof times.source === "string" &&
    Array.isArray(times.words) &&
    times.words.every((word: { word?: unknown; start?: unknown; end?: unknown } | null) => typeof word?.word === "string" && typeof word.start === "number" && typeof word.end === "number")
  );
}

/** A shared-cache file's bytes: a regular file under the size cap, read without following a link. Its clips may be hard links (gnosia-audio allows it), so the link count is not checked. */
async function sharedBytes(file: string): Promise<Buffer | null> {
  const facts = await lstat(file).catch(() => null);
  if (facts === null || !facts.isFile() || facts.size > WORDS_MAX_BYTES) return null;
  return readFile(file).catch(() => null);
}

/** Copy one clip's word times, when the source has them, they parse, and the job has none yet. */
async function seedWords(from: string, to: string, read: (file: string) => Promise<Buffer | null>): Promise<boolean> {
  if ((await lstat(to).catch(() => null)) !== null) return false;
  const body = await read(from);
  if (body === null || !isWordTimes(body)) return false;
  try {
    await writeFile(to, body, { flag: "wx", mode: 0o644 });
    return true;
  } catch {
    return false;
  }
}

const jobBytes = (file: string): Promise<Buffer | null> => safeRead(file, WORDS_MAX_BYTES).catch(() => null);

export interface SeedResult {
  /** Clips the brief's lines need. */
  wanted: number;
  /** Of those, how many were already voiced: copied in from a cache. */
  seeded: number;
  fromShared: number;
  fromParent: number;
  /** Of the voiced ones, how many came with their word times, so a cue on that line needs no timing. */
  timed: number;
}

/**
 * Copy into the job's audio cache the clips it can have for free: the
 * parent's kept clips (a change job), then whichever of the brief's lines the
 * shared cache holds, each with its word times when the source has them. The
 * shared cache is only ever read, by name, and only a regular file is copied;
 * every copy is exclusive, so nothing in the job is overwritten either.
 */
export async function seedClips(
  paths: VideoPaths,
  keys: readonly string[],
  sources: { shared: string | null; parentClips: string | null },
): Promise<SeedResult> {
  await mkdir(paths.audio, { recursive: true });
  let fromParent = 0;
  if (sources.parentClips !== null) {
    let names: string[] = [];
    try {
      names = await readdir(sources.parentClips);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!CLIP_NAME.test(name)) continue;
      const from = path.join(sources.parentClips, name);
      if (!(await isWav(from))) continue;
      try {
        await safeCopy(from, path.join(paths.audio, name));
        fromParent += 1;
      } catch {
        /* already there, or not a plain file: the agent voices it */
      }
      await seedWords(path.join(sources.parentClips, wordsName(name)), path.join(paths.audio, wordsName(name)), jobBytes);
    }
  }
  let fromShared = 0;
  const unique = [...new Set(keys)];
  if (sources.shared !== null) {
    for (const key of unique) {
      const target = path.join(paths.audio, key);
      if ((await lstat(target).catch(() => null)) === null) {
        const from = path.join(sources.shared, key);
        const facts = await lstat(from).catch(() => null);
        if (facts === null || !facts.isFile()) continue;
        try {
          await copyFile(from, target, constants.COPYFILE_EXCL);
          fromShared += 1;
        } catch {
          /* a race with nothing, or unreadable: the agent voices it */
          continue;
        }
      }
      // A parent's clip may have come without its times while the shared
      // cache has them: they are the same line's, by the same key.
      await seedWords(path.join(sources.shared, wordsName(key)), path.join(paths.audio, wordsName(key)), sharedBytes);
    }
  }
  let seeded = 0;
  let timed = 0;
  for (const key of unique) {
    if ((await lstat(path.join(paths.audio, key)).catch(() => null))?.isFile() !== true) continue;
    seeded += 1;
    if ((await lstat(path.join(paths.audio, wordsName(key))).catch(() => null))?.isFile() === true) timed += 1;
  }
  return { wanted: unique.length, seeded, fromShared, fromParent, timed };
}

/**
 * After a verdict: keep the clips the final source voices, in `clips/`, with
 * their word times, so a change job re-voices and re-times only what it
 * changes. Copied the gate's way, one link and a WAV header (or a parse) each,
 * by the names the runner computed from the source's literals, never by
 * listing what a render left behind.
 */
export async function keepClips(paths: VideoPaths, keys: readonly string[]): Promise<number> {
  await mkdir(paths.clips, { recursive: true });
  let kept = 0;
  for (const key of new Set(keys)) {
    const from = path.join(paths.audio, key);
    if (!(await isWav(from))) continue;
    try {
      await safeCopy(from, path.join(paths.clips, key));
      kept += 1;
    } catch {
      /* already kept, or not a plain file */
    }
    await seedWords(path.join(paths.audio, wordsName(key)), path.join(paths.clips, wordsName(key)), jobBytes);
  }
  return kept;
}
