import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../../paths";
import { scriptShells } from "../script-shells";
import { discoverToolchain, programAt, toolchainProblems, type Program, type Toolchain } from "../toolchain";

/**
 * What a revideokc job renders with on this machine (phase 2c of
 * docs/STUDIO-VIDEO-TOOLS.md), discovered the way `toolchain.ts` discovers
 * manimkc's: every path resolved now, so the profiles name where things
 * really are, never a guess a `brew upgrade` or a Chrome update moves.
 *
 * A revideokc job needs manimkc's half too, and takes it from the same
 * discovery: kokoro's interpreter (`.venv-tts`) and model, the shared clip
 * cache it seeds from, ffmpeg and ffprobe, the narration facts the brief's
 * length is predicted with. Its own half is the revideokc checkout: Node
 * modules (Revideo, Vite, puppeteer, TypeScript, Revideo's own ffmpeg and
 * ffprobe), the `.venv` gnosia-audio is installed in, and a Chrome.
 *
 * Nothing here reads a file an agent wrote.
 */

export interface RevideokcTools {
  /** The real revideokc checkout: `REVIDEOKC_ROOT`, else the submodule. Its `lib/`, `src/` and `tools/` are copied into each job. */
  root: string;
  /** `<root>/node_modules`, resolved, or null. Linked into each job read-only. */
  nodeModules: string | null;
  /** `<root>/.venv`, resolved, or null: where gnosia-audio is installed (`npm run narration-deps`). */
  venv: string | null;
  /** `<root>/.venv/bin/python`: the interpreter gnosia-audio runs on, for `narrate`, `sidecars` and the clip keys. */
  gnosiaPython: Program | null;
  /** The shells gnosia-audio's console script needs, resolved: none unless uv wrote it in its `#!/bin/sh` form (`../script-shells.ts`). */
  scriptShells: string[];
  /** The Chrome binary puppeteer drives, resolved, and the app bundle (or install directory) it runs its helpers from. */
  chrome: { binary: string; bundle: string } | null;
  /** Revideo's own ffmpeg and ffprobe packages, resolved: its exporter runs them. */
  ffmpegInstaller: string | null;
  ffprobeInstaller: string | null;
  /** `node_modules/typescript`, resolved: the lint (`tsc --noEmit`) and the gate's parse. */
  typescript: string | null;
  /** `@revideo/core`'s version, for health and the doctor. */
  revideo: string | null;
  /** Whether the CLI has `build --no-narrate` and `sidecars` (c-wenlong/revideokc#8), which a sandboxed build needs. */
  splitBuild: boolean;
  /** The version of the node every job runs, which must strip types (22.18 or later). */
  nodeVersion: string;
  /** The owner's own revideokc data root, from the environment or the checkout's `.env`: the clean-room rule denies it. Null when it is the checkout. */
  ownerHome: string | null;
}

/** A revideokc job's toolchain: manimkc's discovery, and revideokc's own half. */
export type RevideokcToolchain = Toolchain & { revideokc: RevideokcTools };

function resolveOr(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

/** The revideokc checkout the studio renders with, as `services/catalog/src/env.ts` finds it. */
export function revideokcRoot(): string {
  const configured = process.env.REVIDEOKC_ROOT?.trim();
  const root = configured ? path.resolve(REPO_ROOT, configured) : path.join(REPO_ROOT, "tools", "revideokc");
  return resolveOr(root) ?? root;
}

/**
 * The Chrome revideokc's own CLI would use (`tools/cli/lib/node.mjs`
 * `chromePath`): `REVIDEOKC_CHROME`, else the system Chrome, else Chromium.
 * The bundle is the `.app` the binary sits in, whose helper apps Chrome
 * starts for its renderer and GPU processes; on Linux, the binary's folder.
 */
export function findChrome(env: NodeJS.ProcessEnv = process.env): { binary: string; bundle: string } | null {
  const candidates = [
    env.REVIDEOKC_CHROME?.trim(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((candidate): candidate is string => candidate !== undefined && candidate !== "");
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const binary = resolveOr(candidate);
    if (binary === null) continue;
    const app = /^(.*?\.app)\//.exec(binary)?.[1];
    return { binary, bundle: app ?? path.dirname(binary) };
  }
  return null;
}

function packageVersion(nodeModules: string | null, name: string): string | null {
  if (nodeModules === null) return null;
  try {
    const parsed = JSON.parse(readFileSync(path.join(nodeModules, name, "package.json"), "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/** Whether gnosia-audio is installed in the venv: its package directory in some site-packages. */
function gnosiaInstalled(venv: string | null): boolean {
  if (venv === null) return false;
  try {
    return readdirSync(path.join(venv, "lib")).some((python) => existsSync(path.join(venv, "lib", python, "site-packages", "gnosia_audio", "cli.py")));
  } catch {
    return false;
  }
}

/** `REVIDEOKC_HOME` as revideokc resolves it: the environment, then the checkout's `.env`; `~/` expanded. */
function ownerDataRoot(root: string): string | null {
  let value = process.env.REVIDEOKC_HOME?.trim() ?? "";
  if (value === "") {
    try {
      const line = readFileSync(path.join(root, ".env"), "utf8")
        .split("\n")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith("REVIDEOKC_HOME="));
      value = (line?.slice("REVIDEOKC_HOME=".length) ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
    } catch {
      value = "";
    }
  }
  if (value === "") return null;
  const home = process.env.HOME ?? "";
  const expanded = value === "~" ? home : value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
  if (!path.isAbsolute(expanded)) return null;
  return resolveOr(expanded) ?? path.resolve(expanded);
}

export function discoverRevideokc(): RevideokcTools {
  const root = revideokcRoot();
  const nodeModules = resolveOr(path.join(root, "node_modules"));
  const venv = resolveOr(path.join(root, ".venv"));
  const pkg = (name: string): string | null => (nodeModules === null ? null : resolveOr(path.join(nodeModules, name)));
  return {
    root,
    nodeModules,
    venv,
    gnosiaPython: venv !== null && gnosiaInstalled(venv) ? programAt(path.join(root, ".venv", "bin", "python")) : null,
    scriptShells: venv === null ? [] : scriptShells(path.join(venv, "bin", "gnosia-audio")),
    chrome: findChrome(),
    ffmpegInstaller: pkg("@ffmpeg-installer"),
    ffprobeInstaller: pkg("@ffprobe-installer"),
    typescript: pkg("typescript"),
    revideo: packageVersion(nodeModules, "@revideo/core"),
    splitBuild: existsSync(path.join(root, "tools", "cli", "lib", "sidecars-cmd.mjs")),
    nodeVersion: process.versions.node,
    ownerHome: ownerDataRoot(root),
  };
}

export async function discoverRevideokcToolchain(): Promise<RevideokcToolchain> {
  return { ...(await discoverToolchain()), revideokc: discoverRevideokc() };
}

/** A toolchain as a revideokc job sees it; throws when it was discovered without revideokc's half. */
export function revideokcTools(tools: Toolchain): RevideokcTools {
  const own = (tools as Partial<RevideokcToolchain>).revideokc;
  if (own === undefined) throw new Error("this toolchain was discovered without revideokc's half, so no revideokc job can run with it");
  return own;
}

/** Whether `version` is at least `major.minor`. */
function atLeast(version: string, major: number, minor: number): boolean {
  const [a = 0, b = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  return a > major || (a === major && b >= minor);
}

/**
 * Why a revideokc job cannot run here, one line each; empty when it can.
 * Of manimkc's half, only what a revideokc job uses counts: the sandbox,
 * ffmpeg, kokoro's interpreter and model, and node's path. manimkc's own
 * `.venv`, `manim/` and the Python its CLI runs on are not needed.
 */
export function revideokcProblems(tools: Toolchain): string[] {
  const shared = toolchainProblems(tools).filter(
    (problem) => !/\.venv is missing|python3 is not on PATH|gnosia-audio, the narration package, does not answer/.test(problem),
  );
  const own = (tools as Partial<RevideokcToolchain>).revideokc;
  if (own === undefined) return [...shared, "revideokc's half of the toolchain was never discovered"];
  const problems = [...shared];
  if (!existsSync(path.join(own.root, "tools", "cli", "revideokc.mjs"))) {
    problems.push(`${own.root} is not a revideokc checkout: run git submodule update --init tools/revideokc, or set REVIDEOKC_ROOT`);
    return problems;
  }
  if (!own.splitBuild) {
    problems.push(`the revideokc checkout at ${own.root} has no build --no-narrate or sidecars verb (c-wenlong/revideokc#8), which a sandboxed build needs: move the submodule forward`);
  }
  if (!atLeast(own.nodeVersion, 22, 18)) problems.push(`node ${own.nodeVersion} cannot run revideokc, which needs 22.18 or later to strip types`);
  if (own.nodeModules === null || own.revideo === null) problems.push(`${own.root}/node_modules is missing: run PUPPETEER_SKIP_DOWNLOAD=1 npm ci there`);
  else {
    if (own.ffmpegInstaller === null || own.ffprobeInstaller === null) problems.push("Revideo's own ffmpeg or ffprobe package is missing from node_modules");
    if (own.typescript === null) problems.push("typescript is missing from node_modules, so a scene cannot be checked");
  }
  if (own.chrome === null) problems.push("no Chrome or Chromium was found (REVIDEOKC_CHROME names one), and Revideo renders in one");
  if (own.gnosiaPython === null) problems.push(`gnosia-audio is not installed in ${own.root}/.venv: run npm run narration-deps there`);
  if (own.chrome !== null && /["\\\n\r]/.test(own.chrome.binary)) problems.push("the Chrome binary's path holds a character a sandbox profile cannot carry");
  return problems;
}
