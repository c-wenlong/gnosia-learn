import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, proposing, type FakeClaude } from "./fake-claude";
import { candidatePath, candidateSvgPath, targetPath, targetSvgPath } from "../src/paths";
import type { JobRecord } from "../src/store";
import { topicListAnswer } from "./vocabulary";
import { until } from "./wait";

/**
 * The draft routes over a real socket: the shapes the web app is built
 * against (docs/STUDIO-CHAT-FIRST.md, "API"), and `draftId` on the job routes.
 */

const fake: FakeClaude = await fakeClaude();
process.env.STUDIO_CLAUDE_BIN = fake.bin;

const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
  diagramList: vi.fn(),
  diagramShow: vi.fn(),
  jobEnqueue: vi.fn(),
  jobClaim: vi.fn(),
  jobFinish: vi.fn(),
  sessionStart: vi.fn(),
  sessionEnd: vi.fn(),
  status: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/catalog")>()),
  ...catalogMock,
}));
const canvasMock = vi.hoisted(() => ({ doctor: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/canvas")>()),
  doctor: canvasMock.doctor,
}));
// No job runs: the queue is not what these routes are about.
const agentMock = vi.hoisted(() => ({ startAgent: vi.fn(() => new Promise(() => undefined)) }));
vi.mock("../src/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/agent")>()),
  startAgent: agentMock.startAgent,
}));

const { createApi } = await import("../src/api");
const { Drafts } = await import("../src/drafts");
const { JobStore } = await import("../src/store");
const { Runner } = await import("../src/runner");
const { Mirrors } = await import("../src/mirrors");

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

const good = {
  intent: "Show how a sender's window reacts to loss.",
  title: "TCP congestion window",
  topic: "tcp-congestion-control",
  slug: "tcp-congestion-window",
  mode: "new",
  elements: [{ label: "Sender" }, { label: "Receiver" }],
  relations: [{ from: "Sender", to: "Receiver" }],
};

let server: Server;
let base: string;
let drafts: InstanceType<typeof Drafts>;
let runner: InstanceType<typeof Runner>;
let store: InstanceType<typeof JobStore>;

const post = (route: string, body: unknown) =>
  fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-drafts-api-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  await fake.script([]);
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  catalogMock.diagramShow.mockReset().mockResolvedValue(ok({ diagram: null }));
  for (const fn of [catalogMock.jobEnqueue, catalogMock.jobClaim, catalogMock.jobFinish, catalogMock.sessionStart, catalogMock.sessionEnd, catalogMock.status]) {
    fn.mockReset().mockResolvedValue(ok());
  }
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  store = new JobStore();
  runner = new Runner(store);
  drafts = new Drafts(store, runner);
  runner.extraSpend = () => drafts.spendEntries();
  server = createApi({ store, runner, mirrors: new Mirrors(), drafts });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await drafts.drain();
  await runner.drain();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

afterAll(async () => {
  await fake.cleanup();
});

/** Read an SSE response until `done` holds on what arrived, then stop. */
async function readEvents(route: string, done: (text: string) => boolean): Promise<string> {
  const controller = new AbortController();
  const response = await fetch(`${base}${route}`, { signal: controller.signal });
  const reader = response.body!.getReader();
  let text = "";
  const deadline = Date.now() + 5_000;
  while (!done(text) && Date.now() < deadline) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    text += new TextDecoder().decode(value);
  }
  controller.abort();
  return text;
}

describe("the draft routes", () => {
  it("create, talk, read, follow and draw, in the shapes of the API table", async () => {
    await fake.script([{ text: proposing(good), cost: 0.02 }]);
    const created = await post("/api/drafts", { idempotencyKey: "k" });
    expect(created.status).toBe(201);
    const { draftId, state, note } = (await created.json()) as { draftId: string; state: string; note: string };
    expect(state).toBe("open");
    expect(note).toEqual(expect.any(String));
    expect((await post("/api/drafts", { idempotencyKey: "k" })).status).toBe(200);

    const sent = await post(`/api/drafts/${draftId}/messages`, { text: "draw the congestion window" });
    expect(sent.status).toBe(202);
    expect(await sent.json()).toMatchObject({ draftId, seq: 2, note: expect.any(String) });
    await drafts.settled(draftId);

    const read = (await (await fetch(`${base}/api/drafts/${draftId}`)).json()) as Record<string, unknown>;
    expect(read).toMatchObject({
      draftId,
      kind: "diagram",
      state: "briefed",
      source: null,
      title: "TCP congestion window",
      pendingTopic: null,
      jobId: null,
      turns: 1,
      turnCap: expect.any(Number),
      costUsd: 0.02,
      costSource: "result",
      inFlight: false,
      error: null,
      note: expect.any(String),
    });
    expect((read.transcript as { role: string }[]).map((entry) => entry.role)).toEqual(["person", "planner"]);

    const list = (await (await fetch(`${base}/api/drafts?state=briefed`)).json()) as { drafts: Record<string, unknown>[] };
    expect(list.drafts).toEqual([
      { draftId, kind: "diagram", state: "briefed", title: "TCP congestion window", source: null, turns: 1, costUsd: 0.02, updated: expect.any(String), jobId: null },
    ]);

    // Replay from the start carries ids; ?after skips what the client has.
    const all = await readEvents(`/api/drafts/${draftId}/events`, (text) => text.includes("event: brief\n"));
    expect(all).toContain("id: 2\nevent: message\n");
    expect(all).toMatch(/id: 3\nevent: reply\n/);
    expect(all).toMatch(/event: brief\ndata: \{"seq":4,"replySeq":3,"brief":/);
    const later = await readEvents(`/api/drafts/${draftId}/events?after=3`, (text) => text.includes("event: brief\n"));
    expect(later).not.toContain("event: message");

    const drawn = await post(`/api/drafts/${draftId}/draw`, { idempotencyKey: "press" });
    expect(drawn.status).toBe(201);
    const body = (await drawn.json()) as { jobId: string; state: string };
    expect(body.state).toBe("drawing");
    const job = (await (await fetch(`${base}/api/jobs/${body.jobId}`)).json()) as { draftId: string };
    expect(job.draftId).toBe(draftId);
    // A second press with the same key is the same job.
    const again = await post(`/api/drafts/${draftId}/draw`, { idempotencyKey: "press" });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { jobId: string }).jobId).toBe(body.jobId);
    // Talking while it draws is refused.
    const busy = await post(`/api/drafts/${draftId}/messages`, { text: "and?" });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ error: expect.any(String), detail: { reason: "drawing" } });
    // Parked on the agent, which never answers, so the teardown does not race the job's own writes.
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the job never reached its agent");
  });

  it("refuses what the table refuses, in the { error, detail } envelope", async () => {
    expect((await fetch(`${base}/api/drafts/nope`)).status).toBe(404);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    const draw = await post(`/api/drafts/${draftId}/draw`, { idempotencyKey: "x" });
    expect(draw.status).toBe(409);
    expect(await draw.json()).toMatchObject({ detail: { reason: "not-briefed", state: "open" } });
    expect((await post(`/api/drafts/${draftId}/messages`, { text: "" })).status).toBe(400);

    // POST /api/jobs with a draftId only for a briefed draft.
    const job = await post("/api/jobs", { ...good, idempotencyKey: "j", draftId });
    expect(job.status).toBe(409);
    expect(await job.json()).toMatchObject({ detail: { reason: "not-briefed" } });

    const abandoned = await post(`/api/drafts/${draftId}/abandon`, {});
    expect(abandoned.status).toBe(200);
    expect(await abandoned.json()).toMatchObject({ draftId, state: "abandoned" });
    expect((await post(`/api/drafts/${draftId}/messages`, { text: "hi" })).status).toBe(409);
  });

  it("refuses a job naming a draft while its planner is answering", async () => {
    await fake.script([{ text: proposing(good) }, { text: "still thinking", hangMs: 500 }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, { text: "draw it" });
    await drafts.settled(draftId);
    expect(drafts.get(draftId)?.state).toBe("briefed");
    await post(`/api/drafts/${draftId}/messages`, { text: "one more thing" });
    const job = await post("/api/jobs", { ...good, idempotencyKey: "j2", draftId });
    expect(job.status).toBe(409);
    expect(await job.json()).toMatchObject({ detail: { reason: "in-flight" } });
    await drafts.settled(draftId);
  });

  it("counts the planner's turns in health", async () => {
    await fake.script([{ text: "which one?", cost: 0.03 }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, { text: "hello" });
    await drafts.settled(draftId);
    const health = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
    expect(health.plannerTurnsLast24h).toBe(1);
    expect(health.plannerCostLast24h).toBeCloseTo(0.03, 6);
    expect(health.costLast24h).toBeCloseTo(0.03, 6);
  });
});

describe("resume and revise carry the draft", () => {
  it("a resumed interrupted job is the draft's newest, and the draft follows it", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, { text: "draw it" });
    await drafts.settled(draftId);

    // The draft's job, as the runner's reconcile leaves it after a restart.
    const jobId = "job-interrupted";
    const at = new Date().toISOString();
    await store.create({
      id: jobId,
      kind: "diagram",
      state: "interrupted",
      phase: "drawing",
      brief: { ...good, concepts: [], model: "sonnet", idempotencyKey: "parent-key" },
      targetPath: targetPath(good.slug),
      targetSvgPath: targetSvgPath(good.slug),
      candidatePath: candidatePath(jobId, good.slug),
      candidateSvgPath: candidateSvgPath(jobId, good.slug),
      topic: good.topic,
      slug: good.slug,
      attempt: 1,
      sessionId: `studio-${jobId}`,
      agentSessionId: "77777777-7777-4777-8777-777777777777",
      parentJobId: null,
      draftId,
      changes: null,
      idempotencyKey: "parent-key",
      targetHashBefore: null,
      requestedAt: at,
      startedAt: at,
      finishedAt: at,
      reviewedAt: null,
      heartbeatAt: null,
      cancelRequestedAt: null,
      exitCode: null,
      turns: null,
      costUsd: null,
      costSource: null,
      gate: null,
      errorKind: "interrupted",
      error: "the runner died while this job was running",
      written: [],
      indexed: false,
      catalogErrors: [],
    } as JobRecord);
    await drafts.markDrawing(draftId, jobId);
    await drafts.settled(draftId);
    expect(drafts.get(draftId)?.state).toBe("briefed");

    const resumed = await post(`/api/jobs/${jobId}/resume`, {});
    expect(resumed.status).toBe(201);
    const next = ((await resumed.json()) as { jobId: string }).jobId;
    expect(store.get(next)?.draftId).toBe(draftId);
    expect(drafts.get(draftId)).toMatchObject({ state: "drawing", jobIds: [jobId, next] });
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the resumed job never reached its agent");
  });
});
