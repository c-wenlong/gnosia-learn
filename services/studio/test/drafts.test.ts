import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, proposing, type FakeClaude } from "./fake-claude";
import { TOPICS, topicListAnswer } from "./vocabulary";
import { until } from "./wait";

/**
 * Drafts and their turns, end to end through a fake `claude`: the real spawn,
 * the real stream parsing, the disk record, the verdict on a brief, the one
 * retry, the Draw press and the job it follows. The catalog is stubbed and the
 * runner is a stand-in, since neither is what is under test here; no request
 * leaves the machine.
 */

let fake: FakeClaude;
// Read at import by config.ts, so set before the first import below.
process.env.STUDIO_PLANNER_TURNS = "4";
const fakeReady = fakeClaude().then((made) => {
  fake = made;
  process.env.STUDIO_CLAUDE_BIN = made.bin;
});
await fakeReady;

const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
  topicAdd: vi.fn(),
  diagramList: vi.fn(),
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

const { Drafts } = await import("../src/drafts");
const { JobStore } = await import("../src/store");
const { JobRefused } = await import("../src/runner");
const { spendWindow } = await import("../src/cost");
const { draftDir, draftJsonPath, draftSessionLogPath, draftTranscriptPath } = await import("../src/paths");

type DraftsT = InstanceType<typeof Drafts>;

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

/** A brief that passes against the test vocabulary. */
const good = {
  intent: "Show how a sender's window reacts to loss.",
  title: "TCP congestion window",
  topic: "tcp-congestion-control",
  slug: "tcp-congestion-window",
  mode: "new",
  layout: "flow-lr",
  elements: [{ label: "Sender" }, { label: "Receiver" }],
  relations: [{ from: "Sender", to: "Receiver", label: "sends segments" }],
  concepts: [],
};
const bad = { ...good, relations: [{ from: "Sender", to: "Relay" }] };

let store: InstanceType<typeof JobStore>;
let drafts: DraftsT;
let runner: {
  enqueue: ReturnType<typeof vi.fn>;
  assertUnderCap: ReturnType<typeof vi.fn>;
  canvasOpen: () => boolean;
};

function build(): DraftsT {
  return new Drafts(store, runner as never);
}

beforeAll(async () => {
  await fakeReady;
});

afterAll(async () => {
  await fake.cleanup();
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-drafts-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.topicAdd.mockReset().mockResolvedValue(ok());
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  runner = {
    enqueue: vi.fn(async (brief: { slug: string }, _parent: unknown, options: { draftId: string }) => {
      const record = {
        id: `job-${Math.random().toString(36).slice(2, 8)}`,
        state: "queued",
        slug: brief.slug,
        draftId: options.draftId,
        brief,
        idempotencyKey: (brief as { idempotencyKey?: string }).idempotencyKey,
      };
      return { record, created: true, jobsAhead: 0 };
    }),
    assertUnderCap: vi.fn(),
    canvasOpen: () => false,
  };
  await fake.script([]);
  store = new JobStore();
  drafts = build();
});

afterEach(async () => {
  await drafts.drain();
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

/** Send and wait for the whole turn, retries and writes included. */
async function say(id: string, text: string): Promise<void> {
  await drafts.send(id, text);
  await drafts.settled(id);
}

describe("a conversation", () => {
  it("asks, then proposes on 'just draw it', and the brief passes validateBrief", async () => {
    await fake.script([
      { text: "There is already a tailscale diagram. Extend it, or a fresh one?", cost: 0.054 },
      { text: proposing(good), cost: 0.015 },
    ]);
    const { record } = await drafts.create({ idempotencyKey: "k1" });
    expect(record.state).toBe("open");
    // The workspace is written before any turn: the prompt a person can read, and the deny file.
    const system = await readFile(path.join(draftDir(record.id), "planner-system.md"), "utf8");
    expect(system).toContain("-----BEGIN VOCABULARY-----");
    expect(JSON.parse(await readFile(path.join(draftDir(record.id), "planner-settings.json"), "utf8")).permissions.deny).toContain("Bash");

    await say(record.id, "Show how the tailscale vpn tunnels work across devices in the tailscale network.");
    expect(drafts.get(record.id)?.state).toBe("open");
    await say(record.id, "Fresh one. Just draw it.");

    const view = await drafts.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.brief?.slug).toBe("tcp-congestion-window");
    expect(view.turns).toBe(2);
    expect(view.costUsd).toBeCloseTo(0.069, 6);
    expect(view.costSource).toBe("result");
    expect(view.transcript.map((entry) => entry.role)).toEqual(["person", "planner", "person", "planner"]);
    expect(view.transcript[3]?.brief?.title).toBe("TCP congestion window");

    // The first turn starts the session with its minted id; the second resumes it.
    const argvs = await fake.argvs();
    const sessionId = drafts.get(record.id)!.plannerSessionId;
    expect(argvs[0]).toContain("--session-id");
    expect(argvs[0]![argvs[0]!.indexOf("--session-id") + 1]).toBe(sessionId);
    expect(argvs[1]![argvs[1]!.indexOf("--resume") + 1]).toBe(sessionId);
    expect(argvs[1]![argvs[1]!.indexOf("--tools") + 1]).toBe("");

    // Every raw line is on disk, and the record, and the row was mirrored with the owner.
    expect(await readFile(draftSessionLogPath(record.id), "utf8")).toContain('"type":"result"');
    expect(JSON.parse(await readFile(draftJsonPath(record.id), "utf8")).state).toBe("briefed");
    expect(catalogMock.draftUpsert).toHaveBeenCalledWith(draftJsonPath(record.id));
  });

  it("returns the same draft for a repeated idempotency key", async () => {
    const first = await drafts.create({ idempotencyKey: "same" });
    const second = await drafts.create({ idempotencyKey: "same" });
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
  });
});

describe("the brief's one retry", () => {
  it("resumes the planner once with the field and the sentence, and the retry takes the reply's place", async () => {
    await fake.script([{ text: proposing(bad) }, { text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw the congestion window");
    const argvs = await fake.argvs();
    expect(argvs).toHaveLength(2);
    const retryPrompt = argvs[1]![1]!;
    expect(retryPrompt).toContain("-----BEGIN STUDIO-----");
    expect(retryPrompt).toContain('relations[0].to: "Relay" is not one of the elements');

    const view = await drafts.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.turns).toBe(2);
    const planner = view.transcript.filter((entry) => entry.role === "planner");
    expect(planner[0]).toMatchObject({ superseded: true, briefInvalid: { field: "relations[0].to", retried: true } });
    expect(planner[1]?.brief?.slug).toBe("tcp-congestion-window");
    expect(view.transcript.find((entry) => entry.role === "studio")).toMatchObject({ internal: true });
  });

  it("sends the retry once and only once, then shows the refusal (E6)", async () => {
    await fake.script([{ text: proposing(bad) }, { text: proposing(bad) }, { text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw the congestion window");
    expect(await fake.argvs()).toHaveLength(2);
    const view = await drafts.view(record.id);
    expect(view.state).toBe("open");
    expect(view.error).toMatchObject({ kind: "brief-invalid", field: "relations[0].to" });
    expect(view.transcript.filter((entry) => entry.role === "planner").at(-1)?.briefInvalid).toMatchObject({ retried: false });
  });
});

const newTopic = {
  slug: "mesh-vpn",
  title: "Mesh VPNs",
  domain: "networking",
  summary: "Peer-to-peer tunnels between devices.",
  aliases: ["tailscale"],
  relations: [{ kind: "related", to: "tcp-congestion-control" }],
};
const withTopic = (brief: Record<string, unknown>) =>
  `${proposing(brief)}\n\n\`\`\`topic\n${JSON.stringify(newTopic)}\n\`\`\``;

describe("a proposed topic", () => {
  it("is dry-run, stored as pending, and created by the Draw press before the enqueue", async () => {
    const brief = { ...good, topic: "mesh-vpn", slug: "tailscale-tunnels" };
    await fake.script([{ text: withTopic(brief) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels, just draw it");
    let view = await drafts.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.pendingTopic?.entry.slug).toBe("mesh-vpn");
    expect(catalogMock.topicAddDryRun).toHaveBeenCalledTimes(1);

    // The press: the topic first, and only then the job, against the vocabulary as it is now.
    const order: string[] = [];
    catalogMock.topicAdd.mockImplementation(async (_entry: unknown, reason: string) => {
      order.push("topic add");
      expect(reason).toContain(record.id);
      catalogMock.topicList.mockResolvedValue(
        topicListAnswer([...TOPICS, { ...newTopic, maps: { manimkc: [], courses: [], concepts: [] }, incoming: [] }]),
      );
      return ok();
    });
    runner.enqueue.mockImplementationOnce(async (valid: { topic: string; idempotencyKey: string }, _p: unknown, options: { draftId: string }) => {
      order.push("enqueue");
      expect(valid.topic).toBe("mesh-vpn");
      expect(valid.idempotencyKey).toBe(`draft:${record.id}:press-1`);
      expect(options.draftId).toBe(record.id);
      return { record: { id: "job-1", state: "queued", draftId: record.id }, created: true, jobsAhead: 0 };
    });
    const drawn = await drafts.draw(record.id, "press-1");
    expect(drawn).toEqual({ jobId: "job-1", created: true });
    expect(order).toEqual(["topic add", "enqueue"]);
    view = await drafts.view(record.id);
    expect(view.state).toBe("drawing");
    expect(view.pendingTopic).toBeNull();
    expect(view.jobId).toBe("job-1");
  });

  it("refuses the same reply with a bad relation, and nothing is pending", async () => {
    const brief = { ...bad, topic: "mesh-vpn" };
    await fake.script([{ text: withTopic(brief) }, { text: withTopic(brief) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels");
    const view = await drafts.view(record.id);
    expect(view.state).toBe("open");
    expect(view.pendingTopic).toBeNull();
    expect(view.error).toMatchObject({ kind: "brief-invalid", field: "relations[0].to" });
  });

  it("lands a topic-add refusal as a STUDIO note and leaves the draft briefed (E7)", async () => {
    await fake.script([{ text: withTopic({ ...good, topic: "mesh-vpn" }) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels");
    catalogMock.topicAdd.mockResolvedValue({ ok: false, json: { ok: false, error: "no such domain" }, error: "exited 1", offline: false });
    await expect(drafts.draw(record.id, "p")).rejects.toMatchObject({ status: 400, detail: { reason: "topic-add" } });
    expect(runner.enqueue).not.toHaveBeenCalled();
    const view = await drafts.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.transcript.at(-1)).toMatchObject({ role: "studio", text: expect.stringContaining("no such domain") });
  });
});

describe("the limits", () => {
  it("refuses a second message while a turn is in flight with 409", async () => {
    await fake.script([{ text: "thinking about it", hangMs: 400 }]);
    const { record } = await drafts.create({});
    await drafts.send(record.id, "first");
    await expect(drafts.send(record.id, "second")).rejects.toMatchObject({ status: 409, detail: { reason: "in-flight" } });
    await drafts.settled(record.id);
    expect(await fake.argvs()).toHaveLength(1);
  });

  it("refuses a message past the turn cap with 422, and closes a conversation that never proposed", async () => {
    await fake.script([{ text: "which kind of diagram?" }]);
    const { record } = await drafts.create({});
    for (let i = 0; i < 4; i += 1) await say(record.id, `message ${i}`);
    await expect(drafts.send(record.id, "one more")).rejects.toMatchObject({ status: 422, detail: { reason: "turn-cap", turnCap: 4 } });
    await until(() => drafts.get(record.id)?.state === "abandoned", "the turn cap never closed the draft");
  });

  it("refuses a message with the job cap's own 429 when the day's spend is over", async () => {
    runner.assertUnderCap.mockImplementation(() => {
      throw new JobRefused(429, "over the cap", { reason: "daily-cap", totalUsd: 1, capUsd: 1 });
    });
    const { record } = await drafts.create({});
    await expect(drafts.send(record.id, "hello")).rejects.toMatchObject({ status: 429, detail: { reason: "daily-cap" } });
    expect(await fake.argvs()).toHaveLength(0);
  });

  it("counts each turn at its own end, so an old turn leaves the window while a new one stays", async () => {
    await fake.script([{ text: "a question?", cost: 0.05 }]);
    const { record } = await drafts.create({});
    await say(record.id, "one");
    await say(record.id, "two");
    const entries = drafts.spendEntries();
    expect(entries).toHaveLength(2);
    // Monday's turn, as though it had ended two days ago.
    const old = { ...entries[0]!, finishedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() };
    const window = spendWindow([old, entries[1]!], 24 * 3_600_000);
    expect(window.totalUsd).toBeCloseTo(0.05, 6);
    expect(window.jobs).toBe(1);
  });
});

describe("what goes wrong", () => {
  it("stops a turn whose init event carries a tool, and writes no reply (C15)", async () => {
    await fake.script([{ text: proposing(good), tools: ["Bash"] }]);
    const { record } = await drafts.create({});
    await say(record.id, "hello");
    const view = await drafts.view(record.id);
    expect(view.error?.kind).toBe("agent");
    expect(view.error?.message).toMatch(/must have none/);
    expect(view.transcript.filter((entry) => entry.role === "planner")).toHaveLength(0);
  });

  it("shows a refused first request in the API's own words (E1)", async () => {
    await fake.script([{ refused: "API Error: 400 This credential is not allowed" }]);
    const { record } = await drafts.create({});
    await say(record.id, "hello");
    expect((await drafts.view(record.id)).error).toMatchObject({ kind: "agent", message: "API Error: 400 This credential is not allowed" });
  });

  it("starts a fresh session with the conversation as data when the old one cannot be resumed (C3)", async () => {
    await fake.script([{ text: "first answer" }, { noSession: true }, { text: "carried on" }]);
    const { record } = await drafts.create({});
    await say(record.id, "one");
    const before = drafts.get(record.id)!.plannerSessionId;
    await fake.script([{ noSession: true }, { text: "carried on" }]);
    await say(record.id, "two");
    const argvs = await fake.argvs();
    expect(argvs).toHaveLength(2);
    expect(argvs[1]).toContain("--session-id");
    expect(argvs[1]![1]).toContain("-----BEGIN CONVERSATION-----");
    expect(argvs[1]![1]).toContain("person: one");
    expect(drafts.get(record.id)!.plannerSessionId).not.toBe(before);
    const view = await drafts.view(record.id);
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", text: "carried on" });
  });

  it("marks a turn the runner died in as cut off, with a cost that is not zero (C1)", async () => {
    const { record } = await drafts.create({});
    // What a dead runner leaves: the message on disk, the turn in flight, and part of a stream.
    await writeFile(
      draftTranscriptPath(record.id),
      `${await readFile(draftTranscriptPath(record.id), "utf8")}${JSON.stringify({ seq: 2, type: "message", at: new Date().toISOString(), text: "hi" })}\n`,
    );
    const onDisk = { ...drafts.get(record.id)!, seq: 2, turns: 1, inFlight: { turn: 2, startedAt: new Date().toISOString() } };
    await writeFile(draftJsonPath(record.id), JSON.stringify(onDisk));
    const usage = { input_tokens: 10, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 20 };
    await writeFile(
      draftSessionLogPath(record.id),
      [
        { type: "studio-turn", turn: 2, at: new Date().toISOString() },
        { type: "system", subtype: "init", tools: [], mcp_servers: [] },
        { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Is this a new" } } },
        { type: "assistant", message: { id: "m1", model: "claude-sonnet-5", content: [], usage } },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n"),
    );

    const restarted = build();
    await restarted.load();
    expect(await restarted.reconcile()).toEqual([record.id]);
    const view = await restarted.view(record.id);
    expect(view.inFlight).toBe(false);
    expect(view.state).toBe("open");
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", text: "Is this a new", interrupted: true });
    expect(view.costUsd).toBeGreaterThan(0);
    expect(view.error?.kind).toBe("interrupted");
  });
});

describe("the job a draft follows", () => {
  it("goes back to briefed with the findings on a failed drawing, and to done with what was drawn on an accept", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    const { jobId } = await drafts.draw(record.id, "press");
    expect(drafts.get(record.id)?.state).toBe("drawing");
    await expect(drafts.send(record.id, "while drawing")).rejects.toMatchObject({ status: 409, detail: { reason: "drawing" } });

    const job = {
      id: jobId,
      state: "running",
      slug: "tcp-congestion-window",
      topic: "tcp-congestion-control",
      draftId: record.id,
      brief: { ...good, model: "sonnet" },
      gate: null,
      error: null,
    };
    await mkdir(path.join(process.env.STUDIO_HOME!, "jobs", jobId, "scratch"), { recursive: true });
    await store.create(job as never);
    await store.update(jobId, { state: "failed", error: "the gate found no Receiver", gate: { findings: ["Receiver is missing."] } as never });
    await until(() => drafts.get(record.id)?.state === "briefed", "a failed drawing never put the draft back at briefed");
    await drafts.settled(record.id);
    let view = await drafts.view(record.id);
    expect(view.transcript.at(-1)?.text).toContain("Receiver is missing.");
    // The planner hears it on the next turn.
    expect(drafts.get(record.id)?.undelivered).toHaveLength(1);

    const { jobId: second } = await drafts.draw(record.id, "press-2");
    await store.create({ ...job, id: second, state: "awaiting_review" } as never);
    await store.update(second, { state: "accepted" });
    await until(() => drafts.get(record.id)?.state === "done", "an accepted drawing never finished the draft");
    await drafts.settled(record.id);
    view = await drafts.view(record.id);
    expect(view.transcript.at(-1)?.text).toMatch(/accepted and saved as tcp-congestion-window[\s\S]*Sender -> Receiver \(sends segments\)/);

    await fake.script([{ text: "Another one? Which?" }]);
    await say(record.id, "another diagram please");
    expect((await fake.argvs())[0]![1]).toContain("-----BEGIN STUDIO-----");
    expect(drafts.get(record.id)?.state).toBe("open");
  });
});
