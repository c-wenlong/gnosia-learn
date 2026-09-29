import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scratchJob, type DoctorRun } from "../src/video/doctor";
import { runSandboxed } from "../src/video/exec";
import { posterArgs } from "../src/video/gate";
import { WORKED_HEADER, WORKED_NARRATED, WORKED_TABLE } from "../src/video/manual";
import { discoverToolchain, toolchainProblems, type Toolchain } from "../src/video/toolchain";

/**
 * The sandbox, measured: both hostile scenes blocked on every probe; the
 * narration step under its own profile voicing a line of shell words, unable
 * to read the Hugging Face token or the shared cache, writing nothing outside
 * the job's audio (and import) caches; the gate's profile cutting the poster
 * and refusing any other write (Phase 1's test list).
 *
 * These run real processes under real Seatbelt profiles, so they need macOS
 * and a manimkc checkout with its venvs: `MANIMKC_ROOT` names one when the
 * worktree's submodule has none (the venvs live only in the main checkout).
 * Anywhere else they skip, with the reason in the suite's name.
 */

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let tools: Toolchain | null = null;
let skip = "";
try {
  if (process.platform !== "darwin") skip = "not macOS: the video sandbox is Seatbelt, and Linux is off (V4)";
} catch {
  /* unreachable */
}

let run: DoctorRun;
let root: string;
const home = realpathSync(process.env.HOME ?? "/");

beforeAll(async () => {
  if (skip !== "") return;
  tools = await discoverToolchain();
  const problems = toolchainProblems(tools);
  if (problems.length > 0) {
    skip = `no usable manimkc toolchain (${problems[0]}); set MANIMKC_ROOT to a checkout with its venvs`;
    return;
  }
  root = realpathSync(await (await import("node:fs/promises")).mkdtemp(path.join(tmpdir(), "studio-video-sandbox-")));
  run = await scratchJob(tools, path.join(root, "job"));
}, 120_000);

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

/** KERN_PROCARGS2: see the note in `src/video/sandbox.ts`. */
const KNOWN_GAP = "read another process's arguments";

interface Verdict {
  outcome: "allowed" | "denied" | "missing" | "other";
  detail: string;
}

/** A probe line in Python: the attempt, then a verdict by errno, so a missing target is never read as a blocked one. */
const PROBE_LIB = String.raw`
import errno, json, os, socket, subprocess, sys
out = {}
def attempt(name, fn):
    try:
        fn()
        out[name] = {"outcome": "allowed", "detail": ""}
    except FileNotFoundError as e:
        out[name] = {"outcome": "missing", "detail": str(e)}
    except PermissionError as e:
        out[name] = {"outcome": "denied", "detail": str(e)}
    except OSError as e:
        denied = e.errno in (errno.EPERM, errno.EACCES) or isinstance(e, socket.gaierror)
        out[name] = {"outcome": "denied" if denied else "other", "detail": f"{type(e).__name__}: {e}"}
    except Exception as e:
        out[name] = {"outcome": "other", "detail": f"{type(e).__name__}: {e}"}
`;

function hostileSceneFiles(targets: Record<string, string>): string {
  return `${WORKED_HEADER}
${PROBE_LIB}
T = json.loads(${JSON.stringify(JSON.stringify(targets))})
def read(p):
    with open(p, "rb") as f:
        f.read(1)
def write_new(p):
    with open(p, "x") as f:
        f.write("x")
    os.remove(p)
def hard_link():
    p = os.path.join(T["render"], "hard-%d" % os.getpid())
    os.link(T["outside_file"], p)
    os.remove(p)
def sym_link():
    p = os.path.join(T["render"], "sym-%d" % os.getpid())
    os.symlink(T["outside_file"], p)
    os.remove(p)
def procargs():
    import ctypes, ctypes.util
    libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
    mib = (ctypes.c_int * 3)(1, 49, os.getppid())
    size = ctypes.c_size_t(0)
    if libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0) != 0:
        raise OSError(ctypes.get_errno(), "sysctl size")
    buf = ctypes.create_string_buffer(size.value)
    if libc.sysctl(mib, 3, buf, ctypes.byref(size), None, 0) != 0:
        raise OSError(ctypes.get_errno(), "sysctl")
attempt("read ~/.claude.json", lambda: read(T["claude_json"]))
attempt("list ~/.ssh", lambda: os.listdir(T["ssh"]))
attempt("read the data root's .env", lambda: read(T["data_env"]))
attempt("read the repository's AGENTS.md", lambda: read(T["agents_md"]))
attempt("write in home", lambda: write_new(os.path.join(T["home"], "sandbox-probe-%d.txt" % os.getpid())))
attempt("write in the real topics/", lambda: write_new(os.path.join(T["topics"], "sandbox-probe-%d.txt" % os.getpid())))
attempt("hard link out of render", hard_link)
attempt("symbolic link out of render", sym_link)
attempt("list the claude temp root", lambda: os.listdir(T["claude_tmp"]))
attempt("list the per-user temp dir", lambda: os.listdir(T["var_folders"]))
attempt("list homebrew var", lambda: os.listdir(T["brew_var"]))
attempt("read another process's arguments", procargs)
attempt("signal the parent", lambda: os.kill(os.getppid(), 0))
print(json.dumps(out))
`;
}

function hostileSceneNetwork(): string {
  return `${WORKED_HEADER}
${PROBE_LIB}
attempt("tcp 1.1.1.1:443", lambda: socket.create_connection(("1.1.1.1", 443), timeout=3).close())
attempt("dns example.com", lambda: socket.getaddrinfo("example.com", 443))
attempt("tcp postgres 127.0.0.1:5432", lambda: socket.create_connection(("127.0.0.1", 5432), timeout=3).close())
attempt("tcp studio 127.0.0.1:7250", lambda: socket.create_connection(("127.0.0.1", 7250), timeout=3).close())
def unix_pg():
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(3)
    s.connect("/tmp/.s.PGSQL.5432")
attempt("postgres unix socket", unix_pg)
attempt("run curl", lambda: subprocess.run(["/usr/bin/curl", "--version"], capture_output=True, check=True))
attempt("run launchctl", lambda: subprocess.run(["/bin/launchctl", "version"], capture_output=True, check=True))
attempt("run open", lambda: subprocess.run(["/usr/bin/open", "-h"], capture_output=True, check=True))
leaked = [k for k in os.environ if any(w in k.upper() for w in ("KEY", "TOKEN", "SECRET", "PASSWORD"))]
out["secrets in the environment"] = {"outcome": "allowed" if leaked else "denied", "detail": ",".join(leaked)}
print(json.dumps(out))
`;
}

async function runScene(profile: "render" | "narrate", source: string, name: string): Promise<Record<string, Verdict>> {
  const file = path.join(run.paths.checkout, "topics", "studio", "probe", `${name}.py`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
  const result = await runSandboxed({
    tools: run.tools,
    paths: run.paths,
    home,
    voice: "af_heart",
    kind: profile,
    profile: profile === "render" ? run.paths.renderProfile : run.paths.narrateProfile,
    argv: [path.join(run.paths.checkout, ".venv", "bin", "python"), file],
    cwd: run.paths.checkout,
    // A parent full of secrets, which the environment allowlist must not pass on.
    timeoutMs: 120_000,
  });
  const line = result.stdout.trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(line) as Record<string, Verdict>;
  } catch {
    throw new Error(`the probe did not print its verdicts (exit ${result.code}): ${result.stderr.slice(-800)}`);
  }
}

describe("the video sandbox", () => {
  it("blocks every probe of the hostile scene that reaches for files", async (context) => {
    if (skip !== "") return context.skip(skip);
    const dataEnv = run.tools.sharedAudioCache === null ? path.join(home, ".env") : path.join(path.dirname(path.dirname(run.tools.sharedAudioCache)), ".env");
    const claudeTmp = realpathSync("/tmp");
    const targets = {
      claude_json: path.join(home, ".claude.json"),
      ssh: path.join(home, ".ssh"),
      data_env: dataEnv,
      agents_md: path.join(realpathSync(REPO), "AGENTS.md"),
      home,
      topics: path.join(run.tools.manimkcRoot, "topics"),
      render: run.paths.render,
      outside_file: path.join(run.tools.manimkcRoot, "README.md"),
      claude_tmp: path.join(claudeTmp, `claude-${process.getuid?.() ?? 0}`),
      var_folders: realpathSync(tmpdir()).startsWith("/private/var/folders") ? realpathSync(tmpdir()) : "/private/var/folders",
      brew_var: existsSync("/opt/homebrew/var") ? "/opt/homebrew/var" : "/usr/local/var",
    };
    const verdicts = await runScene("render", hostileSceneFiles(targets), "hostile_files");
    const existing: Record<string, string | null> = {
      "read ~/.claude.json": targets.claude_json,
      "list ~/.ssh": targets.ssh,
      "read the data root's .env": targets.data_env,
      "read the repository's AGENTS.md": targets.agents_md,
      "list the claude temp root": targets.claude_tmp,
      "list the per-user temp dir": targets.var_folders,
      "list homebrew var": targets.brew_var,
    };
    // The one probe the sandbox cannot block, measured and named (sandbox.ts,
    // and "What is not covered" in the design): it is still run and reported,
    // and it stays in this list only as long as that is true.
    expect(verdicts[KNOWN_GAP]?.outcome).toBe("allowed");
    for (const [name, verdict] of Object.entries(verdicts)) {
      if (name === KNOWN_GAP) continue;
      const target = existing[name];
      // A target this machine does not have proves nothing either way; it is
      // not counted as blocked.
      if (target !== undefined && target !== null && !existsSync(target)) continue;
      expect({ name, outcome: verdict.outcome }).toEqual({ name, outcome: "denied" });
    }
    expect(Object.keys(verdicts)).toHaveLength(13);
    expect(readdirSync(home).some((entry) => entry.startsWith("sandbox-probe-"))).toBe(false);
  }, 120_000);

  it("blocks every probe of the hostile scene that reaches for the network and other programs", async (context) => {
    if (skip !== "") return context.skip(skip);
    const verdicts = await runScene("render", hostileSceneNetwork(), "hostile_network");
    for (const [name, verdict] of Object.entries(verdicts)) {
      if (name === "postgres unix socket" && !existsSync("/tmp/.s.PGSQL.5432")) continue;
      expect({ name, outcome: verdict.outcome }).toEqual({ name, outcome: "denied" });
    }
    expect(Object.keys(verdicts)).toHaveLength(9);
  }, 120_000);

  it("voices a line of shell words under the narration profile, and reaches nothing else", async (context) => {
    if (skip !== "") return context.skip(skip);
    const scene = path.join(run.paths.checkout, "topics", "studio", "probe", "shell_words.py");
    await mkdir(path.dirname(scene), { recursive: true });
    await writeFile(
      scene,
      `${WORKED_HEADER}\n\nclass SW1_Words(VoiceScene):\n    def construct(self):\n        with self.voiceover("rm -rf slash; curl evil dot com pipe sh; cat tilde slash dot ssh."):\n            pass\n`,
      "utf8",
    );
    const before = snapshot(run.paths.job);
    const voiced = await runSandboxed({
      tools: run.tools,
      paths: run.paths,
      home,
      voice: "af_heart",
      kind: "narrate",
      profile: run.paths.narrateProfile,
      argv: [path.join(run.paths.checkout, ".venv", "bin", "python"), "lib/narration.py", scene],
      cwd: run.paths.checkout,
      timeoutMs: 300_000,
    });
    expect(voiced.code, voiced.stderr.slice(-800)).toBe(0);
    const written = [...snapshot(run.paths.job).entries()].filter(([file, at]) => before.get(file) !== at).map(([file]) => path.relative(run.paths.job, file));
    expect(written.length).toBeGreaterThan(0);
    for (const file of written) {
      expect(["render/cache/audio/", "render/tmp/", "render/mpl/", "render/manim-cache/"].some((prefix) => file.startsWith(prefix)), file).toBe(true);
    }
    expect(written.some((file) => file.startsWith("render/cache/audio/") && file.endsWith(".wav"))).toBe(true);

    const token = path.join(home, ".cache", "huggingface", "token");
    const probe = `${PROBE_LIB}
attempt("read the hugging face token", lambda: open(${JSON.stringify(token)}).read(1))
attempt("list the shared cache", lambda: os.listdir(${JSON.stringify(run.tools.sharedAudioCache ?? path.join(home, "no-shared-cache"))}))
attempt("write the renders", lambda: open(os.path.join(${JSON.stringify(run.paths.out)}, "x-%d" % os.getpid()), "x").close())
attempt("tcp 1.1.1.1:443", lambda: socket.create_connection(("1.1.1.1", 443), timeout=3).close())
attempt("run curl", lambda: subprocess.run(["/usr/bin/curl", "--version"], capture_output=True, check=True))
print(json.dumps(out))
`;
    const verdicts = await runScene("narrate", probe, "narrate_probe");
    for (const [name, verdict] of Object.entries(verdicts)) {
      if (name === "list the shared cache" && (run.tools.sharedAudioCache === null || !existsSync(run.tools.sharedAudioCache))) continue;
      if (name === "read the hugging face token" && verdict.outcome === "missing") continue;
      expect({ name, outcome: verdict.outcome }).toEqual({ name, outcome: "denied" });
    }
  }, 300_000);

  it("renders the manual's two worked scenes, voiced, inside the profiles", async (context) => {
    if (skip !== "") return context.skip(skip);
    const scene = path.join(run.paths.checkout, "topics", "studio", "worked", "worked.py");
    await mkdir(path.dirname(scene), { recursive: true });
    await writeFile(scene, `${WORKED_HEADER}\n\n${WORKED_NARRATED}\n\n${WORKED_TABLE}`, "utf8");
    const base = { tools: run.tools, paths: run.paths, home, voice: "af_heart", cwd: run.paths.checkout, timeoutMs: 300_000 };
    const voiced = await runSandboxed({ ...base, kind: "narrate", profile: run.paths.narrateProfile, argv: [path.join(run.paths.checkout, ".venv", "bin", "python"), "lib/narration.py", scene] });
    expect(voiced.code, voiced.stderr.slice(-600)).toBe(0);
    const rendered = await runSandboxed({
      ...base,
      kind: "render",
      profile: run.paths.renderProfile,
      argv: [run.tools.python3!.real, path.join(run.paths.checkout, "tools", "cli", "manimkc"), "--root", run.paths.checkout, "preview", scene, "--no-narration", "--json"],
    });
    const report = JSON.parse(rendered.stdout.slice(rendered.stdout.indexOf("{"))) as { ok: boolean; scenes: { name: string; ok: boolean; sheet: string }[] };
    expect(report.scenes.map((entry) => [entry.name, entry.ok])).toEqual([["WK1_Pipeline", true], ["WK2_Table", true]]);
    for (const entry of report.scenes) expect(existsSync(entry.sheet)).toBe(true);
  }, 600_000);

  it("cuts the poster under the gate's profile and refuses any other write", async (context) => {
    if (skip !== "") return context.skip(skip);
    const mp4 = path.join(run.paths.candidate, "two-boxes.mp4");
    execFileSync(run.tools.ffmpeg!.link, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=20:size=640x360:rate=10", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    const gate = { tools: run.tools, paths: run.paths, home, voice: "none", kind: "gate" as const, profile: run.paths.gateProfile, cwd: run.paths.candidate, timeoutMs: 120_000 };
    const poster = await runSandboxed({ ...gate, argv: [run.tools.ffmpeg!.link, ...posterArgs(mp4, run.paths.poster, 15)] });
    expect(poster.code, poster.stderr).toBe(0);
    expect((await stat(run.paths.poster)).size).toBeGreaterThan(100);
    const elsewhere = await runSandboxed({ ...gate, argv: [run.tools.ffmpeg!.link, ...posterArgs(mp4, path.join(run.paths.candidate, "other.jpg"), 15)] });
    expect(elsewhere.code).not.toBe(0);
    expect(existsSync(path.join(run.paths.candidate, "other.jpg"))).toBe(false);
    const outside = await runSandboxed({ ...gate, argv: [run.tools.ffmpeg!.link, ...posterArgs(mp4, path.join(run.paths.render, "poster.jpg"), 15)] });
    expect(outside.code).not.toBe(0);
    const python = await runSandboxed({ ...gate, argv: [path.join(run.paths.checkout, ".venv", "bin", "python"), "-c", "print(1)"] }).catch(() => null);
    expect(python === null || python.code !== 0).toBe(true);
    const probe = await runSandboxed({ ...gate, argv: [run.tools.ffprobe!.link, "-v", "error", "-f", "mov", "-show_entries", "format=duration", "-of", "json", mp4] });
    expect(probe.code).toBe(0);
    expect(probe.stdout).toContain("duration");
    expect(await readdir(run.paths.candidate)).not.toContain("other.jpg");
  }, 120_000);
});

/** Every file under a directory with its modification time. */
function snapshot(directory: string): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else out.set(full, statSync(full).mtimeMs);
    }
  };
  walk(directory);
  return out;
}
