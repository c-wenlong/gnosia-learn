import { copyFile, lstat, mkdir, readdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { run } from "../proc";
import { STUDIO_DOMAIN, videoPaths, type VideoPaths } from "./paths";
import type { Toolchain } from "./toolchain";
import type { ValidVideoBrief } from "./brief";
import { isNarrated } from "./brief";

/**
 * The job checkout (D46): a synthetic manimkc checkout holding one topic.
 *
 * manimkc's own server serialises jobs because two agents in one checkout's
 * `topics/` would race; a checkout per job removes the reason, and makes the
 * clean-room rule structural, since there are no other topics to read.
 *
 * - `lib/` is a **copy**, not a link. `lib/narration.py` finds its repository
 *   with `Path(__file__).resolve().parents[1]`, which follows a linked `lib/`
 *   back to the real checkout and reads that checkout's `.env`; the sandbox
 *   refuses the read and the render dies (finding 1 of the design). It is 220
 *   kB, and it is also why the agent may read the helpers without reaching
 *   the real checkout.
 * - `manim/`, the venvs, `tools/` and `manim.cfg` are links: a venv writes its
 *   own absolute path into every script, so it cannot be copied, and the
 *   render profile allows reading and running exactly these.
 * - `custom_config.yml` is written, pointing ManimGL's output base and its
 *   cache into `render/`, the only place a render may write.
 * - `render/.env` holds `NARRATION_BACKEND=kokoro` and the voice, and no key,
 *   which is also the point: the job's data root has nothing to find.
 */

const LINKED = ["manim", ".venv", ".venv-tts", "tools", "manim.cfg"] as const;

/** `why_it_matters` → `WhyItMatters`, as manimkc's `new` spells a scene class. */
export function camel(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/** The scene classes a brief's scenes become under `prefix`, in play order. */
export function classNames(prefix: string, sceneNames: readonly string[]): string[] {
  return sceneNames.map((name, i) => `${prefix}${i + 1}_${camel(name)}`);
}

/** Copy a directory of regular files and directories, dropping links and caches. */
async function copyTree(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.name === "__pycache__" || entry.name === ".DS_Store") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(source, target);
    else if (entry.isFile()) await copyFile(source, target);
  }
}

/** Every path of `raw` moved from its job directory to `job`. */
export function rebasePaths(raw: VideoPaths, job: string): VideoPaths {
  const rebased = {} as Record<keyof VideoPaths, string>;
  for (const [key, value] of Object.entries(raw) as [keyof VideoPaths, string][]) {
    rebased[key] = path.join(job, path.relative(raw.job, value));
  }
  return rebased as VideoPaths;
}

/** Resolve the job directory and build every path from the resolved one: Seatbelt matches real paths. */
export async function resolvedPaths(jobId: string, slug: string, jobDirectory?: string): Promise<VideoPaths> {
  const raw = videoPaths(jobId, slug);
  const wanted = jobDirectory ?? raw.job;
  await mkdir(wanted, { recursive: true });
  const real = await realpath(wanted);
  return real === raw.job ? raw : rebasePaths(raw, real);
}

/** The skeleton every job has before a topic is put in it. */
export async function buildCheckout(tools: Toolchain, paths: VideoPaths, voice: string): Promise<void> {
  await copyTree(path.join(tools.manimkcRoot, "lib"), paths.lib);
  for (const name of LINKED) {
    const target = path.join(paths.checkout, name);
    if ((await lstat(target).catch(() => null)) !== null) continue;
    await symlink(path.join(tools.manimkcRoot, name), target);
  }
  // Absolute, because ManimGL joins the base with its sub-directories and
  // reads the file from the working directory, the checkout, which the render
  // profile does not let it write.
  await writeFile(
    path.join(paths.checkout, "custom_config.yml"),
    [
      "# Written by the studio for one job: every ManimGL output and cache inside this job's render/.",
      "directories:",
      `  base: ${JSON.stringify(paths.manimBase)}`,
      "  subdirs:",
      '    output: "scenes"',
      `  cache: ${JSON.stringify(paths.manimCache)}`,
      `  downloads: ${JSON.stringify(path.join(paths.manimCache, "downloads"))}`,
      "",
    ].join("\n"),
    "utf8",
  );
  for (const dir of [paths.renderTmp, paths.mpl, paths.manimBase, paths.manimCache, paths.audio, paths.out, paths.bin, paths.tmp]) {
    await mkdir(dir, { recursive: true });
  }
  // No key, and nothing but the two settings the narration step reads: a
  // `.env` is required by `manimkc doctor` (finding 3), and this one has
  // nothing in it worth finding.
  //
  // The same file in the checkout too: `manimkc doctor` looks for the
  // checkout's `.env`, not the data root's, measured.
  const dotenv = `NARRATION_BACKEND=kokoro\n${voice === "none" ? "" : `NARRATION_KOKORO_VOICE=${voice}\n`}`;
  await writeFile(path.join(paths.render, ".env"), dotenv, "utf8");
  await writeFile(path.join(paths.checkout, ".env"), dotenv, "utf8");
}

/** The environment the runner runs manimkc's own `new` in: nothing inherited. */
function cliEnv(tools: Toolchain, paths: VideoPaths): NodeJS.ProcessEnv {
  return {
    PATH: [tools.ffmpeg === null ? null : path.dirname(tools.ffmpeg.link), "/usr/bin", "/bin"].filter(Boolean).join(":"),
    HOME: process.env.HOME ?? "",
    LANG: "en_US.UTF-8",
    TMPDIR: paths.renderTmp,
    MANIMKC_HOME: paths.render,
    MANIMKC_ROOT: paths.checkout,
  };
}

export interface Scaffold {
  prefix: string;
  classes: string[];
}

/** The `prefix:` line of a topic.yml. */
export function prefixOf(topicYml: string): string | null {
  return /^prefix:\s*([A-Z]{1,4})\s*$/m.exec(topicYml)?.[1] ?? null;
}

/** The `topic:` slug of a topic.yml, or null when it names none. */
export function topicOf(topicYml: string): string | null {
  const value = /^topic:[ \t]*([^\s#]*)/m.exec(topicYml)?.[1] ?? "";
  return value === "" ? null : value;
}

/**
 * The scene-class prefix: the slug's initials, cut to the four letters
 * manimkc allows. Passed explicitly because `new` would suggest all the
 * initials and then refuse its own suggestion for a slug of five words or
 * more (measured on the first real run). The job checkout holds no other
 * topic, so no prefix is taken.
 */
export function prefixFor(slug: string): string {
  const words = slug.split("-").filter((word) => word !== "");
  const initials = words.map((word) => word.charAt(0)).join("").toUpperCase().replace(/[^A-Z]/g, "");
  const prefix = words.length === 1 ? (words[0] ?? "").slice(0, 2).toUpperCase().replace(/[^A-Z]/g, "") : initials;
  return (prefix || "V").slice(0, 4);
}

/** A title manimkc can put in a docstring and a YAML string: no quote, backslash or line break. */
function safeTitle(title: string): string {
  return title.replace(/["\\\r\n]/g, "").slice(0, 120);
}

/**
 * Put the topic in: `manimkc new` for a new video, with the brief's scene
 * names (plain `Scene` stubs with `--silent`); or, for a change, the source
 * the job starts from, copied in. Then the topic line, which the gate checks
 * and the agent may not edit.
 *
 * `new` runs outside the sandbox because it is the runner's step and reads no
 * agent input: its only arguments are a slug and scene names the validator
 * pattern-checked, and a title stripped of anything that could end a string.
 */
export async function scaffold(
  tools: Toolchain,
  paths: VideoPaths,
  brief: ValidVideoBrief,
  startFrom: { files: Map<string, Buffer> } | null,
): Promise<Scaffold> {
  if (startFrom !== null) {
    await mkdir(paths.topicDir, { recursive: true });
    for (const [name, body] of startFrom.files) {
      // One level, and only the two kinds of file a topic holds.
      if (!/^[a-z0-9_]+\.py$|^topic\.yml$/.test(name)) continue;
      await writeFile(path.join(paths.topicDir, name), body);
    }
  } else {
    const python = tools.python3?.real;
    if (python === undefined) throw new Error("python3 is missing, so the topic cannot be scaffolded");
    const result = await run(
      python,
      [
        path.join(paths.checkout, "tools", "cli", "manimkc"),
        "--root",
        paths.checkout,
        "new",
        `${STUDIO_DOMAIN}/${brief.slug}`,
        "--title",
        safeTitle(brief.title),
        "--prefix",
        prefixFor(brief.slug),
        "--scenes",
        brief.scenes.map((scene) => scene.name).join(","),
        "--no-makefile",
        ...(isNarrated(brief) ? [] : ["--silent"]),
        "--json",
      ],
      { cwd: paths.checkout, env: cliEnv(tools, paths), timeoutMs: 60_000 },
    );
    if (result.code !== 0) {
      throw new Error(`manimkc new failed: ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")}`);
    }
  }
  const yml = await readFile(paths.topicYml, "utf8");
  const prefix = prefixOf(yml);
  if (prefix === null) throw new Error("the topic.yml has no prefix line");
  const topicLine = `topic: ${brief.topic}`;
  const next = /^topic:.*$/m.test(yml) ? yml.replace(/^topic:.*$/m, topicLine) : `${topicLine}\n${yml}`;
  await writeFile(paths.topicYml, next, "utf8");
  return { prefix, classes: classNames(prefix, brief.scenes.map((scene) => scene.name)) };
}
