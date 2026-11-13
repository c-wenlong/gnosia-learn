import { realpathSync } from "node:fs";
import path from "node:path";

import type { VideoPaths } from "../paths";
import { bwrapProfileText } from "../bwrap";
import { ancestorRules, deniedReadsFor, file, literal, ProfileError, quoted, tree, unique, type ProfileKind, type Rule } from "../sandbox";
import type { Program } from "../toolchain";
import { revideokcPaths } from "./paths";
import type { RevideokcToolchain } from "./toolchain";

/**
 * A revideokc job's three Seatbelt profiles (D76 of
 * docs/STUDIO-VIDEO-TOOLS.md), built on manimkc's (`../sandbox.ts`): deny by
 * default, the same denied places for reads, writes only inside the job, an
 * allowlist of Mach services, and the same refusal of a path that would end a
 * string literal. What each adds is what was measured necessary, in the
 * spike and again for this backend:
 *
 * - **render** (`api`, `lint`, `still`, `build --no-narrate`): node, Chrome
 *   with its own sandbox off (the job profile confines every Chrome process
 *   instead), Revideo's bundled ffmpeg and ffprobe, and the system ffmpeg the
 *   CLI masters and tiles with. Reads the job, revideokc's `node_modules`
 *   (Vite resolves the link to its real path) and nothing else of the owner's.
 *   Writes `render/` only. Network: bind, inbound and outbound on the job's
 *   two loopback ports, and unix sockets under `render/tmp` (Chrome's
 *   `SingletonSocket`); symlinks may be created there and nowhere else
 *   (`SingletonLock`). Chrome's rendezvous service is registered, and the
 *   Mach lookups are thirteen named services. No Python: the build that runs
 *   here starts none (`--no-narrate`), and the sidecars are written in the
 *   narration profile after it.
 * - **narrate** (`narrate`, `sidecars`, the clip keys): node, gnosia-audio's
 *   interpreter in revideokc's `.venv`, and kokoro's in manimkc's `.venv-tts`.
 *   Reads kokoro's model; writes the clip cache, the staged clips, the build's
 *   work folder and the deliverable's folder (where `sidecars` puts its three
 *   files), and the temporary directory. No network, no Mach service.
 * - **gate** (the TypeScript parse of D77, the probe, the poster): node,
 *   ffmpeg and ffprobe; reads `candidate/` and the TypeScript package; writes
 *   the poster and nothing else.
 *
 * Every profile refuses a hard link (`file-link`): gnosia-audio's clips are
 * staged with a link when one can be made, and a file with two links is one
 * the runner's careful copy refuses to keep (`../copy.ts`), so the staging
 * copies instead.
 *
 * The spike profile (2026-09-30) allowed node's whole store directory, and
 * `/bin/sh`, `/bin/bash` and `/usr/bin/env`; none of those were needed once
 * measured here, so the exec list names node's binary alone and no shell.
 */

/**
 * The Mach services the render profile may look up: the spike's thirteen.
 * Metal's compiler, fonts, logd, the window server and CARenderServer
 * (Chrome's GPU process), libinfo, notification_center, FSEvents,
 * diagnosticd, tccd.system, distributed notifications and LaunchServices'
 * daemon (Chrome stops at start without the last two, measured), and
 * Chrome's own rendezvous server, named per process.
 */
export const RENDER_SERVICES = [
  "com.apple.MTLCompilerService",
  "com.apple.fonts",
  "com.apple.logd",
  "com.apple.windowserver.active",
  "com.apple.CARenderServer",
  "com.apple.system.opendirectoryd.libinfo",
  "com.apple.system.notification_center",
  "com.apple.FSEvents",
  "com.apple.diagnosticd",
  "com.apple.tccd.system",
  "com.apple.distributed_notifications@Uv3",
  "com.apple.coreservices.launchservicesd",
] as const;

/** Chrome's `MachPortRendezvousServer.<pid>`, looked up by its children, and the only name it may register. */
export const CHROME_RENDEZVOUS = String.raw`^com\.google\.Chrome\.MachPortRendezvousServer\.`;
export const CHROME_REGISTER = String.raw`^com\.google\.Chrome\.`;

/** The small system program the narration step starts: Python's `platform` runs `uname` for kokoro. The console script's shells are the toolchain's (`scriptShells`): `/bin/sh` alone was allowed before, which ran nothing, since it execs the shell `/private/var/select/sh` names. */
const NARRATE_SYSTEM = ["/usr/bin/uname"];

/** The job's ports file and its pair, which every Chrome tool's setup writes the same way (`../ports.ts`). */
export { portsFile, profilePorts, readPorts, writePorts } from "../ports";

export interface RevideokcProfileInput {
  tools: RevideokcToolchain;
  paths: VideoPaths;
  home: string;
  studioHome?: string;
  /** The job's base port: `base` and `base + 1` are its two. */
  base: number;
}

function program(entry: Program | null): Rule[] {
  return entry === null ? [] : [file(entry.link), file(entry.real), ...(entry.home === null ? [] : [tree(entry.home)])];
}

/** node, by its path and its resolved one: never its whole installation, which the spike allowed. */
function nodeRules(tools: RevideokcToolchain): Rule[] {
  return [...new Set([tools.node, realOr(tools.node)])].map(file);
}

function realOr(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

function execRules(kind: ProfileKind, { tools }: RevideokcProfileInput): Rule[] {
  const own = tools.revideokc;
  const media = [tools.ffmpeg, tools.ffprobe].flatMap(program);
  if (kind === "gate") return [...nodeRules(tools), ...media];
  if (kind === "narrate") {
    // gnosia-audio's console script, which revideokc runs by path: a script is
    // checked at exec as well as the interpreter its first line names.
    const script = own.venv === null ? [] : [file(path.join(own.venv, "bin", "gnosia-audio"))];
    return [...nodeRules(tools), ...script, ...own.scriptShells.map(file), ...program(own.gnosiaPython), ...program(tools.ttsPython), ...media, ...NARRATE_SYSTEM.map(file)];
  }
  return [
    ...nodeRules(tools),
    ...(own.chrome === null ? [] : [tree(own.chrome.bundle)]),
    ...[own.ffmpegInstaller, own.ffprobeInstaller].flatMap((dir) => (dir === null ? [] : [tree(dir)])),
    ...media,
  ];
}

function readRules(kind: ProfileKind, { tools, paths }: RevideokcProfileInput): Rule[] {
  const own = tools.revideokc;
  if (kind === "gate") return [tree(paths.candidate), ...(own.typescript === null ? [] : [tree(own.typescript)])];
  const job = [tree(paths.checkout), tree(paths.render)];
  if (kind === "narrate") {
    return [
      ...job,
      ...(own.venv === null ? [] : [tree(own.venv)]),
      tree(tools.manimkcDirs.venvTts),
      ...(tools.kokoroModel === null ? [] : [tree(tools.kokoroModel)]),
    ];
  }
  return [...job, ...(own.nodeModules === null ? [] : [tree(own.nodeModules)]), ...(own.chrome === null ? [] : [tree(own.chrome.bundle)])];
}

function writeRules(kind: ProfileKind, { paths }: RevideokcProfileInput): Rule[] {
  if (kind === "gate") return [file(paths.poster)];
  if (kind === "narrate") {
    const own = revideokcPaths(paths);
    // The clip cache, the staged clips and manifest, a build's work folder
    // (where `sidecars` writes before it moves the files) and the folder the
    // deliverable is in, and the temporary directory.
    return [paths.audio, own.publicDir, own.buildWork, paths.outTopic, paths.renderTmp].map(tree);
  }
  return [tree(paths.render)];
}

/** One revideokc profile's text. Deterministic, so a test can read it and a person can diff two jobs'. */
export function buildRevideokcProfile(kind: ProfileKind, input: RevideokcProfileInput): string {
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
      libs: [...input.tools.libs, ...input.tools.revideokc.libs],
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
    `; The ${kind} profile for one studio revideokc job. Written by the runner; see services/studio/src/video/revideokc/sandbox.ts.`,
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
    // Chrome's SingletonLock is a symlink, made in its temporary directory.
    ...(render ? [`(allow file-write-create (require-all (vnode-type SYMLINK) (subpath ${quoted(paths.renderTmp)})))`] : []),
    "(allow file-ioctl) (allow sysctl-read) (allow process-info* (target self))",
    "(allow iokit-open) (allow iokit-get-properties)",
    ...(render
      ? [
          `(allow mach-lookup\n  ${[...RENDER_SERVICES.map((name) => `(global-name "${name}")`), `(global-name-regex #"${CHROME_RENDEZVOUS}")`].join("\n  ")})`,
          `(allow mach-register (global-name-regex #"${CHROME_REGISTER}"))`,
          `(allow network-bind network-inbound\n  ${ports.map((port) => `(local ip "localhost:${port}")`).join("\n  ")})`,
          `(allow network-outbound\n  ${ports.map((port) => `(remote ip "localhost:${port}")`).join("\n  ")})`,
          `(allow network* (local unix-socket (subpath ${quoted(paths.renderTmp)})))`,
          `(allow network-outbound (remote unix-socket (subpath ${quoted(paths.renderTmp)})))`,
        ]
      : []),
    "(allow ipc-posix-shm*) (allow ipc-posix-sem)",
    "(allow signal (target same-sandbox))",
    "(allow user-preference-read) (allow system-fsctl)",
    "",
  ].join("\n");
}

export interface RevideokcEnvInput {
  tools: RevideokcToolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
  /** The job's base port; only the render profile's environment names it. */
  base?: number;
}

/**
 * A step's environment, built from nothing as manimkc's is (`sandboxEnv`):
 * never the runner's own with things taken out.
 *
 * Narration is gnosia-audio's own environment, with no manimkc checkout
 * named (revideokc passes `--manimkc-root` only for a checkout that exists,
 * and the job has none beside it): `MANIMKC_HOME` makes the clip cache the
 * job's `render/cache/audio`, and the backend, voice and kokoro interpreter
 * are named outright, which gives the same clip keys a manimkc job's narration
 * computes, so the shared cache and a parent's clips seed a revideokc job too.
 */
export function revideokcEnv(kind: ProfileKind, { tools, paths, home, voice, base }: RevideokcEnvInput): Record<string, string> {
  const own = tools.revideokc;
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
    REVIDEOKC_HOME: paths.render,
    REVIDEOKC_ROOT: paths.checkout,
    DISABLE_TELEMETRY: "true",
  });
  if (kind === "render") {
    if (base === undefined) throw new ProfileError("a render's environment needs the job's port");
    Object.assign(env, {
      // Chrome ignores TMPDIR for its singleton socket on macOS.
      MAC_CHROMIUM_TMPDIR: paths.renderTmp,
      REVIDEOKC_CHROME: own.chrome?.binary ?? "",
      REVIDEOKC_CHROME_ARGS: "--no-sandbox",
      REVIDEOKC_VITE_PORT: String(base),
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
