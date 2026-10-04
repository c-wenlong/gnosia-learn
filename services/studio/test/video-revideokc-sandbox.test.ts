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
import { HOSTILE_PROBE_JS } from "../src/video/revideokc/doctor";
import { revideokcPaths } from "../src/video/revideokc/paths";
import { readPorts, revideokcEnv } from "../src/video/revideokc/sandbox";
import { lanAddress, watchPorts } from "./lan-probe";
import { discoverRevideokcToolchain, revideokcProblems, type RevideokcToolchain } from "../src/video/revideokc/toolchain";

/**
 * The revideokc sandbox, measured (phase 2c of docs/STUDIO-VIDEO-TOOLS.md):
 * a job set up through the backend exactly as the runner does it, its
 * hostile probe blocked on every line in the render profile, the network
 * open on the job's two ports and nowhere else, and then the job's own
 * wrapper running `still` and `build` for real (narration in its profile,
 * Chrome and both workers in the render profile, the sidecars after) and the
 * gate passing the result with its sandboxed tools.
 *
 * These run Chrome, kokoro and Revideo, so they need macOS, a revideokc
 * checkout with its node_modules and `.venv`, and manimkc's `.venv-tts` with
 * the kokoro model (`MANIMKC_ROOT`). `vitest.setup.ts` points `REVIDEOKC_ROOT`
 * at nothing for every suite, so this one takes the submodule, or
 * `STUDIO_TEST_REVIDEOKC_ROOT` when the worktree's submodule has no
 * dependencies installed. Anywhere else they skip, with the reason.
 * Nothing is paid for: the voice is local.
 */

const execFileAsync = promisify(execFile);
let skip = process.platform === "darwin" ? "" : "not macOS: the video sandbox is Seatbelt";
let tools: RevideokcToolchain;
let root: string;
let job: BackendJob;
let classes: string[];
/** What the still and build case saw of the Vite servers from outside: null until it ran, or when there is no LAN address. */
let lanWatch: { loopbackUp: number; lanReached: number[] } | null = null;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME, REVIDEOKC_ROOT: process.env.REVIDEOKC_ROOT };
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
  tool: "revideokc",
  idempotencyKey: "sandbox-test",
};

const SCENE = `/** @jsxImportSource @revideo/2d/lib */
import {Rect, Txt} from '@revideo/2d';
import {createRef} from '@revideo/core';
import {defineTopic} from '#lib';

const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';

export default defineTopic(function* (view, t) {
  const box = createRef<Rect>();
  const label = createRef<Txt>();
  view.add(<Rect ref={box} width={420} height={200} radius={16} fill={'#1d2533'} stroke={'#f5c542'} lineWidth={6}><Txt ref={label} fontFamily={SANS} fontSize={64} fill={'#e9edf5'} text={'Client'} /></Rect>);
  yield* t.at('TB1_Client', 0, 'client');
  yield* box().scale(1.1, 0.3);
  yield* t.at('TB2_Api', 0, 'API');
  label().text('API');
});
`;

beforeAll(async () => {
  if (skip !== "") return;
  process.env.REVIDEOKC_ROOT = process.env.STUDIO_TEST_REVIDEOKC_ROOT?.trim() || path.join(REPO, "tools", "revideokc");
  tools = await discoverRevideokcToolchain();
  const problems = revideokcProblems(tools);
  if (problems.length > 0) {
    skip = `no usable revideokc toolchain (${problems[0]}); set REVIDEOKC_ROOT and MANIMKC_ROOT to checkouts with their dependencies`;
    return;
  }
  root = realpathSync(await mkdtemp(path.join(tmpdir(), "studio-revideokc-sandbox-")));
  // A manifest above the studio home that the profile denies, as this
  // repository's is when STUDIO_HOME is the default, <checkout>/.studio:
  // Puppeteer's config search reads every package.json up to the home
  // directory, and a refused one ended the render before Chrome started.
  await writeFile(path.join(root, "package.json"), "{}\n", "utf8");
  process.env.STUDIO_HOME = path.join(root, "home");
  const backend = backendFor("revideokc");
  const paths = await backend.paths("1e1e1e1e-aaaa-4bbb-8ccc-123456789abc", brief.slug);
  job = { tools, paths, home: realpathSync(process.env.HOME ?? "/"), voice: "af_heart" };
  await backend.prepare(job);
  classes = (await backend.scaffold(job, brief, null)).classes;
  await writeFile(paths.sceneFile, SCENE, "utf8");
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
    env: revideokcEnv("render", { ...job, tools, base: readPorts(job.paths) }),
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

describe("the revideokc sandbox", () => {
  it("blocks every probe of a hostile scene's node in the render profile", async (context) => {
    if (skip !== "") return context.skip(skip);
    const base = readPorts(job.paths);
    const targets = { home: job.home, root: tools.revideokc.root, nodeModules: tools.revideokc.nodeModules, render: job.paths.render, otherPort: base + 2 };
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
      const result = spawnSync(job.paths.wrapper, ["api", "clock"], { env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", fd, fd], timeout: 120_000 });
      const text = readFileSync(out, "utf8");
      expect(result.status, text.slice(-1500)).toBe(0);
      expect(text).toContain("lib/clock.ts");
      expect(text).not.toContain("Native stack trace");
    } finally {
      closeSync(fd);
      if (callsBefore === null) rmSync(job.paths.calls, { force: true });
      else writeFileSync(job.paths.calls, callsBefore);
    }
  });

  it("runs the job's still and build through its wrapper, narration and sidecars in their profile, and the gate passes the result", async (context) => {
    if (skip !== "") return context.skip(skip);
    const { paths } = job;
    const own = revideokcPaths(paths);
    const startedAtMs = Date.now() - 1_000;
    const before = snapshot(paths.job);
    const env = { PATH: "/usr/bin:/bin", HOME: job.home, NODE_OPTIONS: "--require /nowhere.js", ANTHROPIC_API_KEY: "sk-not-for-the-job" };
    // The Vite servers (one per worker, the pair) are watched from outside while the still and the build run (lan-probe.ts).
    const lan = lanAddress();
    const base = readPorts(paths);
    const watch = lan === null ? null : watchPorts([base, base + 1], lan);
    const still = await execFileAsync(paths.wrapper, ["still"], { env, timeout: 600_000 }).catch((error: { stderr?: string; code?: number }) => error);
    expect((still as { code?: number }).code ?? 0, (still as { stderr?: string }).stderr?.slice(-1500)).toBe(0);
    const built = await execFileAsync(paths.wrapper, ["build"], { env, timeout: 600_000 }).catch((error: { stderr?: string; code?: number }) => error);
    lanWatch = watch === null ? null : await watch.stop();
    expect((built as { code?: number }).code ?? 0, (built as { stderr?: string }).stderr?.slice(-1500)).toBe(0);

    const calls = await readCalls(paths.calls);
    expect(calls.map((call) => [call.verb, call.exitCode, (call.steps ?? []).map((step) => step.step)])).toEqual([
      ["still", 0, ["narrate", "render"]],
      ["build", 0, ["narrate", "render", "sidecars"]],
    ]);
    expect(calls[0]!.rendered).toEqual(classes);
    expect(calls[1]!.deliverable).toEqual({ written: true });
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
        { path: own.stillsSheet, at: new Date(Date.parse(calls[0]!.endedAt) + 10).toISOString() },
        { path: own.buildSheet, at: new Date(Date.parse(calls[1]!.endedAt) + 10).toISOString() },
      ],
      tools: backendFor("revideokc").gateTools(job),
      backend: backendFor("revideokc"),
    });
    expect(gate.findings).toEqual([]);
    expect(gate.ok).toBe(true);
    expect(existsSync(paths.poster)).toBe(true);

    // After a verdict the final lines' clips are kept, by their gnosia-audio keys.
    await backendFor("revideokc").keepClips(job);
    expect((await readdir(paths.clips)).filter((name) => name.endsWith(".wav"))).toHaveLength(2);
  }, 900_000);

  it("never lets a Vite server be reached on the machine's LAN address, only on loopback", (context) => {
    if (skip !== "") return context.skip(skip);
    if (lanAddress() === null) return context.skip("this machine has no non-loopback IPv4 address to try the Vite servers on");
    // Revideo starts Vite on "localhost"; this holds it to that, since the
    // profile's localhost rule does not stop a LAN connection to a wildcard listen.
    expect(lanWatch, "the still and build case did not run").not.toBeNull();
    expect(lanWatch!.loopbackUp, "no Vite server ever answered on loopback, so the LAN check proves nothing").toBeGreaterThan(0);
    expect(lanWatch!.lanReached).toEqual([]);
  });
});
