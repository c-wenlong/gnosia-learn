import type { AddressInfo } from "node:net";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Runner } from "../src/runner";
import type { VideoDoctor, VideoDoctorReport } from "../src/video/doctor";
import type { VideoJobRecord } from "../src/video/types";

import { narratedBrief } from "./video-fixture";
import { topicListAnswer } from "./vocabulary";

/**
 * The video routes over a real socket: `POST /api/jobs` dispatching on the
 * brief's own kind, the sheets and media routes serving only named files
 * (a link in `render/` refused, byte ranges for the mp4), and health's
 * `video` and `agent` blocks.
 */

/** Every handle `open` returned, by path, so a test can see whether one was closed. */
const opened = vi.hoisted(() => [] as { file: string; handle: import("node:fs/promises").FileHandle }[]);
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const open = async (...args: Parameters<typeof actual.open>) => {
    const handle = await actual.open(...args);
    opened.push({ file: String(args[0]), handle });
    return handle;
  };
  return { ...actual, open, default: { ...actual, open } };
});

vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, doctor: vi.fn(async () => ({ code: 0, signal: null, stdout: "", stderr: "", json: null, timedOut: false })) };
});

const answer = (json: unknown) => ({ ok: true, json, error: null, offline: false });
const catalogMock = vi.hoisted(() => ({
  topicList: vi.fn(),
  status: vi.fn(),
  jobEnqueue: vi.fn(),
  videoShow: vi.fn(),
  preferenceGet: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog")>();
  return { ...actual, ...catalogMock };
});

const { createApi } = await import("../src/api");
const { Mirrors } = await import("../src/mirrors");
const { JobStore, RecordStore } = await import("../src/store");
const { VideoRunner } = await import("../src/video/runner");

let server: ReturnType<typeof createApi>;
let base: string;
let videoStore: InstanceType<typeof RecordStore<VideoJobRecord>>;
let home: string;

const report: VideoDoctorReport = { ok: true, sandbox: true, metal: true, kokoro: true, voices: ["af_heart"], checks: [], checkedAt: new Date().toISOString() };
const doctor = { report: async () => report, current: () => report, start: () => undefined, stop: () => undefined } as unknown as VideoDoctor;

beforeEach(async () => {
  home = path.join(tmpdir(), `studio-video-routes-${Date.now()}-${Math.random()}`);
  process.env.STUDIO_HOME = home;
  catalogMock.topicList.mockResolvedValue(topicListAnswer());
  catalogMock.status.mockResolvedValue(answer({}));
  catalogMock.jobEnqueue.mockResolvedValue(answer({ job: {} }));
  catalogMock.videoShow.mockResolvedValue(answer({ video: null }));
  catalogMock.preferenceGet.mockResolvedValue(answer({ value: { model: "opus", effort: "high" } }));
  videoStore = new RecordStore<VideoJobRecord>("video");
  const videoRunner = new VideoRunner(videoStore, { doctor });
  await videoRunner.drain();
  const runner = { busy: 0, capStatus: () => ({ capUsd: null, exceeded: false, totalUsd: 0, jobs: 0, oldestCountedAt: null, oldestAgesOutAt: null, plannerUsd: 0, plannerTurns: 0 }) } as unknown as Runner;
  server = createApi({ store: new JobStore(), runner, mirrors: new Mirrors(), video: { store: videoStore, runner: videoRunner, doctor } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(home, { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

const post = (url: string, body: unknown) => fetch(`${base}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function reviewedJob(): Promise<VideoJobRecord> {
  const brief = { ...narratedBrief(), topic: "tcp-congestion-control" };
  const response = await post("/api/jobs", { kind: "video", ...brief, targetSeconds: 60 });
  expect(response.status).toBe(201);
  const { jobId } = (await response.json()) as { jobId: string };
  return videoStore.update(jobId, { state: "awaiting_review", classes: ["TB1_WhyItMatters", "TB2_Recap"] });
}

describe("the video routes", () => {
  it("queues a video brief on the video runner, and refuses a bad one by field", async () => {
    const bad = await post("/api/jobs", { kind: "video", ...narratedBrief(), topic: "tcp-congestion-control", scenes: [] });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { detail: { field: string } }).detail.field).toBe("scenes");
    const job = await reviewedJob();
    const shown = (await (await fetch(`${base}/api/jobs/${job.id}`)).json()) as Record<string, unknown>;
    expect(shown).toMatchObject({ kind: "video", slug: "two-boxes", target: "videos/two-boxes.mp4" });
    const listed = (await (await fetch(`${base}/api/jobs`)).json()) as { jobs: { jobId: string }[] };
    expect(listed.jobs.map((entry) => entry.jobId)).toContain(job.id);
  });

  it("serves the mp4 with byte ranges, and only the files on its list", async () => {
    const job = await reviewedJob();
    const candidate = path.join(home, "jobs", job.id, "candidate");
    await mkdir(candidate, { recursive: true });
    await writeFile(path.join(candidate, "two-boxes.mp4"), Buffer.from("0123456789"));
    await writeFile(path.join(candidate, "copies.json"), "{}");
    const whole = await fetch(`${base}/api/jobs/${job.id}/media/two-boxes.mp4`);
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("0123456789");
    const part = await fetch(`${base}/api/jobs/${job.id}/media/two-boxes.mp4`, { headers: { range: "bytes=2-5" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await part.text()).toBe("2345");
    // The transcript, which the job view's script panel reads, with ranges like the rest.
    await writeFile(path.join(candidate, "two-boxes.transcript.json"), '{"segments":[]}');
    const transcript = await fetch(`${base}/api/jobs/${job.id}/media/two-boxes.transcript.json`);
    expect(transcript.status).toBe(200);
    expect(transcript.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await transcript.text()).toBe('{"segments":[]}');
    const head = await fetch(`${base}/api/jobs/${job.id}/media/two-boxes.transcript.json`, { headers: { range: "bytes=0-1" } });
    expect(head.status).toBe(206);
    expect(await head.text()).toBe('{"');
    expect((await fetch(`${base}/api/jobs/${job.id}/media/other.transcript.json`)).status).toBe(404);
    expect((await fetch(`${base}/api/jobs/${job.id}/media/two-boxes.chapters.json`)).status).toBe(404);
    expect((await fetch(`${base}/api/jobs/${job.id}/media/copies.json`)).status).toBe(404);
    expect((await fetch(`${base}/api/jobs/${job.id}/media/..%2Fjob.json`)).status).toBe(404);
  });

  it("closes the file when a client aborts a range request mid-body, as a seek does", async () => {
    const job = await reviewedJob();
    const candidate = path.join(home, "jobs", job.id, "candidate");
    await mkdir(candidate, { recursive: true });
    const file = path.join(candidate, "two-boxes.mp4");
    // Far more than one socket buffer, so the body is still streaming when the client goes.
    await writeFile(file, Buffer.alloc(16 * 1024 * 1024, 7));
    // By name: the route opens the resolved path, which is /private/var on macOS where tmpdir says /var.
    const handles = () => opened.filter((entry) => entry.file.endsWith(`${job.id}/candidate/two-boxes.mp4`)).map((entry) => entry.handle);
    const closed = () => handles().filter((handle) => handle.fd === -1).length;
    opened.length = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(`${base}/api/jobs/${job.id}/media/two-boxes.mp4`, { headers: { range: "bytes=1024-" } }, (res) => {
          expect(res.statusCode).toBe(206);
          res.once("data", () => {
            req.destroy();
            resolve();
          });
        });
        req.on("error", (error) => {
          if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
        });
        req.end();
      });
      // Without the fix nothing ever calls close: the handle waits for the garbage collector.
      expect(handles()).toHaveLength(1);
      const deadline = Date.now() + 3_000;
      while (closed() === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(closed()).toBe(1);
      // And a sheet, served whole, still closes its handle when it ends.
      const scenes = path.join(home, "jobs", job.id, "render", "out", "studio", "two-boxes", "scenes");
      await mkdir(scenes, { recursive: true });
      await writeFile(path.join(scenes, "TB1_WhyItMatters.sheet.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const sheet = await fetch(`${base}/api/jobs/${job.id}/sheets/TB1_WhyItMatters.png`);
      expect(Buffer.from(await sheet.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const sheetHandle = opened.find((entry) => entry.file.endsWith("scenes/TB1_WhyItMatters.sheet.png"))?.handle;
      const after = Date.now() + 3_000;
      while (sheetHandle?.fd !== -1 && Date.now() < after) await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sheetHandle?.fd).toBe(-1);
    } finally {
      opened.length = 0;
    }
  });

  it("serves a scene's sheet by its class, and refuses a sheet that is a link", async () => {
    const job = await reviewedJob();
    const scenes = path.join(home, "jobs", job.id, "render", "out", "studio", "two-boxes", "scenes");
    await mkdir(scenes, { recursive: true });
    await writeFile(path.join(scenes, "TB1_WhyItMatters.sheet.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(home, "secret.txt"), "not a sheet");
    await symlink(path.join(home, "secret.txt"), path.join(scenes, "TB2_Recap.sheet.png"));
    const list = (await (await fetch(`${base}/api/jobs/${job.id}/sheets`)).json()) as { sheets: { scene: string; title: string }[] };
    expect(list.sheets.map((sheet) => sheet.scene)).toEqual(["TB1_WhyItMatters", "TB2_Recap"]);
    expect(list.sheets[0]?.title).toBe("Why it matters");
    expect((await fetch(`${base}/api/jobs/${job.id}/sheets/TB1_WhyItMatters.png`)).status).toBe(200);
    const linked = await fetch(`${base}/api/jobs/${job.id}/sheets/TB2_Recap.png`);
    expect(linked.status).toBe(404);
    expect(await linked.text()).not.toContain("not a sheet");
    expect((await fetch(`${base}/api/jobs/${job.id}/sheets/TB9_Other.png`)).status).toBe(404);
  });

  it("reports the video doctor and each kind's model and effort in health", async () => {
    const health = (await (await fetch(`${base}/api/health`)).json()) as { video: { ok: boolean }; agent: { video: { model: { passed: string; source: string } }; diagram: unknown } };
    expect(health.video.ok).toBe(true);
    expect(health.agent.video.model).toEqual({ requested: "opus", passed: "opus", source: "panel" });
    expect(health.agent.diagram).toBeDefined();
  });
});
