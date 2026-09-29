import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, type FakeClaude } from "./fake-claude";
import { topicListAnswer } from "./vocabulary";

/**
 * Phase 2a's routes over a real socket, in the shapes the web app builds
 * against (docs/STUDIO-MENTIONS.md, "API and schema"; STUDIO-VIDEOS.md, "API"
 * and D53): messages with mentions, the slots routes, Make both, the draft
 * view's slots, `GET /api/videos`, and the agent settings.
 */

vi.hoisted(() => {
  // Never the real CLI, whatever reads config.ts first.
  process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude-until-the-fake-is-ready";
  process.env.STUDIO_VIDEO_KIND = "on";
});
const fake: FakeClaude = await fakeClaude();
process.env.STUDIO_CLAUDE_BIN = fake.bin;

const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
  diagramList: vi.fn(),
  videoList: vi.fn(),
  videoShow: vi.fn(),
  preferenceGet: vi.fn(),
  preferenceSet: vi.fn(),
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

const { createApi } = await import("../src/api");
const { Drafts } = await import("../src/drafts");
const { JobStore, RecordStore } = await import("../src/store");
const { Mirrors } = await import("../src/mirrors");
const { narratedBrief } = await import("./video-fixture");
const { CLAUDE_BIN } = await import("../src/config");
if (CLAUDE_BIN !== fake.bin) throw new Error(`the planner would spawn ${CLAUDE_BIN}, not the fake`);

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });
const good = {
  kind: "diagram",
  intent: "Show how a sender's window reacts to loss.",
  title: "TCP congestion window",
  topic: "tcp-congestion-control",
  slug: "tcp-congestion-window",
  mode: "new",
  elements: [{ label: "Sender" }, { label: "Receiver" }],
  relations: [{ from: "Sender", to: "Receiver" }],
  concepts: [],
};
const video = (() => {
  const brief: Record<string, unknown> = { kind: "video", ...narratedBrief(), topic: "tcp-congestion-control", slug: "tcp-congestion-window" };
  delete brief.idempotencyKey;
  return brief;
})();
const fenced = (tag: string, body: unknown) => `\`\`\`${tag}\n${JSON.stringify(body)}\n\`\`\``;

let server: Server;
let base: string;
let drafts: InstanceType<typeof Drafts>;
let claudeDir: string;

const post = (route: string, body: unknown) =>
  fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const put = (route: string, body: unknown) =>
  fetch(`${base}${route}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = async (route: string) => (await fetch(`${base}${route}`)).json() as Promise<Record<string, unknown>>;

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-mentions-api-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  claudeDir = path.join(process.env.STUDIO_HOME, "claude-config");
  await mkdir(claudeDir, { recursive: true });
  await writeFile(path.join(claudeDir, "settings.json"), JSON.stringify({ model: "claude-fable-5-1[1m]", effortLevel: "high" }));
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  await fake.script([]);
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  catalogMock.videoList.mockReset().mockResolvedValue(ok({ videos: [] }));
  catalogMock.videoShow.mockReset().mockResolvedValue(ok({ video: null }));
  catalogMock.preferenceGet.mockReset().mockResolvedValue(ok({ value: null }));
  catalogMock.preferenceSet.mockReset().mockResolvedValue(ok({ changed: true }));
  catalogMock.status.mockReset().mockResolvedValue(ok());
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  const store = new JobStore();
  const videoStore = new RecordStore("video");
  const runner = {
    enqueue: vi.fn(async (brief: { slug: string; idempotencyKey: string }, _p: unknown, options: { draftId: string }) => ({
      record: await store.create({ id: `job-d-${Math.random().toString(36).slice(2, 8)}`, kind: "diagram", state: "queued", slug: brief.slug, draftId: options.draftId, brief, idempotencyKey: brief.idempotencyKey, requestedAt: new Date().toISOString(), targetPath: "t", gate: null, error: null } as never),
      created: true,
      jobsAhead: 0,
    })),
    admit: vi.fn(async () => ({})),
    assertUnderCap: vi.fn(),
    canvasOpen: () => false,
    busy: 0,
    capStatus: () => ({ capUsd: null, exceeded: false, totalUsd: 0, jobs: 0, oldestCountedAt: null, oldestAgesOutAt: null, plannerUsd: 0, plannerTurns: 0 }),
  };
  const videoRunner = {
    enqueue: vi.fn(async (brief: { slug: string; idempotencyKey: string }, _p: unknown, options: { draftId: string }) => ({
      record: await videoStore.create({ id: `job-v-${Math.random().toString(36).slice(2, 8)}`, kind: "video", state: "queued", slug: brief.slug, draftId: options.draftId, brief, idempotencyKey: brief.idempotencyKey, requestedAt: new Date().toISOString(), targetPath: "v", gate: null, error: null } as never),
      created: true,
      jobsAhead: 0,
    })),
    admit: vi.fn(async () => ({ revision: null })),
    busy: 0,
  };
  drafts = new Drafts(store, runner as never, { store: videoStore as never, runner: videoRunner as never });
  const doctor = { current: () => null };
  server = createApi({ store, runner: runner as never, mirrors: new Mirrors(), drafts, video: { store: videoStore as never, runner: videoRunner as never, doctor: doctor as never } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await drafts.drain();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
  delete process.env.CLAUDE_CONFIG_DIR;
});

afterAll(async () => {
  await fake.cleanup();
});

async function draft(): Promise<string> {
  const created = await post("/api/drafts", { idempotencyKey: `k-${Math.random()}` });
  expect(created.status).toBe(201);
  const body = (await created.json()) as { draftId: string; plannerKinds: string[]; sourceKind: string };
  expect(body).toMatchObject({ plannerKinds: ["diagram", "video"], sourceKind: "diagram" });
  return body.draftId;
}

describe("messages with mentions", () => {
  it("answers 202 with the chips recorded, and refuses bad ones in the { error, detail } envelope", async () => {
    await fake.script([{ text: `Both.\n\n${fenced("brief", good)}\n\n${fenced("brief", video)}` }]);
    const id = await draft();
    const bad = await post(`/api/drafts/${id}/messages`, { text: "@video x", mentions: [{ kind: "video", start: 0, end: 4 }] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: expect.any(String), detail: { field: "mentions" } });
    const bare = await post(`/api/drafts/${id}/messages`, { text: "@video", mentions: [{ kind: "video", start: 0, end: 6 }] });
    expect(bare.status).toBe(400);
    expect(await bare.json()).toMatchObject({ detail: { field: "text" } });

    const sent = await post(`/api/drafts/${id}/messages`, {
      text: "@diagram and @video of the window",
      mentions: [{ kind: "diagram", start: 0, end: 8 }, { kind: "video", start: 13, end: 19 }],
    });
    expect(sent.status).toBe(202);
    await drafts.settled(id);
    const view = await get(`/api/drafts/${id}`);
    expect(view).toMatchObject({
      plannerKinds: ["diagram", "video"],
      conversational: true,
      sourceKind: "diagram",
      kind: "video",
      state: "briefed",
      waiting: [],
      pair: { requestSeq: 2, kinds: ["diagram", "video"] },
      // One release: the newest brief of any kind, for a web app from before.
      brief: { slug: "tcp-congestion-window", voice: "af_heart" },
    });
    const slots = view.slots as Record<string, Record<string, unknown>>;
    expect(slots.diagram).toMatchObject({ kind: "diagram", state: "briefed", live: true, requestSeq: 2, held: null, waiting: null, busy: null, replaces: null, jobId: null, jobState: null, briefBy: "planner" });
    expect(slots.video).toMatchObject({ kind: "video", state: "briefed", live: true, requestSeq: 2 });
    const transcript = view.transcript as Record<string, unknown>[];
    expect(transcript[0]).toMatchObject({ role: "person", mentions: [{ kind: "diagram", start: 0, end: 8 }, { kind: "video", start: 13, end: 19 }] });
    expect((transcript[1]!.briefs as { kind: string; requestSeq: number }[]).map((b) => [b.kind, b.requestSeq])).toEqual([
      ["diagram", 2],
      ["video", 2],
    ]);
    const list = (await get("/api/drafts")).drafts as Record<string, unknown>[];
    expect(list[0]).toMatchObject({ draftId: id, kind: "video", kinds: ["diagram", "video"] });
  });
});

describe("the slots routes and Make both", () => {
  it("stops waiting, uses a held brief, and answers Make both per item", async () => {
    await fake.script([
      { text: "Narrated, or silent?" },
      { text: `Here.\n\n${fenced("brief", video)}` },
      { text: `Right, wrong topic.\n\n${fenced("hold", { kinds: ["video"], reason: "Wrong topic" })}` },
      { text: `Here.\n\n${fenced("brief", good)}` },
    ]);
    const id = await draft();
    await post(`/api/drafts/${id}/messages`, { text: "@video attention", mentions: [{ kind: "video", start: 0, end: 6 }] });
    await drafts.settled(id);
    const stopped = await post(`/api/drafts/${id}/slots/video/stop-waiting`, {});
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toMatchObject({ draftId: id, kind: "video", changed: true, waiting: [], slots: { video: { waiting: null } } });
    expect(((await (await post(`/api/drafts/${id}/slots/video/stop-waiting`, {})).json()) as { changed: boolean }).changed).toBe(false);
    expect((await post(`/api/drafts/${id}/slots/podcast/stop-waiting`, {})).status).toBe(400);

    // Tag again, get the card, then a hold.
    await post(`/api/drafts/${id}/messages`, { text: "@video narrated", mentions: [{ kind: "video", start: 0, end: 6 }] });
    await drafts.settled(id);
    await post(`/api/drafts/${id}/messages`, { text: "that's the wrong topic" });
    await drafts.settled(id);
    let view = await get(`/api/drafts/${id}`);
    const held = (view.slots as Record<string, { held: unknown; briefSeq: number }>).video!;
    expect(held.held).toMatchObject({ reason: "Wrong topic" });
    const refused = await post(`/api/drafts/${id}/draw`, { idempotencyKey: "v1", kind: "video" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ detail: { reason: "held", kind: "video" } });
    expect((await post(`/api/drafts/${id}/slots/video/use?base=999`, {})).status).toBe(409);
    const used = await post(`/api/drafts/${id}/slots/video/use?base=${held.briefSeq}`, {});
    expect(used.status).toBe(200);
    expect(await used.json()).toMatchObject({ changed: true, slots: { video: { held: null } } });

    // A diagram too, from a later request: two live cards, no pair.
    await post(`/api/drafts/${id}/messages`, { text: "@diagram as well", mentions: [{ kind: "diagram", start: 0, end: 8 }] });
    await drafts.settled(id);
    view = await get(`/api/drafts/${id}`);
    expect(view.pair).toBeNull();

    const both = await post(`/api/drafts/${id}/draw`, { items: [{ kind: "diagram", idempotencyKey: "d" }, { kind: "video", idempotencyKey: "v" }] });
    expect(both.status).toBe(200);
    const answer = (await both.json()) as { results: Record<string, unknown>[] };
    expect(answer.results).toEqual([
      { kind: "diagram", jobId: expect.stringMatching(/^job-d-/), created: true, replaces: null },
      { kind: "video", jobId: expect.stringMatching(/^job-v-/), created: true, replaces: null },
    ]);
    const busy = await post(`/api/drafts/${id}/draw`, { idempotencyKey: "v2", kind: "video" });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ detail: { reason: "kind-busy", kind: "video" } });
    const one = await post(`/api/drafts/${id}/draw`, { idempotencyKey: "v", kind: "video" });
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ kind: "video", created: false, replaces: null, state: "drawing" });
  });

  it("edits a video brief by kind, and 409s a kind the base does not name", async () => {
    await fake.script([{ text: `Here.\n\n${fenced("brief", video)}` }]);
    const id = await draft();
    await post(`/api/drafts/${id}/messages`, { text: "@video attention", mentions: [{ kind: "video", start: 0, end: 6 }] });
    await drafts.settled(id);
    const view = await get(`/api/drafts/${id}`);
    const slot = (view.slots as Record<string, { brief: Record<string, unknown>; briefSeq: number }>).video!;
    const edited = await put(`/api/drafts/${id}/brief?base=${slot.briefSeq}&kind=video`, { ...slot.brief, title: "Attention, slowly" });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ kind: "video", brief: { title: "Attention, slowly" }, briefSeq: expect.any(Number) });
    const stale = await put(`/api/drafts/${id}/brief?base=${slot.briefSeq}&kind=video`, { ...slot.brief, title: "Again" });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ detail: { reason: "brief-changed" } });
    const refused = await put(`/api/drafts/${id}/brief?base=none&kind=video`, { ...slot.brief, targetSeconds: 600 });
    expect(refused.status).toBe(400);
    const after = await get(`/api/drafts/${id}`);
    expect(after.transcript as { text: string }[]).toContainEqual(expect.objectContaining({ text: expect.stringContaining('- title: "Two boxes" -> "Attention, slowly"') }));
  });
});

describe("GET /api/videos", () => {
  it("lists the owner's landed studio videos, with the poster by the video's own asset id", async () => {
    catalogMock.videoList.mockResolvedValue(
      ok({
        videos: [
          { origin: "studio", slug: "two-boxes", assetId: "video:two-boxes", title: "Two boxes", topic: "tcp-congestion-control", concepts: [], durationSeconds: 61.2, narrated: true, revision: 2, poster: { assetId: "poster:video:two-boxes", key: "k" }, updatedAt: "2026-09-29T00:00:00.000Z" },
          { origin: "studio", slug: "no-poster", assetId: "video:no-poster", title: null, topic: "t", concepts: [], durationSeconds: null, narrated: false, revision: 1, poster: null, updatedAt: "2026-09-28T00:00:00.000Z" },
          { origin: "manimkc", slug: null, assetId: "manimkc:out/x.mp4", title: "x", topic: null, concepts: [], durationSeconds: 9, narrated: true, revision: null, poster: null, updatedAt: "2026-09-27T00:00:00.000Z" },
        ],
      }),
    );
    const body = await get("/api/videos");
    expect(body.videos).toEqual([
      { slug: "two-boxes", title: "Two boxes", topic: "tcp-congestion-control", concepts: [], assetId: "video:two-boxes", posterAssetId: "video:two-boxes", durationSeconds: 61.2, narrated: true, revision: 2, updated: "2026-09-29T00:00:00.000Z" },
      { slug: "no-poster", title: null, topic: "t", concepts: [], assetId: "video:no-poster", posterAssetId: null, durationSeconds: null, narrated: false, revision: 1, updated: "2026-09-28T00:00:00.000Z" },
    ]);
    catalogMock.videoList.mockResolvedValue({ ok: false, json: null, error: "down", offline: true });
    expect((await fetch(`${base}/api/videos`)).status).toBe(503);
  });
});

describe("the agent settings (D53)", () => {
  it("reports both rows, what default resolves to, and the priced models; stores a row through the catalog", async () => {
    const view = await get("/api/settings/agent");
    expect(view).toMatchObject({
      video: { key: "studioVideoAgent", stored: null, value: { model: "default", effort: "default" }, model: { passed: "claude-fable-5-1[1m]", source: "claude-settings" }, effort: { passed: "high" } },
      diagram: { key: "studioDiagramAgent", stored: null, value: { model: "sonnet", effort: "default" }, model: { passed: "sonnet", source: "default" } },
      defaults: { model: "claude-fable-5-1[1m]", effort: "high" },
      efforts: ["low", "medium", "high", "xhigh", "max"],
    });
    expect((view.models as { value: string }[]).map((model) => model.value)).toEqual(["fable", "opus", "sonnet", "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5"]);

    const stored = await put("/api/settings/agent", { kind: "diagram", model: "opus", effort: "low" });
    expect(stored.status).toBe(200);
    expect(catalogMock.preferenceSet).toHaveBeenCalledWith("studioDiagramAgent", { model: "opus", effort: "low" });
    expect((await put("/api/settings/agent", { kind: "video", model: "--flag", effort: "low" })).status).toBe(400);
    expect((await put("/api/settings/agent", { kind: "video", model: "default", effort: "extreme" })).status).toBe(400);
    expect((await put("/api/settings/agent", { kind: "podcast", model: "default", effort: "default" })).status).toBe(400);
    catalogMock.preferenceSet.mockResolvedValue({ ok: false, json: null, error: "down", offline: true });
    expect((await put("/api/settings/agent", { kind: "video", model: "default", effort: "default" })).status).toBe(503);

    const health = await get("/api/health");
    expect(health.agent).toMatchObject({ defaults: { model: "claude-fable-5-1[1m]", effort: "high" }, video: { model: { source: "claude-settings" } } });
  });
});
