import { accessSync, constants, existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { REPO_ROOT } from "../../paths";
import { scriptShells } from "../script-shells";
import { discoverToolchain, foreignLibs, programAt, toolchainProblems, type Program, type Toolchain } from "../toolchain";

export { scriptShells };

/**
 * What a remotionkc job renders with on this machine (phase 3 of
 * docs/STUDIO-VIDEO-TOOLS.md), discovered the way revideokc's is: every path
 * resolved now, so the profiles name where things really are.
 *
 * A remotionkc job needs manimkc's half too, for narration: kokoro's
 * interpreter (`.venv-tts`) and model, the shared clip cache it seeds from,
 * ffmpeg and ffprobe (the CLI masters and tiles with the system's). Its own
 * half is the remotionkc checkout: Node modules (Remotion, its compositor
 * with its own ffmpeg, webpack's esbuild, TypeScript 7's native `tsc`), the
 * Chrome Headless Shell Remotion downloads into `node_modules/.remotion`
 * (`npx remotion browser ensure`), and the `.venv` gnosia-audio is
 * installed in.
 *
 * Which Chrome: the Headless Shell, never the system Chrome. It is the build
 * Remotion pins to its version and renders with by default, one binary with
 * no app bundle, and measured inside the job profile it needs one Mach
 * service (Metal's shader compiler) and its own rendezvous name, where the
 * system Chrome revideokc drives needs thirteen. The system Chrome would also
 * need `--headless=new`, since current Chrome has dropped the old headless
 * mode Remotion asks a custom executable for, and it updates itself under
 * the profile's feet.
 *
 * Nothing here reads a file an agent wrote.
 */

export interface RemotionkcTools {
  /** The real remotionkc checkout: `REMOTIONKC_ROOT`, else the submodule. Its `lib/`, `src/` and `tools/` are copied into each job. */
  root: string;
  /** `<root>/node_modules`, resolved, or null. Linked into each job read-only. */
  nodeModules: string | null;
  /** `<root>/.venv`, resolved, or null: where gnosia-audio is installed (`npm run narration-deps`). */
  venv: string | null;
  /** `<root>/.venv/bin/python`: the interpreter gnosia-audio runs on, for `narrate`, `sidecars` and the clip keys. */
  gnosiaPython: Program | null;
  /**
   * The shells gnosia-audio's console script needs, resolved: none when its
   * first line names the venv's python, `/bin/sh` and the shell macOS runs
   * as `sh` (`/private/var/select/sh`, bash) when uv wrote the `#!/bin/sh`
   * form it uses for an interpreter path too long for a shebang (measured: a
   * checkout under the session's temporary directory got it, and the
   * narration step died with "Failed to exec /bin/bash as variant for
   * /bin/sh" until the variant was allowed).
   */
  scriptShells: string[];
  /** The Chrome Headless Shell in `node_modules/.remotion`, resolved, and the directory it runs its helpers and libraries from. */
  headlessShell: { binary: string; dir: string } | null;
  /** `@remotion/compositor-<platform>-<arch>`, resolved: Remotion's compositor and the ffmpeg and ffprobe it stitches with. */
  compositor: string | null;
  /** webpack's esbuild binary (`@esbuild/<platform>-<arch>/bin/esbuild`), resolved: the bundle's TypeScript loader starts it. */
  esbuild: string | null;
  /** TypeScript 7's native `tsc` (`@typescript/typescript-<platform>-<arch>/lib/tsc`), resolved: the lint. */
  tsc: string | null;
  /** `remotion`'s version, for health and the doctor. */
  remotion: string | null;
  /** Whether the CLI has `build --no-narrate`, `sidecars` and the sandbox settings (`tools/render/sandbox.mjs`), which a sandboxed job needs. */
  sandboxReady: boolean;
  /** The version of the node every job runs, which must strip types (22.18 or later). */
  nodeVersion: string;
  /** The owner's own remotionkc data root, from the environment or the checkout's `.env`: the clean-room rule denies it. Null when it is the checkout. */
  ownerHome: string | null;
  /**
   * The TypeScript package the gate parses a source with (`lib/typescript.js`
   * of the studio's own, resolved). Not remotionkc's: its TypeScript 7 is a
   * native compiler with no JavaScript API, and the parse wants only the
   * syntax, which any recent TypeScript reads.
   */
  parser: string | null;
  /**
   * Library roots this half's binaries resolve against beyond the standard
   * directories, measured with `ldd` (`../toolchain.ts` `foreignLibs`): on
   * Linux they are bound into every profile, on macOS the list stays empty.
   */
  libs: string[];
}

/** A remotionkc job's toolchain: manimkc's discovery, and remotionkc's own half. */
export type RemotionkcToolchain = Toolchain & { remotionkc: RemotionkcTools };

function resolveOr(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

/** The remotionkc checkout the studio renders with, as `services/catalog/src/env.ts` finds it. */
export function remotionkcRoot(): string {
  const configured = process.env.REMOTIONKC_ROOT?.trim();
  const root = configured ? path.resolve(REPO_ROOT, configured) : path.join(REPO_ROOT, "tools", "remotionkc");
  return resolveOr(root) ?? root;
}

/** `node_modules/.remotion/chrome-headless-shell/<platform>/<dir>/chrome-headless-shell`, as remotionkc's own doctor finds it. */
export function findHeadlessShell(nodeModules: string | null): { binary: string; dir: string } | null {
  if (nodeModules === null) return null;
  const base = path.join(nodeModules, ".remotion", "chrome-headless-shell");
  let platforms: string[];
  try {
    platforms = readdirSync(base).sort();
  } catch {
    return null;
  }
  for (const platform of platforms) {
    let dirs: string[];
    try {
      dirs = readdirSync(path.join(base, platform)).sort();
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const binary = resolveOr(path.join(base, platform, dir, "chrome-headless-shell"));
      if (binary !== null) return { binary, dir: path.dirname(binary) };
    }
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

/** `REMOTIONKC_HOME` as remotionkc resolves it: the environment, then the checkout's `.env`; `~/` expanded. */
function ownerDataRoot(root: string): string | null {
  let value = process.env.REMOTIONKC_HOME?.trim() ?? "";
  if (value === "") {
    try {
      const line = readFileSync(path.join(root, ".env"), "utf8")
        .split("\n")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith("REMOTIONKC_HOME="));
      value = (line?.slice("REMOTIONKC_HOME=".length) ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
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


/** The studio's own TypeScript, for the gate's parse. */
function studioTypeScript(): string | null {
  try {
    return resolveOr(createRequire(import.meta.url).resolve("typescript"));
  } catch {
    return null;
  }
}

/** The synchronous half of the discovery; `libs` is `ldd` work, so only `discoverRemotionkcToolchain` fills it. */
export function discoverRemotionkc(): Omit<RemotionkcTools, "libs"> {
  const root = remotionkcRoot();
  const nodeModules = resolveOr(path.join(root, "node_modules"));
  const venv = resolveOr(path.join(root, ".venv"));
  const target = `${process.platform}-${process.arch}`;
  const inModules = (...parts: string[]): string | null => (nodeModules === null ? null : resolveOr(path.join(nodeModules, ...parts)));
  // The compositor's Linux builds are split by libc (`-gnu`, `-musl`) where
  // the other platforms' are not; npm's optional-dependency filter leaves
  // exactly the matching one installed.
  const compositor =
    process.platform === "linux"
      ? (inModules("@remotion", `compositor-${target}-gnu`) ?? inModules("@remotion", `compositor-${target}-musl`) ?? inModules("@remotion", `compositor-${target}`))
      : inModules("@remotion", `compositor-${target}`);
  return {
    root,
    nodeModules,
    venv,
    gnosiaPython: venv !== null && gnosiaInstalled(venv) ? programAt(path.join(root, ".venv", "bin", "python")) : null,
    scriptShells: venv === null ? [] : scriptShells(path.join(venv, "bin", "gnosia-audio")),
    headlessShell: findHeadlessShell(nodeModules),
    compositor,
    esbuild: inModules("@esbuild", target, "bin", "esbuild"),
    tsc: inModules("@typescript", `typescript-${target}`, "lib", "tsc"),
    remotion: packageVersion(nodeModules, "remotion"),
    sandboxReady: existsSync(path.join(root, "tools", "cli", "lib", "sidecars-cmd.mjs")) && existsSync(path.join(root, "tools", "render", "sandbox.mjs")),
    nodeVersion: process.versions.node,
    ownerHome: ownerDataRoot(root),
    parser: studioTypeScript(),
  };
}

/** The executable regular files in a directory — the compositor's binaries — for `foreignLibs`. */
function executablesIn(dir: string | null): string[] {
  if (dir === null) return [];
  try {
    return readdirSync(dir)
      .map((name) => path.join(dir!, name))
      .filter((file) => {
        try {
          return statSync(file).isFile() && accessSync(file, constants.X_OK) === undefined;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

export async function discoverRemotionkcToolchain(): Promise<RemotionkcToolchain> {
  const own = discoverRemotionkc();
  const libs =
    process.platform === "linux"
      ? await foreignLibs([own.gnosiaPython?.real ?? null, own.headlessShell?.binary ?? null, own.esbuild, own.tsc, ...executablesIn(own.compositor)])
      : [];
  return { ...(await discoverToolchain()), remotionkc: { ...own, libs } };
}

/** A toolchain as a remotionkc job sees it; throws when it was discovered without remotionkc's half. */
export function remotionkcTools(tools: Toolchain): RemotionkcTools {
  const own = (tools as Partial<RemotionkcToolchain>).remotionkc;
  if (own === undefined) throw new Error("this toolchain was discovered without remotionkc's half, so no remotionkc job can run with it");
  return own;
}

/** Whether `version` is at least `major.minor`. */
function atLeast(version: string, major: number, minor: number): boolean {
  const [a = 0, b = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  return a > major || (a === major && b >= minor);
}

/**
 * Why a remotionkc job cannot run here, one line each; empty when it can.
 * Of manimkc's half, only what a remotionkc job uses counts, as for
 * revideokc: the sandbox, ffmpeg, kokoro's interpreter and model, and node.
 */
export function remotionkcProblems(tools: Toolchain): string[] {
  const shared = toolchainProblems(tools).filter(
    (problem) => !/\.venv is missing|python3 is not on PATH|gnosia-audio, the narration package, does not answer/.test(problem),
  );
  const own = (tools as Partial<RemotionkcToolchain>).remotionkc;
  if (own === undefined) return [...shared, "remotionkc's half of the toolchain was never discovered"];
  const problems = [...shared];
  if (!existsSync(path.join(own.root, "tools", "cli", "remotionkc.mjs"))) {
    problems.push(`${own.root} is not a remotionkc checkout: run git submodule update --init tools/remotionkc, or set REMOTIONKC_ROOT`);
    return problems;
  }
  if (!own.sandboxReady) {
    problems.push(`the remotionkc checkout at ${own.root} has no build --no-narrate, sidecars verb or tools/render/sandbox.mjs, which a sandboxed job needs: move the submodule forward`);
  }
  if (!atLeast(own.nodeVersion, 22, 18)) problems.push(`node ${own.nodeVersion} cannot run remotionkc, which needs 22.18 or later to strip types`);
  if (own.nodeModules === null || own.remotion === null) problems.push(`${own.root}/node_modules is missing: run npm ci there`);
  else {
    if (own.headlessShell === null) problems.push(`Remotion's Chrome Headless Shell is not in ${own.root}/node_modules/.remotion: run npx remotion browser ensure there (a job cannot download it)`);
    if (own.compositor === null) problems.push("Remotion's compositor package for this platform is missing from node_modules");
    if (own.esbuild === null) problems.push("esbuild's binary for this platform is missing from node_modules, so a composition cannot be bundled");
    if (own.tsc === null) problems.push("TypeScript's native compiler for this platform is missing from node_modules, so a composition cannot be checked");
  }
  if (own.parser === null) problems.push("the studio's own typescript package is missing, so the gate cannot parse a composition: run npm ci in this repository");
  if (own.gnosiaPython === null) problems.push(`gnosia-audio is not installed in ${own.root}/.venv: run npm run narration-deps there`);
  return problems;
}
