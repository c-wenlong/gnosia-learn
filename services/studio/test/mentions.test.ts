import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, proposing, type FakeClaude } from "./fake-claude";
import { topicListAnswer } from "./vocabulary";
import { until } from "./wait";

/**
 * Tags, slots and presses by kind (docs/STUDIO-MENTIONS.md, D55 to D62),
 * end to end through a fake `claude`: the TAGS and WAITING blocks a turn
 * carries, the untagged conversation with its `suggest`, the `hold`, briefs of
 * two kinds in one reply with one shared retry, waiting across turns, Stop
 * waiting, Use this brief, Make both, a video in review replaced, and the
 * races the doc names. The runners are stand-ins; no request leaves the
 * machine.
 */

// `config.ts` reads the CLI's path once, at import. A path that cannot run
// until the fake's is set means an import that reads it early fails a test
// rather than reaching the real `claude`, which an earlier draft of this suite
// did through a static import of the video fixture.
vi.hoisted(() => {
  process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude-until-the-fake-is-ready";
  process.env.STUDIO_PLANNER_TURNS = "8";
  process.env.STUDIO_VIDEO_KIND = "on";
});
let fake: FakeClaude;
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
  videoList: vi.fn(),
  videoShow: vi.fn(),
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
const { narratedBrief } = await import("./video-fixture");
const { CLAUDE_BIN } = await import("../src/config");
// Never the real CLI: every turn here is the fake's.
if (CLAUDE_BIN !== fake!.bin) throw new Error(`the planner would spawn ${CLAUDE_BIN}, not the fake`);
const { JobStore, RecordStore } = await import("../src/store");
const { JobRefused } = await import("../src/runner");
const { draftJsonPath, plannerSystemPath } = await import("../src/paths");

type DraftsT = InstanceType<typeof Drafts>;
const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

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
const videoBrief = (() => {
  const brief: Record<string, unknown> = { ...narratedBrief(), topic: "tcp-congestion-control", slug: "tcp-congestion-window" };
  delete brief.idempotencyKey;
  return brief;
})();

const block = (tag: string, body: unknown): string => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;
const both = (diagram: unknown = { kind: "diagram", ...good }, video: unknown = { kind: "video", ...videoBrief }): string =>
  `Both, then.\n\n${block("brief", diagram)}\n\n${block("brief", video)}`;
const videoOnly = (video: unknown = { kind: "video", ...videoBrief }): string => `A video.\n\n${block("brief", video)}`;

/** The composer's `{ text, mentions }` for a message with these chips first. */
function chips(text: string, ...kinds: ("diagram" | "video")[]): [string, { kind: string; start: number; end: number }[]] {
  let prefix = "";
  const mentions: { kind: string; start: number; end: number }[] = [];
  for (const kind of kinds) {
    mentions.push({ kind, start: prefix.length, end: prefix.length + kind.length + 1 });
    prefix += `@${kind} `;
  }
  return [`${prefix}${text}`, mentions];
}

let store: InstanceType<typeof JobStore>;
let videoStore: InstanceType<typeof RecordStore>;
let drafts: DraftsT;
let runner: { enqueue: ReturnType<typeof vi.fn>; admit: ReturnType<typeof vi.fn>; assertUnderCap: ReturnType<typeof vi.fn>; canvasOpen: () => boolean };
let videoRunner: { enqueue: ReturnType<typeof vi.fn>; admit: ReturnType<typeof vi.fn> };

function build(): DraftsT {
  return new Drafts(store, runner as never, { store: videoStore as never, runner: videoRunner as never });
}

beforeAll(async () => {
  await fakeReady;
});
afterAll(async () => {
  await fake.cleanup();
  delete process.env.STUDIO_VIDEO_KIND;
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-mentions-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.topicAdd.mockReset().mockResolvedValue(ok());
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  catalogMock.videoList.mockReset().mockResolvedValue(ok({ videos: [] }));
  catalogMock.videoShow.mockReset().mockResolvedValue(ok({ video: null }));
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  store = new JobStore();
  videoStore = new RecordStore("video");
  runner = {
    enqueue: vi.fn(async (brief: { slug: string; idempotencyKey: string }, _parent: unknown, options: { draftId: string }) => {
      const record = await store.create({
        id: `job-d-${Math.random().toString(36).slice(2, 8)}`,
        kind: "diagram",
        state: "queued",
        slug: brief.slug,
        topic: "tcp-congestion-control",
        targetPath: `learn/assets/${brief.slug}.tldr`,
        draftId: options.draftId,
        brief,
        idempotencyKey: brief.idempotencyKey,
        requestedAt: new Date().toISOString(),
        gate: null,
        error: null,
      } as never);
      return { record, created: true, jobsAhead: 0 };
    }),
    admit: vi.fn(async () => ({ exists: false, revision: null, hash: null })),
    assertUnderCap: vi.fn(),
    canvasOpen: () => false,
  };
  videoRunner = {
    enqueue: vi.fn(async (brief: { slug: string; idempotencyKey: string }, parent: { jobId: string; discard: boolean } | undefined, options: { draftId: string }) => {
      // The real runner marks a parent in review discarded inside the enqueue,
      // before the draft records the child (D52).
      if (parent?.discard === true) await videoStore.update(parent.jobId, { state: "discarded" } as never);
      const record = await videoStore.create({
        id: `job-v-${Math.random().toString(36).slice(2, 8)}`,
        kind: "video",
        state: "queued",
        slug: brief.slug,
        topic: "tcp-congestion-control",
        targetPath: `videos/${brief.slug}.mp4`,
        draftId: options.draftId,
        parentJobId: parent?.jobId ?? null,
        brief,
        idempotencyKey: brief.idempotencyKey,
        requestedAt: new Date().toISOString(),
        gate: null,
        error: null,
      } as never);
      return { record, created: true, jobsAhead: 0 };
    }),
    admit: vi.fn(async () => ({ revision: null })),
  };
  await fake.script([]);
  drafts = build();
});

afterEach(async () => {
  await drafts.drain();
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

async function send(id: string, text: string, ...kinds: ("diagram" | "video")[]): Promise<void> {
  if (kinds.length === 0) await drafts.send(id, text);
  else await drafts.send(id, ...chips(text, ...kinds));
  await drafts.settled(id);
}

const prompt = async (index: number): Promise<string> => (await fake.prompts())[index] ?? "";

describe("a new draft", () => {
  it("carries the combined prompt with the video section and its data blocks, and records its kinds", async () => {
    catalogMock.videoList.mockResolvedValue(ok({ videos: [{ origin: "studio", slug: "two-boxes", assetId: "video:two-boxes", title: "Two boxes", topic: "tcp-congestion-control", durationSeconds: 61 }] }));
    const { record } = await drafts.create({});
    expect(record).toMatchObject({ plannerKinds: ["diagram", "video"], conversational: true, sourceKind: "diagram" });
    const system = await readFile(plannerSystemPath(record.id), "utf8");
    expect(system).toContain("# A video brief");
    expect(system).toContain("two-boxes | Two boxes | tcp-congestion-control | 1 min 1 s | studio");
    expect(system).toContain("-----BEGIN VOICES-----");
  });

  it("opens on a studio video with its CHANGING block, and never falls back to a same-slug diagram", async () => {
    catalogMock.videoShow.mockResolvedValue(ok({ video: { slug: "two-boxes", title: "Two boxes", topic: "tcp-congestion-control", durationSeconds: 61, sourceHash: "abc", revision: 3, brief: narratedBrief() } }));
    const { record } = await drafts.create({ source: "two-boxes", sourceKind: "video" });
    expect(record).toMatchObject({ sourceKind: "video", kind: "video", source: "two-boxes", sourceHash: "abc", sourceRevision: 3 });
    const system = await readFile(plannerSystemPath(record.id), "utf8");
    expect(system).toContain("-----BEGIN CHANGING-----\nslug: two-boxes");
    expect(system).toContain("say: A request starts at the client.");
    expect(system).not.toContain("-----BEGIN EXTENDING-----");
    expect(catalogMock.diagramList).toHaveBeenCalled();

    // A diagram checkout that shares the video's slug says nothing about the
    // video (C11 is a diagram check; the #207 review).
    await mkdir(path.join(process.env.STUDIO_HOME!, "work"), { recursive: true });
    await writeFile(path.join(process.env.STUDIO_HOME!, "work", "two-boxes.tldr"), '{"a diagram":"that changed"}');
    await writeFile(path.join(process.env.STUDIO_HOME!, "work", "two-boxes.checkout.json"), '{"revision": 9}');
    expect((await drafts.view(record.id)).sourceChanged).toBe(false);

    catalogMock.videoShow.mockResolvedValue(ok({ video: null }));
    await expect(drafts.create({ source: "a-diagram-slug", sourceKind: "video" })).rejects.toMatchObject({
      status: 404,
      detail: { reason: "no-video" },
    });
    await expect(drafts.create({ source: "x", sourceKind: "podcast" })).rejects.toMatchObject({ status: 400, detail: { field: "sourceKind" } });
  });
});

describe("mentions on a message (D57)", () => {
  it("are checked against the text, not trusted", async () => {
    const { record } = await drafts.create({});
    const refused = (text: string, mentions: unknown) => drafts.send(record.id, text, mentions);
    await expect(refused("@video x", [{ kind: "video", start: 0, end: 9 }])).rejects.toMatchObject({ status: 400, detail: { field: "mentions" } });
    await expect(refused("@video x", [{ kind: "diagram", start: 0, end: 6 }])).rejects.toMatchObject({ status: 400, detail: { field: "mentions" } });
    await expect(refused("@video x", [{ kind: "podcast", start: 0, end: 6 }])).rejects.toMatchObject({ status: 400, detail: { field: "mentions" } });
    await expect(refused("@video @video", [{ kind: "video", start: 0, end: 6 }, { kind: "video", start: 7, end: 13 }])).rejects.toMatchObject({ status: 400, detail: { field: "mentions" } });
    await expect(refused("@video", [{ kind: "video", start: 0, end: 6 }, { kind: "video", start: 1, end: 7 }])).rejects.toMatchObject({ status: 400 });
    await expect(refused("x", "@video")).rejects.toMatchObject({ status: 400, detail: { field: "mentions" } });
    // A bare tag in an empty conversation has nothing to make it from (T15).
    await expect(refused("  @video ", [{ kind: "video", start: 2, end: 8 }])).rejects.toMatchObject({ status: 400, detail: { field: "text" } });
    expect(drafts.get(record.id)?.turns).toBe(0);
  });

  it("refuses a kind the draft's prompt does not carry (T4)", async () => {
    process.env.STUDIO_VIDEO_KIND = "off";
    try {
      const { record } = await drafts.create({});
      expect(record.plannerKinds).toEqual(["diagram"]);
      await expect(drafts.send(record.id, ...chips("attention", "video"))).rejects.toMatchObject({
        status: 409,
        detail: { reason: "kind-not-in-conversation", kind: "video" },
      });
    } finally {
      process.env.STUDIO_VIDEO_KIND = "on";
    }
  });

  it("write the TAGS block ahead of the words, record the chips, and keep their positions past trimmed space", async () => {
    await fake.script([{ text: both() }]);
    const { record } = await drafts.create({});
    const [text, mentions] = chips("how TCP opens a connection", "video", "diagram");
    await drafts.send(record.id, `  ${text}`, mentions.map((m) => ({ ...m, start: m.start + 2, end: m.end + 2 })));
    await drafts.settled(record.id);
    expect(await prompt(0)).toBe(`-----BEGIN TAGS-----\nvideo\ndiagram\n-----END TAGS-----\n\n${text}`);
    const view = await drafts.view(record.id);
    const message = view.transcript[0]!;
    expect(message).toMatchObject({ role: "person", text, mentions: [{ kind: "video", start: 0, end: 6 }, { kind: "diagram", start: 7, end: 15 }] });
    expect(text.slice(message.mentions![1]!.start, message.mentions![1]!.end)).toBe("@diagram");
  });
});

describe("with no tag: a conversation (D58)", () => {
  it("answers with no brief, surfaces the suggestion stripped from the prose, and drops an untagged brief (T24)", async () => {
    await fake.script([{ text: `A diagram would help here.\n\n${block("suggest", { kinds: ["diagram", "podcast"] })}\n\n${block("brief", { kind: "diagram", ...good })}` }]);
    const { record } = await drafts.create({});
    await send(record.id, "how does TCP back off?");
    expect(await prompt(0)).toBe("how does TCP back off?");
    const view = await drafts.view(record.id);
    const reply = view.transcript.at(-1)!;
    expect(reply).toMatchObject({ role: "planner", suggest: ["diagram"], briefsIgnored: ["diagram"] });
    expect(reply.text).not.toContain("```suggest");
    expect(reply.briefs).toBeUndefined();
    expect(view.state).toBe("open");
    expect(view.slots).toEqual({});
  });
});

describe("several tags, several briefs (D60, D61)", () => {
  it("lands a card per kind, paired by the request, with Make both's pair in the view", async () => {
    await fake.script([{ text: both() }]);
    const { record } = await drafts.create({});
    await send(record.id, "attention weights", "diagram", "video");
    const view = await drafts.view(record.id);
    expect(view.state).toBe("briefed");
    expect(view.kind).toBe("video");
    expect(view.slots.diagram).toMatchObject({ state: "briefed", live: true, requestSeq: 2, waiting: null, busy: null, replaces: null });
    expect(view.slots.video).toMatchObject({ state: "briefed", live: true, requestSeq: 2, briefBy: "planner" });
    expect(view.pair).toEqual({ requestSeq: 2, kinds: ["diagram", "video"] });
    expect(view.transcript.at(-1)!.briefs!.map((brief) => brief.kind).sort()).toEqual(["diagram", "video"]);
    // The row mirrors the newest brief, and its kind (D62).
    const onDisk = JSON.parse(await readFile(draftJsonPath(record.id), "utf8")) as Record<string, unknown>;
    expect(onDisk).toMatchObject({ kind: "video", state: "briefed", title: videoBrief.title });
  });

  it("retries only the refused kind, ignores the retry's other brief, and pairs across the two replies (T31)", async () => {
    await fake.script([
      { text: both(undefined, { kind: "video", ...videoBrief, targetSeconds: 300 }) },
      { text: both({ kind: "diagram", ...good, title: "Should be ignored" }) },
    ]);
    const { record } = await drafts.create({});
    await send(record.id, "attention weights", "diagram", "video");
    const retry = await prompt(1);
    expect(retry).toContain("Your video brief was refused:\n- video, targetSeconds:");
    expect(retry).toContain("and no other brief");
    const view = await drafts.view(record.id);
    const replies = view.transcript.filter((entry) => entry.role === "planner");
    expect(replies).toHaveLength(2);
    // The first reply keeps its valid card; it is not superseded.
    expect(replies[0]).toMatchObject({ briefs: [expect.objectContaining({ kind: "diagram" })], briefsInvalid: [expect.objectContaining({ kind: "video", retried: true })] });
    expect(replies[0]!.superseded).toBeUndefined();
    expect(replies[1]).toMatchObject({ briefs: [expect.objectContaining({ kind: "video", requestSeq: 2 })], briefsIgnored: ["diagram"] });
    expect(view.slots.diagram?.brief?.title).toBe("TCP congestion window");
    expect(view.pair).toEqual({ requestSeq: 2, kinds: ["diagram", "video"] });
    expect(drafts.get(record.id)?.turns).toBe(2);
  });

  it("shows a kind refused twice as its own error, stops it waiting, and leaves the other card live (T7)", async () => {
    const badVideo = { kind: "video", ...videoBrief, targetSeconds: 300 };
    await fake.script([{ text: both(undefined, badVideo) }, { text: videoOnly(badVideo) }]);
    const { record } = await drafts.create({});
    await send(record.id, "attention weights", "diagram", "video");
    const view = await drafts.view(record.id);
    expect(view.error).toMatchObject({ kind: "brief-invalid", field: "targetSeconds", briefKind: "video" });
    expect(view.slots.video).toMatchObject({ brief: null, waiting: null });
    expect(view.slots.diagram).toMatchObject({ live: true });
    expect(view.pair).toBeNull();
    expect(view.waiting).toEqual([]);
  });
});

describe("a tag waits for its brief (T30)", () => {
  it("carries a WAITING block on the untagged answer, and pairs the brief with the tagged message", async () => {
    await fake.script([{ text: "Narrated, or silent?" }, { text: videoOnly() }]);
    const { record } = await drafts.create({});
    await send(record.id, "attention weights", "video");
    let view = await drafts.view(record.id);
    expect(view.waiting).toEqual(["video"]);
    expect(view.slots.video).toMatchObject({ waiting: { requestSeq: 2 }, brief: null });
    await send(record.id, "narrated");
    expect(await prompt(1)).toBe("-----BEGIN WAITING-----\nvideo\n-----END WAITING-----\n\nnarrated");
    view = await drafts.view(record.id);
    expect(view.waiting).toEqual([]);
    expect(view.slots.video).toMatchObject({ state: "briefed", requestSeq: 2, waiting: null });
  });

  it("stops waiting without a turn, and a brief landing after is dropped", async () => {
    await fake.script([{ text: "Narrated, or silent?" }, { text: videoOnly(), hangMs: 300 }]);
    const { record } = await drafts.create({});
    await send(record.id, "attention weights", "video");
    await drafts.send(record.id, "narrated");
    // The race: Stop waiting while the turn that would answer it is in flight.
    const stopped = await drafts.stopWaiting(record.id, "video");
    expect(stopped.changed).toBe(true);
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.slots.video).toMatchObject({ brief: null, waiting: null });
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", briefsIgnored: ["video"] });
    // A second press writes nothing; an unknown kind is refused.
    expect((await drafts.stopWaiting(record.id, "video")).changed).toBe(false);
    await expect(drafts.stopWaiting(record.id, "podcast")).rejects.toMatchObject({ status: 400, detail: { field: "kind" } });
  });

  it("refuses a tag while a turn is in flight, and records no waiting for it", async () => {
    await fake.script([{ text: "thinking", hangMs: 300 }]);
    const { record } = await drafts.create({});
    await drafts.send(record.id, "hello");
    await expect(drafts.send(record.id, ...chips("now", "video"))).rejects.toMatchObject({ status: 409, detail: { reason: "in-flight" } });
    await drafts.settled(record.id);
    expect((await drafts.view(record.id)).waiting).toEqual([]);
  });
});

describe("a hold, and Use this brief (T29)", () => {
  it("holds the contradicted card, refuses its press, and puts it back with no turn", async () => {
    await fake.script([
      { text: videoOnly() },
      { text: `Understood, that topic is wrong.\n\n${block("hold", { kinds: ["video", "diagram"], reason: "You said the topic is wrong" })}\n\n${block("suggest", { kinds: ["video"] })}` },
    ]);
    const { record } = await drafts.create({});
    await send(record.id, "attention", "video");
    await send(record.id, "that's the wrong topic");
    let view = await drafts.view(record.id);
    const reply = view.transcript.at(-1)!;
    expect(reply).toMatchObject({ hold: { kinds: ["video"], reason: "You said the topic is wrong" }, suggest: ["video"] });
    expect(view.slots.video).toMatchObject({ held: { reason: "You said the topic is wrong" }, live: true });
    expect(view.slots.diagram).toBeUndefined();
    await expect(drafts.drawOne(record.id, "press", "video")).rejects.toMatchObject({ status: 409, detail: { reason: "held" } });
    await expect(drafts.useBrief(record.id, "video", "1")).rejects.toMatchObject({ status: 409, detail: { reason: "brief-changed" } });
    const used = await drafts.useBrief(record.id, "video", String(view.slots.video!.briefSeq));
    expect(used.changed).toBe(true);
    view = await drafts.view(record.id);
    expect(view.slots.video?.held).toBeNull();
    expect(drafts.get(record.id)?.undelivered.at(-1)).toContain("Use this brief");
    await expect(drafts.drawOne(record.id, "press", "video")).resolves.toMatchObject({ kind: "video", created: true });
  });
});

describe("Make both (D60)", () => {
  async function paired(text = both()): Promise<string> {
    await fake.script([{ text }]);
    const { record } = await drafts.create({});
    await send(record.id, "attention weights", "diagram", "video");
    return record.id;
  }

  it("starts both, each with its own key, and a repeated press returns the same jobs", async () => {
    const id = await paired();
    const answer = await drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    expect(answer.single).toBe(false);
    if (answer.single) return;
    expect(answer.results).toEqual([
      { kind: "diagram", jobId: expect.stringMatching(/^job-d-/), created: true, replaces: null },
      { kind: "video", jobId: expect.stringMatching(/^job-v-/), created: true, replaces: null },
    ]);
    expect(runner.enqueue.mock.calls[0]![0]).toMatchObject({ idempotencyKey: `draft:${id}:d` });
    expect(videoRunner.enqueue.mock.calls[0]![0]).toMatchObject({ idempotencyKey: `draft:${id}:v`, slug: "tcp-congestion-window" });
    const view = await drafts.view(id);
    expect(view.slots.diagram).toMatchObject({ state: "drawing", busy: { state: "queued" } });
    expect(view.slots.video).toMatchObject({ state: "drawing", busy: { state: "queued" } });
    const again = await drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    expect(again.single ? null : again.results.map((result) => ("created" in result ? result.created : null))).toEqual([false, false]);
    expect(runner.enqueue).toHaveBeenCalledTimes(1);
    expect(videoRunner.enqueue).toHaveBeenCalledTimes(1);
  });

  it("starts one when the other is refused, and the refusal sits under its own card (T26)", async () => {
    const id = await paired();
    videoRunner.admit.mockRejectedValueOnce(new JobRefused(503, "this machine cannot run a video job right now, so nothing was queued"));
    const answer = await drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    if (answer.single) throw new Error("expected Make both");
    expect(answer.results[0]).toMatchObject({ kind: "diagram", created: true });
    expect(answer.results[1]).toEqual({ kind: "video", status: 503, refusal: { error: "this machine cannot run a video job right now, so nothing was queued", detail: null } });
    const view = await drafts.view(id);
    expect(view.slots.video).toMatchObject({ state: "briefed", live: true });
    expect(view.transcript.at(-1)?.text).toContain("Make video was refused");
    // The refused card's own press stays for a retry.
    await expect(drafts.drawOne(id, "v", "video")).resolves.toMatchObject({ kind: "video", created: true });
  });

  it("creates a shared proposed topic once and clears it on both cards (T11); a failed topic refuses only the cards naming it (T32)", async () => {
    const topic = { slug: "attention-mechanisms", title: "Attention mechanisms", domain: "machine-learning", summary: "x", aliases: [], relations: [] };
    const withTopic = `${both({ kind: "diagram", ...good, topic: topic.slug }, { kind: "video", ...videoBrief, topic: topic.slug })}\n\n${block("topic", topic)}`;
    const id = await paired(withTopic);
    const view = await drafts.view(id);
    expect(view.slots.diagram?.pendingTopic?.entry.slug).toBe(topic.slug);
    expect(view.slots.video?.pendingTopic?.entry.slug).toBe(topic.slug);
    catalogMock.topicAdd.mockImplementation(async () => {
      catalogMock.topicList.mockResolvedValue(topicListAnswer([...(topicListAnswer().json as { topics: unknown[] }).topics ?? [], { slug: topic.slug, title: topic.title, domain: topic.domain, summary: null, aliases: [], relations: [], maps: { manimkc: [], courses: [], concepts: [] }, incoming: [] }]));
      return ok();
    });
    const answer = await drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    if (answer.single) throw new Error("expected Make both");
    expect(catalogMock.topicAdd).toHaveBeenCalledTimes(1);
    expect(answer.results.every((result) => "jobId" in result)).toBe(true);
    const after = await drafts.view(id);
    expect(after.slots.diagram?.pendingTopic).toBeNull();
    expect(after.slots.video?.pendingTopic).toBeNull();
  });

  it("refuses the diagram on its failed topic and starts the video on an existing one (T32)", async () => {
    const topic = { slug: "attention-mechanisms", title: "Attention mechanisms", domain: "machine-learning", summary: "x", aliases: [], relations: [] };
    const id = await paired(`${both({ kind: "diagram", ...good, topic: topic.slug })}\n\n${block("topic", topic)}`);
    catalogMock.topicAdd.mockResolvedValue({ ok: false, json: { error: "domain refused" }, error: "exited 1", offline: false });
    const answer = await drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    if (answer.single) throw new Error("expected Make both");
    expect(answer.results[0]).toMatchObject({ kind: "diagram", status: 400, refusal: { error: "domain refused" } });
    expect(answer.results[1]).toMatchObject({ kind: "video", created: true });
  });

  it("is refused while a turn is in flight, and a message is refused while it is pressed", async () => {
    const id = await paired();
    await fake.script([{ text: "hmm", hangMs: 300 }]);
    await drafts.send(id, "one more thought");
    await expect(drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] })).rejects.toMatchObject({
      status: 409,
      detail: { reason: "in-flight" },
    });
    await drafts.settled(id);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    videoRunner.admit.mockImplementationOnce(async () => {
      await gate;
      return { revision: null };
    });
    const pressing = drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    await expect(drafts.send(id, "wait")).rejects.toMatchObject({ status: 409, detail: { reason: "draw-in-progress" } });
    await expect(drafts.drawOne(id, "other", "diagram")).rejects.toMatchObject({ status: 409, detail: { reason: "draw-in-progress" } });
    release();
    await pressing;
  });

  it("refuses a malformed request whole", async () => {
    const id = await paired();
    await expect(drafts.draw(id, { items: [{ kind: "video", idempotencyKey: "a" }, { kind: "video", idempotencyKey: "b" }] })).rejects.toMatchObject({ status: 400 });
    await expect(drafts.draw(id, { items: [{ kind: "diagram", idempotencyKey: "a" }, { kind: "video", idempotencyKey: "a" }] })).rejects.toMatchObject({ status: 400 });
    await expect(drafts.draw(id, { items: [{ kind: "video" }] })).rejects.toMatchObject({ status: 400, detail: { field: "items[0].idempotencyKey" } });
    await expect(drafts.draw(id, { items: [] })).rejects.toMatchObject({ status: 400, detail: { field: "items" } });
  });
});

describe("a kind's job holds only its own press (D60)", () => {
  it("accepts messages while a job runs, holds that kind's press, and leaves the other kind free (T8)", async () => {
    await fake.script([{ text: both() }, { text: `A newer diagram.\n\n${block("brief", { kind: "diagram", ...good, title: "Newer" })}` }]);
    const { record } = await drafts.create({});
    await send(record.id, "attention", "diagram", "video");
    const { jobId } = await drafts.drawOne(record.id, "d1", "diagram");
    await send(record.id, "make it newer", "diagram");
    const view = await drafts.view(record.id);
    expect(view.slots.diagram).toMatchObject({ state: "drawing", brief: { title: "Newer" }, busy: { jobId, state: "queued" } });
    await expect(drafts.drawOne(record.id, "d2", "diagram")).rejects.toMatchObject({ status: 409, detail: { reason: "kind-busy", jobId } });
    await expect(drafts.drawOne(record.id, "v1", "video")).resolves.toMatchObject({ kind: "video", created: true });
    // The job's verdict leaves the newer brief in force, pressable.
    await store.update(jobId, { state: "running" } as never);
    await store.update(jobId, { state: "failed", error: "boom" } as never);
    await until(() => drafts.get(record.id)?.slots?.diagram?.state === "briefed", "the failed job never freed the diagram card");
    await expect(drafts.drawOne(record.id, "d2", "diagram")).resolves.toMatchObject({ kind: "diagram", created: true });
  });
});

describe("a video in review (D52)", () => {
  it("is told to the planner, and a newer brief on its slug replaces it in one step", async () => {
    await fake.script([{ text: videoOnly() }, { text: videoOnly({ kind: "video", ...videoBrief, title: "Two boxes, slower" }) }]);
    const { record } = await drafts.create({});
    await send(record.id, "two boxes", "video");
    const { jobId } = await drafts.drawOne(record.id, "v1", "video");
    await videoStore.update(jobId, { state: "running" } as never);
    await videoStore.update(jobId, { state: "awaiting_review", gate: { durationSeconds: 61.2, findings: [] } } as never);
    await until(() => drafts.get(record.id)?.undelivered.some((note) => note.includes("is ready for review")) === true, "the review note never came");
    expect(drafts.get(record.id)?.undelivered.at(-1)).toContain("The video `tcp-congestion-window` is ready for review, 1 min 1 s.");
    // In review with no newer brief: busy.
    expect((await drafts.view(record.id)).slots.video).toMatchObject({ busy: { jobId, state: "awaiting_review" }, replaces: null });

    await send(record.id, "say it slower", "video");
    const view = await drafts.view(record.id);
    expect(view.slots.video).toMatchObject({ busy: null, replaces: { jobId } });
    const pressed = await drafts.drawOne(record.id, "v2", "video");
    expect(pressed).toMatchObject({ kind: "video", created: true, replaces: jobId });
    expect(videoRunner.enqueue.mock.calls[1]![1]).toEqual({ jobId, agentSessionId: null, changes: null, discard: true });
    const after = await drafts.view(record.id);
    // The parent's discard was the press's own, not a verdict: no "discarded" note, still drawing.
    expect(after.slots.video).toMatchObject({ state: "drawing", jobId: pressed.jobId });
    expect(after.transcript.some((entry) => entry.text.includes("was discarded; nothing landed"))).toBe(false);
    expect(after.transcript.some((entry) => entry.text.includes("was discarded and replaced by the new brief"))).toBe(true);
  });
});

describe("a draft from before tags", () => {
  it("loading while drawing, knows the brief its job draws: an edit mid-draw is refused, and after the verdict it is pressable (#207 review)", async () => {
    const { record } = await drafts.create({});
    const job = await store.create({
      id: "old-job",
      kind: "diagram",
      state: "running",
      slug: good.slug,
      topic: good.topic,
      targetPath: `learn/assets/${good.slug}.tldr`,
      draftId: record.id,
      brief: good,
      idempotencyKey: "old",
      requestedAt: new Date().toISOString(),
      gate: null,
      error: null,
    } as never);
    const legacy = { ...drafts.get(record.id)! } as Record<string, unknown>;
    for (const key of ["slots", "plannerKinds", "conversational", "sourceKind"]) delete legacy[key];
    await writeFile(draftJsonPath(record.id), JSON.stringify({ ...legacy, state: "drawing", brief: good, briefSeq: 1, briefBy: "planner", jobIds: [job.id] }));
    await drafts.drain();
    drafts = build();
    await drafts.load();
    expect(drafts.get(record.id)?.slots?.diagram).toMatchObject({ state: "drawing", briefSeq: 1, drawnSeq: 1 });
    await expect(drafts.editBrief(record.id, { ...good, title: "Mid-draw" }, "1")).rejects.toMatchObject({ status: 409, detail: { reason: "drawing" } });
    await store.update(job.id, { state: "failed", error: "boom" } as never);
    await until(() => drafts.get(record.id)?.slots?.diagram?.state === "briefed", "the verdict never freed the card");
    await expect(drafts.editBrief(record.id, { ...good, title: "After" }, "1")).resolves.toMatchObject({ changed: true });
    await expect(drafts.drawOne(record.id, "after")).resolves.toMatchObject({ kind: "diagram", created: true });
  });

  it("loads its one brief as a diagram slot, and reads an untagged message as tagged Diagram", async () => {
    const { record } = await drafts.create({});
    const legacy = { ...drafts.get(record.id)! } as Record<string, unknown>;
    delete legacy.slots;
    delete legacy.plannerKinds;
    delete legacy.conversational;
    delete legacy.sourceKind;
    // Saved before D53: the old validateBrief filled in `model: "sonnet"`.
    await writeFile(draftJsonPath(record.id), JSON.stringify({ ...legacy, state: "briefed", brief: { ...good, model: "sonnet" }, briefSeq: 1, briefBy: "planner" }));
    await drafts.drain();
    drafts = build();
    await drafts.load();
    let view = await drafts.view(record.id);
    expect(view).toMatchObject({ plannerKinds: ["diagram"], conversational: false, state: "briefed" });
    expect(view.slots.diagram).toMatchObject({ state: "briefed", brief: { title: good.title } });
    // A draft never carries a model; the settings panel decides (the #207 review).
    expect(view.slots.diagram?.brief).not.toHaveProperty("model");
    expect(view.brief).not.toHaveProperty("model");
    await drafts.drawOne(record.id, "legacy-press");
    expect(runner.enqueue.mock.calls[0]![0]).not.toHaveProperty("model");
    await fake.script([{ text: proposing({ ...good, title: "Revised" }) }]);
    await send(record.id, "make it about loss");
    // No TAGS block: its recorded prompt has never heard of one.
    expect(await prompt(0)).toBe("make it about loss");
    view = await drafts.view(record.id);
    expect(view.slots.diagram?.brief?.title).toBe("Revised");
    await expect(drafts.send(record.id, ...chips("x", "video"))).rejects.toMatchObject({ status: 409, detail: { reason: "kind-not-in-conversation" } });
  });
});
