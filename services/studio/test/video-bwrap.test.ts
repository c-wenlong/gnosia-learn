import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bwrapArgv, bwrapProfileArgv, bwrapProfileText, prepareBwrap, type BwrapSpec } from "../src/video/bwrap";
import { rebasePaths } from "../src/video/checkout";
import { videoPaths, type VideoPaths } from "../src/video/paths";
import { buildProfile, file, ProfileError, sandboxed, tree } from "../src/video/sandbox";
import { which, type Toolchain } from "../src/video/toolchain";

/**
 * The Linux sandbox's own text: the argv a `.bwrap.json` carries, the skeleton
 * rootfs the mounts land on, and `sandboxed` reading the file back. The
 * emission tests run anywhere — they produce text — and one confinement check
 * runs `bwrap` for real where unprivileged namespaces answer (Ubuntu's
 * AppArmor restriction skips it on hosts that have no `bwrap` profile).
 */

let root: string;
let paths: VideoPaths;

beforeEach(async () => {
  root = realpathSync(await mkdtemp(path.join(tmpdir(), "studio-video-bwrap-")));
  paths = rebasePaths(videoPaths("0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", "two-boxes"), path.join(root, "job"));
  await mkdir(paths.job, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A toolchain whose sandbox is bwrap: the fixture `buildProfile` branches on. */
function bwrapTools(): Toolchain {
  return {
    platform: "linux",
    sandboxKind: "bwrap",
    sandboxExec: "/usr/bin/bwrap",
    libs: [],
    manimkcRoot: "/opt/manimkc",
    manimkcDirs: { manim: "/opt/manimkc/manim", venv: "/opt/manimkc/.venv", venvTts: "/opt/manimkc/.venv-tts", tools: "/opt/manimkc/tools" },
    ffmpeg: { link: "/usr/bin/ffmpeg", real: "/usr/bin/ffmpeg", home: null },
    ffprobe: { link: "/usr/bin/ffprobe", real: "/usr/bin/ffprobe", home: null },
    python3: { link: "/usr/bin/python3", real: "/usr/bin/python3", home: null },
    venvPython: { link: "/opt/manimkc/.venv/bin/python", real: "/opt/manimkc/.venv/bin/python3.12", home: null },
    ttsPython: null,
    node: "/usr/bin/node",
    hfHubCache: "/home/me/.cache/huggingface/hub",
    kokoroModel: null,
    voicesInstalled: [],
    sharedAudioCache: null,
    narration: null,
  };
}

/** `argv` as [flag, ...operands] pairs the assertions can step through. */
function pairs(argv: string[]): { flag: string; operands: string[] }[] {
  const out: { flag: string; operands: string[] }[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]!;
    if (flag === "--") {
      out.push({ flag, operands: [] });
      break;
    }
    const operands: string[] = [];
    while (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) operands.push(argv[++i]!);
    out.push({ flag, operands });
  }
  return out;
}

async function fixtureSpec(): Promise<BwrapSpec> {
  const inside = path.join(root, "bound");
  const deniedDir = path.join(inside, "secret");
  const deniedFile = path.join(inside, "secret.txt");
  await mkdir(deniedDir, { recursive: true });
  await writeFile(deniedFile, "x", "utf8");
  const renderDir = path.join(root, "render");
  const poster = path.join(root, "candidate", "poster.jpg");
  return {
    kind: "render",
    exec: [file(path.join(root, "tools", "prog"))],
    reads: [tree(inside)],
    writes: [tree(renderDir), file(poster)],
    deniedReads: [deniedDir, deniedFile, path.join(root, "never-bound")],
    libs: [path.join(root, "nix-root")],
    rootfs: paths.sandboxRoot,
    empty: paths.sandboxEmpty,
    emptyFile: paths.sandboxEmptyFile,
    ports: [47012, 47013],
  };
}

describe("the bwrap profile", () => {
  it("writes the whole argv as readable JSON: version, kind, the pair when render, and a trailing --", async () => {
    const spec = await fixtureSpec();
    const text = bwrapProfileText(spec);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text) as { version: number; kind: string; argv: string[]; ports: number[] };
    expect(parsed.version).toBe(1);
    expect(parsed.kind).toBe("render");
    expect(parsed.ports).toEqual([47012, 47013]);
    expect(parsed.argv.at(-1)).toBe("--");
    // Deterministic: the same spec writes the same file.
    expect(bwrapProfileText(spec)).toBe(text);
    // And the runner can read it back.
    expect(bwrapProfileArgv(text)).toEqual(parsed.argv);
  });

  it("opens with the namespaces, the skeleton at /, proc and dev, then mounts reads ro and writes rw", async () => {
    const spec = await fixtureSpec();
    const argv = bwrapArgv(spec);
    expect(argv.slice(0, 4)).toEqual(["--unshare-all", "--unshare-net", "--die-with-parent", "--new-session"]);
    expect(argv.slice(4, 13)).toEqual(["--ro-bind", paths.sandboxRoot, "/", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/dev/shm"]);
    const flags = pairs(argv);
    const ro = flags.filter((flag) => flag.flag === "--ro-bind-try").map((flag) => flag.operands);
    const rw = flags.filter((flag) => flag.flag === "--bind-try").map((flag) => flag.operands);
    // The standard library dirs always land, and the measured foreign root too.
    expect(ro).toContainEqual(["/usr/lib", "/usr/lib"]);
    expect(ro).toContainEqual([path.join(root, "nix-root"), path.join(root, "nix-root")]);
    // The exec'd program and the read tree are mounts, both read-only.
    expect(ro).toContainEqual([path.join(root, "tools", "prog"), path.join(root, "tools", "prog")]);
    expect(ro).toContainEqual([path.join(root, "bound"), path.join(root, "bound")]);
    // A subpath write goes rw; a literal write names its parent, not the file.
    expect(rw).toContainEqual([path.join(root, "render"), path.join(root, "render")]);
    expect(rw).toContainEqual([path.join(root, "candidate"), path.join(root, "candidate")]);
    expect(rw.some((pair) => pair[0]?.endsWith("poster.jpg"))).toBe(false);
    // A writable parent of a read is never bound twice or shadowed by it.
    expect(ro.filter((pair) => pair[0] === path.join(root, "render")).length).toBe(0);
  });

  it("mounts an empty shadow over a denied place under a bound parent, and names nothing that nothing covers", async () => {
    const spec = await fixtureSpec();
    const argv = bwrapArgv(spec);
    const flags = pairs(argv).filter((flag) => flag.flag === "--ro-bind");
    expect(flags).toContainEqual({ flag: "--ro-bind", operands: [paths.sandboxEmpty, path.join(root, "bound", "secret")] });
    expect(flags).toContainEqual({ flag: "--ro-bind", operands: [paths.sandboxEmptyFile, path.join(root, "bound", "secret.txt")] });
    expect(flags.every((flag) => flag.operands[1] !== path.join(root, "never-bound"))).toBe(true);
  });

  it("binds the GPU's devices for a render and never for narration or the gate", async () => {
    const spec = await fixtureSpec();
    expect(pairs(bwrapArgv({ ...spec, gpu: true })).some((flag) => flag.flag === "--dev-bind-try" && flag.operands[0] === "/dev/dri")).toBe(true);
    expect(pairs(bwrapArgv({ ...spec, gpu: false })).some((flag) => flag.flag.startsWith("--dev-bind"))).toBe(false);
  });

  it("refuses a file that is not one of its profiles", () => {
    expect(() => bwrapProfileArgv('{"argv": []}')).toThrow(/not a profile/);
    expect(() => bwrapProfileArgv("(version 1)\n(deny default)")).toThrow();
    expect(() => bwrapProfileArgv('{"version": 1, "argv": [1]}')).toThrow(/not a profile/);
  });

  it("buildProfile hands it the rule lists: JSON out, no Seatbelt text", () => {
    const text = buildProfile("render", { tools: bwrapTools(), paths, home: path.join(root, "me") });
    const parsed = JSON.parse(text) as { kind: string; argv: string[] };
    expect(parsed.kind).toBe("render");
    expect(parsed.argv).toContain("--unshare-all");
    // The render's mounts name the job and the toolchain; no Homebrew line.
    expect(parsed.argv).toContainEqual(paths.checkout);
    expect(text).not.toContain("deny default");
    const narrate = JSON.parse(buildProfile("narrate", { tools: bwrapTools(), paths, home: path.join(root, "me") })) as { argv: string[] };
    expect(narrate.argv.some((arg) => arg === "/dev/dri")).toBe(false);
  });

  it("sandboxed runs the file's argv under bwrap, and fails a Seatbelt file rather than misreading it", async () => {
    const spec = await fixtureSpec();
    const tools = bwrapTools();
    await writeFile(paths.renderProfile, bwrapProfileText(spec), "utf8");
    expect(sandboxed(tools, paths.renderProfile, ["/usr/bin/env"])).toEqual([tools.sandboxExec, ...bwrapArgv(spec), "/usr/bin/env"]);
    await writeFile(paths.gateProfile, "(version 1)\n(deny default)\n", "utf8");
    expect(() => sandboxed(tools, paths.gateProfile, ["/usr/bin/true"])).toThrow(ProfileError);
    expect(() => sandboxed(tools, path.join(root, "missing.bwrap.json"), [])).toThrow(ProfileError);
    // And seatbelt tooling still takes `-f`, whatever the file is.
    expect(sandboxed({ ...tools, sandboxKind: "seatbelt", sandboxExec: "/usr/bin/sandbox-exec" }, paths.gateProfile, ["x"])).toEqual(["/usr/bin/sandbox-exec", "-f", paths.gateProfile, "x"]);
  });
});

describe("the skeleton rootfs", () => {
  it("writes a stub at every mount destination, file stubs where the source is a file, and the empty shadows", async () => {
    const spec = await fixtureSpec();
    const prog = path.join(root, "tools", "prog");
    await mkdir(path.dirname(prog), { recursive: true });
    await writeFile(prog, "binary", "utf8");
    const texts = [bwrapProfileText(spec), bwrapProfileText({ ...spec, kind: "gate" })];
    await prepareBwrap(paths, texts);
    const at = (dest: string) => path.join(paths.sandboxRoot, dest);
    // Every destination the argv names exists under the skeleton.
    for (const dest of ["/proc", "/dev", "/dev/shm", "/usr/lib", path.join(root, "bound"), path.join(root, "render"), path.join(root, "bound", "secret")]) {
      expect(existsSync(at(dest)), dest).toBe(true);
    }
    // A file's destination is a file: a directory would make the bind fail.
    expect(statSync(at(prog)).isFile()).toBe(true);
    expect(statSync(at(deniedFileFor(spec))).isFile()).toBe(true);
    // The write mounts' sources were created too, since a bind refuses a gap.
    expect(statSync(path.join(root, "render")).isDirectory()).toBe(true);
    expect(statSync(path.join(root, "candidate")).isDirectory()).toBe(true);
    expect(statSync(paths.sandboxEmpty).isDirectory()).toBe(true);
    expect(existsSync(paths.sandboxEmptyFile)).toBe(true);
    // Owner-writable, or a job's cleanup could not remove it: the profile
    // mounts it read-only whatever the host mode says.
    expect((await stat(paths.sandboxRoot)).mode & 0o222).not.toBe(0);
    expect((await stat(paths.sandboxEmpty)).mode & 0o777).toBe(0o555);
  });

  it("rebuilds clean: a stale stub does not survive a second prepare", async () => {
    const spec = await fixtureSpec();
    await prepareBwrap(paths, [bwrapProfileText(spec)]);
    const stale = path.join(paths.sandboxRoot, "stale-dir");
    await mkdir(stale, { recursive: true });
    await prepareBwrap(paths, [bwrapProfileText(spec)]);
    expect(existsSync(stale)).toBe(false);
  });
});

function deniedFileFor(spec: BwrapSpec): string {
  const deniedFile = spec.deniedReads.find((denied) => denied.endsWith(".txt"));
  if (deniedFile === undefined) throw new Error("the fixture names a denied file");
  return deniedFile;
}

/** Whether this box lets an unprivileged process make a user namespace: AppArmor's restriction says no without a bwrap profile. */
function bwrapWorks(bwrap: string): boolean {
  const probe = spawnSync(bwrap, ["--unshare-all", "--ro-bind", "/", "/", "--", "/usr/bin/true"], { timeout: 15_000 });
  return probe.status === 0;
}

describe("a real bwrap run", () => {
  const bwrap = which("bwrap") ?? (existsSync("/usr/bin/bwrap") ? "/usr/bin/bwrap" : null);

  it("runs a bound program, and finds nothing else", async (context) => {
    if (bwrap === null) return context.skip("no bwrap on this box");
    if (!bwrapWorks(bwrap)) return context.skip("unprivileged namespaces are refused here (Ubuntu's AppArmor restriction)");
    const spec = { ...(await fixtureSpec()), exec: [file("/bin/sh")], gpu: false };
    const text = bwrapProfileText(spec);
    await writeFile(paths.renderProfile, text, "utf8");
    await prepareBwrap(paths, [text]);
    const tools = { ...bwrapTools(), sandboxExec: bwrap };
    const run = (argv: string[]) => spawnSync(argv[0]!, argv.slice(1), { timeout: 15_000, encoding: "utf8" });
    const inside = run(sandboxed(tools, paths.renderProfile, ["/bin/sh", "-c", "echo inside; test -e /etc/shadow && echo saw-shadow || echo no-shadow"]));
    expect(inside.status, inside.stderr).toBe(0);
    expect(inside.stdout).toContain("inside");
    expect(inside.stdout).toContain("no-shadow");
    // A program the profile never named is absent: exec answers ENOENT.
    const denied = run(sandboxed(tools, paths.renderProfile, ["/usr/bin/env"]));
    expect(denied.status).not.toBe(0);
  }, 30_000);
});
