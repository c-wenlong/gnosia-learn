import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { until } from "./wait";

/**
 * A video job whose tools die as they start (V26 of docs/STUDIO-VIDEOS.md),
 * end to end through the runner: a stand-in `claude` that calls the job's
 * wrapper over and over the way the 2026-10-03 job did, a wrapper whose every
 * step is killed as it starts, and the runner stopping the session after the
 * third call, failing the job as `toolchain` with its cost, running no gate
 * and no second attempt, and telling the doctor.
 *
 * The backend is manimkc's with the parts that need a real manimkc replaced:
 * no checkout is built and nothing is sandboxed, since what is under test is
 * the runner's reading of the wrapper's log, not the tools.
 */

// `config.ts` reads the CLI's path once, at import: never the real `claude`.
vi.hoisted(() => {
  process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude-until-the-fake-is-ready";
});

/** Ten wrapper calls, one every 150 ms, then half a minute of silence: a session the runner has to stop. */
const FAKE = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const here = path.dirname(process.argv[1]);
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(here, "spawns"), "x");
const job = path.dirname(argv[argv.indexOf("--settings") + 1]);
const wrapper = path.join(job, "bin", "video");
const session = argv.includes("--resume") ? argv[argv.indexOf("--resume") + 1] : argv[argv.indexOf("--session-id") + 1];
const out = (event) => process.stdout.write(JSON.stringify(event) + "\n");
out({ type: "system", subtype: "init", session_id: session, tools: ["Bash"], mcp_servers: [], model: "claude-sonnet-5", apiKeySource: "none" });
const usage = { input_tokens: 10, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 50 };
let n = 0;
const turn = () => {
  if (n >= 10) return;
  n += 1;
  const id = "toolu_" + n;
  out({ type: "stream_event", event: { type: "message_start", message: { id: "msg_" + n, model: "claude-sonnet-5", usage } } });
  out({ type: "assistant", message: { id: "msg_" + n, model: "claude-sonnet-5", role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: { command: wrapper + " api" } }], usage } });
  const run = spawnSync(wrapper, ["api"], { encoding: "utf8" });
  fs.appendFileSync(path.join(here, "calls"), "x");
  out({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "Exit code " + run.status + "\n" + (run.stderr || ""), is_error: run.status !== 0 }] } });
  setTimeout(turn, 150);
};
turn();
setTimeout(() => process.exit(0), 30000);
`;

/** The job's one command, as the real ones record a step that dies starting: no exit code, a signal, a few ms. */
function wrapperFor(calls: string): string {
  return `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const startedAt = new Date().toISOString();
const started = Date.now();
const child = spawnSync(process.execPath, ["-e", "process.kill(process.pid, 'SIGKILL')"], { stdio: ["ignore", "pipe", "pipe"] });
const step = { step: "render", exitCode: child.status, signal: child.signal || null, ms: Date.now() - started };
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ verb: process.argv[2] || "api", scenes: [], names: [], startedAt, endedAt: new Date().toISOString(), exitCode: step.exitCode, steps: [step] }) + "\\n");
process.stderr.write("----- Native stack trace -----\\n 1: node::Start(int, char**)\\n");
process.exitCode = 1;
`;
}

const fakeDir = await mkdtemp(path.join(tmpdir(), "fake-video-claude-"));
await writeFile(path.join(fakeDir, "claude"), FAKE, "utf8");
await chmod(path.join(fakeDir, "claude"), 0o755);
process.env.STUDIO_CLAUDE_BIN = path.join(fakeDir, "claude");

const catalogMock = vi.hoisted(() => ({
  jobEnqueue: vi.fn(),
  jobClaim: vi.fn(),
  jobFinish: vi.fn(),
  jobShow: vi.fn(),
  sessionStart: vi.fn(),
  sessionEnd: vi.fn(),
  videoShow: vi.fn(),
  videoCheckout: vi.fn(),
  preferenceGet: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/catalog")>()), ...catalogMock }));

const gateCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("../src/video/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/video/backend")>();
  const real = actual.backendFor("manimkc");
  const backend: import("../src/video/backend").VideoBackend = {
    ...real,
    problems: () => [],
    async prepare(job) {
      await mkdir(job.paths.topicDir, { recursive: true });
      await mkdir(job.paths.tmp, { recursive: true });
    },
    async scaffold(job) {
      await writeFile(job.paths.sceneFile, "# the scenes\n", "utf8");
      return { prefix: "TB", classes: ["TB1_WhyItMatters", "TB2_Recap"] };
    },
    async wrapper(job) {
      await mkdir(job.paths.bin, { recursive: true });
      await writeFile(job.paths.wrapper, wrapperFor(job.paths.calls), { encoding: "utf8", mode: 0o755 });
      return "the listing";
    },
    settings: () => ({}) as ReturnType<typeof real.settings>,
    prompt: () => "make the video",
    gateTools: () => {
      gateCalls.count += 1;
      throw new Error("the gate ran on a job whose tools never started");
    },
  };
  return { ...actual, backendFor: () => backend };
});

const { CLAUDE_BIN } = await import("../src/config");
if (CLAUDE_BIN !== path.join(fakeDir, "claude")) throw new Error(`the runner would spawn ${CLAUDE_BIN}, not the stand-in`);
const { VideoRunner } = await import("../src/video/runner");
const { RecordStore } = await import("../src/store");
const { silentBrief } = await import("./video-fixture");
type VideoDoctorT = import("../src/video/doctor").VideoDoctor;
type VideoDoctorReportT = import("../src/video/doctor").VideoDoctorReport;
type VideoJobRecordT = import("../src/video/types").VideoJobRecord;
type ToolchainT = import("../src/video/toolchain").Toolchain;

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

let home: string;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME, STUDIO_DAILY_USD: process.env.STUDIO_DAILY_USD, STUDIO_VIDEO_HANG_MS: process.env.STUDIO_VIDEO_HANG_MS };

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "studio-dead-tools-"));
  process.env.STUDIO_HOME = home;
  delete process.env.STUDIO_DAILY_USD;
  delete process.env.STUDIO_VIDEO_HANG_MS;
  await mkdir(path.join(home, "jobs"), { recursive: true });
  for (const mock of Object.values(catalogMock)) mock.mockReset();
  catalogMock.jobEnqueue.mockResolvedValue(ok({ job: {} }));
  catalogMock.jobClaim.mockResolvedValue(ok({ job: {} }));
  catalogMock.jobFinish.mockResolvedValue(ok());
  catalogMock.sessionStart.mockResolvedValue(ok());
  catalogMock.sessionEnd.mockResolvedValue(ok());
  catalogMock.videoShow.mockResolvedValue(ok({ video: null }));
  catalogMock.preferenceGet.mockResolvedValue(ok({ value: null }));
  gateCalls.count = 0;
  await rm(path.join(fakeDir, "spawns"), { force: true });
  await rm(path.join(fakeDir, "calls"), { force: true });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(async () => {
  await rm(fakeDir, { recursive: true, force: true });
});

function doctor() {
  const report: VideoDoctorReportT = { ok: true, sandbox: true, metal: true, kokoro: true, voices: ["af_heart"], checks: [], checkedAt: new Date().toISOString() };
  const noteToolchainStop = vi.fn();
  const stub = { report: async () => report, current: () => report, start: () => undefined, stop: () => undefined, noteToolchainStop };
  return { doctor: stub as unknown as VideoDoctorT, noteToolchainStop };
}

async function count(file: string): Promise<number> {
  return (await readFile(path.join(fakeDir, file), "utf8").catch(() => "")).length;
}

describe("a job whose tools die as they start", () => {
  it("is stopped after the third dead call, failed as toolchain with its cost, with no gate and no retry", async () => {
    const store = new RecordStore<VideoJobRecordT>("video");
    const told = doctor();
    const runner = new VideoRunner(store, { doctor: told.doctor, toolchain: async () => ({ node: process.execPath }) as unknown as ToolchainT });
    const { record } = await runner.enqueue({ ...silentBrief(), idempotencyKey: `dead-${Date.now()}` });
    const startedAt = Date.now();
    await until(() => ["failed", "awaiting_review", "cancelled"].includes(store.get(record.id)?.state ?? ""), () => `the job is still ${store.get(record.id)?.state}`, 20_000);
    await runner.settled(record.id);
    const elapsed = Date.now() - startedAt;

    const done = store.get(record.id)!;
    expect(done.state).toBe("failed");
    expect(done.errorKind).toBe("toolchain");
    expect(done.error).toContain("the render step (in the render sandbox) died as it started in 3 calls in a row (video api, video api, video api)");
    expect(done.error).toContain("killed by SIGKILL");
    expect(done.error).toContain("the machine's problem, not the agent's");
    // The output went to the record and the events, and not into the error the planner reads.
    expect(done.error).not.toContain("Native stack trace");
    expect(done.deadTools?.output).toContain("----- Native stack trace -----");
    expect(done.deadTools?.calls).toHaveLength(3);
    // The session was stopped, not left to its ten calls and its half minute of silence.
    expect(elapsed).toBeLessThan(15_000);
    expect(await count("calls")).toBeLessThan(10);
    expect(await count("calls")).toBeGreaterThanOrEqual(3);
    // One attempt, no gate.
    expect(await count("spawns")).toBe(1);
    expect(gateCalls.count).toBe(0);
    expect(done.gate).toBeNull();
    // The cost of what it did, counted from the stream, since the session was cut before its result.
    expect(done.costUsd).toBeGreaterThan(0);
    expect(done.costSource).toBe("stream");
    expect(catalogMock.jobFinish).toHaveBeenCalledWith(expect.objectContaining({ jobId: record.id, state: "failed", errorKind: "toolchain", costUsd: done.costUsd, costSource: "stream" }));
    // And the doctor was told.
    expect(told.noteToolchainStop).toHaveBeenCalledWith(expect.objectContaining({ jobId: record.id, detail: done.error }));
  });
});
