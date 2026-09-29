import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordStore } from "../src/store";
import type { ValidVideoBrief } from "../src/video/brief";
import type { VideoDoctor, VideoDoctorReport } from "../src/video/doctor";
import type { VideoJobRecord } from "../src/video/types";

import { narratedBrief } from "./video-fixture";

/**
 * The video runner's frame, with the catalog stubbed: the refusals made
 * before anything is written, the one-transaction discard and enqueue of a
 * change from review (D52), Accept through `video put` (idempotent retry
 * included), the reconcile, and a cancel before the start. The agent's own
 * session is the real run's to prove; nothing here starts one, since the
 * runner is drained before each test queues anything.
 */

const catalogMock = vi.hoisted(() => ({
  jobEnqueue: vi.fn(),
  jobClaim: vi.fn(),
  jobFinish: vi.fn(async () => ({ ok: true, json: {}, error: null, offline: false })),
  jobShow: vi.fn(),
  jobDiscard: vi.fn(async () => ({ ok: true, json: {}, error: null, offline: false })),
  sessionStart: vi.fn(),
  sessionEnd: vi.fn(async () => ({ ok: true, json: {}, error: null, offline: false })),
  videoShow: vi.fn(),
  videoCheckout: vi.fn(),
  videoPut: vi.fn(),
  preferenceGet: vi.fn(async () => ({ ok: true, json: { value: null }, error: null, offline: false })),
}));
vi.mock("../src/catalog", () => catalogMock);

const { VideoRunner, stillWorking } = await import("../src/video/runner");
const { acceptVideo, discardVideo } = await import("../src/video/review");

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

function doctor(report: Partial<VideoDoctorReport> = {}): VideoDoctor {
  const full: VideoDoctorReport = { ok: true, sandbox: true, metal: true, kokoro: true, voices: ["af_heart"], checks: [], checkedAt: new Date().toISOString(), ...report };
  return { report: async () => full, current: () => full, start: () => undefined, stop: () => undefined } as unknown as VideoDoctor;
}

let home: string;
let store: RecordStore<VideoJobRecord>;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME, STUDIO_DAILY_USD: process.env.STUDIO_DAILY_USD };

beforeEach(async () => {
  home = path.join(tmpdir(), `studio-video-runner-${Date.now()}-${Math.random()}`);
  process.env.STUDIO_HOME = home;
  delete process.env.STUDIO_DAILY_USD;
  await mkdir(path.join(home, "jobs"), { recursive: true });
  store = new RecordStore<VideoJobRecord>("video");
  catalogMock.jobEnqueue.mockResolvedValue(ok({ job: {} }));
  catalogMock.videoShow.mockResolvedValue(ok({ video: null }));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function runner(report: Partial<VideoDoctorReport> = {}) {
  const made = new VideoRunner(store, { doctor: doctor(report) });
  await made.drain();
  return made;
}

function brief(over: Partial<ValidVideoBrief> = {}): ValidVideoBrief {
  return { ...narratedBrief(), idempotencyKey: `key-${Math.random()}`, ...over };
}

describe("the hang timer's question", () => {
  it("counts a wrapper call that ended inside the window, and never a file a scene wrote under render/", async () => {
    const job = path.join(home, "jobs", "hang");
    const render = path.join(job, "render", "out");
    await mkdir(render, { recursive: true });
    const calls = path.join(job, "calls.ndjson");
    const hangMs = 20 * 60_000;
    // A scene that keeps touching a file: fresh, and still not the agent.
    await writeFile(path.join(render, "partial.mp4"), "x");
    expect(await stillWorking({ calls }, hangMs)).toBe(false);
    const call = (endedAt: number) => `${JSON.stringify({ verb: "preview", startedAt: new Date(endedAt - 1000).toISOString(), endedAt: new Date(endedAt).toISOString(), exitCode: 0 })}\n`;
    await writeFile(calls, call(Date.now() - hangMs - 60_000));
    expect(await stillWorking({ calls }, hangMs)).toBe(false);
    await writeFile(calls, call(Date.now() - 60_000), { flag: "a" });
    expect(await stillWorking({ calls }, hangMs)).toBe(true);
    // And once the window has passed that call, it no longer counts.
    expect(await stillWorking({ calls }, hangMs, Date.now() + hangMs)).toBe(false);
  });
});

describe("the video runner's refusals", () => {
  it("refuses every job while the video doctor fails, and never renders unsandboxed", async () => {
    const made = await runner({ ok: false, checks: [{ name: "toolchain", ok: false, detail: "sandbox-exec is missing" }] });
    await expect(made.enqueue(brief())).rejects.toMatchObject({ status: 503 });
    expect(store.list()).toEqual([]);
  });

  it("refuses a voice kokoro does not have, a slug another job holds, and a mode the catalog contradicts", async () => {
    const made = await runner();
    await expect(made.enqueue(brief({ voice: "bm_george" }))).rejects.toMatchObject({ status: 409 });
    const first = await made.enqueue(brief());
    expect(first.created).toBe(true);
    await expect(made.enqueue(brief())).rejects.toMatchObject({ status: 409, message: expect.stringContaining("already held by job") });
    catalogMock.videoShow.mockResolvedValue(ok({ video: { slug: "other", revision: 3 } }));
    await expect(made.enqueue(brief({ slug: "other-video" }))).rejects.toMatchObject({ status: 409, message: expect.stringContaining('mode "new"') });
    catalogMock.videoShow.mockResolvedValue(ok({ video: null }));
    await expect(made.enqueue(brief({ slug: "third-video", mode: "change" }))).rejects.toMatchObject({ status: 409 });
  });

  it("counts video spend against the one daily cap, and refuses at it", async () => {
    const made = await runner();
    const { record } = await made.enqueue(brief());
    await store.update(record.id, { state: "failed", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), costUsd: 1.5 });
    process.env.STUDIO_DAILY_USD = "1";
    await expect(made.enqueue(brief({ slug: "another-video" }))).rejects.toMatchObject({ status: 429 });
  });

  it("writes the brief the catalog enqueues, with the video target and candidate", async () => {
    const made = await runner();
    const { record } = await made.enqueue(brief());
    const written = JSON.parse(await readFile(path.join(home, "jobs", record.id, "brief.json"), "utf8")) as Record<string, unknown>;
    expect(written).toMatchObject({ kind: "video", target: "videos/two-boxes.mp4", candidate: `jobs/${record.id}/candidate/two-boxes.mp4` });
    expect(catalogMock.jobEnqueue).toHaveBeenCalledWith(path.join(home, "jobs", record.id, "brief.json"), {});
  });
});

describe("a job the catalog will not hand over", () => {
  beforeEach(() => {
    catalogMock.jobFinish.mockClear();
    catalogMock.sessionEnd.mockClear();
    catalogMock.sessionStart.mockReset();
    catalogMock.jobClaim.mockReset();
  });

  it("fails the local record and closes the session, and never finishes a row another runner holds", async () => {
    catalogMock.sessionStart.mockResolvedValue(ok());
    catalogMock.jobClaim.mockResolvedValue({ ok: false, json: null, error: "the job is not queued", offline: false });
    const made = new VideoRunner(store, { doctor: doctor() });
    const { record } = await made.enqueue(brief());
    await made.settled(record.id);
    expect(store.get(record.id)).toMatchObject({ state: "failed", errorKind: "not-claimed" });
    expect(catalogMock.sessionEnd).toHaveBeenCalledWith(`studio-${record.id}`, "failed", expect.stringContaining("Another runner holds this job"));
    expect(catalogMock.jobFinish).not.toHaveBeenCalled();
    await made.drain();
  });

  it("never finishes the row when the job throws before its claim", async () => {
    catalogMock.sessionStart.mockRejectedValue(new Error("boom"));
    const made = new VideoRunner(store, { doctor: doctor() });
    const { record } = await made.enqueue(brief());
    await made.settled(record.id);
    expect(store.get(record.id)).toMatchObject({ state: "failed", errorKind: "internal" });
    expect(catalogMock.jobClaim).not.toHaveBeenCalled();
    expect(catalogMock.jobFinish).not.toHaveBeenCalled();
    await made.drain();
  });

  it("does finish a row it claimed when the job throws after the claim", async () => {
    catalogMock.sessionStart.mockResolvedValue(ok());
    catalogMock.jobClaim.mockResolvedValue(ok());
    // Admitted while the doctor passed; it fails by the time the job starts.
    const flaky = doctor();
    const failing = { ...flaky.current()!, ok: false, checks: [{ name: "render profile", ok: false, detail: "no Metal" }] };
    let asked = 0;
    const made = new VideoRunner(store, { doctor: { ...flaky, report: async () => (asked++ === 0 ? flaky.current()! : failing) } as unknown as VideoDoctor });
    const { record } = await made.enqueue(brief());
    await made.settled(record.id);
    expect(store.get(record.id)).toMatchObject({ state: "failed", errorKind: "internal" });
    expect(catalogMock.jobFinish).toHaveBeenCalledWith(expect.objectContaining({ jobId: record.id, state: "failed" }));
    await made.drain();
  });
});

describe("a change asked of a video in review (D52)", () => {
  it("discards the parent and enqueues the child in the catalog's one transaction", async () => {
    const made = await runner();
    const { record: parent } = await made.enqueue(brief());
    await store.update(parent.id, { state: "awaiting_review", agentSessionId: "11111111-1111-4111-8111-111111111111", classes: ["TB1_WhyItMatters", "TB2_Recap"] });
    const child = await made.revise(store.get(parent.id)!, "the arrow in scene two points at the wrong box");
    expect(catalogMock.jobEnqueue).toHaveBeenLastCalledWith(path.join(home, "jobs", child.id, "brief.json"), { discardParent: parent.id });
    expect(store.get(parent.id)?.state).toBe("discarded");
    expect(child).toMatchObject({ parentJobId: parent.id, agentSessionId: "11111111-1111-4111-8111-111111111111", changes: "the arrow in scene two points at the wrong box", state: "queued" });
    const written = JSON.parse(await readFile(path.join(home, "jobs", child.id, "brief.json"), "utf8")) as Record<string, unknown>;
    expect(written.parentJob).toBe(parent.id);
  });

  it("leaves the parent in review when the catalog refuses, and when it is down", async () => {
    const made = await runner();
    const { record: parent } = await made.enqueue(brief());
    await store.update(parent.id, { state: "awaiting_review" });
    catalogMock.jobEnqueue.mockResolvedValueOnce({ ok: false, json: null, error: "refused", offline: false });
    await expect(made.revise(store.get(parent.id)!, "change it")).rejects.toMatchObject({ status: 400 });
    catalogMock.jobEnqueue.mockResolvedValueOnce({ ok: false, json: null, error: "ECONNREFUSED", offline: true });
    await expect(made.revise(store.get(parent.id)!, "change it")).rejects.toMatchObject({ status: 503 });
    expect(store.get(parent.id)?.state).toBe("awaiting_review");
    expect(store.list().filter((record) => record.parentJobId === parent.id)).toEqual([]);
  });
});

describe("Accept and Discard", () => {
  it("lands the video in one catalog call, and a repeated put is an own retry", async () => {
    const made = await runner();
    const { record } = await made.enqueue(brief());
    await store.update(record.id, { state: "awaiting_review", targetRevisionBefore: null });
    catalogMock.videoPut.mockResolvedValueOnce(ok({ revision: 1, assets: [{ id: "video:two-boxes" }, { id: "poster:video:two-boxes" }], retry: false }));
    const accepted = await acceptVideo(store, made, record.id);
    expect(accepted).toMatchObject({ ok: true, landed: ["video:two-boxes", "poster:video:two-boxes"], revision: 1 });
    expect(catalogMock.videoPut).toHaveBeenCalledWith(expect.objectContaining({ jobId: record.id, slug: "two-boxes", base: null }));
    expect(store.get(record.id)?.state).toBe("accepted");
    const again = await acceptVideo(store, made, record.id);
    expect(again).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses with the database down and leaves the candidate waiting (V15)", async () => {
    const made = await runner();
    const { record } = await made.enqueue(brief());
    await store.update(record.id, { state: "awaiting_review" });
    catalogMock.videoPut.mockResolvedValueOnce({ ok: false, json: null, error: "ECONNREFUSED", offline: true });
    expect(await acceptVideo(store, made, record.id)).toMatchObject({ ok: false, status: 503 });
    expect(store.get(record.id)?.state).toBe("awaiting_review");
  });

  it("discards a video in review: render/ and candidate/ go, the source stays", async () => {
    const made = await runner();
    const { record } = await made.enqueue(brief());
    await store.update(record.id, { state: "awaiting_review" });
    const job = path.join(home, "jobs", record.id);
    const topic = path.join(job, "checkout", "topics", "studio", "two-boxes");
    await mkdir(topic, { recursive: true });
    await writeFile(path.join(topic, "two_boxes.py"), "# the source\n");
    await writeFile(path.join(topic, "topic.yml"), "topic: tcp-congestion-control\n");
    await mkdir(path.join(job, "render", "out"), { recursive: true });
    await mkdir(path.join(job, "candidate"), { recursive: true });
    await writeFile(path.join(job, "candidate", "two-boxes.mp4"), "mp4");
    expect(await discardVideo(store, made, record.id)).toMatchObject({ ok: true });
    expect(store.get(record.id)?.state).toBe("discarded");
    const { existsSync } = await import("node:fs");
    expect(existsSync(path.join(job, "render"))).toBe(false);
    expect(existsSync(path.join(job, "candidate"))).toBe(false);
    expect(await readFile(path.join(job, "source", "two_boxes.py"), "utf8")).toBe("# the source\n");
  });
});

describe("reconcile and cancel", () => {
  it("marks a running job interrupted, and adopts an accept the runner died before writing down", async () => {
    const made = await runner();
    const { record: running } = await made.enqueue(brief());
    await store.update(running.id, { state: "running", sessionId: "studio-x" });
    const { record: reviewed } = await made.enqueue(brief({ slug: "other-video" }));
    await store.update(reviewed.id, { state: "awaiting_review" });
    catalogMock.jobShow.mockResolvedValueOnce(ok({ job: { state: "accepted" } }));
    const result = await made.reconcile();
    expect(result).toEqual({ interrupted: [running.id], adopted: [reviewed.id] });
    expect(store.get(running.id)?.state).toBe("interrupted");
    expect(store.get(reviewed.id)?.state).toBe("accepted");
  });

  it("cancels a job that has not started", async () => {
    const made = await runner();
    const { record } = await made.enqueue(brief());
    expect((await made.cancel(record.id)).state).toBe("cancelled");
    await expect(made.cancel(record.id)).rejects.toMatchObject({ status: 409 });
  });
});
