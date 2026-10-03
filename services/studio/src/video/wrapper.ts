import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { sandboxEnv, renderJobs } from "./sandbox";
import { sheetPath, type VideoPaths } from "./paths";
import type { Toolchain } from "./toolchain";

/**
 * The agent's one command: `jobs/<id>/bin/video` (D45 of docs/STUDIO-VIDEOS.md).
 *
 * A small Node program written per job with the job's paths compiled in, so
 * the one Bash prefix the permission file allows cannot be pointed at another
 * job. It is the only door to anything that runs, which is why the sandbox,
 * the environment and the call log all live in it:
 *
 * - **Five verbs and nothing else**: `api [names]`, `lint`, `narrate
 *   [Scene ...]`, `preview [Scene ...]`, `build`. A name must come from
 *   `manimkc api`'s own list, a scene from the brief's classes. Anything else
 *   is refused with one fixed sentence that never repeats what was passed, so
 *   an argument cannot become text in the agent's context by bouncing off it.
 * - **Its first line is `#!/usr/bin/env -i <node>`.** macOS splits a shebang
 *   line on spaces, so `env -i` clears the whole environment before node
 *   starts. A Node program run with an inherited environment would read
 *   `NODE_OPTIONS`, and `NODE_OPTIONS=--require <the scene file>` in front of
 *   the allowed prefix would run agent-written code unsandboxed. Whether the
 *   CLI's Bash matcher accepts a leading assignment was not tested (the design
 *   says so); with this line the answer does not matter. Measured: an
 *   inherited `NODE_OPTIONS` naming a missing file changes nothing.
 * - **Every child's environment is built from nothing**: the allowlist in
 *   `sandbox.ts`, compiled in here, so an inherited `PYTHONPATH` cannot reach
 *   Python either.
 * - **Every call is one line in `calls.ndjson`**: the verb, the scenes, start
 *   and end, the exit codes, the scene file's hash when it started, and which
 *   sheets and deliverable it produced, found by `lstat` at the paths computed
 *   from the brief, never parsed out of output that agent code could have
 *   printed into. That file is how the job view shows steps and how the gate
 *   knows what was rendered when.
 * - It prints manimkc's own report back, which is what the skill has the
 *   owner read. A step's output reaches the agent through pipes of the
 *   wrapper's own, drained as it arrives and written to the wrapper's
 *   stdout and stderr, never through the descriptors the wrapper was given:
 *   the CLI hands Bash a file under the temporary directory, which the
 *   profiles refuse to read, and a strict program aborts at start when it
 *   cannot fstat its standard streams (revideokc's node did; manimkc's
 *   Python tolerates it).
 *
 * `narrate` runs `lib/narration.py` under the narration profile, the only one
 * that can read the kokoro model. `preview` and `build` run that same step
 * first, as `manimkc preview` does its own prefetch, then run manimkc under
 * the render profile, where a line nobody voiced fails loudly because the
 * model is not readable there.
 */

export interface WrapperConfig {
  jobId: string;
  sandboxExec: string;
  /** The interpreter the stdlib-only manimkc CLI runs on. */
  python3: string;
  checkout: string;
  sceneFile: string;
  topicDir: string;
  calls: string;
  /** Where a call marks itself started, removed when it ends: the hang timer's view of a render in progress. */
  inflight: string;
  profiles: { render: string; narrate: string };
  env: { render: Record<string, string>; narrate: Record<string, string> };
  scenes: string[];
  apiNames: string[];
  narrated: boolean;
  sheets: Record<string, string>;
  deliverable: string;
  jobs: number;
}

export function wrapperConfig(input: {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
  scenes: string[];
  apiNames: string[];
  narrated: boolean;
}): WrapperConfig {
  const { tools, paths } = input;
  if (tools.sandboxExec === null || tools.python3 === null) throw new Error("the toolchain cannot run a wrapper");
  const envInput = { tools, paths, home: input.home, voice: input.voice };
  return {
    jobId: path.basename(paths.job),
    sandboxExec: tools.sandboxExec,
    python3: tools.python3.real,
    checkout: paths.checkout,
    sceneFile: paths.sceneFile,
    topicDir: paths.topicDir,
    calls: paths.calls,
    inflight: paths.inflight,
    profiles: { render: paths.renderProfile, narrate: paths.narrateProfile },
    env: { render: sandboxEnv("render", envInput), narrate: sandboxEnv("narrate", envInput) },
    scenes: input.scenes,
    apiNames: input.apiNames,
    narrated: input.narrated,
    sheets: Object.fromEntries(input.scenes.map((scene) => [scene, sheetPath(paths, scene)])),
    deliverable: paths.deliverable,
    jobs: renderJobs(),
  };
}

/**
 * The program's body. Plain CommonJS with no dependency but node itself, so
 * it runs whatever the studio's own modules are doing.
 */
export const WRAPPER_BODY = String.raw`
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");

const USAGE = [
  "video: the one command this job has. It takes one of:",
  "  video api [name ...]       the rules, the palette and every helper; names print one entry in full",
  "  video lint                 check the scene file",
  "  video narrate [Scene ...]  voice the file's voiceover lines that are not voiced yet",
  "  video preview [Scene ...]  voice, render at 480p, write one contact sheet per scene",
  "  video build                voice, render every scene at 1080p, join, write the transcript",
].join("\n");
const REFUSED = "video: that is not something this command does, and nothing ran.\n" + USAGE;

function now() { return new Date().toISOString(); }

function hashScene() {
  try {
    const fd = fs.openSync(CONFIG.sceneFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile()) return null;
      const hash = crypto.createHash("sha256");
      const buffer = Buffer.alloc(1 << 16);
      for (;;) {
        const n = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (n === 0) break;
        hash.update(buffer.subarray(0, n));
      }
      return hash.digest("hex");
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}

function mtime(file) {
  try {
    const st = fs.lstatSync(file);
    return st.isFile() ? st.mtimeMs : null;
  } catch { return null; }
}

function record(entry) {
  fs.appendFileSync(CONFIG.calls, JSON.stringify(entry) + "\n", { mode: 0o644 });
}

// Where a step's output goes: this process's own stdout and stderr, written
// through their streams, so a full pipe is waited on (the step is paused
// until it drains) rather than spun on. If one fails (its reader went away,
// its file filled), the rest of the output is dropped and the step runs on,
// so the call is still recorded and the marker removed.
let outputLost = false;
const paused = new Set();
function loseOutput() {
  outputLost = true;
  for (const source of paused) source.resume();
  paused.clear();
}
process.stdout.on("error", loseOutput);
process.stderr.on("error", loseOutput);

function forward(source, sink) {
  source.on("data", (chunk) => {
    if (outputLost) return;
    let flowing;
    try {
      flowing = sink.write(chunk);
    } catch {
      loseOutput();
      return;
    }
    if (!flowing && !outputLost) {
      source.pause();
      paused.add(source);
      sink.once("drain", () => {
        paused.delete(source);
        source.resume();
      });
    }
  });
}

// A step's output comes back through pipes of the wrapper's own, never the
// descriptors the wrapper was given: the CLI hands Bash a file under the
// temporary directory for stdout and stderr, which the profiles refuse to
// read, and a strict program (node does) aborts at start when it cannot fstat
// its standard streams. Python tolerates that today; nothing should have to.
// The pipes are drained as the step writes, so a long or chatty render is
// neither held in memory nor stopped for its output.
function sandboxed(profile, env, argv) {
  const started = Date.now();
  return new Promise((resolve) => {
    const ended = (exitCode, signal) => resolve({ step: profile, exitCode, signal, ms: Date.now() - started });
    let child;
    try {
      child = spawn(CONFIG.sandboxExec, ["-f", CONFIG.profiles[profile], ...argv], {
        cwd: CONFIG.checkout,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      ended(null, null);
      return;
    }
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on("error", () => ended(null, null));
    child.on("close", (code, signal) => ended(code === null ? null : code, signal || null));
  });
}

function narrate() {
  return sandboxed("narrate", CONFIG.env.narrate, [CONFIG.checkout + "/.venv/bin/python", "lib/narration.py", CONFIG.sceneFile]);
}

function manimkc(args) {
  return sandboxed("render", CONFIG.env.render, [CONFIG.python3, CONFIG.checkout + "/tools/cli/manimkc", "--root", CONFIG.checkout, ...args]);
}

async function main(argv) {
  const verb = argv[0];
  const rest = argv.slice(1);
  if (verb === undefined || verb === "help" || verb === "--help" || verb === "-h") {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  const knownScene = (name) => CONFIG.scenes.includes(name);
  const knownName = (name) => CONFIG.apiNames.includes(name);
  let ok = false;
  if (verb === "api") ok = rest.length <= 20 && rest.every(knownName);
  else if (verb === "lint" || verb === "build") ok = rest.length === 0;
  else if (verb === "narrate" || verb === "preview") ok = rest.length <= CONFIG.scenes.length && rest.every(knownScene) && new Set(rest).size === rest.length;
  if (!ok) {
    record({ verb: "refused", startedAt: now(), endedAt: now(), exitCode: 2 });
    process.stderr.write(REFUSED + "\n");
    return 2;
  }
  if (verb === "narrate" && !CONFIG.narrated) {
    process.stderr.write("video: this video is silent, so there is nothing to voice.\n");
    return 2;
  }

  const startedAt = now();
  const startMs = Date.now();
  // Started and not ended: a render in progress, which the hang timer counts
  // as the agent working (a line in calls.ndjson comes only at the end).
  // Written whole to a temporary name in the same directory, then renamed,
  // so the hang check never finds it half-written.
  const marker = CONFIG.inflight + "/" + process.pid + ".json";
  const pending = CONFIG.inflight + "/." + process.pid + ".json.tmp";
  try {
    fs.mkdirSync(CONFIG.inflight, { recursive: true, mode: 0o755 });
    fs.writeFileSync(pending, JSON.stringify({ verb, startedAt }) + "\n", { mode: 0o644 });
    fs.renameSync(pending, marker);
  } catch { /* the hang timer then sees silence, which is the old behaviour */ }
  try {
    return await run(verb, rest, startedAt, startMs);
  } finally {
    try { fs.unlinkSync(marker); } catch { /* already gone */ }
  }
}

async function run(verb, rest, startedAt, startMs) {
  const sceneSha256 = hashScene();
  const steps = [];
  const needsVoice = CONFIG.narrated && (verb === "narrate" || verb === "preview" || verb === "build");
  if (needsVoice) {
    process.stderr.write(">>> voicing the scene file's lines (the narration step)\n");
    steps.push(await narrate());
  }
  const voiced = steps.length === 0 || steps[0].exitCode === 0;
  if (voiced && verb !== "narrate") {
    const jobs = String(CONFIG.jobs);
    if (verb === "api") steps.push(await manimkc(["api", ...rest]));
    else if (verb === "lint") steps.push(await manimkc(["lint", CONFIG.sceneFile]));
    else if (verb === "preview") steps.push(await manimkc(["preview", CONFIG.sceneFile, ...rest, "--no-narration", "--jobs", jobs]));
    else if (verb === "build") steps.push(await manimkc(["build", CONFIG.topicDir, "--no-register", "--jobs", jobs]));
  }
  const last = steps[steps.length - 1];
  const exitCode = last === undefined ? 0 : last.exitCode;
  const rendered = verb === "preview"
    ? (rest.length === 0 ? CONFIG.scenes : rest).filter((scene) => {
        const at = mtime(CONFIG.sheets[scene]);
        return at !== null && at >= startMs - 1000;
      })
    : [];
  const deliverableAt = verb === "build" ? mtime(CONFIG.deliverable) : null;
  record({
    verb,
    scenes: verb === "preview" || verb === "narrate" ? (rest.length === 0 ? CONFIG.scenes : rest) : [],
    names: verb === "api" ? rest : [],
    startedAt,
    endedAt: now(),
    exitCode,
    steps,
    sceneSha256,
    rendered,
    deliverable: verb === "build" ? { written: deliverableAt !== null && deliverableAt >= startMs - 1000 } : null,
  });
  return exitCode === null ? 1 : exitCode;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
  process.stderr.write("video: " + (error && error.message ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
`;

/** The program's text: the shebang, the compiled-in configuration, the body. */
export function wrapperSource(node: string, config: WrapperConfig): string {
  if (!/^[A-Za-z0-9/._-]+$/.test(node)) throw new Error("node's path cannot go on a shebang line");
  return `#!/usr/bin/env -i ${node}\n// Written by the studio runner for job ${config.jobId}. Nothing may edit it.\nconst CONFIG = ${JSON.stringify(config, null, 1)};\n${WRAPPER_BODY}`;
}

/** Write `bin/video`, read-and-execute only. */
export async function writeWrapper(node: string, paths: VideoPaths, config: WrapperConfig): Promise<string> {
  await mkdir(paths.bin, { recursive: true });
  // A second attempt rewrites it, and a read-only file refuses its own owner.
  await chmod(paths.wrapper, 0o755).catch(() => undefined);
  await writeFile(paths.wrapper, wrapperSource(node, config), { encoding: "utf8", mode: 0o555 });
  await chmod(paths.wrapper, 0o555);
  return paths.wrapper;
}
