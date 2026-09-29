import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateBrief, type ValidBrief } from "../src/brief";
import { ManualSource } from "../src/manual/source";
import { manualPath, targetPath, targetSvgPath, candidatePath, candidateSvgPath } from "../src/paths";
import type { RunResult } from "../src/proc";
import type { JobRecord } from "../src/store";

import { allSettled, until } from "./wait";
import { testVocabulary } from "./vocabulary";

/**
 * Which manual a job's agent is handed, attempt by attempt (M1 of
 * docs/STUDIO-CHAT-FIRST.md).
 *
 * The CLI replays the system prompt it recorded on a session's first request
 * whenever that session is resumed, so an attempt two that was handed a newer
 * manual would still read the old one, and the record would name the wrong
 * one. The runner therefore decides the manual once per job, records it as
 * `manualHash`, and passes that same file on every attempt. The agent, the
 * gate and the catalog are stubbed; the manual source is real, fed a scripted
 * `api --json`.
 */

const catalogMock = vi.hoisted(() => ({
  jobEnqueue: vi.fn(),
  jobClaim: vi.fn(),
  jobFinish: vi.fn(),
  sessionStart: vi.fn(),
  sessionEnd: vi.fn(),
  diagramShow: vi.fn(async () => ({ ok: false, json: null, error: "unreachable", offline: true })),
  diagramCheckout: vi.fn(async () => ({ ok: false, json: null, error: "unreachable", offline: true })),
}));
vi.mock("../src/catalog", () => catalogMock);

const gateMock = vi.hoisted(() => ({ runGate: vi.fn(), narrate: vi.fn(() => "a step") }));
vi.mock("../src/gate", () => gateMock);

const reviewMock = vi.hoisted(() => ({ dirtyFiles: vi.fn(async () => [] as string[]) }));
vi.mock("../src/review", () => reviewMock);

const agentMock = vi.hoisted(() => ({
  startAgent: vi.fn(),
  sweepOrphans: vi.fn(async () => [] as number[]),
  AgentRun: class {},
}));
vi.mock("../src/agent", () => agentMock);

const { Runner } = await import("../src/runner");
const { JobStore } = await import("../src/store");

const FIXTURE = path.join(import.meta.dirname, "fixtures", "api.json");
const SLUG = "studio-manual-runner-fixture";
const ok = { ok: true, json: {}, error: null, offline: false };

const outcome = {
  exitCode: 0,
  signal: null,
  turns: 9,
  subtype: "success",
  isError: false,
  result: null,
  apiKeySource: null,
  spawnFailed: false,
  denials: [],
  stopReason: null,
  stderr: "",
};

function gate(passed: boolean): Record<string, unknown> {
  return {
    ok: passed,
    steps: [],
    findings: passed ? [] : ["vector b is missing"],
    shapes: 4,
    lints: 0,
    svg: null,
    exportFailed: false,
    checkedAt: new Date().toISOString(),
  };
}

async function brief(): Promise<ValidBrief> {
  return validateBrief(
    {
      intent: "show a dot product",
      topic: "vector-and-linear-algebra-basics",
      slug: SLUG,
      title: "Dot product",
      mode: "new",
      elements: [{ label: "vector a" }, { label: "vector b" }],
      relations: [],
      idempotencyKey: `key-${Math.random()}`,
    },
    testVocabulary(),
  );
}

/** Every `startAgent` call's options, oldest first. */
const spawns = (): Record<string, unknown>[] =>
  agentMock.startAgent.mock.calls.map((call) => call[0] as Record<string, unknown>);

let store: InstanceType<typeof JobStore>;
let runner: InstanceType<typeof Runner>;
let apiOutput: string;

function newBuild(): void {
  const raw = JSON.parse(apiOutput) as Record<string, unknown>[];
  raw.push({ name: `extra${raw.length}`, kind: "function", path: "x", signature: `extra${raw.length}(): void`, summary: "Added by a rebuild.", examples: ["helpers.extra()"], params: [] });
  apiOutput = JSON.stringify(raw);
}

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-manual-runner-${Date.now()}-${Math.random()}`);
  for (const fn of Object.values(catalogMock)) fn.mockReset().mockResolvedValue(ok);
  gateMock.runGate.mockReset().mockResolvedValue(gate(true));
  reviewMock.dirtyFiles.mockReset().mockResolvedValue([]);
  agentMock.startAgent.mockReset().mockImplementation(async () => ({ done: Promise.resolve(outcome), stop: async () => undefined }));
  agentMock.sweepOrphans.mockReset().mockResolvedValue([]);
  apiOutput = await readFile(FIXTURE, "utf8");
  store = new JobStore();
  runner = new Runner(store);
  runner.manual = new ManualSource({
    api: async (): Promise<RunResult> => ({ code: 0, signal: null, stdout: apiOutput, stderr: "", json: JSON.parse(apiOutput), timedOut: false }),
    log: () => undefined,
  });
  await runner.manual.refresh();
});

afterEach(async () => {
  await runner.drain();
  await allSettled(runner, store);
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

describe("the manual a job runs with", () => {
  it("is recorded as manualHash and handed to the spawn as that hash's file", async () => {
    const hash = runner.manual?.current()?.hash ?? "";
    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    expect(store.get(record.id)?.manualHash).toBe(hash);
    expect(spawns()[0]?.manualPath).toBe(manualPath(hash));
    // The prompt stops sending the agent to `canvas api` first.
    expect(String(spawns()[0]?.prompt)).toContain("The tldraw manual in your system prompt");
    // And job.json carries it, beside agentAuth.
    const onDisk = JSON.parse(await readFile(path.join(process.env.STUDIO_HOME ?? "", "jobs", record.id, "job.json"), "utf8")) as JobRecord;
    expect(onDisk.manualHash).toBe(hash);
    expect(onDisk.agentAuth).toBe("login");
  });

  it("is refreshed at enqueue, so a job queued after a rebuild gets the new build's manual", async () => {
    const before = runner.manual?.current()?.hash;
    newBuild();
    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);
    expect(store.get(record.id)?.manualHash).not.toBe(before);
    expect(store.get(record.id)?.manualHash).toBe(runner.manual?.current()?.hash);
  });

  it("stays the one it started with on attempts two and three, when the build changes in between", async () => {
    // The gate fails the first two attempts, and a rebuild lands during each.
    gateMock.runGate
      .mockImplementationOnce(async () => {
        newBuild();
        await runner.manual?.refresh();
        return gate(false);
      })
      .mockImplementationOnce(async () => {
        newBuild();
        await runner.manual?.refresh();
        return gate(false);
      })
      .mockResolvedValue(gate(true));
    const started = runner.manual?.current()?.hash ?? "";
    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    expect(spawns()).toHaveLength(3);
    expect(runner.manual?.current()?.hash).not.toBe(started);
    for (const spawn of spawns()) expect(spawn.manualPath).toBe(manualPath(started));
    expect(spawns().map((spawn) => spawn.resume)).toEqual([false, true, true]);
    expect(store.get(record.id)?.manualHash).toBe(started);
  });

  it("is the parent's for a revision that continues the parent's session", async () => {
    const parentHash = "f".repeat(64);
    const at = new Date(Date.now() - 60_000).toISOString();
    const b = await brief();
    await store.create({
      id: "parent-manual",
      kind: "diagram",
      state: "failed",
      phase: null,
      brief: b,
      targetPath: targetPath(SLUG),
      targetSvgPath: targetSvgPath(SLUG),
      candidatePath: candidatePath("parent-manual", SLUG),
      candidateSvgPath: candidateSvgPath("parent-manual", SLUG),
      topic: b.topic,
      slug: SLUG,
      attempt: 3,
      sessionId: "studio-parent-manual",
      agentSessionId: "12121212-1212-4212-8212-121212121212",
      parentJobId: null,
      changes: null,
      idempotencyKey: "parent-manual-key",
      targetHashBefore: null,
      requestedAt: at,
      startedAt: at,
      finishedAt: at,
      reviewedAt: null,
      heartbeatAt: null,
      cancelRequestedAt: null,
      exitCode: 0,
      turns: 9,
      costUsd: null,
      costSource: null,
      manualHash: parentHash,
      gate: null,
      errorKind: "gate",
      error: "x",
      written: [],
      indexed: false,
      catalogErrors: [],
    });
    const { record } = await runner.enqueue(await brief(), {
      jobId: "parent-manual",
      agentSessionId: "12121212-1212-4212-8212-121212121212",
      changes: "make it bigger",
    });
    await runner.settled(record.id);
    expect(store.get(record.id)?.manualHash).toBe(parentHash);
    expect(spawns()[0]?.manualPath).toBe(manualPath(parentHash));
  });

  it("is the newest for a revision whose parent kept no session to continue", async () => {
    const { record } = await runner.enqueue(await brief(), { jobId: "no-such-parent", agentSessionId: null, changes: "x" });
    await runner.settled(record.id);
    expect(store.get(record.id)?.manualHash).toBe(runner.manual?.current()?.hash);
  });

  it("is none on a runner without a manual source, and the prompt still sends the agent to canvas api", async () => {
    runner.manual = null;
    const { record } = await runner.enqueue(await brief());
    await until(() => spawns().length > 0, "the agent never started");
    await runner.settled(record.id);
    expect(store.get(record.id)?.manualHash).toBeNull();
    expect(spawns()[0]?.manualPath).toBeNull();
    expect(String(spawns()[0]?.prompt)).toContain("npm run --silent canvas -- api");
  });
});
