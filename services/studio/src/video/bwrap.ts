import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import type { VideoPaths } from "./paths";
import type { ProfileKind, Rule } from "./sandbox";

/**
 * The Linux half of the second boundary (D44 of docs/STUDIO-VIDEOS.md, V4):
 * what a Seatbelt profile says on macOS, a bubblewrap namespace says here.
 * One `.bwrap.json` file per profile kind, written next to the job's other
 * records; its `argv` is the whole argument vector the wrapper and the runner
 * hand to `bwrap`, so a job's confinement is readable and diffable exactly as
 * a `.sb` file is on a Mac.
 *
 * The mapping:
 *
 * - **`(deny default)` → a skeleton rootfs mounted read-only at `/`.** bwrap
 *   works the other way around from Seatbelt: instead of allowing everything
 *   and denying a list, the namespace starts empty and every reachable path
 *   is a mount. `paths.sandboxRoot` is a directory of empty stubs — one per
 *   mount point — bound over `/`, so the parent's directories of an allowed
 *   path exist (Seatbelt's `file-read-metadata` ancestors) while nothing
 *   beside them does. The root is read-only, which is also the write deny:
 *   without it bwrap's private tmpfs accepts writes anywhere, an ephemeral
 *   RAM-fill a Seatbelt profile refuses outright.
 * - **`process-exec` + `file-read*` → `--ro-bind-try`; `file-write*` →
 *   `--bind-try`.** Mount namespaces have no exec filter: anything bound is
 *   executable. That is enough, because the boundary's job is keeping the
 *   scene off programs that could act outside it (curl, git, ssh): those are
 *   simply absent. A scene still runs arbitrary Python and Node by design.
 * - **The deny list → nothing to deny, except under a bound tree.** A path
 *   not bound does not exist inside. The one remaining case is a denied
 *   directory inside an allowed one: it gets `paths.sandboxEmpty`, an empty
 *   read-only directory, mounted over it.
 * - **The network rules → `--unshare-net` (inside `--unshare-all`).** The job
 *   gets its own net namespace; bwrap 0.9 brings `lo` up inside it, so the
 *   render profile's two loopback ports work while `1.1.1.1`, the host's
 *   loopback services and every unix socket outside the job's binds are all
 *   unreachable — which is stricter than the Seatbelt port list, since even
 *   the job's own ports are unreachable from the host.
 * - **`mach-lookup`, `iokit-*`, `sysctl-read`, `user-preference-read`,
 *   `file-ioctl` → nothing.** They are Darwin mechanisms; the closest Linux
 *   knobs (procfs, sysfs, ioctls) are covered by the pid namespace's own
 *   `/proc` and by what the mounts let in. `signal (target same-sandbox)` is
 *   the pid namespace: no host pid is visible to kill, which also closes the
 *   KERN_PROCARGS2 gap the macOS design documents — `/proc` shows only this
 *   sandbox's processes, so no other process's argv or environment is
 *   readable.
 * - **`deny file-link` and the symlink-create deny → inert.** A hard link
 *   across mounts fails with EXDEV, and one inside the job is a second name
 *   for a file the job already owns; a symlink points at a path, and the
 *   path it points at is absent.
 * - **`ipc-posix-shm*` → `--tmpfs /dev/shm`**, a fresh empty one (the ipc
 *   namespace means the host's is not there anyway). `/dev/dri` and any
 *   `/dev/nvidia*` are bound for the render profile so Vulkan finds a real
 *   adapter where there is one (lavapipe needs neither).
 *
 * Two things this cannot say that Seatbelt could: exec-by-path (covered
 * above) and per-port loopback rules (moot in a private netns). The port
 * pair is still recorded in the profile for the doc and the tests.
 */

export interface BwrapSpec {
  kind: ProfileKind;
  /** Programs and trees the profile may run: read-only binds, like Seatbelt's `process-exec` list plus its reads. */
  exec: Rule[];
  reads: Rule[];
  writes: Rule[];
  /** The paths Seatbelt would deny: each one under a bound parent gets the empty shadow mounted over it. */
  deniedReads: string[];
  /** Shared-library roots the bound binaries resolve against (ldd-derived; `/nix/store/*`, `/opt/*`): the platform binds below cover only the standard dirs. */
  libs: string[];
  /** The job's skeleton rootfs and empty shadows: a directory and a file, each bound read-only over a denied place a bound parent would otherwise expose. */
  rootfs: string;
  empty: string;
  emptyFile: string;
  /** The job's loopback pair, recorded only: a private netns needs no rules. */
  ports?: number[];
  /** Whether GPU devices go in: render profiles only. */
  gpu?: boolean;
}

/** The profile file's schema version. */
const BWRAP_VERSION = 1;

/** The system's library directories: ELF resolution (ld.so, libc and friends), bound unconditionally read-only. */
const PLATFORM_LIBS = ["/lib", "/lib64", "/lib32", "/usr/lib", "/usr/lib64", "/usr/local/lib"];
/**
 * `/usr/share` whole: fonts, zoneinfo, the Vulkan ICD manifests, mime and
 * terminfo — operating-system data with no secrets. The individual `/etc`
 * entries stay named, since `/etc` also holds shadow and friends.
 */
const PLATFORM_SHARE = ["/usr/share", "/usr/lib/locale"];
const PLATFORM_ETC_DIRS = ["/etc/fonts", "/etc/ssl", "/etc/vulkan", "/etc/X11", "/etc/udev", "/etc/ld.so.conf.d"];
const PLATFORM_ETC_FILES = [
  "/etc/ld.so.cache",
  "/etc/ld.so.conf",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/passwd",
  "/etc/group",
  "/etc/localtime",
  "/etc/machine-id",
  "/etc/os-release",
];

/** `/dev/nvidia*`, when the box has them: the nvidia Vulkan ICD's devices. */
function nvidiaNodes(): string[] {
  try {
    return readdirSync("/dev")
      .filter((name) => /^nvidia/.test(name))
      .sort()
      .map((name) => `/dev/${name}`);
  } catch {
    return [];
  }
}

/**
 * One profile's argv, everything between `bwrap` and the `--`: mounts first
 * so the skeleton's stubs exist before the real paths land on them, read-only
 * binds before read-write ones so a writable tree under a read-only parent
 * still mounts, deny shadows last so they land inside a bound parent that is
 * already there.
 */
export function bwrapArgv(spec: BwrapSpec): string[] {
  const argv: string[] = [
    "--unshare-all",
    "--unshare-net",
    "--die-with-parent",
    "--new-session",
    "--ro-bind",
    spec.rootfs,
    "/",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/dev/shm",
  ];
  if (spec.gpu === true) {
    argv.push("--dev-bind-try", "/dev/dri", "/dev/dri");
    for (const node of nvidiaNodes()) argv.push("--dev-bind-try", node, node);
  }
  const ro = (target: string) => argv.push("--ro-bind-try", target, target);
  for (const target of [...PLATFORM_LIBS, ...PLATFORM_SHARE, ...PLATFORM_ETC_DIRS, ...PLATFORM_ETC_FILES, ...spec.libs]) ro(target);
  // A literal write rule names a file; a namespace cannot mount a file that
  // does not exist yet, so what it binds is the file's parent. That is wider
  // than Seatbelt's one file, inside the same job's own directory.
  const writeDirs = spec.writes.map((rule) => (rule.kind === "literal" ? path.dirname(rule.path) : rule.path));
  const bound: string[] = [];
  for (const rule of [...spec.exec, ...spec.reads]) {
    if (writeDirs.includes(rule.path) || bound.includes(rule.path)) continue;
    bound.push(rule.path);
    ro(rule.path);
  }
  for (const dir of writeDirs) {
    if (bound.includes(dir)) continue;
    bound.push(dir);
    argv.push("--bind-try", dir, dir);
  }
  for (const denied of spec.deniedReads) {
    const covered = bound.some((allowed) => denied === allowed || denied.startsWith(`${allowed}/`));
    if (!covered || !existsSync(denied)) continue;
    argv.push("--ro-bind", existsSync(denied) && statSync(denied).isFile() ? spec.emptyFile : spec.empty, denied);
  }
  argv.push("--");
  return argv;
}

/** A profile's text: the argv and the pair it names, as readable JSON. */
export function bwrapProfileText(spec: BwrapSpec): string {
  return `${JSON.stringify({ version: BWRAP_VERSION, kind: spec.kind, argv: bwrapArgv(spec), ...(spec.ports === undefined ? {} : { ports: spec.ports }) }, null, 1)}\n`;
}

/** The argv a `.bwrap.json` carries. Throws when the file is not one of ours. */
export function bwrapProfileArgv(text: string): string[] {
  const parsed = JSON.parse(text) as { version?: unknown; argv?: unknown };
  if (parsed.version !== BWRAP_VERSION || !Array.isArray(parsed.argv) || !parsed.argv.every((arg) => typeof arg === "string")) {
    throw new Error("a .bwrap.json is not a profile this runner wrote");
  }
  return parsed.argv;
}

/**
 * The skeleton the three profiles mount at `/` — one stub per destination
 * any of them names, plus `/proc` and `/dev` — and the empty shadows. Bind
 * destinations under a read-only mount must already exist, so this is written
 * before the first sandboxed call; a second prepare rebuilds it clean.
 *
 * The shadows exist first: a stub's type is decided by its source, so an
 * empty shadow that did not exist yet would leave a directory stub where a
 * file mount lands. The root itself stays owner-writable — its stubs are
 * removed wholesale when a job is cleaned up, which a read-only directory
 * would refuse; inside the profile it is a read-only bind regardless.
 */
export async function prepareBwrap(paths: VideoPaths, texts: string[]): Promise<void> {
  await mkdir(paths.sandboxEmpty, { recursive: true });
  writeFileSync(paths.sandboxEmptyFile, "", { flag: "w" });
  await rm(paths.sandboxRoot, { recursive: true, force: true });
  await mkdir(paths.sandboxRoot, { recursive: true });
  for (const target of ["/proc", "/dev"]) mkdirSync(path.join(paths.sandboxRoot, target), { recursive: true });
  for (const text of texts) {
    const argv = bwrapProfileArgv(text);
    for (let i = 0; i < argv.length; i += 1) {
      const flag = argv[i]!;
      if (flag === "--") break;
      const takesPair = /^--(ro-)?bind(-try)?$|^--dev-bind(-try)?$|^--file$|^--bind-data$|^--ro-bind-data$/.test(flag);
      const takesTarget = /^--(tmpfs|proc|dev|dir|mqueue|symlink)$/.test(flag);
      const target = takesPair ? argv[i + 2] : takesTarget ? argv[i + 1] : undefined;
      if (target === undefined || target === "/" || !target.startsWith("/")) continue;
      const stub = path.join(paths.sandboxRoot, target);
      const source = takesPair ? argv[i + 1] : undefined;
      const isFile = source !== undefined && existsSync(source) && statSync(source).isFile();
      if (isFile) {
        mkdirSync(path.dirname(stub), { recursive: true });
        writeFileSync(stub, "", { flag: "a" });
      } else {
        mkdirSync(stub, { recursive: true });
      }
      if (takesPair) i += 2;
      else i += 1;
    }
  }
  // Write mounts also need their sources to exist: the job's own directories
  // are created here when a checkout step has not made one yet.
  for (const text of texts) {
    const argv = bwrapProfileArgv(text);
    for (let i = 0; i + 1 < argv.length; i += 1) {
      if ((argv[i] === "--bind-try" || argv[i] === "--bind") && argv[i + 1]!.startsWith("/")) {
        mkdirSync(argv[i + 1]!, { recursive: true });
      }
    }
  }
  await chmod(paths.sandboxEmpty, 0o555);
}
