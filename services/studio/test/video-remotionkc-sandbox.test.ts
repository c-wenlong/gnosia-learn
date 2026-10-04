import { execFile, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backendFor, type BackendJob } from "../src/video/backend";
import type { ValidVideoBrief } from "../src/video/brief";
import { readCalls } from "../src/video/calls";
import { runSandboxed } from "../src/video/exec";
import { runVideoGate } from "../src/video/gate";
import { HOSTILE_PROBE_JS } from "../src/video/hostile-probe";
import { readPorts } from "../src/video/ports";
import { lanAddress, watchPorts } from "./lan-probe";
import { remotionkcPaths } from "../src/video/remotionkc/paths";
import { remotionkcEnv } from "./../src/video/remotionkc/sandbox";
import { discoverRemotionkcToolchain, remotionkcProblems, type RemotionkcToolchain } from "../src/video/remotionkc/toolchain";

/**
 * The remotionkc sandbox, measured (phase 3 of docs/STUDIO-VIDEO-TOOLS.md):
 * a job set up through the backend exactly as the runner does it, its
 * hostile probe blocked on every line in the render profile, the network
 * open on the job's two ports and nowhere else, and then the job's own
 * wrapper running `lint`, `still` and `build` for real (narration in its
 * profile, webpack, the Headless Shell and the compositor in the render
 * profile, the sidecars after) and the gate passing the result with its
 * sandboxed tools.
 *
 * Two cases are the bugs revideokc's backend met only on the real machine,
 * which a studio home under the temporary directory hid: a `package.json`
 * above the studio home that the profile refuses (as this repository's is
 * when `STUDIO_HOME` is the default, `<checkout>/.studio`; browserslist read
 * it, and webpack died with EPERM until remotionkc bounded the search), and
 * the wrapper run with its standard streams on a file under the denied
 * temporary directory (as Claude Code's Bash runs it).
 *
 * These run Chrome, kokoro and Remotion, so they need macOS, a remotionkc
 * checkout with its node_modules, the Headless Shell and `.venv`, and
 * manimkc's `.venv-tts` with the kokoro model (`MANIMKC_ROOT`).
 * `vitest.setup.ts` points `REMOTIONKC_ROOT` at nothing for every suite, so
 * this one takes the submodule, or `STUDIO_TEST_REMOTIONKC_ROOT` when the
 * worktree's submodule has no dependencies installed. Anywhere else they
 * skip, with the reason. Nothing is paid for: the voice is local.
 */

const execFileAsync = promisify(execFile);
let skip = process.platform === "darwin" ? "" : "not macOS: the video sandbox is Seatbelt";
let tools: RemotionkcToolchain;
let root: string;
let job: BackendJob;
let classes: string[];
/** What the still and build case saw of the render's server from outside: null until it ran, or when there is no LAN address. */
let lanWatch: { loopbackUp: number; lanReached: number[] } | null = null;
/** The last scene's extraFrames in the case's composition: half a second at 30 fps. */
const HELD_FRAMES = 15;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME, REMOTIONKC_ROOT: process.env.REMOTIONKC_ROOT };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Two lines, so the build takes seconds: long enough that the gate's length prediction holds for them. */
const brief: ValidVideoBrief = {
  title: "Two boxes",
  topic: "networking",
  slug: "two-boxes",
  mode: "new",
  idea: "A request crosses an API.",
  audience: "familiar",
  targetSeconds: 60,
  voice: "af_heart",
  scenes: [
    { name: "client", beats: [{ say: "A request starts at the client, which knows what it wants and nothing about where the answer lives.", show: "a box", labels: ["Client"] }] },
    { name: "api", beats: [{ say: "Then it passes through the API, which checks the request and decides which service should answer it.", show: "a second box", labels: ["API"] }] },
  ],
  concepts: [],
  tool: "remotionkc",
  idempotencyKey: "sandbox-test",
};

const SCENE = `import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { NarrationTrack, OUT, defineTopic, ramp, sceneCues, type TimedScene, type TopicProps } from "#lib";

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const LABELS: Record<string, [string, string]> = { TB1_Client: ["Client", "client"], TB2_Api: ["API", "API"] };

const Box: React.FC<{ scene: TimedScene }> = ({ scene }) => {
  const f = useCurrentFrame();
  const [label, word] = LABELS[scene.scene]!;
  const shown = ramp(f, sceneCues(scene).at(0, word), 9, OUT);
  return (
    <AbsoluteFill style={{ background: "#10141c", alignItems: "center", justifyContent: "center" }}>
      <div style={{ padding: "40px 80px", borderRadius: 16, border: "6px solid #f5c542", color: "#e9edf5", fontFamily: SANS, fontSize: 64, opacity: shown }}>{label}</div>
    </AbsoluteFill>
  );
};

const Video: React.FC<TopicProps> = ({ timeline }) => {
  if (!timeline) return null;
  return (
    <AbsoluteFill>
      <NarrationTrack timeline={timeline} />
      {timeline.scenes.map((s) => (
        <Sequence key={s.scene} from={s.from} durationInFrames={s.durationInFrames}>
          <Box scene={s} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export default defineTopic({ component: Video });
`;

beforeAll(async () => {
  if (skip !== "") return;
  process.env.REMOTIONKC_ROOT = process.env.STUDIO_TEST_REMOTIONKC_ROOT?.trim() || path.join(REPO, "tools", "remotionkc");
  tools = await discoverRemotionkcToolchain();
  const problems = remotionkcProblems(tools);
  if (problems.length > 0) {
    skip = `no usable remotionkc toolchain (${problems[0]}); set STUDIO_TEST_REMOTIONKC_ROOT and MANIMKC_ROOT to checkouts with their dependencies`;
    return;
  }
  root = realpathSync(await mkdtemp(path.join(tmpdir(), "studio-remotionkc-sandbox-")));
  // A manifest above the studio home that the profile denies, as this
  // repository's is when STUDIO_HOME is the default, <checkout>/.studio:
  // browserslist's config search, which webpack runs, reads every
  // package.json up to the root, and a refused one ended the bundle.
  await writeFile(path.join(root, "package.json"), '{"browserslist": ["ie 6"]}\n', "utf8");
  process.env.STUDIO_HOME = path.join(root, "home");
  const backend = backendFor("remotionkc");
  // Not revideokc's suite's job id: the two suites run at once, and the same id would point both jobs at the same port pair.
  const paths = await backend.paths("2e2e2e2e-aaaa-4bbb-8ccc-123456789abc", brief.slug);
  job = { tools, paths, home: realpathSync(process.env.HOME ?? "/"), voice: "af_heart" };
  await backend.prepare(job);
  classes = (await backend.scaffold(job, brief, null)).classes;
  // The last scene held by extraFrames, so the gate's measurement of a hold is checked against a real build.
  await writeFile(paths.sceneFile, SCENE.replace("defineTopic({ component: Video })", `defineTopic({ component: Video, extraFrames: { ${JSON.stringify(classes.at(-1))}: ${HELD_FRAMES} } })`), "utf8");
  await backend.wrapper(job, { scenes: classes, narrated: true });
}, 120_000);

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function render(argv: string[], timeoutMs = 60_000) {
  return runSandboxed({
    ...job,
    kind: "render",
    profile: job.paths.renderProfile,
    env: remotionkcEnv("render", { ...job, tools, base: readPorts(job.paths) }),
    argv,
    cwd: job.paths.checkout,
    timeoutMs,
  });
}

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

describe("the remotionkc sandbox", () => {
  it("blocks every probe of a hostile scene's node in the render profile", async (context) => {
    if (skip !== "") return context.skip(skip);
    const base = readPorts(job.paths);
    const targets = { home: job.home, root: tools.remotionkc.root, nodeModules: tools.remotionkc.nodeModules, render: job.paths.render, otherPort: base + 2 };
    const result = await render([tools.node, "-e", HOSTILE_PROBE_JS, JSON.stringify(targets)]);
    const verdicts = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}") as Record<string, string>;
    expect(Object.keys(verdicts)).toHaveLength(18);
    for (const [name, verdict] of Object.entries(verdicts)) expect({ name, verdict: verdict.startsWith("blocked") }).toEqual({ name, verdict: true });
  }, 120_000);

  it("lets a render listen and connect on the job's two ports, and on no other", async (context) => {
    if (skip !== "") return context.skip(skip);
    const base = readPorts(job.paths);
    const program = `
const net = require("node:net");
const tryPort = (port) => new Promise((resolve) => {
  const server = net.createServer((socket) => socket.end("ok"));
  server.once("error", (e) => resolve("listen " + e.code));
  server.listen(port, "127.0.0.1", () => {
    const client = net.connect(port, "127.0.0.1");
    client.once("data", () => { client.destroy(); server.close(() => resolve("ok")); });
    client.once("error", (e) => server.close(() => resolve("connect " + e.code)));
  });
});
(async () => { const out = {}; for (const port of ${JSON.stringify([base, base + 1, base + 2, base - 1])}) out[port] = await tryPort(port); console.log(JSON.stringify(out)); })();`;
    const result = await render([tools.node, "-e", program]);
    expect(JSON.parse(result.stdout.trim())).toEqual({ [base]: "ok", [base + 1]: "ok", [base + 2]: "listen EPERM", [base - 1]: "listen EPERM" });
  }, 60_000);

  it("answers through its wrapper when its standard streams are a file the profiles refuse to read", async (context) => {
    if (skip !== "") return context.skip(skip);
    // Claude Code 2.1.287 runs Bash with stdout and stderr on a file under the
    // temporary directory, which every profile denies; node in the sandbox
    // aborted at start on the fstat of its inherited streams.
    const out = path.join(root, "bash-output.txt");
    const fd = openSync(out, "w");
    // The later case reads the job's calls from the first; this one's line is put back out of its way.
    const callsBefore = existsSync(job.paths.calls) ? readFileSync(job.paths.calls, "utf8") : null;
    try {
      const result = spawnSync(job.paths.wrapper, ["api", "sceneCues"], { env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", fd, fd], timeout: 120_000 });
      const text = readFileSync(out, "utf8");
      expect(result.status, text.slice(-1500)).toBe(0);
      expect(text).toContain("lib/cues.ts");
      expect(text).not.toContain("Native stack trace");
    } finally {
      closeSync(fd);
      if (callsBefore === null) rmSync(job.paths.calls, { force: true });
      else writeFileSync(job.paths.calls, callsBefore);
    }
  });

  it("runs the job's lint, still and build through its wrapper, narration and sidecars in their profile, and the gate passes the result", async (context) => {
    if (skip !== "") return context.skip(skip);
    const { paths } = job;
    const own = remotionkcPaths(paths);
    const startedAtMs = Date.now() - 1_000;
    const before = snapshot(paths.job);
    const env = { PATH: "/usr/bin:/bin", HOME: job.home, NODE_OPTIONS: "--require /nowhere.js", ANTHROPIC_API_KEY: "sk-not-for-the-job", BROWSERSLIST: "ie 6" };
    const lint = await execFileAsync(paths.wrapper, ["lint"], { env, timeout: 300_000 }).catch((error: { stdout?: string; code?: number }) => error);
    expect((lint as { code?: number }).code ?? 0, (lint as { stdout?: string }).stdout?.slice(-1500)).toBe(0);
    // The render's server is watched from outside while the still and the build run (lan-probe.ts).
    const lan = lanAddress();
    const watch = lan === null ? null : watchPorts([readPorts(paths)], lan);
    // Stopped however the two calls end, so a failed render cannot leave the watcher probing.
    let built: unknown;
    try {
      const still = await execFileAsync(paths.wrapper, ["still"], { env, timeout: 600_000 }).catch((error: { stderr?: string; code?: number }) => error);
      // A failed still fails here, without a build after it; the finally still stops the watcher.
      expect((still as { code?: number }).code ?? 0, (still as { stderr?: string }).stderr?.slice(-1500)).toBe(0);
      built = await execFileAsync(paths.wrapper, ["build"], { env, timeout: 600_000 }).catch((error: { stderr?: string; code?: number }) => error);
    } finally {
      lanWatch = watch === null ? null : await watch.stop();
    }
    expect((built as { code?: number }).code ?? 0, (built as { stderr?: string }).stderr?.slice(-1500)).toBe(0);

    const calls = await readCalls(paths.calls);
    expect(calls.map((call) => [call.verb, call.exitCode, (call.steps ?? []).map((step) => step.step)])).toEqual([
      ["lint", 0, ["render"]],
      ["still", 0, ["narrate", "render"]],
      ["build", 0, ["narrate", "render", "sidecars"]],
    ]);
    expect(calls[1]!.rendered).toEqual(classes);
    expect(calls[2]!.deliverable).toEqual({ written: true });
    // No bundle is left behind: each render removes its own (about 40 MB).
    expect((await readdir(paths.renderTmp)).filter((name) => name.startsWith("remotion-webpack-bundle-"))).toEqual([]);
    // Every write landed in render/, the wrapper's own logs aside.
    const written = [...snapshot(paths.job).entries()].filter(([file, at]) => before.get(file) !== at).map(([file]) => path.relative(paths.job, file));
    for (const file of written) expect(file.startsWith("render/") || ["calls.ndjson"].includes(file), file).toBe(true);
    // The staged clips are copies: the profile refuses a hard link, and the runner keeps only single-link files.
    for (const name of await readdir(path.join(own.publicDir, own.topic, "audio"))) expect(statSync(path.join(own.publicDir, own.topic, "audio", name)).nlink).toBe(1);

    const gate = await runVideoGate({
      brief,
      paths,
      classes,
      startedAtMs,
      sourceHashBefore: null,
      calls,
      reads: [
        { path: own.stillsSheet, at: new Date(Date.parse(calls[1]!.endedAt) + 10).toISOString() },
        { path: own.buildSheet, at: new Date(Date.parse(calls[2]!.endedAt) + 10).toISOString() },
      ],
      tools: backendFor("remotionkc").gateTools(job),
      backend: backendFor("remotionkc"),
    });
    expect(gate.findings).toEqual([]);
    expect(gate.ok).toBe(true);
    expect(existsSync(paths.poster)).toBe(true);
    // Step 7 measured the hold where it landed: the line's 0.4 s tail and the extraFrames at 30 fps.
    expect(gate.sync?.heldTail[classes.at(-1)!]).toBeCloseTo(0.4 + HELD_FRAMES / 30, 1);
    expect(gate.sync?.heldTail[classes[0]!]).toBeCloseTo(0.4, 1);

    // After a verdict the final lines' clips are kept, by their gnosia-audio keys.
    await backendFor("remotionkc").keepClips(job);
    expect((await readdir(paths.clips)).filter((name) => name.endsWith(".wav"))).toHaveLength(2);
  }, 900_000);

  it("never lets the render's server be reached on the machine's LAN address, only on loopback", (context) => {
    if (skip !== "") return context.skip(skip);
    if (lanAddress() === null) return context.skip("this machine has no non-loopback IPv4 address to try the render's server on");
    // Remotion's server listens on "::" when left alone, and the profile's
    // localhost rule does not stop a LAN connection to that; loopbackOnly in
    // remotionkc's tools/render/sandbox.mjs moves it to 127.0.0.1.
    expect(lanWatch, "the still and build case did not run").not.toBeNull();
    expect(lanWatch!.loopbackUp, "the render's server never answered on loopback, so the LAN check proves nothing").toBeGreaterThan(0);
    expect(lanWatch!.lanReached).toEqual([]);
  });
});
