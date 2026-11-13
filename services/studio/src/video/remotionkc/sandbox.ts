import { realpathSync } from "node:fs";
import path from "node:path";

import type { VideoPaths } from "../paths";
import { bwrapProfileText } from "../bwrap";
import { ancestorRules, deniedReadsFor, file, literal, ProfileError, quoted, tree, unique, type ProfileKind, type Rule } from "../sandbox";
import type { Program } from "../toolchain";
import { remotionkcPaths } from "./paths";
import type { RemotionkcToolchain } from "./toolchain";

/**
 * A remotionkc job's three Seatbelt profiles (phase 3 of
 * docs/STUDIO-VIDEO-TOOLS.md, D76 and D80), built on manimkc's base as
 * revideokc's are: deny by default, the same denied places for reads, writes
 * only inside the job, and the same refusal of a path that would end a
 * string literal. Each allowance below was measured necessary on the owner's
 * machine, a render inside the profile under the default `STUDIO_HOME`
 * (inside this repository) failing without it:
 *
 * - **render** (`api`, `lint`, `still`, `build --no-narrate`): node; the
 *   Chrome Headless Shell (Remotion's own, in `node_modules/.remotion`) with
 *   its own sandbox off, which Remotion always passes; Remotion's compositor
 *   with its ffmpeg and ffprobe; webpack's esbuild; TypeScript 7's native
 *   `tsc`; and the system ffmpeg and ffprobe the CLI masters and tiles with.
 *   Reads the job and remotionkc's `node_modules`, nothing else of the
 *   owner's. Writes `render/` only, and makes symlinks only under
 *   `render/tmp`, where Remotion links the public dir into its bundle.
 *   Network: bind, inbound and outbound on the job's two loopback ports
 *   (Remotion's server and Chrome's DevTools, pinned by remotionkc's
 *   `REMOTIONKC_PORT`), and nothing else, not even a unix socket.
 *   Mach: Chrome's rendezvous name, registered and looked up, and Metal's
 *   shader compiler, which is an XPC service (an `xpc-service-name`, not a
 *   `global-name`; with only the second the GPU process died and WebGL
 *   failed). No Python and no shell.
 * - **narrate** (`narrate`, `sidecars`, the clip keys): revideokc's, for the
 *   same gnosia-audio: node, gnosia-audio's interpreter in remotionkc's
 *   `.venv` and its console script (with `/bin/sh` and the shell it runs
 *   only when uv wrote the script in its `#!/bin/sh` form), kokoro's
 *   interpreter in manimkc's `.venv-tts`, the model; writes the clip cache, the staged clips, the
 *   build's work folders (where `sidecars` writes and locks) and the
 *   deliverable's folder. No network, no Mach service.
 * - **gate** (the TypeScript parse, the probe, the poster): node, ffmpeg and
 *   ffprobe; reads `candidate/` and the studio's own TypeScript package
 *   (remotionkc's TypeScript 7 has no JavaScript API to parse with); writes
 *   the poster and nothing else.
 *
 * Every profile refuses a hard link (`file-link`), as revideokc's do:
 * narration stages clips with a link when one can be made, and a file with
 * two links is one the runner's careful copy refuses to keep.
 *
 * Measured to cost nothing when denied, against revideokc's system Chrome:
 * fonts, logd, the window server, CARenderServer, libinfo,
 * notification_center, FSEvents, diagnosticd, tccd, distributed
 * notifications and LaunchServices. The Headless Shell needs none of them.
 *
 * A loopback port rule also allows a listen on every address of that port,
 * and a listen on `::` takes connections from the local network (measured).
 * Remotion listens on every address, so remotionkc's render listens on
 * 127.0.0.1 instead when `REMOTIONKC_PORT` is set; the profile cannot.
 */

/** Chrome's `MachPortRendezvousServer.<pid>`, as the Headless Shell names it: looked up by its children, and the only name it may register. */
export const CHROME_RENDEZVOUS = String.raw`^org\.chromium\.Chromium\.MachPortRendezvousServer\.`;

/** The XPC services the render profile may look up: Metal's shader compiler, which Chrome's GPU process needs for WebGL. */
export const RENDER_XPC_SERVICES = ["com.apple.MTLCompilerService"] as const;

/** The small system program the narration step starts: Python's `platform` runs `uname` for kokoro. The console script's shells are the toolchain's (`scriptShells`). */
const NARRATE_SYSTEM = ["/usr/bin/uname"];

export interface RemotionkcProfileInput {
  tools: RemotionkcToolchain;
  paths: VideoPaths;
  home: string;
  studioHome?: string;
  /** The job's base port: `base` and `base + 1` are its two. */
  base: number;
}

function program(entry: Program | null): Rule[] {
  return entry === null ? [] : [file(entry.link), file(entry.real), ...(entry.home === null ? [] : [tree(entry.home)])];
}

function realOr(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

/** node, by its path and its resolved one: never its whole installation. */
function nodeRules(tools: RemotionkcToolchain): Rule[] {
  return [...new Set([tools.node, realOr(tools.node)])].map(file);
}

function execRules(kind: ProfileKind, { tools }: RemotionkcProfileInput): Rule[] {
  const own = tools.remotionkc;
  const media = [tools.ffmpeg, tools.ffprobe].flatMap(program);
  if (kind === "gate") return [...nodeRules(tools), ...media];
  if (kind === "narrate") {
    // gnosia-audio's console script, which remotionkc runs by path: a script is
    // checked at exec as well as the interpreter its first line names.
    const script = own.venv === null ? [] : [file(path.join(own.venv, "bin", "gnosia-audio"))];
    return [...nodeRules(tools), ...script, ...own.scriptShells.map(file), ...program(own.gnosiaPython), ...program(tools.ttsPython), ...media, ...NARRATE_SYSTEM.map(file)];
  }
  return [
    ...nodeRules(tools),
    ...(own.headlessShell === null ? [] : [tree(own.headlessShell.dir)]),
    ...(own.compositor === null ? [] : [tree(own.compositor)]),
    ...[own.esbuild, own.tsc].flatMap((binary) => (binary === null ? [] : [file(binary)])),
    ...media,
  ];
}

/** The studio's TypeScript package directory, from its `lib/typescript.js`. */
function parserPackage(parser: string | null): Rule[] {
  return parser === null ? [] : [tree(path.dirname(path.dirname(parser)))];
}

function readRules(kind: ProfileKind, { tools, paths }: RemotionkcProfileInput): Rule[] {
  const own = tools.remotionkc;
  if (kind === "gate") return [tree(paths.candidate), ...parserPackage(own.parser)];
  const job = [tree(paths.checkout), tree(paths.render)];
  if (kind === "narrate") {
    return [
      ...job,
      ...(own.venv === null ? [] : [tree(own.venv)]),
      tree(tools.manimkcDirs.venvTts),
      ...(tools.kokoroModel === null ? [] : [tree(tools.kokoroModel)]),
    ];
  }
  return [...job, ...(own.nodeModules === null ? [] : [tree(own.nodeModules)])];
}

function writeRules(kind: ProfileKind, { paths }: RemotionkcProfileInput): Rule[] {
  if (kind === "gate") return [file(paths.poster)];
  if (kind === "narrate") {
    const own = remotionkcPaths(paths);
    // The clip cache, the staged clips and manifest, the build's work folders
    // (where `sidecars` writes and takes the topic's lock) and the folder the
    // deliverable is in, and the temporary directory.
    return [paths.audio, own.publicDir, own.buildWork, paths.outTopic, paths.renderTmp].map(tree);
  }
  return [tree(paths.render)];
}

/** One remotionkc profile's text. Deterministic, so a test can read it and a person can diff two jobs'. */
export function buildRemotionkcProfile(kind: ProfileKind, input: RemotionkcProfileInput): string {
  const { paths, base } = input;
  if (!Number.isInteger(base) || base < 1024 || base > 65534) throw new ProfileError(`${base} is not a base port a profile can name`);
  const deniedReads = deniedReadsFor(input);
  const exec = execRules(kind, input);
  const reads = readRules(kind, input);
  const writes = writeRules(kind, input);
  const render = kind === "render";
  if (input.tools.sandboxKind === "bwrap") {
    // The same lists, as a namespace: every exec and read a mount, every
    // denied place under one an empty shadow, the ports private to the job's
    // netns, Chrome's devices only when a render asks for them.
    return bwrapProfileText({
      kind,
      exec,
      reads,
      writes,
      deniedReads,
      libs: [...input.tools.libs, ...input.tools.remotionkc.libs],
      rootfs: paths.sandboxRoot,
      empty: paths.sandboxEmpty,
      emptyFile: paths.sandboxEmptyFile,
      ports: render ? [base, base + 1] : undefined,
      gpu: render,
    });
  }
  const ancestors = ancestorRules([...exec, ...reads, ...writes], deniedReads);
  const ports = [base, base + 1];
  return [
    `; The ${kind} profile for one studio remotionkc job. Written by the runner; see services/studio/src/video/remotionkc/sandbox.ts.`,
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec\n  ${unique(exec).join("\n  ")})`,
    "(allow file-read*)",
    `(deny file-read*\n  ${deniedReads.map((dir) => `(subpath ${quoted(dir)})`).join("\n  ")})`,
    `(allow file-read*\n  ${unique(reads).join("\n  ")})`,
    ...(ancestors.length === 0 ? [] : [`(allow file-read-metadata\n  ${ancestors.join("\n  ")})`]),
    `(allow file-write*\n  ${[...unique(writes), literal("/dev/null"), literal("/dev/dtracehelper")].join("\n  ")})`,
    "(deny file-link)",
    "(deny file-write-create (vnode-type SYMLINK))",
    // Remotion links the data root's public/ into its bundle, under the temporary directory.
    ...(render ? [`(allow file-write-create (require-all (vnode-type SYMLINK) (subpath ${quoted(paths.renderTmp)})))`] : []),
    "(allow file-ioctl) (allow sysctl-read) (allow process-info* (target self))",
    "(allow iokit-open) (allow iokit-get-properties)",
    ...(render
      ? [
          `(allow mach-lookup\n  ${[...RENDER_XPC_SERVICES.map((name) => `(xpc-service-name "${name}")`), `(global-name-regex #"${CHROME_RENDEZVOUS}")`].join("\n  ")})`,
          `(allow mach-register (global-name-regex #"${CHROME_RENDEZVOUS}"))`,
          `(allow network-bind network-inbound\n  ${ports.map((port) => `(local ip "localhost:${port}")`).join("\n  ")})`,
          `(allow network-outbound\n  ${ports.map((port) => `(remote ip "localhost:${port}")`).join("\n  ")})`,
        ]
      : []),
    "(allow ipc-posix-shm*) (allow ipc-posix-sem)",
    "(allow signal (target same-sandbox))",
    "(allow user-preference-read) (allow system-fsctl)",
    "",
  ].join("\n");
}

export interface RemotionkcEnvInput {
  tools: RemotionkcToolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
  /** The job's base port; only the render profile's environment names it. */
  base?: number;
}

/**
 * A step's environment, built from nothing as manimkc's and revideokc's are,
 * never the runner's own with things taken out.
 *
 * The render's names the job's port (`REMOTIONKC_PORT`, which pins Remotion's
 * server to it, on loopback, and Chrome's DevTools to the next), turns
 * webpack's persistent cache off (`REMOTIONKC_BUNDLE_CACHE=off`: storing it
 * stats every directory above `node_modules` up to the root, and the profile
 * refuses the first, measured), and points Chrome's temporary directory into
 * the job. Narration is revideokc's: gnosia-audio's own environment with no
 * manimkc checkout named, so the clip keys are a manimkc job's.
 */
export function remotionkcEnv(kind: ProfileKind, { tools, paths, home, voice, base }: RemotionkcEnvInput): Record<string, string> {
  const binDir = tools.ffmpeg === null ? null : path.dirname(tools.ffmpeg.link);
  const env: Record<string, string> = {
    PATH: [binDir, "/usr/bin", "/bin"].filter((dir): dir is string => dir !== null).join(":"),
    HOME: home,
    LANG: "en_US.UTF-8",
    TMPDIR: paths.renderTmp,
    // Linux: $HOME points at a read-only skeleton stub, so caches (fontconfig's,
    // Chrome's) that default under it are pointed at the job's instead.
    ...(tools.platform === "linux"
      ? { XDG_CACHE_HOME: path.join(paths.renderTmp, "xdg"), XDG_CONFIG_HOME: path.join(paths.renderTmp, "xdg-config") }
      : {}),
  };
  if (kind === "gate") return env;
  Object.assign(env, {
    REMOTIONKC_HOME: paths.render,
    REMOTIONKC_ROOT: paths.checkout,
  });
  if (kind === "render") {
    if (base === undefined) throw new ProfileError("a render's environment needs the job's port");
    Object.assign(env, {
      // Chrome ignores TMPDIR for its own files on macOS.
      MAC_CHROMIUM_TMPDIR: paths.renderTmp,
      REMOTIONKC_PORT: String(base),
      REMOTIONKC_BUNDLE_CACHE: "off",
    });
    return env;
  }
  Object.assign(env, {
    MANIMKC_HOME: paths.render,
    NARRATION_BACKEND: "kokoro",
    NARRATION_KOKORO_VOICE: voice,
    NARRATION_TTS_PYTHON: tools.ttsPython?.link ?? "",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HOME: path.join(paths.renderTmp, "hf"),
    HF_HUB_CACHE: tools.hfHubCache,
  });
  return env;
}
