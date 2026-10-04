import path from "node:path";

import type { BackendJob } from "../backend";
import { safeRead } from "../copy";
import { runSandboxed } from "../exec";
import { keysFromReply } from "../seed";
import { readNarration } from "../ts-gate";
import { remotionkcPaths } from "./paths";
import { remotionkcEnv } from "./sandbox";
import { remotionkcTools, type RemotionkcToolchain } from "./toolchain";

/**
 * A remotionkc job's clip keys: gnosia-audio's `keys --json`, as revideokc's
 * (`../revideokc/clips.ts`), run in the narration profile with the
 * narration's environment, since the render profile runs no Python. Hashing
 * a line runs nothing, but the lines of a final source were typed by the
 * agent, so the call stays inside a profile. Nothing is written.
 */
export async function remotionkcClipKeys(job: BackendJob, allLines: readonly string[]): Promise<string[]> {
  const lines = allLines.filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];
  const own = remotionkcTools(job.tools);
  if (own.gnosiaPython === null) throw new Error("gnosia-audio is not installed in remotionkc's .venv");
  const tools = job.tools as RemotionkcToolchain;
  const result = await runSandboxed({
    ...job,
    kind: "narrate",
    profile: job.paths.narrateProfile,
    env: remotionkcEnv("narrate", { ...job, tools }),
    argv: [path.join(remotionkcPaths(job.paths).venv, "bin", "python"), "-I", "-m", "gnosia_audio", "keys", "--json"],
    cwd: job.paths.checkout,
    stdin: JSON.stringify({ lines }),
    timeoutMs: 180_000,
  });
  return keysFromReply(result, lines.length, job.paths.audio);
}

/** The lines the final `narration.json` voices, in order, or none when it cannot be read. */
export async function narratedLines(job: BackendJob): Promise<string[]> {
  const body = await safeRead(remotionkcPaths(job.paths).narration, 2 * 2 ** 20).catch(() => null);
  if (body === null) return [];
  const read = readNarration(body, { hold: false });
  return "chapters" in read ? read.chapters.flatMap((chapter) => chapter.lines) : [];
}
