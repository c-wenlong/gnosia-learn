import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readdir } from "node:fs/promises";
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
 * the agent's narration step makes only what is missing. Jobs never write the
 * shared cache, and nothing is promoted into it after Accept: that cache is
 * the owner's hand-run one, and audio made from agent-chosen text does not go
 * there under a key whose sound nobody verified.
 *
 * A clip's name is manimkc's own key (`narration.cache_path`: backend, voice,
 * speed, rate and the spoken form of the line), computed by manimkc's own
 * code. It runs in the render profile, with the lines on stdin and nothing
 * written: hashing text is not running it, but the lines of a final source
 * were typed by the agent, so the same rule holds for every call.
 */

const KEY_CODE = String.raw`
import json, sys
lines = json.load(sys.stdin)
sys.argv = ["keys"]
sys.path.insert(0, "lib")
from narration import cache_path
print(json.dumps([cache_path(line)[1].name for line in lines]))
`;

export interface KeyInput {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
}

/** The clip file names these lines are voiced into, in order. */
export async function clipKeys(input: KeyInput, lines: readonly string[]): Promise<string[]> {
  if (lines.length === 0) return [];
  const result = await runSandboxed({
    ...input,
    kind: "render",
    profile: input.paths.renderProfile,
    argv: [path.join(input.paths.checkout, ".venv", "bin", "python"), "-c", KEY_CODE],
    cwd: input.paths.checkout,
    stdin: JSON.stringify(lines),
    timeoutMs: 180_000,
  });
  const last = result.stdout.trim().split("\n").at(-1) ?? "";
  let keys: unknown;
  try {
    keys = JSON.parse(last);
  } catch {
    throw new Error(`manimkc would not name the clips (exit ${result.code}): ${result.stderr.trim().split("\n").slice(-2).join(" ")}`);
  }
  if (!Array.isArray(keys) || keys.length !== lines.length || !keys.every((key) => typeof key === "string" && /^[0-9a-f]{16}\.wav$/.test(key))) {
    throw new Error("manimkc named the clips in a shape this runner does not recognise");
  }
  return keys as string[];
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

export interface SeedResult {
  /** Clips the brief's lines need. */
  wanted: number;
  /** Of those, how many were already voiced: copied in from a cache. */
  seeded: number;
  fromShared: number;
  fromParent: number;
}

/**
 * Copy into the job's audio cache the clips it can have for free: the
 * parent's kept clips (a change job), then whichever of the brief's lines the
 * shared cache holds. The shared cache is only ever read, by name, and only a
 * regular file is copied; the copy is `COPYFILE_EXCL`, so nothing in the job
 * is overwritten either.
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
      if (!/^[0-9a-f]{16}\.wav$/.test(name)) continue;
      const from = path.join(sources.parentClips, name);
      if (!(await isWav(from))) continue;
      try {
        await safeCopy(from, path.join(paths.audio, name));
        fromParent += 1;
      } catch {
        /* already there, or not a plain file: the agent voices it */
      }
    }
  }
  let fromShared = 0;
  const unique = [...new Set(keys)];
  if (sources.shared !== null) {
    for (const key of unique) {
      const target = path.join(paths.audio, key);
      if ((await lstat(target).catch(() => null)) !== null) continue;
      const from = path.join(sources.shared, key);
      const facts = await lstat(from).catch(() => null);
      if (facts === null || !facts.isFile()) continue;
      try {
        await copyFile(from, target, constants.COPYFILE_EXCL);
        fromShared += 1;
      } catch {
        /* a race with nothing, or unreadable: the agent voices it */
      }
    }
  }
  let seeded = 0;
  for (const key of unique) {
    if ((await lstat(path.join(paths.audio, key)).catch(() => null))?.isFile() === true) seeded += 1;
  }
  return { wanted: unique.length, seeded, fromShared, fromParent };
}

/**
 * After a verdict: keep the clips the final source voices, in `clips/`, so a
 * change job re-voices only what it changes. Copied the gate's way, one link
 * and a WAV header each, by the names the runner computed from the source's
 * literals, never by listing what a render left behind.
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
  }
  return kept;
}
