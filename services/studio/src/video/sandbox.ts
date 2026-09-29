import { cpus, totalmem } from "node:os";
import path from "node:path";

import type { Toolchain } from "./toolchain";
import type { VideoPaths } from "./paths";

/**
 * The second boundary (D44 of docs/STUDIO-VIDEOS.md): the OS sandbox every
 * process that runs agent-written code, or parses a file agent code wrote,
 * runs inside.
 *
 * The permission file governs the agent's tools and nothing its code does
 * once it runs. `manimkc preview` imports the scene file the agent wrote, so a
 * line of that file that opens `~/.ssh` or a socket passed every rule in the
 * settings file, because the tool call that ran it was the allowed wrapper.
 * These profiles are what makes "nothing outside the job" a boundary rather
 * than a sentence in a prompt.
 *
 * Three profiles, one base, as measured on 2026-09-29 (the design doc has the
 * probe table):
 *
 * - **render**: `manimkc api`, `lint`, `preview`, `build`. Writes only
 *   `render/`, reads manimkc's code and venvs and this job.
 * - **narrate**: `lib/narration.py` over the scene file's `voiceover`
 *   literals, the one step that loads kokoro. Reads widened to the model's
 *   directory in the Hugging Face cache; writes narrowed to the job's audio
 *   cache and the three caches the import of manimlib opens (its temporary
 *   directory, matplotlib's and ManimGL's own, measured: without the last the
 *   import dies in diskcache).
 * - **gate**: the runner's own `ffprobe` and poster cut on the gate's copies.
 *   Runs only `ffmpeg` and `ffprobe`, reads only `candidate/` of this job, and
 *   writes exactly one file, `candidate/poster.jpg`. The render profile could
 *   not be reused: it cannot read `candidate/`, and cutting the poster in
 *   `render/` would hand ffmpeg a file a lingering process can still rewrite.
 *
 * Every rule denies by default. An `(allow default)` profile with denies was
 * tried first and measured to leave the clipboard, the keychain, launchd and
 * LaunchServices reachable, the last two being a way to start a process
 * outside the sandbox. `mach-lookup` is the one place a deny list remains,
 * because Metal and the font system need services nobody has listed; that is
 * named in the design's "What is not covered".
 *
 * **A known gap, measured 2026-09-29: another process's arguments and
 * environment.** A scene can call the sysctl KERN_PROCARGS2 through ctypes
 * and read the argv and environment of any process running as this user,
 * other Claude Code sessions included (their OAuth token among the variable
 * names). No Seatbelt rule found blocks it: `sysctl-name` filters, a strict
 * `sysctl-read` allowlist and `process-info*` denies all leave it readable,
 * and denying every sysctl stops Python starting. With no network and no
 * other program, what it reads can reach only the video, the render logs and
 * the agent's context, the same class the read deny list is in, but it is a
 * live credential, so it is named here, in the design's "What is not
 * covered", and in the suite, which runs the probe and reports it.
 *
 * Seatbelt matches real paths, so every path written into a profile is
 * resolved first (`/private/tmp`, not `/tmp`) by the caller, and a path
 * holding a character that would end the profile's string literal is refused
 * rather than escaped.
 */

export type ProfileKind = "render" | "narrate" | "gate";

/**
 * The small system programs manimkc's shell tools call (`assemble.sh`,
 * `faststart.sh`, the CLI's own subprocesses), measured by running a whole
 * preview and build under the profile. Anything else is refused at exec,
 * which is what stops a scene starting `launchctl`, `open` or `curl`.
 */
const SYSTEM_PROGRAMS = [
  "/bin/bash",
  "/bin/sh",
  "/usr/bin/env",
  "/usr/bin/mktemp",
  "/usr/bin/dirname",
  "/usr/bin/sed",
  "/usr/bin/wc",
  "/usr/bin/tail",
  "/usr/bin/head",
  "/usr/bin/grep",
  "/usr/bin/uname",
  "/bin/rm",
  "/bin/mkdir",
  "/usr/bin/python3",
  "/usr/bin/xcrun",
];

/**
 * Mach services a scene must not reach even though `mach-lookup` is otherwise
 * open: DNS (a lookup is a channel out even with every socket refused), the
 * clipboard, the keychain and LaunchServices, which can start a process
 * outside the sandbox.
 */
const DENIED_SERVICES = [
  "com.apple.dnssd.service",
  "com.apple.pasteboard.1",
  "com.apple.SecurityServer",
  "com.apple.securityd.xpc",
  "com.apple.security.agent",
  "com.apple.coreservices.launchservicesd",
  "com.apple.lsd.mapdb",
  "com.apple.lsd.modifydb",
];

export class ProfileError extends Error {}

/** A path as a Seatbelt string literal. Refused, never escaped, when it holds a quote, a backslash or a line break. */
function quoted(value: string): string {
  if (!path.isAbsolute(value) || /["\\\n\r\u0000]/.test(value)) {
    throw new ProfileError(`${JSON.stringify(value)} cannot go in a sandbox profile: it must be absolute and hold no quote, backslash or line break`);
  }
  return `"${value}"`;
}

const subpath = (value: string): string => `(subpath ${quoted(value)})`;
const literal = (value: string): string => `(literal ${quoted(value)})`;

export interface ProfileInput {
  tools: Toolchain;
  paths: VideoPaths;
  /** The owner's home directory, resolved: denied for reads except where re-allowed. */
  home: string;
}

/** The programs each profile may start. */
function execRules(kind: ProfileKind, { tools }: ProfileInput): string[] {
  const media = [tools.ffmpeg, tools.ffprobe].flatMap((program) =>
    program === null ? [] : [literal(program.link), literal(program.real), ...(program.home === null ? [] : [subpath(program.home)])],
  );
  if (kind === "gate") return media;
  const pythons = [tools.venvPython, tools.ttsPython, ...(kind === "render" ? [tools.python3] : [])].flatMap((program) =>
    program === null ? [] : [literal(program.link), literal(program.real), ...(program.home === null ? [] : [subpath(program.home)])],
  );
  const manimkc = [
    subpath(path.join(tools.manimkcRoot, ".venv")),
    subpath(path.join(tools.manimkcRoot, ".venv-tts")),
    ...(kind === "render" ? [subpath(path.join(tools.manimkcRoot, "tools"))] : []),
  ];
  const system = kind === "render" ? SYSTEM_PROGRAMS.map(literal) : ["/bin/sh", "/usr/bin/uname"].map(literal);
  return [...new Set([...pythons, ...media, ...manimkc, ...system])];
}

/** What each profile may read, over and above the system outside the denied places. */
function readRules(kind: ProfileKind, { tools, paths }: ProfileInput): string[] {
  if (kind === "gate") return [subpath(paths.candidate)];
  const manimkc = ["manim", ".venv", ".venv-tts", "tools"].map((name) => subpath(path.join(tools.manimkcRoot, name)));
  const job = [subpath(paths.checkout), subpath(paths.render)];
  const model = kind === "narrate" && tools.kokoroModel !== null ? [subpath(tools.kokoroModel)] : [];
  return [...manimkc, ...job, ...model];
}

function writeRules(kind: ProfileKind, { paths }: ProfileInput): string[] {
  if (kind === "gate") return [literal(paths.poster)];
  if (kind === "narrate") return [paths.audio, paths.renderTmp, paths.mpl, paths.manimCache].map(subpath);
  return [subpath(paths.render)];
}

/** One profile's text. Deterministic, so a test can read it and a person can diff two jobs'. */
export function buildProfile(kind: ProfileKind, input: ProfileInput): string {
  const deniedReads = [input.home, "/opt/homebrew/var", "/usr/local/var", "/Volumes", "/private/tmp", "/private/var/folders", "/private/var/tmp"];
  return [
    `; The ${kind} profile for one studio video job. Written by the runner; see services/studio/src/video/sandbox.ts.`,
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec\n  ${execRules(kind, input).join("\n  ")})`,
    "(allow file-read*)",
    `(deny file-read*\n  ${deniedReads.map(subpath).join("\n  ")})`,
    `(allow file-read*\n  ${readRules(kind, input).join("\n  ")})`,
    "(allow file-read-metadata)",
    `(allow file-write*\n  ${[...writeRules(kind, input), literal("/dev/null"), literal("/dev/dtracehelper")].join("\n  ")})`,
    "(deny file-write-create (vnode-type SYMLINK))",
    "(allow file-ioctl) (allow sysctl-read) (allow process-info* (target self))",
    "(allow iokit-open) (allow iokit-get-properties)",
    "(allow mach-lookup)",
    `(deny mach-lookup\n  ${DENIED_SERVICES.map((name) => `(global-name "${name}")`).join("\n  ")})`,
    "(allow ipc-posix-shm*) (allow ipc-posix-sem)",
    "(allow signal (target same-sandbox))",
    "(allow user-preference-read) (allow system-fsctl)",
    "",
  ].join("\n");
}

/**
 * How many scenes render at once inside one job: `min(cores / 3, (RAM - 2 GB)
 * / 1.5 GB, 4)`, from manimkc's measured 930 MB and three cores per 1080p
 * scene. Four on the owner's M4 Pro.
 */
export function renderJobs(cores: number = cpus().length, memoryBytes: number = totalmem()): number {
  const byCores = Math.floor(cores / 3);
  const byMemory = Math.floor((memoryBytes / 2 ** 30 - 2) / 1.5);
  return Math.max(1, Math.min(byCores, byMemory, 4));
}

export interface EnvInput {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
}

/**
 * A child's environment, built from nothing (the allowlist in "The sandbox").
 *
 * Never a copy of the caller's with things removed: the runner's own
 * environment carries a session token when it was started from a Claude
 * session (measured), and a scene that printed its environment would put it
 * in the video. Nothing here names a key.
 */
export function sandboxEnv(kind: ProfileKind, { tools, paths, home, voice }: EnvInput): Record<string, string> {
  const binDir = tools.ffmpeg === null ? null : path.dirname(tools.ffmpeg.link);
  const env: Record<string, string> = {
    PATH: [binDir, "/usr/bin", "/bin"].filter((dir): dir is string => dir !== null).join(":"),
    HOME: home,
    LANG: "en_US.UTF-8",
    TMPDIR: paths.renderTmp,
  };
  if (kind === "gate") return env;
  Object.assign(env, {
    MPLCONFIGDIR: paths.mpl,
    MANIMKC_HOME: paths.render,
    MANIMKC_ROOT: paths.checkout,
    MANIMKC_RENDER_JOBS: String(renderJobs()),
    NARRATION_BACKEND: "kokoro",
    NARRATION_KOKORO_VOICE: voice,
  });
  if (kind === "narrate") {
    Object.assign(env, {
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      // In the job, so the library never reads `~/.cache/huggingface/token`
      // on load, which it does when HF_HOME is the default (measured: the
      // sandbox refused the read and the step failed until this moved).
      HF_HOME: path.join(paths.renderTmp, "hf"),
      HF_HUB_CACHE: tools.hfHubCache,
    });
  }
  return env;
}

/** The argv that runs `argv` inside a profile file. */
export function sandboxed(tools: Toolchain, profileFile: string, argv: string[]): string[] {
  if (tools.sandboxExec === null) throw new ProfileError("sandbox-exec is missing, and nothing here runs unsandboxed");
  return [tools.sandboxExec, "-f", profileFile, ...argv];
}
