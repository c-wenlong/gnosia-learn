import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";

import { studioHome } from "../paths";
import { parseJson } from "../proc";
import { VIDEO_DOCTOR_TTL_MS } from "./config";
import { buildCheckout, resolvedPaths } from "./checkout";
import { runSandboxed } from "./exec";
import { WORKED_HEADER, WORKED_NARRATED } from "./manual";
import { commandPathProblem } from "./bash-guard";
import { prepareBwrap } from "./bwrap";
import { buildProfile, resolvedStudioHome } from "./sandbox";
import { discoverToolchain, toolchainProblems, type Toolchain } from "./toolchain";
import type { VideoPaths } from "./paths";
import { VOICES } from "./voices";

/**
 * The video doctor (docs/STUDIO-VIDEOS.md, "The video doctor"): whether this
 * machine can run a video job right now. While it fails, video jobs answer
 * 503 with the reason, and nothing ever falls back to rendering unsandboxed
 * (V2, V3).
 *
 * `manimkc doctor --json` against a scratch job checkout, plus the studio's
 * own checks:
 *
 * - the toolchain the profiles are generated from;
 * - the render profile renders a one-scene fixture, which proves Metal finds
 *   its adapter inside it (Claude Code's own sandbox was measured to leave it
 *   with none), and the narration profile voices its line, which proves the
 *   kokoro model is cached where an offline step can read it;
 * - a hostile probe run inside the render profile is blocked on every line.
 *
 * `manimkc doctor` alone took nine seconds (measured), so the answer is
 * cached and refreshed at start and every ten minutes. It writes nothing
 * outside `$STUDIO_HOME/video-doctor/`, and its manimkc timing lines go to the
 * scratch data root, never the owner's.
 */

export interface VideoDoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VideoDoctorReport {
  ok: boolean;
  /** `sandbox-exec` present and the probe blocked. */
  sandbox: boolean;
  /** The fixture rendered inside the render profile. */
  metal: boolean;
  /** The fixture's line was voiced inside the narration profile. */
  kokoro: boolean;
  voices: string[];
  checks: VideoDoctorCheck[];
  checkedAt: string;
  /**
   * The last job of this tool the runner stopped because its tools could not
   * start (V26), when there was one since the studio started. It does not
   * change `ok`. The checks above passed while that job's every call died, so
   * no passing run could ever clear a failure it set, only a restart; and a
   * job is stopped after three dead calls now, so the next one costs little
   * to try.
   */
  toolchainStop?: ToolchainStop | null;
}

export interface ToolchainStop {
  jobId: string;
  at: string;
  detail: string;
}

/**
 * What a hostile scene tries, as a Python program: each line prints whether
 * the attempt was blocked. The same probes the design's table records, minus
 * the ones that would touch the owner's data if they succeeded. A write that
 * gets through is removed at once, and reported as a failure.
 */
export const HOSTILE_PROBE = String.raw`
import json, os, socket, subprocess, sys
home = os.environ.get("HOME", "")
out = {}
def attempt(name, fn):
    try:
        fn()
        out[name] = "allowed"
    except Exception as e:
        out[name] = "blocked: " + type(e).__name__
def read_home():
    # The owner's ssh keys by name: a skeleton rootfs lets a listdir of the
    # home stub succeed on Linux (it shows only mount points), so the probe
    # names the directory that would hold secrets.
    os.listdir(os.path.join(home, ".ssh"))
def read_claude():
    open(os.path.join(home, ".claude.json")).read(1)
def write_home():
    p = os.path.join(home, ".studio-sandbox-probe-%d" % os.getpid())
    with open(p, "x") as f:
        f.write("x")
    os.remove(p)
def tcp():
    socket.create_connection(("1.1.1.1", 443), timeout=3).close()
def local_tcp():
    socket.create_connection(("127.0.0.1", 5432), timeout=3).close()
def dns():
    socket.getaddrinfo("example.com", 443)
def pg_socket():
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(3)
    s.connect("/tmp/.s.PGSQL.5432")
def exec_curl():
    subprocess.run(["/usr/bin/curl", "--version"], capture_output=True, check=True)
def exec_launchctl():
    subprocess.run(["/bin/launchctl", "version"], capture_output=True, check=True)
def list_tmp():
    os.listdir("/private/tmp")
def list_var_folders():
    os.listdir(os.environ.get("DARWIN_USER_TEMP_DIR", "/private/var/folders"))
def symlink_out():
    p = os.path.join(os.environ["MANIMKC_HOME"], "probe-link-%d" % os.getpid())
    # A namespace cannot refuse the link itself, so the boundary being
    # probed is the target: a denied path resolves nowhere inside.
    os.symlink(os.path.join(home, ".ssh", "config"), p)
    try:
        open(p).read(1)
    finally:
        os.remove(p)
def list_brew_var():
    os.listdir("/opt/homebrew/var") if os.path.isdir("/opt/homebrew/var") else os.listdir("/usr/local/var")
attempt("read home", read_home)
attempt("read ~/.claude.json", read_claude)
attempt("write in home", write_home)
attempt("tcp 1.1.1.1:443", tcp)
attempt("tcp 127.0.0.1:5432", local_tcp)
attempt("dns example.com", dns)
attempt("postgres unix socket", pg_socket)
attempt("run curl", exec_curl)
attempt("run launchctl", exec_launchctl)
attempt("list /private/tmp", list_tmp)
attempt("list /private/var/folders", list_var_folders)
attempt("symlink out of render", symlink_out)
attempt("list homebrew var", list_brew_var)
out["secrets in env"] = "blocked" if not any(k for k in os.environ if any(w in k.upper() for w in ("KEY", "TOKEN", "SECRET", "PASSWORD"))) else "allowed"
print(json.dumps(out))
`;

/**
 * A probe outcome counts as blocked only when the attempt failed; a missing
 * file or a refused connection that is not the sandbox's doing would read as
 * blocked too, which makes this a necessary check rather than a proof. The
 * suite's hostile-scene test is the proof, on a machine where each target
 * exists.
 */
export function probeBlocked(report: Record<string, string>, platform: NodeJS.Platform = process.platform): { ok: boolean; allowed: string[] } {
  // A private netns cannot refuse a listen on an unallocated port the way a
  // Seatbelt port list did; the boundary it keeps is that nothing can reach
  // it, which the connect lines already probe.
  const tolerated = platform === "linux" ? new Set(["listen on a port that is not the job's"]) : new Set<string>();
  const allowed = Object.entries(report)
    .filter(([name, verdict]) => !verdict.startsWith("blocked") && !tolerated.has(name))
    .map(([name]) => name);
  return { ok: allowed.length === 0 && Object.keys(report).length > 0, allowed };
}

export interface DoctorRun {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
}

/** A scratch job with the three profiles written, for the doctor and the tests. */
export async function scratchJob(tools: Toolchain, directory: string, voice = "af_heart"): Promise<DoctorRun> {
  await rm(directory, { recursive: true, force: true });
  const paths = await resolvedPaths("doctor", "doctor-fixture", directory);
  const home = realpathSync(process.env.HOME ?? "/");
  await buildCheckout(tools, paths, voice);
  const written = ([["render", paths.renderProfile], ["narrate", paths.narrateProfile], ["gate", paths.gateProfile]] as const).map(([kind, file]) => ({
    file,
    text: buildProfile(kind, { tools, paths, home, studioHome: resolvedStudioHome() }),
  }));
  for (const each of written) await writeFile(each.file, each.text, "utf8");
  if (tools.sandboxKind === "bwrap") await prepareBwrap(paths, written.map((each) => each.text));
  await mkdir(paths.candidate, { recursive: true });
  return { tools, paths, home };
}

export async function runVideoDoctor(): Promise<VideoDoctorReport> {
  const tools = await discoverToolchain();
  const checks: VideoDoctorCheck[] = [];
  const problems = toolchainProblems(tools);
  checks.push({ name: "toolchain", ok: problems.length === 0, detail: problems.length === 0 ? "every program the profiles name was found" : problems.join("; ") });
  const voices = VOICES.map((voice) => voice.id).filter((id) => tools.voicesInstalled.includes(id));
  checks.push({ name: "voices", ok: voices.length > 0, detail: voices.length > 0 ? `installed: ${voices.join(", ")}` : "no kokoro voice from the list is installed" });
  const home = studioHome();
  // Resolved, since every job path is: a studio home behind a link to a
  // folder with a space would pass on its own spelling and fail at setup.
  const pathProblem = commandPathProblem(resolvedStudioHome(), tools.node);
  if (pathProblem !== null) checks.push({ name: "studio home", ok: false, detail: pathProblem });
  let sandbox = false;
  let metal = false;
  let kokoro = false;
  if (problems.length === 0) {
    const run = await scratchJob(tools, path.join(home, "video-doctor", "run"), voices[0] ?? "af_heart");
    const base = { tools: run.tools, paths: run.paths, home: run.home, voice: voices[0] ?? "af_heart" };

    const manimkc = await runSandboxed({
      ...base,
      kind: "render",
      profile: run.paths.renderProfile,
      argv: [tools.python3!.real, path.join(run.paths.checkout, "tools", "cli", "manimkc"), "--root", run.paths.checkout, "doctor", "--json"],
      cwd: run.paths.checkout,
      timeoutMs: 120_000,
    }).catch(() => null);
    const report = manimkc === null ? null : (parseJson(manimkc.stdout) as { checks?: { name: string; ok: boolean; warn?: boolean; detail?: string }[] } | null);
    const failing = (report?.checks ?? []).filter((check) => !check.ok && check.warn !== true);
    checks.push({
      name: "manimkc doctor",
      ok: report !== null && failing.length === 0,
      detail: report === null ? "manimkc doctor did not answer inside the render profile" : failing.length === 0 ? "every check passed" : failing.map((check) => `${check.name}: ${check.detail ?? ""}`).join("; "),
    });

    const probe = await runSandboxed({ ...base, kind: "render", profile: run.paths.renderProfile, argv: [path.join(run.paths.checkout, ".venv", "bin", "python"), "-I", "-c", HOSTILE_PROBE], cwd: run.paths.checkout, timeoutMs: 60_000 }).catch(() => null);
    const verdicts = probe === null ? {} : ((parseJson(probe.stdout) as Record<string, string> | null) ?? {});
    const blocked = probeBlocked(verdicts);
    sandbox = blocked.ok;
    checks.push({ name: "hostile probe", ok: blocked.ok, detail: blocked.ok ? `${Object.keys(verdicts).length} attempts, every one blocked` : `allowed: ${blocked.allowed.join(", ") || "the probe did not run"}` });

    const topic = path.join(run.paths.checkout, "topics", "studio", "doctor-fixture");
    await mkdir(topic, { recursive: true });
    const scene = path.join(topic, "doctor_fixture.py");
    await writeFile(scene, `${WORKED_HEADER}\n\n${WORKED_NARRATED}`, "utf8");
    const voiced = await runSandboxed({ ...base, kind: "narrate", profile: run.paths.narrateProfile, argv: [path.join(run.paths.checkout, ".venv", "bin", "python"), "lib/narration.py", scene], cwd: run.paths.checkout, timeoutMs: 300_000 }).catch(() => null);
    kokoro = voiced !== null && voiced.code === 0;
    checks.push({ name: "narration profile", ok: kokoro, detail: kokoro ? "the fixture's lines were voiced offline" : `the narration step failed: ${(voiced?.stderr ?? "").trim().split("\n").slice(-2).join(" ")}` });

    const rendered = await runSandboxed({
      ...base,
      kind: "render",
      profile: run.paths.renderProfile,
      argv: [tools.python3!.real, path.join(run.paths.checkout, "tools", "cli", "manimkc"), "--root", run.paths.checkout, "preview", scene, "WK1_Pipeline", "--no-narration", "--json"],
      cwd: run.paths.checkout,
      timeoutMs: 300_000,
    }).catch(() => null);
    const preview = rendered === null ? null : (parseJson(rendered.stdout) as { ok?: boolean } | null);
    metal = preview?.ok === true;
    checks.push({ name: "render profile", ok: metal, detail: metal ? "the fixture rendered: Metal found its adapter inside the sandbox" : `the fixture did not render: ${(rendered?.stderr ?? "").trim().split("\n").slice(-2).join(" ")}` });
    if (metal) {
      // Each job's matplotlib cache starts as a copy of this one, so no job
      // pays the ten seconds a first `import manimlib` costs in a fresh
      // MPLCONFIGDIR (measured).
      const template = path.join(home, "cache", "video-mpl");
      await rm(template, { recursive: true, force: true });
      await cp(run.paths.mpl, template, { recursive: true, dereference: false, verbatimSymlinks: true }).catch(() => undefined);
    }
  }
  const ok = checks.every((check) => check.ok);
  return { ok, sandbox, metal, kokoro, voices, checks, checkedAt: new Date().toISOString() };
}

/** The doctor's answer, cached for `VIDEO_DOCTOR_TTL_MS`, one run at a time. */
export class VideoDoctor {
  private last: VideoDoctorReport | null = null;
  private running: Promise<VideoDoctorReport> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly check: () => Promise<VideoDoctorReport>;

  constructor(check: () => Promise<VideoDoctorReport> = runVideoDoctor) {
    this.check = check;
  }

  private stopped: ToolchainStop | null = null;

  current(): VideoDoctorReport | null {
    return this.last === null ? null : this.withStop(this.last);
  }

  /**
   * A job of this tool was stopped because its tools could not start: health
   * reports it beside the checks, and the checks run again now rather than
   * at the next ten-minute refresh, in case they can see it. Always a run
   * that starts after the stop: one already in flight began before it, so a
   * forced report would only join that one, and its verdict would stand
   * until the next refresh. The new run is queued behind it instead.
   */
  noteToolchainStop(stop: ToolchainStop): void {
    this.stopped = stop;
    const inFlight = this.running;
    if (inFlight === null) void this.report(true);
    else void inFlight.finally(() => this.report(true)).catch(() => undefined);
  }

  private withStop(report: VideoDoctorReport): VideoDoctorReport {
    return this.stopped === null ? report : { ...report, toolchainStop: this.stopped };
  }

  async report(force = false): Promise<VideoDoctorReport> {
    const fresh = this.last !== null && Date.now() - Date.parse(this.last.checkedAt) < VIDEO_DOCTOR_TTL_MS;
    if (fresh && !force) return this.withStop(this.last!);
    this.running ??= this.check()
      .catch((error: unknown): VideoDoctorReport => ({
        ok: false,
        sandbox: false,
        metal: false,
        kokoro: false,
        voices: [],
        checks: [{ name: "doctor", ok: false, detail: `the video doctor threw: ${(error as Error).message}` }],
        checkedAt: new Date().toISOString(),
      }))
      .then((report) => {
        this.last = report;
        return report;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running.then((report) => this.withStop(report));
  }

  start(): void {
    this.timer = setInterval(() => void this.report(true), VIDEO_DOCTOR_TTL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * For shutdown: clears the timer the way `stop()` does, then waits for a
   * check already in flight to finish. The check itself is not cancelled —
   * its sandboxed steps carry their own timeouts — so a caller bounds the
   * wait (`within` in index.ts) rather than trusting it.
   */
  async drain(): Promise<void> {
    this.stop();
    await this.running?.catch(() => undefined);
  }
}
