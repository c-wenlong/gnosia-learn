import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { VideoPaths } from "../paths";
import { remotionkcPaths } from "./paths";
import { remotionkcEnv } from "./sandbox";
import { COMBINED_HASH_JS } from "./source";
import type { RemotionkcToolchain } from "./toolchain";

/**
 * A remotionkc job's one command: `jobs/<id>/bin/video`, the same door
 * manimkc's and revideokc's are (D45 of docs/STUDIO-VIDEOS.md), with
 * remotionkc's verbs (phase 3 of docs/STUDIO-VIDEO-TOOLS.md):
 *
 *   video api [Name ...]        the library and its rules           render profile
 *   video lint                  tsc --noEmit over the checkout      render profile
 *   video narrate               voice narration.json                narrate profile
 *   video still [moment ...]    narrate, then stills and one sheet  narrate, then render
 *   video build                 narrate, render, master, then       narrate, render,
 *                               write the transcript                 then narrate
 *
 * Every rule of revideokc's wrapper holds: `#!/usr/bin/env -i <node>` so no
 * inherited variable reaches node, each child's environment built from
 * nothing (`remotionkcEnv`), arguments checked against fixed patterns and
 * refused with one fixed sentence, one line per call in `calls.ndjson` with
 * the source's combined hash, the sheet and deliverable found by `lstat` at
 * paths computed from the brief, a marker in `inflight/` while it runs, and a
 * step's output relayed through pipes of the wrapper's own, never the
 * descriptors it was given: the CLI hands Bash a file under the temporary
 * directory for stdout and stderr, which the profiles refuse to read, and
 * node aborts at start when it cannot fstat its standard streams.
 *
 * The lint is TypeScript 7's native `tsc`, run directly: the `tsc` script in
 * `node_modules/.bin` is a node launcher for the same binary. `build` renders
 * at remotionkc's default concurrency of three. Before a render the two ports
 * are checked, so a render left running by an earlier call is named rather
 * than failing inside Remotion.
 */

export interface RemotionkcWrapperConfig {
  jobId: string;
  sandboxExec: string;
  node: string;
  checkout: string;
  topic: string;
  topicDir: string;
  calls: string;
  inflight: string;
  profiles: { render: string; narrate: string };
  env: { render: Record<string, string>; narrate: Record<string, string> };
  scenes: string[];
  apiNames: string[];
  stillsSheet: string;
  buildSheet: string;
  deliverable: string;
  tsc: string;
  ports: number[];
}

export function remotionkcWrapperConfig(input: {
  tools: RemotionkcToolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
  base: number;
  scenes: string[];
  apiNames: string[];
}): RemotionkcWrapperConfig {
  const { tools, paths } = input;
  if (tools.sandboxExec === null) throw new Error("the toolchain cannot run a wrapper");
  if (tools.remotionkc.tsc === null) throw new Error("TypeScript's native compiler is missing, so the wrapper has no lint");
  const own = remotionkcPaths(paths);
  const envInput = { tools, paths, home: input.home, voice: input.voice, base: input.base };
  return {
    jobId: path.basename(paths.job),
    sandboxExec: tools.sandboxExec,
    node: tools.node,
    checkout: paths.checkout,
    topic: own.topic,
    topicDir: paths.topicDir,
    calls: paths.calls,
    inflight: paths.inflight,
    profiles: { render: paths.renderProfile, narrate: paths.narrateProfile },
    env: { render: remotionkcEnv("render", envInput), narrate: remotionkcEnv("narrate", envInput) },
    scenes: input.scenes,
    apiNames: input.apiNames,
    stillsSheet: own.stillsSheet,
    buildSheet: own.buildSheet,
    deliverable: paths.deliverable,
    tsc: tools.remotionkc.tsc,
    ports: [input.base, input.base + 1],
  };
}

/** The program's body: plain CommonJS with no dependency but node itself. */
export const REMOTIONKC_WRAPPER_BODY = String.raw`
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");

const USAGE = [
  "video: the one command this job has. It takes one of:",
  "  video api [Name ...]       the library's rules and every export; names print those entries",
  "  video lint                 check the TypeScript: tsc --noEmit over the topic and the library",
  "  video narrate              voice narration.json's lines that are not voiced yet",
  "  video still [moment ...]   voice, render at half size, write one sheet of stills (a moment is a frame or 12.5s)",
  "  video build                voice, render at 1080p, master, write the transcript and a sheet",
].join("\n");
const REFUSED = "video: that is not something this command does, and nothing ran.\n" + USAGE;
const MOMENT = /^(?:\d{1,6}|\d{1,4}(?:\.\d{1,3})?s)$/;
${COMBINED_HASH_JS}
function now() { return new Date().toISOString(); }

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
// its file filled), the rest of that stream's output is dropped, the other
// keeps going, and the step runs on, so the call is still recorded and the
// marker removed.
const lost = new Set();
const paused = new Map();
function loseOutput(sink) {
  lost.add(sink);
  for (const source of paused.get(sink) || []) source.resume();
  paused.delete(sink);
}
process.stdout.on("error", () => loseOutput(process.stdout));
process.stderr.on("error", () => loseOutput(process.stderr));

function forward(source, sink) {
  source.on("data", (chunk) => {
    if (lost.has(sink)) return;
    let flowing;
    try {
      flowing = sink.write(chunk);
    } catch {
      loseOutput(sink);
      return;
    }
    if (!flowing && !lost.has(sink)) {
      source.pause();
      if (!paused.has(sink)) paused.set(sink, new Set());
      paused.get(sink).add(source);
      sink.once("drain", () => {
        paused.get(sink)?.delete(source);
        source.resume();
      });
    }
  });
}

// A step's output comes back through pipes of the wrapper's own, never the
// descriptors the wrapper was given: the CLI hands Bash a file under the
// temporary directory for stdout and stderr, which the profiles refuse to
// read, and node aborts at start when it cannot fstat its standard streams.
// The pipes are drained as the step writes, so a long or chatty render is
// neither held in memory nor stopped for its output.
function sandboxed(step, profile, argv) {
  const started = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(CONFIG.sandboxExec, ["-f", CONFIG.profiles[profile], ...argv], {
        cwd: CONFIG.checkout,
        env: CONFIG.env[profile],
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve({ step, exitCode: null, signal: null, ms: Date.now() - started });
      return;
    }
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on("error", () => resolve({ step, exitCode: null, signal: null, ms: Date.now() - started }));
    child.on("close", (code, signal) => resolve({ step, exitCode: code === null ? null : code, signal: signal || null, ms: Date.now() - started }));
  });
}

function cli(args) {
  return [CONFIG.node, CONFIG.checkout + "/tools/cli/remotionkc.mjs", "--root", CONFIG.checkout, ...args];
}

function portHeld(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code === "EADDRINUSE" || error.code === "EACCES"));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(false)));
  });
}

async function heldPorts() {
  const held = [];
  for (const port of CONFIG.ports) {
    if ((await portHeld(port, "127.0.0.1")) || (await portHeld(port, "::1"))) held.push(port);
  }
  return held;
}

async function main(argv) {
  const verb = argv[0];
  const rest = argv.slice(1);
  if (verb === undefined || verb === "help" || verb === "--help" || verb === "-h") {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  let ok = false;
  if (verb === "api") ok = rest.length <= 20 && rest.every((name) => CONFIG.apiNames.includes(name));
  else if (verb === "lint" || verb === "narrate" || verb === "build") ok = rest.length === 0;
  else if (verb === "still") ok = rest.length <= 12 && rest.every((moment) => MOMENT.test(moment));
  if (!ok) {
    record({ verb: "refused", startedAt: now(), endedAt: now(), exitCode: 2 });
    process.stderr.write(REFUSED + "\n");
    return 2;
  }
  if (verb === "still" || verb === "build") {
    const held = await heldPorts();
    if (held.length > 0) {
      process.stderr.write("video: this job's render port" + (held.length === 1 ? " " : "s ") + held.join(" and ") + (held.length === 1 ? " is" : " are") + " still held, most likely by a render an earlier call started that has not ended. Wait a minute and run it again; nothing ran.\n");
      record({ verb, startedAt: now(), endedAt: now(), exitCode: 3, steps: [], sceneSha256: sourceHash(CONFIG.topicDir), rendered: [], deliverable: verb === "build" ? { written: false } : null });
      return 3;
    }
  }

  const startedAt = now();
  const startMs = Date.now();
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
  const sceneSha256 = sourceHash(CONFIG.topicDir);
  const steps = [];
  const go = async (step, profile, argv) => {
    const last = steps[steps.length - 1];
    if (last !== undefined && last.exitCode !== 0) return;
    steps.push(await sandboxed(step, profile, argv));
  };
  if (verb === "api") await go("render", "render", cli(["api", ...rest]));
  else if (verb === "lint") await go("render", "render", [CONFIG.tsc, "--noEmit", "--pretty", "false", "-p", CONFIG.checkout + "/tsconfig.json"]);
  else {
    process.stderr.write(">>> voicing narration.json's lines (the narration step)\n");
    await go("narrate", "narrate", cli(["narrate", CONFIG.topic]));
    if (verb === "still") await go("render", "render", cli(["still", CONFIG.topic, ...rest, "--no-narrate"]));
    if (verb === "build") {
      await go("render", "render", cli(["build", CONFIG.topic, "--no-narrate"]));
      process.stderr.write(">>> writing the transcript, chapters and captions (the sidecars step)\n");
      await go("sidecars", "narrate", cli(["sidecars", CONFIG.topic]));
    }
  }
  const last = steps[steps.length - 1];
  const exitCode = last === undefined ? 0 : last.exitCode;
  const sheetAt = verb === "still" ? mtime(CONFIG.stillsSheet) : null;
  const deliverableAt = verb === "build" ? mtime(CONFIG.deliverable) : null;
  record({
    verb,
    scenes: verb === "still" || verb === "narrate" ? CONFIG.scenes : [],
    names: verb === "api" ? rest : [],
    moments: verb === "still" ? rest : [],
    startedAt,
    endedAt: now(),
    exitCode,
    steps,
    sceneSha256,
    // A still with no moments puts a still of every line on the one sheet, so
    // it rendered every scene; one of chosen moments covers no scene for
    // certain (a moment names a time, not a scene), and its sheet replaces
    // the whole-video one, so it renders none.
    rendered: verb === "still" && rest.length === 0 && sheetAt !== null && sheetAt >= startMs - 1000 && exitCode === 0 ? CONFIG.scenes : [],
    deliverable: verb === "build" ? { written: deliverableAt !== null && deliverableAt >= startMs - 1000 && exitCode === 0 } : null,
  });
  return exitCode === null ? 1 : exitCode;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
  process.stderr.write("video: " + (error && error.message ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
`;

/** The program's text: the shebang, the compiled-in configuration, the body. */
export function remotionkcWrapperSource(node: string, config: RemotionkcWrapperConfig): string {
  if (!/^[A-Za-z0-9/._-]+$/.test(node)) throw new Error("node's path cannot go on a shebang line");
  return `#!/usr/bin/env -i ${node}\n// Written by the studio runner for remotionkc job ${config.jobId}. Nothing may edit it.\nconst CONFIG = ${JSON.stringify(config, null, 1)};\n${REMOTIONKC_WRAPPER_BODY}`;
}

/** Write `bin/video`, read-and-execute only. */
export async function writeRemotionkcWrapper(node: string, paths: VideoPaths, config: RemotionkcWrapperConfig): Promise<string> {
  await mkdir(paths.bin, { recursive: true });
  await chmod(paths.wrapper, 0o755).catch(() => undefined);
  await writeFile(paths.wrapper, remotionkcWrapperSource(node, config), { encoding: "utf8", mode: 0o555 });
  await chmod(paths.wrapper, 0o555);
  return paths.wrapper;
}
