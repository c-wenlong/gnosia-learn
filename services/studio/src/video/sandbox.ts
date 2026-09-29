import { realpathSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import path from "node:path";

import { studioHome } from "../paths";

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
 * outside the sandbox. `mach-lookup` was a deny list in the first version and
 * a background `NSURLSession` walked through it (a daemon fetched the URL on
 * the scene's behalf); it is an allowlist now, `ALLOWED_SERVICES` below.
 *
 * **A known gap, measured 2026-09-29: another process's arguments and
 * environment.** A scene can call the sysctl KERN_PROCARGS2 through ctypes
 * and read the argv and environment of any process running as this user,
 * other Claude Code sessions included (their OAuth token among the variable
 * names). No Seatbelt rule found blocks it: `sysctl-name` filters, a strict
 * `sysctl-read` allowlist and `process-info*` denies all leave it readable,
 * and denying every sysctl stops Python starting. With no network, no other
 * program and no Mach service that talks to one (the allowlist below; the
 * suite sends a background `NSURLSession` to a loopback server and requires
 * it never arrives), what it reads can reach only the video, the render logs
 * and the agent's context, the same class the read deny list is in, but it is
 * a live credential, so it is named here, in the design's "What is not
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
 * The Mach services each profile may look up, and nothing else: an
 * allowlist, taken from a traced run (2026-09-29) of every step a job takes
 * (`api`, `lint`, `narrate`, `preview`, `build`, the scan, the clip keys, the
 * gate's lint, probe and poster) under `(allow mach-lookup (with report))`,
 * then cut to what those steps cannot do without.
 *
 * Denied by `(deny default)`, and measured to cost nothing but a log line:
 * `nsurlsessiond` (a background `NSURLSession` hands the request to that
 * daemon, which fetches it outside the sandbox: a scene reached a loopback
 * server through it while `mach-lookup` was a deny list), `cfprefsd`
 * (preferences it writes on the caller's behalf), `coreservicesd`,
 * LaunchServices, distributed notifications, `notification_center`,
 * `configd`, `analyticsd`, `diskarbitrationd`, `dirhelper`, `logd`,
 * opendirectoryd, DNS, the clipboard and the keychain.
 *
 * The one allowed name is Metal's shader compiler, which ManimGL's renderer
 * needs; kokoro and the two media programs need none. A macOS release that
 * adds a service Metal needs shows as the doctor's fixture failing to render,
 * which answers 503 rather than rendering with more open.
 */
const ALLOWED_SERVICES: Record<ProfileKind, readonly string[]> = {
  render: ["com.apple.MTLCompilerService"],
  narrate: [],
  gate: [],
};

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
  /**
   * `$STUDIO_HOME`, resolved: denied for reads before this job's own
   * directories are re-allowed, so a studio home outside the owner's home
   * (and outside every other denied place) still hides every other job.
   */
  studioHome?: string;
}

/** A path rule before it is written out: a whole tree, or one file. */
interface Rule {
  kind: "subpath" | "literal";
  path: string;
}

const tree = (value: string): Rule => ({ kind: "subpath", path: value });
const file = (value: string): Rule => ({ kind: "literal", path: value });
const written = (rule: Rule): string => (rule.kind === "subpath" ? subpath(rule.path) : literal(rule.path));

/** The programs each profile may start. */
function execRules(kind: ProfileKind, { tools }: ProfileInput): Rule[] {
  const program = (entry: Toolchain["ffmpeg"]): Rule[] =>
    entry === null ? [] : [file(entry.link), file(entry.real), ...(entry.home === null ? [] : [tree(entry.home)])];
  const media = [tools.ffmpeg, tools.ffprobe].flatMap(program);
  if (kind === "gate") return media;
  const pythons = [tools.venvPython, tools.ttsPython, ...(kind === "render" ? [tools.python3] : [])].flatMap(program);
  const dirs = tools.manimkcDirs;
  const manimkc = [tree(dirs.venv), tree(dirs.venvTts), ...(kind === "render" ? [tree(dirs.tools)] : [])];
  const system = (kind === "render" ? SYSTEM_PROGRAMS : ["/bin/sh", "/usr/bin/uname"]).map(file);
  return [...pythons, ...media, ...manimkc, ...system];
}

/** What each profile may read, over and above the system outside the denied places. */
function readRules(kind: ProfileKind, { tools, paths }: ProfileInput): Rule[] {
  if (kind === "gate") return [tree(paths.candidate)];
  const manimkc = [tools.manimkcDirs.manim, tools.manimkcDirs.venv, tools.manimkcDirs.venvTts, tools.manimkcDirs.tools].map(tree);
  const job = [tree(paths.checkout), tree(paths.render)];
  const model = kind === "narrate" && tools.kokoroModel !== null ? [tree(tools.kokoroModel)] : [];
  return [...manimkc, ...job, ...model];
}

function writeRules(kind: ProfileKind, { paths }: ProfileInput): Rule[] {
  if (kind === "gate") return [file(paths.poster)];
  if (kind === "narrate") return [paths.audio, paths.renderTmp, paths.mpl, paths.manimCache].map(tree);
  return [tree(paths.render)];
}

/** Each rule written once, in first-seen order. */
function unique(rules: Rule[]): string[] {
  return [...new Set(rules.map(written))];
}

/**
 * Every directory above an allowed path that sits inside a denied place, as
 * a literal: the metadata a process needs to resolve its way down to what it
 * may read (`realpath` of the venv's interpreter `lstat`s each component,
 * dyld does the same for a framework), and nothing beside it. So a scene can
 * `stat` `~/Desktop` on the way to the venv, and cannot `stat` `~/.ssh/id_ed25519`
 * to learn whether it exists, how big it is or when it last changed.
 */
function ancestorRules(allowed: Rule[], denied: readonly string[]): string[] {
  const out = new Set<string>();
  for (const rule of allowed) {
    for (let dir = path.dirname(rule.path); ; dir = path.dirname(dir)) {
      if (denied.some((root) => dir === root || dir.startsWith(`${root}/`))) out.add(literal(dir));
      if (dir === path.dirname(dir)) break;
    }
  }
  return [...out];
}

/** `$STUDIO_HOME` as Seatbelt will see it: resolved when it exists, absolute either way. */
export function resolvedStudioHome(): string {
  const home = studioHome();
  try {
    return realpathSync(home);
  } catch {
    return path.resolve(home);
  }
}

/** One profile's text. Deterministic, so a test can read it and a person can diff two jobs'. */
export function buildProfile(kind: ProfileKind, input: ProfileInput): string {
  // The jobs root and the studio home go in by name even when the owner's
  // home already covers them: a `STUDIO_HOME` set outside it would otherwise
  // leave every other job's workspace readable.
  const jobsRoot = path.dirname(input.paths.job);
  const deniedReads = [
    ...new Set([
      input.home,
      "/opt/homebrew/var",
      "/usr/local/var",
      "/Volumes",
      "/private/tmp",
      "/private/var/folders",
      "/private/var/tmp",
      ...(input.studioHome === undefined ? [] : [input.studioHome]),
      jobsRoot,
    ]),
  ];
  const exec = execRules(kind, input);
  const reads = readRules(kind, input);
  const writes = writeRules(kind, input);
  const services = ALLOWED_SERVICES[kind];
  const ancestors = ancestorRules([...exec, ...reads, ...writes], deniedReads);
  return [
    `; The ${kind} profile for one studio video job. Written by the runner; see services/studio/src/video/sandbox.ts.`,
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec\n  ${unique(exec).join("\n  ")})`,
    "(allow file-read*)",
    `(deny file-read*\n  ${deniedReads.map(subpath).join("\n  ")})`,
    `(allow file-read*\n  ${unique(reads).join("\n  ")})`,
    // Only when there is something to name: an `(allow file-read-metadata)`
    // with no filter would allow it everywhere.
    ...(ancestors.length === 0 ? [] : [`(allow file-read-metadata\n  ${ancestors.join("\n  ")})`]),
    `(allow file-write*\n  ${[...unique(writes), literal("/dev/null"), literal("/dev/dtracehelper")].join("\n  ")})`,
    "(deny file-write-create (vnode-type SYMLINK))",
    "(allow file-ioctl) (allow sysctl-read) (allow process-info* (target self))",
    "(allow iokit-open) (allow iokit-get-properties)",
    ...(services.length === 0 ? [] : [`(allow mach-lookup\n  ${services.map((name) => `(global-name "${name}")`).join("\n  ")})`]),
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
