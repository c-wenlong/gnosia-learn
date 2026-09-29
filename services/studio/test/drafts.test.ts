import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, proposing, type FakeClaude } from "./fake-claude";
import { TOPICS, topicListAnswer, topicListDown } from "./vocabulary";
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
  admit: ReturnType<typeof vi.fn>;
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
    admit: vi.fn(async () => ({ exists: false, revision: null, hash: null })),
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

  it("makes one draft for two posts of one key that arrive together", async () => {
    const [first, second] = await Promise.all([drafts.create({ idempotencyKey: "twice" }), drafts.create({ idempotencyKey: "twice" })]);
    expect(second.record.id).toBe(first.record.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(drafts.list()).toHaveLength(1);
  });

  it("returns the same draft for a repeated idempotency key", async () => {
    const first = await drafts.create({ idempotencyKey: "same" });
    const second = await drafts.create({ idempotencyKey: "same" });
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);
  });
});

describe("what a person types", () => {
  it("reaches the planner as text on stdin, never as argv, however it starts", async () => {
    const texts = [
      "--debug-file=/tmp/studio-planner-pwned.log",
      "- a bullet\n- another bullet",
      "-p --resume=11111111-2222-4333-8444-555555555555 --output-format=text",
    ];
    await fake.script([{ text: "Noted. What should the diagram make clear?" }]);
    const { record } = await drafts.create({});
    for (const text of texts) await say(record.id, text);
    const view = await drafts.view(record.id);
    // Every turn produced a reply: none of them was refused as an unknown option.
    expect(view.error).toBeNull();
    expect(view.transcript.filter((entry) => entry.role === "planner")).toHaveLength(3);
    expect(await fake.prompts()).toEqual(texts);
    for (const argv of await fake.argvs()) {
      for (const text of texts) expect(argv.some((arg) => arg.includes(text.slice(0, 12)))).toBe(false);
    }
  });
});

describe("the brief's one retry", () => {
  it("resumes the planner once with the field and the sentence, and the retry takes the reply's place", async () => {
    await fake.script([{ text: proposing(bad) }, { text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw the congestion window");
    const argvs = await fake.argvs();
    expect(argvs).toHaveLength(2);
    const retryPrompt = (await fake.prompts())[1]!;
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

  it("checks the doctor before creating the topic, so a press that can only fail creates nothing", async () => {
    await fake.script([{ text: withTopic({ ...good, topic: "mesh-vpn" }) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels");
    canvasMock.doctor.mockResolvedValue({ code: 1, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
    await expect(drafts.draw(record.id, "p")).rejects.toMatchObject({ status: 503 });
    expect(catalogMock.topicAdd).not.toHaveBeenCalled();
    expect(drafts.get(record.id)?.pendingTopic?.entry.slug).toBe("mesh-vpn");
  });

  it("refuses a pending topic before any write when the studio serves another owner, and still draws an existing topic (C16)", async () => {
    const saved = process.env.STUDIO_OWNER;
    process.env.STUDIO_OWNER = "owner-b";
    try {
      await fake.script([{ text: withTopic({ ...good, topic: "mesh-vpn" }) }]);
      const pending = (await drafts.create({})).record;
      await say(pending.id, "tailscale tunnels");
      expect(drafts.get(pending.id)?.pendingTopic?.entry.slug).toBe("mesh-vpn");
      await expect(drafts.draw(pending.id, "p")).rejects.toMatchObject({ status: 409, detail: { reason: "topic-owner" } });
      expect(catalogMock.topicAdd).not.toHaveBeenCalled();
      expect(runner.enqueue).not.toHaveBeenCalled();
      expect(canvasMock.doctor).not.toHaveBeenCalled();
      const view = await drafts.view(pending.id);
      expect(view.state).toBe("briefed");
      expect(view.transcript.at(-1)).toMatchObject({ role: "studio", text: expect.stringContaining("catalog topic add") });

      await fake.script([{ text: proposing(good) }]);
      const existing = (await drafts.create({})).record;
      await say(existing.id, "the congestion window");
      await expect(drafts.draw(existing.id, "p")).resolves.toMatchObject({ created: true });
      expect(drafts.get(existing.id)?.state).toBe("drawing");
    } finally {
      if (saved === undefined) delete process.env.STUDIO_OWNER;
      else process.env.STUDIO_OWNER = saved;
    }
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

describe("a Draw press", () => {
  it("holds the draft: no turn beside it, one topic and one job for two presses of one key, and 409 for another key", async () => {
    await fake.script([{ text: withTopic({ ...good, topic: "mesh-vpn" }) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels");
    catalogMock.topicAdd.mockImplementation(async () => {
      catalogMock.topicList.mockResolvedValue(
        topicListAnswer([...TOPICS, { ...newTopic, maps: { manimkc: [], courses: [], concepts: [] }, incoming: [] }]),
      );
      return ok();
    });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    runner.enqueue.mockImplementationOnce(async (valid: { idempotencyKey: string }) => {
      await gate;
      return { record: { id: "job-held", state: "queued", draftId: record.id, idempotencyKey: valid.idempotencyKey }, created: true, jobsAhead: 0 };
    });
    const first = drafts.draw(record.id, "press");
    const second = drafts.draw(record.id, "press");
    await expect(drafts.draw(record.id, "another")).rejects.toMatchObject({ status: 409, detail: { reason: "draw-in-progress" } });
    await expect(drafts.send(record.id, "wait, change it")).rejects.toMatchObject({ status: 409, detail: { reason: "draw-in-progress" } });
    release();
    expect(await first).toEqual({ jobId: "job-held", created: true });
    expect(await second).toEqual({ jobId: "job-held", created: false });
    expect(catalogMock.topicAdd).toHaveBeenCalledTimes(1);
    expect(runner.enqueue).toHaveBeenCalledTimes(1);
    expect(drafts.get(record.id)?.state).toBe("drawing");
  });

  it("is not undone by a turn that was already running when a Resume moved the draft to drawing", async () => {
    await fake.script([{ text: proposing(good), hangMs: 300 }]);
    const { record } = await drafts.create({});
    await drafts.send(record.id, "draw it");
    // A Resume from the job panel lands while the planner is still answering.
    await drafts.markDrawing(record.id, "job-resumed");
    expect(drafts.get(record.id)?.state).toBe("drawing");
    await drafts.settled(record.id);
    const after = drafts.get(record.id)!;
    expect(after.state).toBe("drawing");
    expect(after.brief?.slug).toBe("tcp-congestion-window");
  });

  it("asks everything the enqueue would refuse on before it creates a topic", async () => {
    await fake.script([{ text: withTopic({ ...good, topic: "mesh-vpn" }) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels");
    runner.admit.mockRejectedValueOnce(new JobRefused(409, "learn/assets/tcp-congestion-window.tldr is already held by job j", { holder: "j" }));
    await expect(drafts.draw(record.id, "p")).rejects.toMatchObject({ status: 409, detail: { holder: "j" } });
    expect(catalogMock.topicAdd).not.toHaveBeenCalled();
    expect(runner.enqueue).not.toHaveBeenCalled();
    expect(drafts.get(record.id)?.pendingTopic?.entry.slug).toBe("mesh-vpn");
  });

  it("writes the draft's row just before the job names it, so an outage earlier in the talk cannot refuse the Draw", async () => {
    let rowExists = false;
    catalogMock.draftUpsert.mockImplementation(async () => ({ ok: false, json: null, error: "unreachable", offline: true }));
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    // Postgres is back; nothing has asked for a mirror since.
    catalogMock.draftUpsert.mockImplementation(async () => {
      rowExists = true;
      return ok();
    });
    runner.enqueue.mockImplementationOnce(async () => {
      expect(rowExists).toBe(true);
      return { record: { id: "job-row", state: "queued", draftId: record.id }, created: true, jobsAhead: 0 };
    });
    await expect(drafts.draw(record.id, "p")).resolves.toEqual({ jobId: "job-row", created: true });
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
    const prompts = await fake.prompts();
    expect(prompts[1]).toContain("-----BEGIN CONVERSATION-----");
    expect(prompts[1]).toContain("person: one");
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

describe("a shutdown between two spawns of one turn", () => {
  it("starts no retry once draining has begun", async () => {
    const brief = { ...bad, topic: "mesh-vpn" };
    await fake.script([{ text: withTopic(brief) }, { text: proposing(good) }]);
    const { record } = await drafts.create({});
    // The shutdown lands while the first reply is being judged.
    catalogMock.topicAddDryRun.mockImplementation(async () => {
      void drafts.drain();
      return ok({ nearMatches: [] });
    });
    await say(record.id, "tailscale tunnels");
    expect(await fake.argvs()).toHaveLength(1);
    expect((await drafts.view(record.id)).error?.kind).toBe("interrupted");
  });
});

describe("a crash between two writes", () => {
  /** What a runner that died mid-turn leaves: the given events on disk, and a record that says a turn is in flight. */
  async function leave(id: string, events: Record<string, unknown>[], record: Record<string, unknown>, spawns = 1): Promise<void> {
    const body = await readFile(draftTranscriptPath(id), "utf8");
    await writeFile(draftTranscriptPath(id), body + events.map((event) => `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`).join(""));
    await writeFile(draftJsonPath(id), JSON.stringify({ ...drafts.get(id)!, ...record }));
    const markers = Array.from({ length: spawns }, () => JSON.stringify({ type: "studio-turn", turn: 2, at: new Date().toISOString() }));
    await writeFile(draftSessionLogPath(id), `${markers.join("\n")}\n`);
  }

  it("does not write a second reply for a turn whose reply is already on disk, nor reuse a seq", async () => {
    const { record } = await drafts.create({});
    // The reply landed; the save that would have moved `seq` and cleared the turn did not.
    await leave(record.id, [
      { seq: 2, type: "message", text: "hi" },
      { seq: 3, type: "reply", turn: 2, text: "Which kind of diagram?" },
    ], { seq: 1, turns: 1, inFlight: { turn: 2, startedAt: new Date().toISOString() } });
    const restarted = build();
    await restarted.load();
    expect(restarted.get(record.id)?.seq).toBe(3);
    await restarted.reconcile();
    const replies = (await restarted.view(record.id)).transcript.filter((entry) => entry.role === "planner");
    expect(replies).toEqual([expect.objectContaining({ seq: 3, text: "Which kind of diagram?" })]);
    expect(replies[0]?.interrupted).toBeUndefined();
    expect((await restarted.view(record.id)).inFlight).toBe(false);
    await fake.script([{ text: "ok" }]);
    await restarted.send(record.id, "a flow");
    await restarted.settled(record.id);
    const seqs = (await restarted.events(record.id)).map((event) => event.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    drafts = restarted;
  });

  it("counts a recovered turn's cost once, even when the runner died again between the cut-off reply and its cost", async () => {
    const { record } = await drafts.create({});
    const at = new Date().toISOString();
    // What this pass itself leaves when it dies midway: the cut-off reply, and no spend.
    await leave(record.id, [
      { seq: 2, type: "message", text: "hi" },
      { seq: 3, type: "reply", turn: 2, text: "Is this a new", interrupted: true, costUsd: 0.0186, costSource: "stream" },
    ], { seq: 3, turns: 1, spend: [], inFlight: { turn: 2, startedAt: at } });
    const usage = { input_tokens: 10, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 20 };
    await writeFile(
      draftSessionLogPath(record.id),
      [
        { type: "studio-turn", turn: 2, at },
        { type: "assistant", message: { id: "m1", model: "claude-sonnet-5", content: [], usage } },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n"),
    );
    const restarted = build();
    await restarted.load();
    await restarted.reconcile();
    const once = restarted.get(record.id)!;
    expect(once.spend).toHaveLength(1);
    expect(once.costUsd).toBeGreaterThan(0);
    expect((await restarted.view(record.id)).transcript.filter((entry) => entry.role === "planner")).toHaveLength(1);
    // A third start finds nothing left to count.
    const again = build();
    await again.load();
    await again.reconcile();
    expect(again.get(record.id)!.spend).toHaveLength(1);
    expect(again.get(record.id)!.costUsd).toBe(once.costUsd);
    drafts = again;
  });

  it("keeps a brief that passed on the turn the runner died in", async () => {
    const { record } = await drafts.create({});
    const brief = { ...good, concepts: [], model: "sonnet" };
    await leave(record.id, [
      { seq: 2, type: "message", text: "draw it" },
      { seq: 3, type: "reply", turn: 2, text: proposing(good) },
      { seq: 4, type: "brief", replySeq: 3, brief, pendingTopic: null },
    ], { seq: 4, turns: 1, state: "briefed", brief, inFlight: { turn: 2, startedAt: new Date().toISOString() } });
    const restarted = build();
    await restarted.load();
    await restarted.reconcile();
    expect((await restarted.view(record.id)).state).toBe("briefed");
    drafts = restarted;
  });
});

describe("a turn that fails after it has said something", () => {
  it("is shown cut off, and no brief is read out of it", async () => {
    await fake.script([{ text: proposing(good), failed: "API Error: 529 Overloaded" }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    const view = await drafts.view(record.id);
    expect(view.state).toBe("open");
    expect(view.brief).toBeNull();
    expect(view.error).toMatchObject({ kind: "agent", message: "API Error: 529 Overloaded" });
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", interrupted: true });
    // And no retry was spent on it.
    expect(await fake.argvs()).toHaveLength(1);
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
    expect((await fake.prompts())[0]).toContain("-----BEGIN STUDIO-----");
    expect(drafts.get(record.id)?.state).toBe("open");
  });
});

describe("following the job when the draft was not listening", () => {
  const jobFor = (id: string, draftId: string, state: string) => ({
    id,
    state,
    slug: "tcp-congestion-window",
    topic: "tcp-congestion-control",
    draftId,
    brief: { ...good, model: "sonnet" },
    gate: null,
    error: null,
    requestedAt: new Date().toISOString(),
  });

  it("applies a job that finished before the draft recorded its id", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    runner.enqueue.mockImplementationOnce(async () => {
      // The spawn failed at once: terminal before `draw` gets its answer.
      await mkdir(path.join(process.env.STUDIO_HOME!, "jobs", "job-fast", "scratch"), { recursive: true });
      await store.create(jobFor("job-fast", record.id, "running") as never);
      await store.update("job-fast", { state: "failed", error: "the agent never started" });
      return { record: store.get("job-fast"), created: true, jobsAhead: 0 };
    });
    await drafts.draw(record.id, "p");
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.transcript.at(-1)?.text).toContain("the agent never started");
    // Acted on once, not once from the listener and again from the re-check.
    expect(view.transcript.filter((entry) => entry.role === "studio")).toHaveLength(1);
  });

  it("brings a drawing draft to briefed on start when the runner found its job running and marked it interrupted", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    const { jobId } = await drafts.draw(record.id, "p");
    expect(drafts.get(record.id)?.state).toBe("drawing");
    await drafts.settled(record.id);

    // A restart: the runner's reconcile writes `interrupted` before any draft listens.
    await mkdir(path.join(process.env.STUDIO_HOME!, "jobs", jobId, "scratch"), { recursive: true });
    const restartedStore = new JobStore();
    await restartedStore.create(jobFor(jobId, record.id, "interrupted") as never);
    store = restartedStore;
    const restarted = build();
    await restarted.load();
    await restarted.syncFromJobs();
    await restarted.settled(record.id);
    const view = await restarted.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.transcript.at(-1)?.text).toMatch(/was interrupted[\s\S]*Resume it from the job/);
    drafts = restarted;
  });

  it("records a job the draft never heard of, when the runner died between the enqueue and markDrawing", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    await mkdir(path.join(process.env.STUDIO_HOME!, "jobs", "job-lost", "scratch"), { recursive: true });
    await store.create(jobFor("job-lost", record.id, "running") as never);
    const restarted = build();
    await restarted.load();
    await restarted.syncFromJobs();
    await restarted.settled(record.id);
    expect(restarted.get(record.id)).toMatchObject({ state: "drawing", jobIds: ["job-lost"] });
    await restarted.drain();
  });
});


describe("C11: the extend target changed after the conversation started", () => {
  /** An extend draft on disk, as `create` leaves one after `inspect`, with its checkout beside it. */
  async function extendDraft(document: unknown, revision: number): Promise<{ id: string; drafts: DraftsT }> {
    const { record } = await drafts.create({ idempotencyKey: "c11" });
    const { workDir, workPath } = await import("../src/paths");
    const { documentHashOf } = await import("../src/diagrams");
    await mkdir(workDir(), { recursive: true });
    await writeFile(workPath("dot-product"), JSON.stringify(document), "utf8");
    await writeFile(path.join(workDir(), "dot-product.checkout.json"), JSON.stringify({ revision }), "utf8");
    const saved = JSON.parse(await readFile(draftJsonPath(record.id), "utf8"));
    await writeFile(
      draftJsonPath(record.id),
      JSON.stringify({ ...saved, source: "dot-product", sourceHash: await documentHashOf(workPath("dot-product")), sourceRevision: revision }),
      "utf8",
    );
    const loaded = build();
    await loaded.load();
    return { id: record.id, drafts: loaded };
  }

  it("reports nothing on a new diagram's conversation", async () => {
    const { record } = await drafts.create({ idempotencyKey: "plain" });
    const view = await drafts.view(record.id);
    expect(view.sourceChanged).toBe(false);
    expect(view.sourceRevision).toBeNull();
  });

  it("is false while the checkout is what the planner was told about, whatever order its keys are in", async () => {
    const { id, drafts: loaded } = await extendDraft({ a: 1, b: [1, 2] }, 3);
    const { workPath } = await import("../src/paths");
    await writeFile(workPath("dot-product"), JSON.stringify({ b: [1, 2], a: 1 }), "utf8");
    const view = await loaded.view(id);
    expect(view.sourceChanged).toBe(false);
    expect(view.sourceRevision).toBe(3);
  });

  it("is true after an edit to the checkout", async () => {
    const { id, drafts: loaded } = await extendDraft({ a: 1 }, 3);
    const { workPath } = await import("../src/paths");
    await writeFile(workPath("dot-product"), JSON.stringify({ a: 2 }), "utf8");
    expect((await loaded.view(id)).sourceChanged).toBe(true);
  });

  it("is true once the checkout is brought up to a newer revision", async () => {
    const { id, drafts: loaded } = await extendDraft({ a: 1 }, 3);
    const { workDir } = await import("../src/paths");
    await writeFile(path.join(workDir(), "dot-product.checkout.json"), JSON.stringify({ revision: 4 }), "utf8");
    expect((await loaded.view(id)).sourceChanged).toBe(true);
  });

  it("does not guess when the checkout is gone", async () => {
    const { id, drafts: loaded } = await extendDraft({ a: 1 }, 3);
    const { workDir, workPath } = await import("../src/paths");
    await rm(workPath("dot-product"));
    await rm(path.join(workDir(), "dot-product.checkout.json"));
    expect((await loaded.view(id)).sourceChanged).toBe(false);
  });
});

describe("a brief edited by hand", () => {
  it("keeps a proposed topic while the brief still names it, and drops it for a topic that exists", async () => {
    const brief = { ...good, topic: "mesh-vpn", slug: "tailscale-tunnels" };
    await fake.script([{ text: withTopic(brief) }]);
    const { record } = await drafts.create({});
    await say(record.id, "tailscale tunnels");
    expect(drafts.get(record.id)?.pendingTopic?.entry.slug).toBe("mesh-vpn");

    // Still on the proposed slug: checked against the widened vocabulary, and the proposal stays.
    const renamed = await drafts.editBrief(record.id, { ...brief, title: "Tailscale tunnels, end to end" });
    expect(renamed.changed).toBe(true);
    expect(renamed.record.pendingTopic?.entry.slug).toBe("mesh-vpn");
    expect(renamed.record.title).toBe("Tailscale tunnels, end to end");

    // An existing topic ends the proposal, and the note says so.
    const moved = await drafts.editBrief(record.id, { ...brief, topic: "tcp-congestion-control" });
    expect(moved.record.pendingTopic).toBeNull();
    const view = await drafts.view(record.id);
    expect(view.transcript.at(-1)?.text).toContain('topic: "mesh-vpn" -> "tcp-congestion-control"');
    expect(view.transcript.at(-1)?.text).toContain("proposed new topic is dropped");
    expect(view.pendingTopic).toBeNull();
    // Two edits, two notes waiting for the planner.
    expect(drafts.get(record.id)?.undelivered).toHaveLength(2);
    // Each edit mirrored the row.
    expect(catalogMock.draftUpsert).toHaveBeenCalled();
  });

  it("is refused while Draw is being pressed, and after the drawing is reviewed", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    let release: () => void = () => undefined;
    canvasMock.doctor.mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () => resolve({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
      }),
    );
    const press = drafts.draw(record.id, "press");
    await expect(drafts.editBrief(record.id, good)).rejects.toMatchObject({ status: 409, detail: { reason: "draw-in-progress" } });
    release();
    const { jobId } = await press;
    await mkdir(path.join(process.env.STUDIO_HOME!, "jobs", jobId, "scratch"), { recursive: true });
    await store.create({ id: jobId, state: "awaiting_review", slug: good.slug, topic: good.topic, draftId: record.id, brief: { ...good, model: "sonnet" }, gate: null, error: null } as never);
    await store.update(jobId, { state: "discarded" });
    await until(() => drafts.get(record.id)?.state === "done", "a discarded drawing never finished the draft");
    await drafts.settled(record.id);
    await expect(drafts.editBrief(record.id, good)).rejects.toMatchObject({ status: 409, detail: { reason: "done" } });
  });

  it("is refused with 503 when the vocabulary cannot be read at all", async () => {
    await fake.script([{ text: proposing(good) }]);
    const { record } = await drafts.create({});
    await say(record.id, "draw it");
    catalogMock.topicList.mockResolvedValue(topicListDown());
    // The cache the first read wrote answers instead, so the edit still passes...
    await expect(drafts.editBrief(record.id, { ...good, title: "Renamed" })).resolves.toMatchObject({ changed: true });
    // ...and with no cache either, it is a 503.
    await rm(path.join(process.env.STUDIO_HOME!, "cache"), { recursive: true, force: true });
    await expect(drafts.editBrief(record.id, good)).rejects.toMatchObject({ status: 503 });
  });
});

describe("C4: the vocabulary changes during a conversation", () => {
  const added = {
    slug: "mesh-vpn",
    title: "Mesh VPNs",
    domain: "networking",
    summary: "Overlay networks between devices.",
    aliases: ["tailscale"],
    relations: [],
    maps: { manimkc: [], courses: [], concepts: [] },
    incoming: [],
  };

  it("tells the planner what was added and archived at the head of its next turn, once", async () => {
    await fake.script([{ text: "Which one?" }, { text: "Mesh VPNs, then." }, { text: "Still here." }]);
    const { record } = await drafts.create({});
    await say(record.id, "hello");
    // One topic added, one archived, after the system prompt was written.
    catalogMock.topicList.mockResolvedValue(topicListAnswer([TOPICS[1]!, added]));
    await say(record.id, "tailscale tunnels");
    await say(record.id, "and?");
    const prompts = await fake.prompts();
    expect(prompts[0]).toBe("hello");
    expect(prompts[1]).toContain("-----BEGIN STUDIO-----");
    expect(prompts[1]).toContain("mesh-vpn | Mesh VPNs | networking | tailscale | Overlay networks between devices.");
    expect(prompts[1]).toContain("archived or removed, so no brief may name them: vector-and-linear-algebra-basics");
    expect(prompts[1]!.indexOf("-----END STUDIO-----")).toBeLessThan(prompts[1]!.indexOf("tailscale tunnels"));
    // Told once: the next turn is the person's text alone.
    expect(prompts[2]).toBe("and?");
    // The system prompt is left as it was written; the baseline moved beside it.
    const system = await readFile(path.join(draftDir(record.id), "planner-system.md"), "utf8");
    expect(system).not.toContain("mesh-vpn");
    const view = await drafts.view(record.id);
    expect(view.transcript.filter((entry) => entry.role === "studio")).toHaveLength(1);
  });

  it("says nothing when the vocabulary is the one the prompt was written with, or cannot be read", async () => {
    await fake.script([{ text: "Which one?" }, { text: "Ok." }]);
    const { record } = await drafts.create({});
    await say(record.id, "hello");
    catalogMock.topicList.mockResolvedValue(topicListDown());
    await say(record.id, "again");
    expect(await fake.prompts()).toEqual(["hello", "again"]);
  });
});

describe("vocabularyChangeNote", () => {
  it("lists a changed topic as it is now, and keeps the removals when the note is capped", async () => {
    const { vocabularyChangeNote } = await import("../src/drafts");
    const { vocabularyBlock } = await import("../src/planner");
    const entry = (slug: string, concepts: string[] = []) => ({
      slug,
      title: slug,
      domain: "d",
      summary: null,
      aliases: [],
      relations: [],
      maps: { manimkc: [], courses: [], concepts },
    });
    const before = vocabularyBlock([entry("a"), entry("b"), entry("gone")]);
    const after = vocabularyBlock([entry("a"), entry("b", ["b-one"]), ...Array.from({ length: 300 }, (_, i) => entry(`new-${i}`))]);
    const note = vocabularyChangeNote(`prompt text\n\n${before}\n\nCORPUS`, after)!;
    expect(note).toContain("archived or removed, so no brief may name them: gone");
    expect(note).toMatch(/more lines not shown\)$/);
    expect(vocabularyChangeNote(before, vocabularyBlock([entry("a"), entry("b"), entry("gone")]))).toBeNull();
    const changed = vocabularyChangeNote(before, vocabularyBlock([entry("a"), entry("b", ["b-one"]), entry("gone")]))!;
    expect(changed).toContain("changed (as they are now):\nb | b | d |  | \n  concepts: b-one");
  });
});

describe("describeBriefEdit", () => {
  it("reads a rename as one line, not as every arrow it touches added and removed", async () => {
    const { describeBriefEdit } = await import("../src/drafts");
    const before = { ...good, model: "sonnet" } as never;
    const after = {
      ...good,
      model: "sonnet",
      elements: [{ label: "Sender" }, { label: "Server" }],
      relations: [{ from: "Sender", to: "Server", label: "sends segments" }],
    } as never;
    const note = describeBriefEdit(before, after);
    expect(note).toContain('- element 2: "Receiver" -> "Server"');
    expect(note).not.toContain("arrow");
    // What the planner is told stays out of what the person reads.
    expect(note).not.toContain("brief in force");
  });

  it("reads an insert as one added element, and a rename beside it as one line", async () => {
    const { describeBriefEdit } = await import("../src/drafts");
    const brief = (labels: string[], relations: [string, string, string][]) =>
      ({
        ...good,
        model: "sonnet",
        elements: labels.map((label) => ({ label })),
        relations: relations.map(([from, to, label]) => ({ from, to, label })),
      }) as never;
    const before = brief(["Think", "Act", "Tool", "Observe", "Answer"], [["Act", "Tool", "calls"], ["Tool", "Observe", "returns"]]);
    const after = brief(
      ["Think", "Act", "Search tool", "Result", "Observe", "Answer"],
      [["Act", "Search tool", "calls"], ["Search tool", "Observe", "returns"]],
    );
    expect(describeBriefEdit(before, after).split("\n")).toEqual([
      "The person edited the brief by hand:",
      '- element 3: "Tool" -> "Search tool"',
      '- element added: "Result"',
    ]);
    const reordered = brief(["Act", "Think", "Tool", "Observe", "Answer"], [["Act", "Tool", "calls"], ["Tool", "Observe", "returns"]]);
    expect(describeBriefEdit(before, reordered)).toContain("- elements reordered:");
  });
});
