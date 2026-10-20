import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, proposing, type FakeClaude } from "./fake-claude";
import { candidatePath, candidateSvgPath, draftJsonPath, targetPath, targetSvgPath } from "../src/paths";
import type { JobRecord } from "../src/data/store";
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
  conceptShow: vi.fn(),
  // A job resolves its model and effort through `catalog preference get`
  // before it reaches its agent (`resolveDiagramAgent`). Left to the real
  // module, that was an npm, tsx and Postgres start against the owner's own
  // database on every job, 0.7 s on a quiet machine and over 5 s under a
  // loaded `npm test`, which is what "the job never reached its agent" timed.
  preferenceGet: vi.fn(),
}));
/** Catalog verbs this file reached without mocking them, by name. See the `afterEach`. */
const unmocked = vi.hoisted(() => [] as string[]);
vi.mock("../src/data/catalog", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/data/catalog")>();
  // Every verb is a CLI spawn, so one this file did not mock is a stand-in
  // that records its name and answers "offline", never the real catalog.
  const standIns = Object.fromEntries(
    Object.entries(real)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => [
        name,
        async () => {
          unmocked.push(name);
          return { ok: false, json: null, error: `catalog ${name} is not mocked in drafts-api.test.ts`, offline: true };
        },
      ]),
  );
  return { ...real, ...standIns, ...catalogMock };
});
const canvasMock = vi.hoisted(() => ({ doctor: vi.fn() }));
vi.mock("../src/canvas/canvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/canvas/canvas")>()),
  doctor: canvasMock.doctor,
}));
// No job runs: the queue is not what these routes are about.
const agentMock = vi.hoisted(() => ({ startAgent: vi.fn(() => new Promise(() => undefined)) }));
vi.mock("../src/agent/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/agent/agent")>()),
  startAgent: agentMock.startAgent,
}));

const { createApi } = await import("../src/api");
const { Drafts } = await import("../src/drafts/drafts");
const { JobStore } = await import("../src/data/store");
const { Runner } = await import("../src/diagram/runner");
const { Mirrors } = await import("../src/canvas/mirrors");

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

/** The variable as the run found it, put back after each test. */
const savedConfigDir = process.env.CLAUDE_CONFIG_DIR;

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
  catalogMock.conceptShow.mockReset().mockResolvedValue(ok({ id: "dot-product", title: "The dot product" }));
  catalogMock.preferenceGet.mockReset().mockResolvedValue(ok({ value: null }));
  // The other half of the same resolution: the owner's Claude Code defaults,
  // read from a settings file that does not exist rather than theirs.
  process.env.CLAUDE_CONFIG_DIR = path.join(process.env.STUDIO_HOME, "claude-config");
  unmocked.length = 0;
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
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  // A verb nobody mocked is a test timing a real CLI and reading the owner's
  // database: mock it in `catalogMock` above.
  expect(unmocked).toEqual([]);
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

/** A message tagged Diagram (D57), as the composer sends one: the chip first. */
const tagged = (text: string) => ({ text: `@diagram ${text}`, mentions: [{ kind: "diagram", start: 0, end: 8 }] });

describe("the draft routes", () => {
  it("open a conversation on a concept from the tutor, in the shapes of docs/STUDIO-TUTOR-HANDOFF.md", async () => {
    const concept = { slug: "dot-product", title: "The dot product", summary: "Parts multiplied and added.", body: "# The dot product\n\nA note." };
    const tutor = [
      { role: "user", content: "What is it for?" },
      { role: "assistant", content: "Measuring how far two vectors agree." },
    ];
    const created = await post("/api/drafts", { concept, tutor, idempotencyKey: "tutor-k" });
    expect(created.status).toBe(201);
    const answer = (await created.json()) as { draftId: string; note: string };
    expect(answer.note).toBe("a conversation about the concept dot-product");
    const read = (await (await fetch(`${base}/api/drafts/${answer.draftId}`)).json()) as Record<string, unknown>;
    expect(read.concept).toEqual({ slug: "dot-product", title: "The dot product", topic: "vector-and-linear-algebra-basics", tutorTurns: 2 });
    expect(read.source).toBeNull();
    const list = (await (await fetch(`${base}/api/drafts`)).json()) as { drafts: Record<string, unknown>[] };
    expect(list.drafts.find((row) => row.draftId === answer.draftId)?.concept).toEqual({ slug: "dot-product", title: "The dot product" });

    const refused = async (body: unknown): Promise<{ status: number; field: unknown }> => {
      const response = await post("/api/drafts", body);
      const json = (await response.json()) as { detail?: { field?: unknown } };
      return { status: response.status, field: json.detail?.field };
    };
    expect(await refused({ concept, source: "some-diagram" })).toEqual({ status: 400, field: "concept" });
    expect(await refused({ concept, tutor: Array.from({ length: 7 }, () => tutor[0]) })).toEqual({ status: 400, field: "tutor" });
    expect(await refused({ concept: { ...concept, slug: "a/../b" } })).toEqual({ status: 400, field: "concept.slug" });
    expect(await refused({ tutor })).toEqual({ status: 400, field: "tutor" });
  });

  it("create, talk, read, follow and draw, in the shapes of the API table", async () => {
    await fake.script([{ text: proposing(good), cost: 0.02 }]);
    const created = await post("/api/drafts", { idempotencyKey: "k" });
    expect(created.status).toBe(201);
    const { draftId, state, note } = (await created.json()) as { draftId: string; state: string; note: string };
    expect(state).toBe("open");
    expect(note).toEqual(expect.any(String));
    expect((await post("/api/drafts", { idempotencyKey: "k" })).status).toBe(200);

    const sent = await post(`/api/drafts/${draftId}/messages`, tagged("draw the congestion window"));
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
      { draftId, kind: "diagram", kinds: ["diagram"], state: "briefed", title: "TCP congestion window", name: null, firstMessage: expect.any(String), source: null, concept: null, turns: 1, costUsd: 0.02, updated: expect.any(String), jobId: null },
    ]);

    // Replay from the start carries ids; ?after skips what the client has.
    const all = await readEvents(`/api/drafts/${draftId}/events`, (text) => text.includes("event: brief\n"));
    expect(all).toContain("id: 2\nevent: message\n");
    expect(all).toMatch(/id: 3\nevent: reply\n/);
    expect(all).toMatch(/event: brief\ndata: \{"seq":4,"replySeq":3,"kind":"diagram","brief":/);
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
    // Talking while it draws is accepted (C14 lifted by D60); the diagram
    // card's press is what is held, by kind.
    const busy = await post(`/api/drafts/${draftId}/draw`, { idempotencyKey: "another" });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ error: "The diagram is still being drawn", detail: { reason: "kind-busy", kind: "diagram", jobId: body.jobId } });
    await fake.script([{ text: "It is drawing now." }]);
    const talk = await post(`/api/drafts/${draftId}/messages`, { text: "and?" });
    expect(talk.status).toBe(202);
    await drafts.settled(draftId);
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

  it("records the brief a POST /api/jobs from a draft draws, so an edit under it is refused (#207 review)", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    const seq = drafts.get(draftId)!.slots!.diagram!.briefSeq!;
    const job = await post("/api/jobs", { ...good, idempotencyKey: "j-seq", draftId });
    expect(job.status).toBe(201);
    expect(drafts.get(draftId)!.slots!.diagram).toMatchObject({ state: "drawing", drawnSeq: seq });
    const edit = await fetch(`${base}/api/drafts/${draftId}/brief?base=${seq}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...good, title: "Under its job" }),
    });
    expect(edit.status).toBe(409);
    expect(await edit.json()).toMatchObject({ detail: { reason: "drawing" } });
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the job never reached its agent");
  });

  it("refuses a job naming a draft while its planner is answering", async () => {
    await fake.script([{ text: proposing(good) }, { text: "still thinking", hangMs: 500 }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    expect(drafts.get(draftId)?.state).toBe("briefed");
    await post(`/api/drafts/${draftId}/messages`, { text: "one more thing" });
    const job = await post("/api/jobs", { ...good, idempotencyKey: "j2", draftId });
    expect(job.status).toBe(409);
    expect(await job.json()).toMatchObject({ detail: { reason: "in-flight" } });
    await drafts.settled(draftId);
  });

  it("takes a message of any length the body limit allows, and answers a larger body with 413", async () => {
    await fake.script([{ text: "read it all", cost: 0.01 }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    const long = await post(`/api/drafts/${draftId}/messages`, { text: "a pasted spec. ".repeat(2_000) });
    expect(long.status).toBe(202);
    await drafts.settled(draftId);

    const huge = await post(`/api/drafts/${draftId}/messages`, { text: "x".repeat(1_100_000) });
    expect(huge.status).toBe(413);
    expect(((await huge.json()) as { error: string }).error).toMatch(/over 1 MB/);
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

describe("PUT /api/drafts/{id}/brief", () => {
  /** A PUT based on the brief in force, unless `baseSeq` says otherwise (`null` sends none). */
  const put = (route: string, body: unknown, type = "application/json", baseSeq?: string | null) => {
    const current = drafts.get(route.split("/")[3] ?? "");
    const named = baseSeq === undefined ? (current?.brief ? String(current.briefSeq) : "none") : baseSeq;
    const query = named === null ? "" : `?base=${named}`;
    return fetch(`${base}${route}${query}`, { method: "PUT", headers: { "content-type": type }, body: JSON.stringify(body) });
  };

  /** A briefed draft: one turn that proposes `good`. */
  async function briefed(): Promise<string> {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    expect(drafts.get(draftId)?.state).toBe("briefed");
    return draftId;
  }

  const edited = {
    ...good,
    elements: [{ label: "Sender" }, { label: "Server" }],
    relations: [{ from: "Sender", to: "Server", label: "sends segments" }],
  };

  it("stores the edit, shows it as a studio note carrying the brief, tells the planner next turn, and Draw draws it", async () => {
    const draftId = await briefed();
    const response = await put(`/api/drafts/${draftId}/brief`, { ...edited, idempotencyKey: "ignored", mermaid: "flowchart LR\n a-->b" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ draftId, state: "briefed", pendingTopic: null, note: expect.any(String) });
    expect((body.brief as { elements: unknown }).elements).toEqual(edited.elements);
    // Neither the key Draw mints nor the flowchart Draw attaches is stored.
    expect(body.brief).not.toHaveProperty("idempotencyKey");
    expect(body.brief).not.toHaveProperty("mermaid");

    const view = (await (await fetch(`${base}/api/drafts/${draftId}`)).json()) as {
      brief: unknown;
      transcript: { role: string; text: string; brief?: unknown }[];
    };
    expect(view.brief).toEqual(body.brief);
    const last = view.transcript.at(-1)!;
    expect(last.role).toBe("studio");
    expect(last.text).toContain('element 2: "Receiver" -> "Server"');
    expect(last.text).toContain("arrow added: Sender -> Server (sends segments)");
    expect(last.brief).toEqual(body.brief);
    const stream = await readEvents(`/api/drafts/${draftId}/events?after=4`, (text) => text.includes("event: brief\n"));
    expect(stream).toMatch(/event: studio\n/);
    expect(stream).toMatch(/event: brief\ndata: \{"seq":\d+,"replySeq":\d+,"kind":"diagram","brief":/);

    // The planner's next turn opens with the edit and the brief now in force.
    await fake.script([{ text: "Noted: Server it is." }]);
    await post(`/api/drafts/${draftId}/messages`, { text: "looks right?" });
    await drafts.settled(draftId);
    const [prompt] = await fake.prompts();
    expect(prompt).toContain("-----BEGIN STUDIO-----");
    expect(prompt).toContain('element 2: "Receiver" -> "Server"');
    expect(prompt).toContain("This is the brief in force");
    expect(prompt!.indexOf("-----END STUDIO-----")).toBeLessThan(prompt!.indexOf("looks right?"));
    // A reply with no brief leaves the draft open, and the edit is still the brief on record.
    expect((drafts.get(draftId)?.brief as { elements?: unknown } | null)?.elements).toEqual(edited.elements);

    // An open draft takes an edit too, and is briefed again; Draw sends the edited labels to the job.
    const again = await put(`/api/drafts/${draftId}/brief`, edited);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { state: string }).state).toBe("briefed");
    const drawn = await post(`/api/drafts/${draftId}/draw`, { idempotencyKey: "press" });
    expect(drawn.status).toBe(201);
    const { jobId } = (await drawn.json()) as { jobId: string };
    expect(store.get(jobId)?.brief.elements.map((element) => element.label)).toEqual(["Sender", "Server"]);
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the job never reached its agent");

    // While it draws, the brief is not the person's to change.
    const busy = await put(`/api/drafts/${draftId}/brief`, good);
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ detail: { reason: "drawing" } });
  });

  it("changes nothing for an identical brief", async () => {
    const draftId = await briefed();
    const before = (await drafts.view(draftId)).transcript.length;
    const { brief } = await drafts.view(draftId);
    const response = await put(`/api/drafts/${draftId}/brief`, brief);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ note: "the brief is unchanged" });
    expect((await drafts.view(draftId)).transcript).toHaveLength(before);
    expect(drafts.get(draftId)?.undelivered).toEqual([]);
  });

  it("refuses what validateBrief refuses, names the field, and keeps the brief", async () => {
    const draftId = await briefed();
    const bad = await put(`/api/drafts/${draftId}/brief`, { ...good, relations: [{ from: "Sender", to: "Relay" }] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: expect.stringContaining("Relay"), detail: { field: "relations[0].to" } });
    const topic = await put(`/api/drafts/${draftId}/brief`, { ...good, topic: "no-such-topic" });
    expect(await topic.json()).toMatchObject({ detail: { field: "topic" } });
    const array = await put(`/api/drafts/${draftId}/brief`, [good]);
    expect(array.status).toBe(400);
    expect(await array.json()).toMatchObject({ error: "the request body must be a JSON object" });
    // A PUT body is JSON or it is refused before any route, as a POST's is.
    expect((await put(`/api/drafts/${draftId}/brief`, good, "text/plain")).status).toBe(403);
    expect((drafts.get(draftId)?.brief as { elements?: unknown } | null)?.elements).toEqual(good.elements);
    expect((await put("/api/drafts/nope/brief", good)).status).toBe(404);
  });

  it("refuses while a turn is in flight, and on a closed conversation", async () => {
    const draftId = await briefed();
    await fake.script([{ text: "thinking", hangMs: 500 }]);
    await post(`/api/drafts/${draftId}/messages`, { text: "one more thing" });
    const during = await put(`/api/drafts/${draftId}/brief`, edited);
    expect(during.status).toBe(409);
    expect(await during.json()).toMatchObject({ detail: { reason: "in-flight" } });
    await drafts.settled(draftId);
    await post(`/api/drafts/${draftId}/abandon`, {});
    const closed = await put(`/api/drafts/${draftId}/brief`, edited);
    expect(closed.status).toBe(409);
    expect(await closed.json()).toMatchObject({ detail: { reason: "abandoned" } });
  });

  it("lists drafts by several states at once, with the first message for a row that has no title", async () => {
    await fake.script([{ text: "Which protocol?" }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, { text: `  Show   how ${"a very long message ".repeat(10)}` });
    await drafts.settled(draftId);
    const briefedId = await briefed();
    const list = (await (await fetch(`${base}/api/drafts?state=open,briefed`)).json()) as { drafts: Record<string, unknown>[] };
    expect(list.drafts.map((row) => row.draftId).sort()).toEqual([draftId, briefedId].sort());
    const open = list.drafts.find((row) => row.draftId === draftId)!;
    expect(open.title).toBeNull();
    expect(open.firstMessage).toMatch(/^Show how a very long message/);
    expect((open.firstMessage as string).length).toBeLessThanOrEqual(120);
    expect(open.firstMessage).toMatch(/…$/);
    expect(list.drafts.find((row) => row.draftId === briefedId)?.firstMessage).toBe("@diagram draw it");
    const onlyOpen = (await (await fetch(`${base}/api/drafts?state=open`)).json()) as { drafts: unknown[] };
    expect(onlyOpen.drafts).toHaveLength(1);

    // Conversations never started are filtered before the limit, so they cannot crowd out real ones.
    for (let i = 0; i < 3; i += 1) await post("/api/drafts", {});
    const crowded = (await (await fetch(`${base}/api/drafts?state=open,briefed&limit=2`)).json()) as { drafts: { turns: number }[] };
    expect(crowded.drafts.every((row) => row.turns === 0)).toBe(true);
    const started = (await (await fetch(`${base}/api/drafts?state=open,briefed&nonEmpty=1&limit=2`)).json()) as {
      drafts: { draftId: string }[];
    };
    expect(started.drafts.map((row) => row.draftId).sort()).toEqual([draftId, briefedId].sort());

    // A page at a time: each page starts after the last row of the one before.
    type Row = { draftId: string; updated: string };
    const page = async (before?: Row) =>
      ((await (
        await fetch(
          `${base}/api/drafts?state=open,briefed&nonEmpty=1&limit=1${before === undefined ? "" : `&before=${encodeURIComponent(before.updated)}&beforeId=${before.draftId}`}`,
        )
      ).json()) as { drafts: Row[] }).drafts;
    const first = await page();
    const second = await page(first[0]);
    const third = await page(second[0]);
    expect([...first, ...second].map((row) => row.draftId)).toEqual(started.drafts.map((row) => row.draftId));
    expect(third).toEqual([]);
  });

  it("searches titles, first messages and concept titles with q, before the cursor and the limit (D87)", async () => {
    const talk = async (text: string): Promise<string> => {
      await fake.script([{ text: "Which one?" }]);
      const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
      await post(`/api/drafts/${draftId}/messages`, { text });
      await drafts.settled(draftId);
      return draftId;
    };
    const ids = async (query: string): Promise<string[]> =>
      ((await (await fetch(`${base}/api/drafts?${query}`)).json()) as { drafts: { draftId: string }[] }).drafts.map((row) => row.draftId);

    const titled = await briefed(); // titled "TCP congestion window", first message "@diagram draw it"
    const slowStart = await talk("Show how TCP slow start works");
    const product = await talk("Explain the dot product");
    const matrix = await talk("  explain   DOT   matrix  notation ");
    const concept = (await (await post("/api/drafts", { concept: { slug: "cosine", title: "Cosine similarity", summary: null, body: null } })).json()) as { draftId: string };
    const turkish = await talk("Plan the İstanbul route");
    const greek = await talk("Η ΟΔΟΣ προς την πόλη");
    const unrelated = await talk("Something else entirely");

    // The title, and the first message of a draft with no brief, in any case.
    expect((await ids("q=tcp")).sort()).toEqual([titled, slowStart].sort());
    expect((await ids("q=%20TCP%20")).sort()).toEqual([titled, slowStart].sort());
    expect(await ids("q=draw%20it")).toEqual([titled]);
    // Spaces in the text and in the search are one space each.
    expect(await ids("q=dot%20%20product")).toEqual([product]);
    expect(await ids("q=DOT")).toEqual([matrix, product]);
    // The title of the concept a hand-off opened it on, which has no turn yet.
    expect(await ids("q=cosine")).toEqual([concept.draftId]);
    expect(await ids("q=cosine&nonEmpty=1")).toEqual([]);
    expect(await ids("q=nothing-says-this")).toEqual([]);
    // A character is lower-cased on its own, as the web app marks it: "İ" is "i" and a combining dot.
    expect(await ids("q=%C4%B0stanbul")).toEqual([turkish]);
    expect(await ids("q=stanbul")).toEqual([turkish]);
    // A Greek final sigma is the ordinary one to the search, whichever way it is typed.
    expect(await ids("q=%CE%BF%CE%B4%CE%BF%CF%82")).toEqual([greek]); // οδος
    expect(await ids("q=%CE%BF%CE%B4%CE%BF%CF%83")).toEqual([greek]); // οδοσ
    // Blank is no search, and the other filters still apply with it.
    expect(await ids("q=%20%20")).toEqual(await ids(""));
    expect(await ids("q=tcp&state=briefed")).toEqual([titled]);

    // Applied before the limit: the newest draft does not match, and the page is still a page of matches.
    expect((await ids("limit=1"))[0]).toBe(unrelated);
    expect(await ids("q=dot&limit=1")).toEqual([matrix]);
    // And the cursor pages the matches: each page starts after the last row of the one before.
    type Row = { draftId: string; updated: string };
    const page = async (before?: Row) =>
      ((await (
        await fetch(`${base}/api/drafts?q=dot&limit=1${before === undefined ? "" : `&before=${encodeURIComponent(before.updated)}&beforeId=${before.draftId}`}`)
      ).json()) as { drafts: Row[] }).drafts;
    const first = await page();
    const second = await page(first[0]);
    expect([...first, ...second].map((row) => row.draftId)).toEqual([matrix, product]);
    expect(await page(second[0])).toEqual([]);

    const tooLong = await fetch(`${base}/api/drafts?q=${"a".repeat(201)}`);
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ detail: { field: "q" } });
  });
});

describe("PUT /api/drafts/{id}/name", () => {
  const rename = (draftId: string, body: unknown) =>
    fetch(`${base}/api/drafts/${draftId}/name`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const rows = async (query = ""): Promise<Record<string, unknown>[]> =>
    ((await (await fetch(`${base}/api/drafts${query}`)).json()) as { drafts: Record<string, unknown>[] }).drafts;

  /** A conversation the planner titled "TCP congestion window". */
  async function titled(): Promise<string> {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    expect(drafts.get(draftId)?.title).toBe("TCP congestion window");
    return draftId;
  }

  it("names a conversation beside its title, on disk, in the mirror, the list and the record, without moving it up", async () => {
    const draftId = await titled();
    const before = drafts.get(draftId)!.updatedAt;
    const mirrors = catalogMock.draftUpsert.mock.calls.length;

    const answer = await rename(draftId, { name: "  Transport \n layer  " });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ draftId, name: "Transport layer", title: "TCP congestion window", changed: true });
    await drafts.settledAll();

    const disk = JSON.parse(await readFile(draftJsonPath(draftId), "utf8")) as Record<string, unknown>;
    expect(disk).toMatchObject({ name: "Transport layer", title: "TCP congestion window", updatedAt: before });
    expect(catalogMock.draftUpsert.mock.calls.length).toBeGreaterThan(mirrors);
    expect((await rows()).find((row) => row.draftId === draftId)).toMatchObject({ name: "Transport layer", title: "TCP congestion window", updated: before });
    const view = (await (await fetch(`${base}/api/drafts/${draftId}`)).json()) as Record<string, unknown>;
    expect(view).toMatchObject({ name: "Transport layer", title: "TCP congestion window" });

    // The same name again writes nothing.
    const again = await rename(draftId, { name: "Transport layer" });
    expect(await again.json()).toMatchObject({ changed: false });

    // Null, or a name with nothing in it, takes the name off.
    expect(await (await rename(draftId, { name: "   " })).json()).toMatchObject({ name: null, changed: true });
    await rename(draftId, { name: "Again" });
    expect(await (await rename(draftId, { name: null })).json()).toMatchObject({ name: null, changed: true });
    expect(drafts.get(draftId)?.name).toBeNull();
  });

  it("finds a conversation by its name with q, as it finds one by its own words", async () => {
    const draftId = await titled();
    await rename(draftId, { name: "Transport layer" });
    expect((await rows("?q=transport")).map((row) => row.draftId)).toEqual([draftId]);
    expect((await rows("?q=congestion")).map((row) => row.draftId)).toEqual([draftId]);
  });

  it("refuses what is not a name, and a conversation that is not there", async () => {
    const draftId = await titled();
    for (const body of [{ name: 7 }, { name: ["a"] }, {}]) {
      const refused = await rename(draftId, body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(await refused.json()).toMatchObject({ detail: { field: "name" } });
    }
    expect((await rename("no-such-draft", { name: "x" })).status).toBe(404);
    // A long name is cut to the 200 characters the catalog keeps.
    expect(((await (await rename(draftId, { name: "x".repeat(300) })).json()) as { name: string }).name).toHaveLength(200);
  });

  it("is a write drain waits for, and refused once the studio is shutting down", async () => {
    const draftId = await titled();
    const landing = drafts.rename(draftId, "Named on the way out");
    await drafts.drain();
    await landing;
    const disk = JSON.parse(await readFile(draftJsonPath(draftId), "utf8")) as Record<string, unknown>;
    expect(disk.name).toBe("Named on the way out");
    const late = await rename(draftId, { name: "Too late" });
    expect(late.status).toBe(503);
  });
});

describe("the conversation's model (D90)", () => {
  const setModel = (draftId: string, body: unknown) =>
    fetch(`${base}/api/drafts/${draftId}/model`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  /** The value after a flag in a recorded spawn, or null when the flag is not there. */
  const flag = (argv: string[], name: string): string | null => (argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? null) : null);

  it("is picked at create, kept on the record, the disk and the view, and passed to the planner", async () => {
    await fake.script([{ text: proposing(good) }]);
    const created = await post("/api/drafts", { model: "opus" });
    expect(created.status).toBe(201);
    const { draftId } = (await created.json()) as { draftId: string };
    expect(drafts.get(draftId)?.model).toBe("opus");
    const disk = JSON.parse(await readFile(draftJsonPath(draftId), "utf8")) as Record<string, unknown>;
    expect(disk.model).toBe("opus");
    const view = (await (await fetch(`${base}/api/drafts/${draftId}`)).json()) as Record<string, unknown>;
    expect(view).toMatchObject({ model: "opus" });

    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    const argv = (await fake.argvs()).at(-1)!;
    expect(flag(argv, "--model")).toBe("opus");
  });

  it("is set and cleared by PUT, never moving the row up the list", async () => {
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    const before = drafts.get(draftId)!.updatedAt;

    const picked = await setModel(draftId, { model: "fable" });
    expect(picked.status).toBe(200);
    expect(await picked.json()).toMatchObject({ draftId, model: "fable", changed: true, note: "the conversation runs on fable" });
    expect(drafts.get(draftId)?.model).toBe("fable");
    expect(drafts.get(draftId)!.updatedAt).toBe(before);
    // The same pick again writes nothing.
    expect(await (await setModel(draftId, { model: "fable" })).json()).toMatchObject({ model: "fable", changed: false });

    // "default", an empty pick and null all hand the runner's own default back.
    expect(await (await setModel(draftId, { model: "default" })).json()).toMatchObject({ model: null, changed: true, note: "the model is cleared" });
    await setModel(draftId, { model: "opus" });
    expect(await (await setModel(draftId, { model: "   " })).json()).toMatchObject({ model: null, changed: true });
    await setModel(draftId, { model: "opus" });
    expect(await (await setModel(draftId, { model: null })).json()).toMatchObject({ model: null, changed: true });
    expect(drafts.get(draftId)?.model ?? null).toBeNull();
    const disk = JSON.parse(await readFile(draftJsonPath(draftId), "utf8")) as Record<string, unknown>;
    expect(disk.model ?? null).toBeNull();
  });

  it("refuses what is not a model, a body without one, and a conversation that is not there", async () => {
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    for (const body of [{ model: 7 }, { model: ["a"] }, { model: "opus; rm -rf /" }, {}]) {
      const refused = await setModel(draftId, body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect(await refused.json()).toMatchObject({ detail: { field: "model" } });
    }
    expect((await setModel("no-such-draft", { model: "opus" })).status).toBe(404);
    const created = await post("/api/drafts", { model: "opus; rm -rf /" });
    expect(created.status).toBe(400);
    expect(await created.json()).toMatchObject({ detail: { field: "model" } });
  });

  it("applies a new pick to the next turn; a turn already spawned keeps its own", async () => {
    await fake.script([{ text: "one" }, { text: "two" }]);
    const { draftId } = (await (await post("/api/drafts", { model: "sonnet" })).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, { text: "first" });
    await drafts.settled(draftId);
    await setModel(draftId, { model: "opus" });
    await post(`/api/drafts/${draftId}/messages`, { text: "second" });
    await drafts.settled(draftId);
    const argvs = await fake.argvs();
    expect(flag(argvs[0]!, "--model")).toBe("sonnet");
    expect(flag(argvs[1]!, "--model")).toBe("opus");
  });

  it("stamps the pick onto the brief a press posts, without touching the stored one", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", { model: "fable" })).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    // The pick is the conversation's, not the brief's: the card's brief stays clean.
    expect(drafts.get(draftId)!.slots!.diagram!.brief).not.toHaveProperty("model");
    const drawn = await post(`/api/drafts/${draftId}/draw`, { idempotencyKey: "press" });
    expect(drawn.status).toBe(201);
    const { jobId } = (await drawn.json()) as { jobId: string };
    expect(store.get(jobId)?.brief.model).toBe("fable");
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the job never reached its agent");
  });

  it("takes a model a posted brief names, past the old sonnet-or-opus list", async () => {
    const job = await post("/api/jobs", { ...good, model: "claude-fable-5-1", idempotencyKey: "j-fable" });
    expect(job.status).toBe(201);
    const { jobId } = (await job.json()) as { jobId: string };
    expect(store.get(jobId)?.brief.model).toBe("claude-fable-5-1");
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the job never reached its agent");
    expect(store.get(jobId)?.agentModel).toMatchObject({ passed: "claude-fable-5-1", source: "brief" });
  });
});

describe("resume and revise carry the draft", () => {
  it("a resumed interrupted job is the draft's newest, and the draft follows it", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
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

  it("queues a Resume of an older job standalone, and the draft keeps following its newest", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { draftId } = (await (await post("/api/drafts", {})).json()) as { draftId: string };
    await post(`/api/drafts/${draftId}/messages`, tagged("draw it"));
    await drafts.settled(draftId);
    await store.create(interruptedJob("job-older", draftId, "other-slug", "older-key"));
    await drafts.markDrawing(draftId, "job-older");
    await store.create(interruptedJob("job-newer", draftId, good.slug, "newer-key"));
    await drafts.markDrawing(draftId, "job-newer");
    await drafts.settled(draftId);
    expect(drafts.get(draftId)?.jobIds).toEqual(["job-older", "job-newer"]);

    const resumed = await post(`/api/jobs/job-older/resume`, {});
    expect(resumed.status).toBe(201);
    const next = ((await resumed.json()) as { jobId: string }).jobId;
    expect(store.get(next)?.draftId).toBeNull();
    expect(drafts.get(draftId)).toMatchObject({ state: "briefed", jobIds: ["job-older", "job-newer"] });
    await until(() => agentMock.startAgent.mock.calls.length > 0, "the resumed job never reached its agent");
  });
});

/** An interrupted job of a draft's, as the runner's reconcile leaves one. */
function interruptedJob(id: string, draftId: string, slug: string, key: string): JobRecord {
  const at = new Date().toISOString();
  return {
    id,
    kind: "diagram",
    state: "interrupted",
    phase: "drawing",
    brief: { ...good, slug, concepts: [], model: "sonnet", idempotencyKey: key },
    targetPath: targetPath(slug),
    targetSvgPath: targetSvgPath(slug),
    candidatePath: candidatePath(id, slug),
    candidateSvgPath: candidateSvgPath(id, slug),
    topic: good.topic,
    slug,
    attempt: 1,
    sessionId: `studio-${id}`,
    agentSessionId: "77777777-7777-4777-8777-777777777777",
    parentJobId: null,
    draftId,
    changes: null,
    idempotencyKey: key,
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
  } as JobRecord;
}

describe("the event stream", () => {
  it("drops the subscription of a client that left while the replay was being read", async () => {
    let finish: (off: () => void) => void = () => undefined;
    const off = vi.fn();
    let subscribed = false;
    const stub = {
      get: () => ({ id: "d" }),
      subscribe: () => {
        subscribed = true;
        return new Promise<() => void>((resolve) => {
          finish = resolve;
        });
      },
    };
    const store = new JobStore();
    const lone = createApi({ store, runner: new Runner(store), mirrors: new Mirrors(), drafts: stub as never });
    await new Promise<void>((resolve) => lone.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(lone.address() as AddressInfo).port}/api/drafts/d/events`;
    const controller = new AbortController();
    const response = await fetch(url, { signal: controller.signal });
    expect(response.status).toBe(200);
    await until(() => subscribed, "the route never subscribed");
    controller.abort();
    // Let the server see the socket close before the replay finishes.
    await new Promise((resolve) => setTimeout(resolve, 50));
    finish(off);
    await until(() => off.mock.calls.length === 1, "the subscription outlived its client");
    await new Promise<void>((resolve) => lone.close(() => resolve()));
  });
});

