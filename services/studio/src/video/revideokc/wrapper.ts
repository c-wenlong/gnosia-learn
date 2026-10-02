import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { VideoPaths } from "../paths";
import { revideokcPaths } from "./paths";
import { revideokcEnv } from "./sandbox";
import { COMBINED_HASH_JS } from "./source";
import type { RevideokcToolchain } from "./toolchain";

/**
 * A revideokc job's one command: `jobs/<id>/bin/video`, the same door
 * manimkc's is (D45 of docs/STUDIO-VIDEOS.md, `../wrapper.ts`), with
 * revideokc's verbs (phase 2c of docs/STUDIO-VIDEO-TOOLS.md):
 *
 *   video api [Name ...]        the library and its rules           render profile
 *   video lint                  tsc --noEmit over the checkout      render profile
 *   video narrate               voice narration.json                narrate profile
 *   video still [moment ...]    narrate, then stills and one sheet  narrate, then render
 *   video build                 narrate, render with two workers,   narrate, render,
 *                               then write the transcript            then narrate
 *
 * Every rule of manimkc's wrapper holds: `#!/usr/bin/env -i <node>` so no
 * inherited variable reaches node, each child's environment built from
 * nothing (`revideokcEnv`), arguments checked against fixed patterns and
 * refused with one fixed sentence, one line per call in `calls.ndjson` with
 * the source's hash, the sheets and deliverable found by `lstat` at paths
 * computed from the brief, and a marker in `inflight/` while it runs.
 *
 * What differs: the source is several files, so the recorded hash is the
 * combined one (`source.ts`); revideokc's narration is a step of its own
 * that gnosia-audio runs in the narration profile, so `still` and `build`
 * run `narrate` first there and render with `--no-narrate` here, which reads
 * what narrate left and refuses a stale one; and a build's sidecars are
 * gnosia-audio's too, so `build` runs `sidecars` in the narration profile
 * after the render. Before a render the two ports are checked, so a render
 * left running by an earlier call is named rather than failing inside Vite.
 */

export interface RevideokcWrapperConfig {
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

export function revideokcWrapperConfig(input: {
  tools: RevideokcToolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
  base: number;
  scenes: string[];
  apiNames: string[];
}): RevideokcWrapperConfig {
  const { tools, paths } = input;
  if (tools.sandboxExec === null) throw new Error("the toolchain cannot run a wrapper");
  const own = revideokcPaths(paths);
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
    env: { render: revideokcEnv("render", envInput), narrate: revideokcEnv("narrate", envInput) },
    scenes: input.scenes,
    apiNames: input.apiNames,
    stillsSheet: own.stillsSheet,
    buildSheet: own.buildSheet,
    deliverable: paths.deliverable,
    tsc: path.join(own.nodeModules, "typescript", "bin", "tsc"),
    ports: [input.base, input.base + 1],
  };
}

/** The program's body: plain CommonJS with no dependency but node itself. */
export const REVIDEOKC_WRAPPER_BODY = String.raw`
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");

const USAGE = [
  "video: the one command this job has. It takes one of:",
  "  video api [Name ...]       the library's rules and every export; names print those entries",
  "  video lint                 check the TypeScript: tsc --noEmit over the topic and the library",
  "  video narrate              voice narration.json's lines that are not voiced yet",
  "  video still [moment ...]   voice, render at half size, write one sheet of stills (a moment is a frame or 12.5s)",
  "  video build                voice, render at 1080p with two workers, master, write the transcript and a sheet",
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

function sandboxed(step, profile, argv) {
  const started = Date.now();
  const result = spawnSync(CONFIG.sandboxExec, ["-f", CONFIG.profiles[profile], ...argv], {
    cwd: CONFIG.checkout,
    env: CONFIG.env[profile],
    stdio: ["ignore", "inherit", "inherit"],
  });
  return { step, exitCode: result.status === null ? null : result.status, signal: result.signal || null, ms: Date.now() - started };
}

function cli(args) {
  return [CONFIG.node, CONFIG.checkout + "/tools/cli/revideokc.mjs", "--root", CONFIG.checkout, ...args];
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
    return run(verb, rest, startedAt, startMs);
  } finally {
    try { fs.unlinkSync(marker); } catch { /* already gone */ }
  }
}

function run(verb, rest, startedAt, startMs) {
  const sceneSha256 = sourceHash(CONFIG.topicDir);
  const steps = [];
  const go = (step, profile, argv) => {
    const last = steps[steps.length - 1];
    if (last !== undefined && last.exitCode !== 0) return;
    steps.push(sandboxed(step, profile, argv));
  };
  if (verb === "api") go("render", "render", cli(["api", ...rest]));
  else if (verb === "lint") go("render", "render", [CONFIG.node, CONFIG.tsc, "--noEmit", "--pretty", "false", "-p", CONFIG.checkout + "/tsconfig.json"]);
  else {
    process.stderr.write(">>> voicing narration.json's lines (the narration step)\n");
    go("narrate", "narrate", cli(["narrate", CONFIG.topic]));
    if (verb === "still") go("render", "render", cli(["still", CONFIG.topic, ...rest, "--no-narrate"]));
    if (verb === "build") {
      go("render", "render", cli(["build", CONFIG.topic, "--no-narrate", "--workers", "2"]));
      process.stderr.write(">>> writing the transcript, chapters and captions (the sidecars step)\n");
      go("sidecars", "narrate", cli(["sidecars", CONFIG.topic]));
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
    // The one stills sheet shows every scene, so a still that wrote it rendered them all.
    rendered: sheetAt !== null && sheetAt >= startMs - 1000 && exitCode === 0 ? CONFIG.scenes : [],
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
export function revideokcWrapperSource(node: string, config: RevideokcWrapperConfig): string {
  if (!/^[A-Za-z0-9/._-]+$/.test(node)) throw new Error("node's path cannot go on a shebang line");
  return `#!/usr/bin/env -i ${node}\n// Written by the studio runner for revideokc job ${config.jobId}. Nothing may edit it.\nconst CONFIG = ${JSON.stringify(config, null, 1)};\n${REVIDEOKC_WRAPPER_BODY}`;
}

/** Write `bin/video`, read-and-execute only. */
export async function writeRevideokcWrapper(node: string, paths: VideoPaths, config: RevideokcWrapperConfig): Promise<string> {
  await mkdir(paths.bin, { recursive: true });
  await chmod(paths.wrapper, 0o755).catch(() => undefined);
  await writeFile(paths.wrapper, revideokcWrapperSource(node, config), { encoding: "utf8", mode: 0o555 });
  await chmod(paths.wrapper, 0o555);
  return paths.wrapper;
}
