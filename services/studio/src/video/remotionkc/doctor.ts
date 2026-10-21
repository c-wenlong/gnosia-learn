import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";

import { studioHome } from "../../paths";
import { parseJson } from "../../proc";
import { commandPathProblem } from "../bash-guard";
import { prepareBwrap } from "../bwrap";
import { probeBlocked, type VideoDoctorCheck, type VideoDoctorReport } from "../doctor";
import { runSandboxed } from "../exec";
import { HOSTILE_PROBE_JS } from "../hostile-probe";
import { installedFingerprint } from "../installed";
import type { VideoPaths } from "../paths";
import { freePair, writePorts } from "../ports";
import { resolvedStudioHome, type ProfileKind } from "../sandbox";
import { VOICES } from "../voices";
import { buildRemotionkcCheckout, checkoutFingerprint } from "./checkout";
import { FIXTURE_COMPOSITION, FIXTURE_NARRATION, FIXTURE_TOPIC_YML } from "./fixture";
import { remotionkcGateTools } from "./gate-tools";
import { remotionkcPaths, remotionkcVideoPaths } from "./paths";
import { buildRemotionkcProfile, remotionkcEnv } from "./sandbox";
import { discoverRemotionkcToolchain, remotionkcProblems, type RemotionkcToolchain } from "./toolchain";

/**
 * The remotionkc doctor (phase 3 of docs/STUDIO-VIDEO-TOOLS.md): whether
 * this machine can make a remotionkc video right now, by doing it, as
 * revideokc's doctor does (`../revideokc/doctor.ts`).
 *
 * - The toolchain: remotionkc's half and the parts of manimkc's a job uses.
 * - The hostile probe every Chrome tool runs (`../hostile-probe.ts`), in the
 *   render profile, blocked on every line.
 * - The fixture (`fixture.ts`, a chart with a formula and a lit three.js
 *   card): voiced in the narration profile, checked by `tsc` and parsed by
 *   the gate's parser, built in the render profile (so both ports, the
 *   Headless Shell, WebGL through Metal, the compositor and the system
 *   ffmpeg are proven inside it), its sidecars written in the narration
 *   profile, and the build probed and its poster cut in the gate profile.
 *
 * The build takes most of a minute, so a passing verdict is kept for
 * `RENDER_KEPT_MS` while the toolchain, the voice, the code a render runs
 * (`checkoutFingerprint`) and what is installed under it
 * (`installedFingerprint`) are unchanged, and the cheap checks and the probe
 * run every time.
 */

/** How long a passing fixture build stands for an unchanged toolchain. */
export const RENDER_KEPT_MS = 6 * 3_600_000;

/** The remotionkc doctor's fixture takes a pair here, outside the jobs' range and revideokc's doctor's (46990 to 46998). */
export const DOCTOR_PORTS = { first: 46980, last: 46988 } as const;

let lastRender: { key: string; at: number; checks: VideoDoctorCheck[] } | null = null;

/**
 * What a kept fixture build stands for: the toolchain, the voice, the code a
 * render runs, what is installed under it (remotion and `@remotion/*`, the
 * Headless Shell's version and both lockfiles, `installedFingerprint`) and
 * the fixture.
 */
export async function renderKey(tools: RemotionkcToolchain, voice: string): Promise<string> {
  const own = tools.remotionkc;
  const installed = await installedFingerprint({
    root: own.root,
    nodeModules: own.nodeModules,
    packages: (name) => name === "remotion" || name.startsWith("@remotion/"),
    files: own.nodeModules === null ? [] : [path.join(own.nodeModules, ".remotion", "chrome-headless-shell", "VERSION")],
  });
  return JSON.stringify({ tools, voice, code: await checkoutFingerprint(own.root), installed, fixture: FIXTURE_COMPOSITION });
}

/** Forget the kept fixture build (a test, or a change the toolchain cannot see). */
export function forgetRemotionkcRender(): void {
  lastRender = null;
}

export interface RemotionkcScratch {
  tools: RemotionkcToolchain;
  paths: VideoPaths;
  home: string;
  base: number;
}

/** A scratch job with the checkout, the three profiles and the fixture topic, for the doctor and the tests. */
export async function remotionkcScratchJob(tools: RemotionkcToolchain, directory: string, base: number): Promise<RemotionkcScratch> {
  await rm(directory, { recursive: true, force: true });
  const paths = await remotionkcVideoPaths("doctor", "doctor-fixture", directory);
  const home = realpathSync(process.env.HOME ?? "/");
  await buildRemotionkcCheckout(tools, paths);
  await writePorts(paths, base);
  const written = ([["render", paths.renderProfile], ["narrate", paths.narrateProfile], ["gate", paths.gateProfile]] as const).map(([kind, file]) => ({
    file,
    text: buildRemotionkcProfile(kind, { tools, paths, home, studioHome: resolvedStudioHome(), base }),
  }));
  for (const each of written) await writeFile(each.file, each.text, "utf8");
  if (tools.sandboxKind === "bwrap") await prepareBwrap(paths, written.map((each) => each.text));
  await mkdir(paths.topicDir, { recursive: true });
  await writeFile(paths.topicYml, FIXTURE_TOPIC_YML, "utf8");
  await writeFile(remotionkcPaths(paths).narration, `${JSON.stringify(FIXTURE_NARRATION, null, 1)}\n`, "utf8");
  await writeFile(paths.sceneFile, FIXTURE_COMPOSITION, "utf8");
  await mkdir(paths.candidate, { recursive: true });
  return { tools, paths, home, base };
}

/** Run one CLI verb of the scratch job's checkout in a profile. */
export function cliIn(run: RemotionkcScratch, kind: ProfileKind, args: string[], voice: string, timeoutMs = 600_000) {
  const profile = kind === "render" ? run.paths.renderProfile : kind === "narrate" ? run.paths.narrateProfile : run.paths.gateProfile;
  return runSandboxed({
    tools: run.tools,
    paths: run.paths,
    home: run.home,
    voice,
    kind,
    profile,
    env: remotionkcEnv(kind, { tools: run.tools, paths: run.paths, home: run.home, voice, base: run.base }),
    argv: [run.tools.node, path.join(run.paths.checkout, "tools", "cli", "remotionkc.mjs"), "--root", run.paths.checkout, ...args],
    cwd: run.paths.checkout,
    timeoutMs,
  });
}

const tail = (text: string | undefined): string => (text ?? "").trim().split("\n").filter((line) => !/^\s+at /.test(line)).slice(-3).join(" ");

/** The fixture end to end, as a job's steps run it. Each step a check; it stops at the first that fails. */
async function renderFixture(run: RemotionkcScratch, voice: string): Promise<VideoDoctorCheck[]> {
  const checks: VideoDoctorCheck[] = [];
  const topic = remotionkcPaths(run.paths).topic;
  const step = async (name: string, kind: ProfileKind, args: string[], ok: string): Promise<boolean> => {
    const started = Date.now();
    const result = await cliIn(run, kind, args, voice).catch((error: unknown) => ({ code: null, stdout: "", stderr: (error as Error).message, timedOut: false }));
    const passed = result.code === 0;
    checks.push({ name, ok: passed, detail: passed ? `${ok} in ${Math.round((Date.now() - started) / 100) / 10} s` : `failed (exit ${result.code}): ${tail(result.stderr) || tail(result.stdout)}` });
    return passed;
  };
  if (!(await step("narration profile", "narrate", ["narrate", topic], "the fixture's lines were voiced offline"))) return checks;
  const gate = remotionkcGateTools({ tools: run.tools, paths: run.paths, home: run.home, voice });
  const lint = await gate.lint();
  checks.push({ name: "lint", ok: lint !== null && lint.errors.length === 0, detail: lint === null ? "tsc did not answer inside the render profile" : lint.errors.length === 0 ? "tsc found no errors in the fixture" : lint.errors.map((error) => error.msg).join("; ") });
  const parsed = await gate.parseScene!(FIXTURE_COMPOSITION);
  checks.push({ name: "gate parse", ok: parsed.ok && parsed.defaultExport && parsed.strings.includes("A chart from data"), detail: parsed.ok ? "the TypeScript parser read the fixture inside the gate profile" : `the parse failed: ${parsed.error ?? ""}` });
  if (!(await step("render profile", "render", ["build", topic, "--no-narrate"], "the fixture built: the Headless Shell, WebGL and both ports inside the sandbox"))) return checks;
  if (!(await step("sidecars", "narrate", ["sidecars", topic], "the transcript, chapters and captions were written"))) return checks;
  const copy = path.join(run.paths.candidate, "doctor-fixture.mp4");
  await rm(copy, { force: true });
  await copyFile(run.paths.deliverable, copy);
  const probe = await gate.probe(copy);
  const poster = await gate.poster(copy, run.paths.poster, 2);
  const probed = probe !== null && probe.streams.includes("video") && probe.streams.includes("audio") && poster;
  checks.push({ name: "gate profile", ok: probed, detail: probed ? `the build probed at ${probe!.duration}s with sound, and its poster was cut` : "the build could not be probed or its poster cut inside the gate profile" });
  return checks;
}

export async function runRemotionkcDoctor(): Promise<VideoDoctorReport> {
  const tools = await discoverRemotionkcToolchain();
  const checks: VideoDoctorCheck[] = [];
  const problems = remotionkcProblems(tools);
  checks.push({ name: "toolchain", ok: problems.length === 0, detail: problems.length === 0 ? "every program the profiles name was found" : problems.join("; ") });
  const voices = VOICES.map((voice) => voice.id).filter((id) => tools.voicesInstalled.includes(id));
  checks.push({ name: "voices", ok: voices.length > 0, detail: voices.length > 0 ? `installed: ${voices.join(", ")}` : "no kokoro voice from the list is installed" });
  const pathProblem = commandPathProblem(resolvedStudioHome(), tools.node);
  if (pathProblem !== null) checks.push({ name: "studio home", ok: false, detail: pathProblem });
  let sandbox = false;
  let metal = false;
  let kokoro = false;
  if (problems.length === 0 && voices.length > 0) {
    const voice = voices[0]!;
    const base = await freePair(DOCTOR_PORTS);
    const run = await remotionkcScratchJob(tools, path.join(studioHome(), "video-doctor", "remotionkc"), base);
    const other = base === DOCTOR_PORTS.first ? DOCTOR_PORTS.last : DOCTOR_PORTS.first;
    const targets = { home: run.home, root: tools.remotionkc.root, nodeModules: tools.remotionkc.nodeModules, render: run.paths.render, otherPort: other };
    const probe = await runSandboxed({
      tools,
      paths: run.paths,
      home: run.home,
      voice,
      kind: "render",
      profile: run.paths.renderProfile,
      env: remotionkcEnv("render", { tools, paths: run.paths, home: run.home, voice, base }),
      argv: [tools.node, "-e", HOSTILE_PROBE_JS, JSON.stringify(targets)],
      cwd: run.paths.checkout,
      timeoutMs: 60_000,
    }).catch(() => null);
    const verdicts = probe === null ? {} : ((parseJson(probe.stdout.trim().split("\n").at(-1) ?? "") as Record<string, string> | null) ?? {});
    const blocked = probeBlocked(verdicts, tools.platform);
    sandbox = blocked.ok;
    checks.push({ name: "hostile probe", ok: sandbox, detail: sandbox ? `${Object.keys(verdicts).length} attempts, every one blocked` : `allowed: ${blocked.allowed.join(", ") || "the probe did not run"}` });

    const key = await renderKey(tools, voice);
    if (lastRender !== null && lastRender.key === key && Date.now() - lastRender.at < RENDER_KEPT_MS) {
      checks.push(...lastRender.checks.map((check) => ({ ...check, detail: `${check.detail} (at ${new Date(lastRender!.at).toISOString()})` })));
    } else {
      const rendered = await renderFixture(run, voice);
      checks.push(...rendered);
      lastRender = rendered.every((check) => check.ok) ? { key, at: Date.now(), checks: rendered } : null;
    }
    kokoro = checks.some((check) => check.name === "narration profile" && check.ok);
    metal = checks.some((check) => check.name === "render profile" && check.ok);
    if (!checks.some((check) => check.name === "render profile")) {
      checks.push({ name: "render profile", ok: false, detail: "the fixture was not built, since a step before it failed" });
    }
  }
  const ok = checks.every((check) => check.ok);
  return { ok, sandbox, metal, kokoro, voices, checks, checkedAt: new Date().toISOString() };
}
