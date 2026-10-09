import { accessSync, constants, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../paths";
import { run } from "../proc";
import { readNarrationFacts, settleNarrationRead, startNarrationRead, type NarrationFacts } from "./narration";

/**
 * Where the programs a render runs actually live on this machine.
 *
 * The sandbox profiles allow `process-exec` of a short list of programs and
 * nothing else (D44), and Seatbelt matches the real path after every symlink
 * is resolved. So the list is generated here, from where `ffmpeg`, `ffprobe`,
 * `python3` and the two venvs' interpreters resolve right now, never written
 * down as a guess: a `brew upgrade` moves a Cellar keg, and a profile naming
 * the old one would refuse every render with nothing to say why.
 *
 * Nothing here reads a file an agent wrote.
 */

export interface Program {
  /** The name as found on PATH, e.g. `/opt/homebrew/bin/ffmpeg`. */
  link: string;
  /** Every symlink resolved. */
  real: string;
  /**
   * The directory the program's installation lives in, allowed as a subpath:
   * a Homebrew keg (`/opt/homebrew/Cellar/ffmpeg/9.0.1_1`) or a framework
   * (`/Library/Frameworks/Python.framework`), because Python re-executes its
   * own `Python.app` inside the framework. Null for a program that is only
   * its own file.
   */
  home: string | null;
}

export interface Toolchain {
  platform: NodeJS.Platform;
  /**
   * The confinement mechanism `sandboxExec` speaks: Seatbelt profile text on
   * macOS, a bubblewrap argv file on Linux (V4). Null when this machine has
   * no sandbox program, which `sandboxExec` mirrors.
   */
  sandboxKind: "seatbelt" | "bwrap" | null;
  /** `/usr/bin/sandbox-exec`, `bwrap` on Linux, or null when this machine has none (V3). */
  sandboxExec: string | null;
  /**
   * Directories the sandboxed programs' shared libraries live under, outside
   * the standard `/lib`, `/usr/lib` and friends the Linux profile binds
   * anyway: `/nix/store/<hash>-*` roots when a binary comes from nix. Seatbelt
   * profiles never needed the list — their blanket `file-read*` covered every
   * library a process would load — but a bwrap namespace starts empty, so the
   * linker paths are measured with `ldd` here. Empty on macOS.
   */
  libs: string[];
  /** The real manimkc checkout, every symlink resolved: the venvs, `manim/` and `tools/` the job links to. */
  manimkcRoot: string;
  /**
   * The four directories the job links to, each resolved on its own: a
   * checkout whose venv is itself a link (a second clone sharing one set of
   * venvs) has them somewhere else, and Seatbelt allows the real path only.
   */
  manimkcDirs: { manim: string; venv: string; venvTts: string; tools: string };
  ffmpeg: Program | null;
  ffprobe: Program | null;
  python3: Program | null;
  /** `<manimkc>/.venv/bin/python`, resolved: the interpreter a render and the narration step import manimlib in. */
  venvPython: Program | null;
  /** `<manimkc>/.venv-tts/bin/python`, resolved: the kokoro worker's interpreter. */
  ttsPython: Program | null;
  /** The node that runs the wrapper, `process.execPath`. */
  node: string;
  /** The Hugging Face hub cache, where kokoro's model is. */
  hfHubCache: string;
  /** `<hub>/models--hexgrad--Kokoro-82M`, or null when the model was never downloaded (V9). */
  kokoroModel: string | null;
  /** The kokoro voices whose files are in that cache. */
  voicesInstalled: string[];
  /** The owner's shared TTS cache, read to seed a job and never written. Null when manimkc cannot say. */
  sharedAudioCache: string | null;
  /**
   * gnosia-audio, the narration package in `<manimkc>/.venv`, as its
   * `home --json` answered (narration.ts). Null when it is not installed
   * there, which is `make narration-deps` in the checkout. Optional so a
   * toolchain built by hand (a test's) need not name it; `discoverToolchain`
   * always does.
   */
  narration?: NarrationFacts | null;
}

/** Search `PATH` the way a shell would, for an executable regular file. */
export function which(name: string, searchPath: string = process.env.PATH ?? ""): string | null {
  for (const dir of searchPath.split(":")) {
    if (dir === "") continue;
    const candidate = path.join(dir, name);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

/** The installation a resolved program belongs to: its Homebrew keg, its framework, or its nix store path. */
export function installationOf(real: string): string | null {
  const cellar = /^(.*\/Cellar\/[^/]+\/[^/]+)\//.exec(real);
  if (cellar?.[1] !== undefined) return cellar[1];
  const framework = /^(.*\/[^/]+\.framework)\//.exec(real);
  if (framework?.[1] !== undefined) return framework[1];
  const store = /^(\/nix\/store\/[^/]+)\//.exec(real);
  if (store?.[1] !== undefined) return store[1];
  return null;
}

export function programAt(link: string | null): Program | null {
  if (link === null || !existsSync(link)) return null;
  try {
    const real = realpathSync(link);
    return { link, real, home: installationOf(real) };
  } catch {
    return null;
  }
}

/**
 * The manimkc checkout the studio renders with: `MANIMKC_ROOT` (the same
 * variable, and the same meaning, manimkc's own CLI gives it), else the
 * submodule at the path `.gitmodules` names. Resolved, because a worktree may
 * point it at the main checkout where the venvs actually are.
 */
export function manimkcRoot(): string {
  const configured = process.env.MANIMKC_ROOT?.trim();
  const root = configured ? path.resolve(REPO_ROOT, configured) : path.join(REPO_ROOT, "tools", "manimkc");
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

function resolveOr(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

/** The directories the standard Linux binds already cover, which `foreignLibs` never reports. */
const STANDARD_LIB_DIRS = /^\/(usr\/lib|usr\/lib64|usr\/lib32|usr\/local\/lib|lib|lib64|lib32)(\/|$)/;

/**
 * The library roots a set of binaries needs beyond the standard directories:
 * `ldd` on each, then every resolved path reduced to its nix store path or
 * its own directory, minus the platform ones. Each path counts twice — as
 * reported and fully resolved — because nix ships libraries as symlinks into
 * sibling store paths (`gcc-lib` symlinking into `gcc-libgcc`), and the bind
 * list needs both. A statically linked binary answers none; a missing one is
 * skipped. Linux only.
 */
export async function foreignLibs(binaries: (string | null)[]): Promise<string[]> {
  const roots = new Set<string>();
  for (const binary of binaries) {
    if (binary === null) continue;
    const result = await run("ldd", [binary], { timeoutMs: 15_000 }).catch(() => null);
    if (result === null || result.code !== 0) continue;
    for (const match of result.stdout.matchAll(/(?:=>\s+)?(\/[^\s()]+)\s+\(0x[0-9a-f]+\)/g)) {
      for (const lib of [match[1]!, resolveOr(match[1]!)]) {
        if (STANDARD_LIB_DIRS.test(lib)) continue;
        const store = /^(\/nix\/store\/[^/]+)\//.exec(lib)?.[1];
        roots.add(store ?? path.dirname(lib));
      }
    }
  }
  return [...roots].sort();
}

/** The sandbox program this machine has: `/usr/bin/sandbox-exec` on macOS, `bwrap` on Linux (V4). */
function sandboxProgram(platform: NodeJS.Platform): { kind: Toolchain["sandboxKind"]; exec: string } | null {
  if (platform === "darwin") return existsSync("/usr/bin/sandbox-exec") ? { kind: "seatbelt", exec: "/usr/bin/sandbox-exec" } : null;
  if (platform === "linux") {
    const bwrap = which("bwrap") ?? ["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"].find((candidate) => existsSync(candidate));
    return bwrap === undefined || bwrap === null ? null : { kind: "bwrap", exec: bwrap };
  }
  return null;
}

function hubCache(): string {
  const hub = process.env.HF_HUB_CACHE?.trim();
  if (hub) return path.resolve(hub);
  const home = process.env.HF_HOME?.trim();
  if (home) return path.join(path.resolve(home), "hub");
  return path.join(process.env.HOME ?? "", ".cache", "huggingface", "hub");
}

function voicesIn(model: string): string[] {
  const found = new Set<string>();
  let snapshots: string[] = [];
  try {
    snapshots = readdirSync(path.join(model, "snapshots"));
  } catch {
    return [];
  }
  for (const snapshot of snapshots) {
    try {
      for (const file of readdirSync(path.join(model, "snapshots", snapshot, "voices"))) {
        if (file.endsWith(".pt")) found.add(file.slice(0, -3));
      }
    } catch {
      /* a snapshot with no voices directory */
    }
  }
  return [...found].sort();
}

/**
 * The owner's shared TTS cache, as `manimkc home --json` reports it for the
 * real checkout. Read-only: the command writes nothing, and its timing line
 * is switched off.
 */
async function sharedCache(root: string, python: string | null): Promise<string | null> {
  if (python === null) return null;
  const env: NodeJS.ProcessEnv = {
    PATH: "/usr/bin:/bin",
    HOME: process.env.HOME ?? "",
    MANIMKC_TIMING: "0",
    ...(process.env.MANIMKC_HOME === undefined ? {} : { MANIMKC_HOME: process.env.MANIMKC_HOME }),
  };
  const result = await run(python, [path.join(root, "tools", "cli", "manimkc"), "--root", root, "home", "--json"], {
    cwd: root,
    env,
    timeoutMs: 30_000,
  }).catch(() => null);
  const cache = (result?.json as { derived?: { cache?: unknown } } | null)?.derived?.cache;
  return typeof cache === "string" && path.isAbsolute(cache) ? cache : null;
}

export async function discoverToolchain(): Promise<Toolchain> {
  const root = manimkcRoot();
  const python3 = programAt(which("python3"));
  const venvPython = programAt(path.join(root, ".venv", "bin", "python"));
  const ffmpeg = programAt(which("ffmpeg"));
  const ffprobe = programAt(which("ffprobe"));
  const ttsPython = programAt(path.join(root, ".venv-tts", "bin", "python"));
  // Kept for the brief's validator and the card as well, which read it
  // synchronously. A failed read clears it, so health says `fallback` rather
  // than reporting an installation that no longer answers as current, and
  // the card makes its own check; an older read that finishes late changes
  // nothing (Greptile on #257).
  const ticket = startNarrationRead();
  const [narration, sharedAudioCache] = await Promise.all([readNarrationFacts(root, venvPython?.link ?? null), sharedCache(root, python3?.real ?? null)]);
  settleNarrationRead(ticket, narration);
  const hub = hubCache();
  const model = path.join(hub, "models--hexgrad--Kokoro-82M");
  const kokoroModel = existsSync(model) ? realpathSync(model) : null;
  const sandbox = sandboxProgram(process.platform);
  const libs =
    process.platform === "linux"
      ? await foreignLibs([process.execPath, ffmpeg?.real ?? null, ffprobe?.real ?? null, python3?.real ?? null, venvPython?.real ?? null, ttsPython?.real ?? null])
      : [];
  return {
    platform: process.platform,
    sandboxKind: sandbox?.kind ?? null,
    sandboxExec: sandbox?.exec ?? null,
    libs,
    manimkcRoot: root,
    manimkcDirs: {
      manim: resolveOr(path.join(root, "manim")),
      venv: resolveOr(path.join(root, ".venv")),
      venvTts: resolveOr(path.join(root, ".venv-tts")),
      tools: resolveOr(path.join(root, "tools")),
    },
    ffmpeg,
    ffprobe,
    python3,
    venvPython,
    ttsPython,
    node: process.execPath,
    hfHubCache: existsSync(hub) ? realpathSync(hub) : hub,
    kokoroModel,
    voicesInstalled: kokoroModel === null ? [] : voicesIn(kokoroModel),
    sharedAudioCache,
    narration,
  };
}

/** Why a toolchain cannot run a video job, one line each; empty when it can. */
export function toolchainProblems(tools: Toolchain): string[] {
  const problems: string[] = [];
  if (tools.platform !== "darwin" && tools.platform !== "linux") {
    problems.push(`the video kind runs on macOS and Linux for now: ${tools.platform} has no measured sandbox backend, so video jobs stay off here (V4)`);
  }
  if (tools.sandboxExec === null) {
    problems.push(
      tools.platform === "linux"
        ? "bubblewrap (bwrap) is missing, and a video job never renders unsandboxed (V3)"
        : "sandbox-exec is missing, and a video job never renders unsandboxed (V3)",
    );
  }
  if (tools.ffmpeg === null) problems.push("ffmpeg is not on PATH");
  if (tools.ffprobe === null) problems.push("ffprobe is not on PATH");
  if (tools.python3 === null) problems.push("python3 is not on PATH (the manimkc CLI runs on it)");
  if (tools.venvPython === null) problems.push(`${tools.manimkcRoot}/.venv is missing: run manimkc doctor for the fix`);
  if (tools.ttsPython === null) problems.push(`${tools.manimkcRoot}/.venv-tts is missing, so no narrated video can be voiced`);
  if (tools.venvPython !== null && tools.narration === null) {
    problems.push(`gnosia-audio, the narration package, does not answer in ${tools.manimkcRoot}/.venv: run make narration-deps there`);
  }
  if (tools.kokoroModel === null) problems.push("the kokoro model is not in the Hugging Face cache, and the narration step never downloads it (V9)");
  if (!/^[A-Za-z0-9/._-]+$/.test(tools.node)) problems.push(`node's path ${JSON.stringify(tools.node)} holds a character the wrapper's first line cannot carry`);
  return problems;
}
