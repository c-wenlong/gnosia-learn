import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeClaude, type FakeClaude } from "./fake-claude";
import { topicListAnswer } from "./vocabulary";
import { until } from "./wait";

/**
 * Replace and Revise of one video in review, pressed together (D52): "Make
 * video" on a draft whose newest video is in review with a newer brief on its
 * slug (`catalog job enqueue --discard-parent`), and "Revise" of that same job
 * from its review panel. Both discard the parent in the child's own catalog
 * transaction, and the catalog locks the parent's row `FOR UPDATE` and
 * requires `awaiting_review`, so exactly one of the two lands.
 *
 * The catalog here is a stand-in that plays that transaction: the test names
 * the winner, and the order in which the two answers come back to the
 * runner, since the loser's refusal can reach the studio before the winner's
 * success does. Everything else is real: the video runner (drained, so no
 * agent starts), its store, the drafts, and the HTTP routes.
 */

vi.hoisted(() => {
  process.env.STUDIO_CLAUDE_BIN = "/nonexistent/claude-until-the-fake-is-ready";
  process.env.STUDIO_VIDEO_KIND = "on";
});
const fake: FakeClaude = await fakeClaude();
process.env.STUDIO_CLAUDE_BIN = fake.bin;

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });
const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
  topicAdd: vi.fn(),
  diagramList: vi.fn(),
  videoList: vi.fn(),
  videoShow: vi.fn(),
  jobEnqueue: vi.fn(),
  jobClaim: vi.fn(),
  jobFinish: vi.fn(),
  jobShow: vi.fn(),
  jobDiscard: vi.fn(),
  sessionStart: vi.fn(),
  sessionEnd: vi.fn(),
  status: vi.fn(),
  preferenceGet: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/catalog")>()),
  ...catalogMock,
}));

const { createApi } = await import("../src/api");
const { Drafts } = await import("../src/drafts");
const { JobStore, RecordStore } = await import("../src/store");
const { Mirrors } = await import("../src/mirrors");
const { VideoRunner } = await import("../src/video/runner");
const { CLAUDE_BIN } = await import("../src/config");
const { narratedBrief } = await import("./video-fixture");
if (CLAUDE_BIN !== fake.bin) throw new Error(`the planner would spawn ${CLAUDE_BIN}, not the fake`);

import type { Runner } from "../src/runner";
import type { VideoDoctor, VideoDoctorReport } from "../src/video/doctor";
import type { VideoJobRecord } from "../src/video/types";

const report: VideoDoctorReport = { ok: true, sandbox: true, metal: true, kokoro: true, voices: ["af_heart"], checks: [], checkedAt: new Date().toISOString() };
const doctor = { report: async () => report, current: () => report, start: () => undefined, stop: () => undefined } as unknown as VideoDoctor;

const videoBrief = (() => {
  const brief: Record<string, unknown> = { ...narratedBrief(), topic: "tcp-congestion-control", slug: "tcp-congestion-window" };
  delete brief.idempotencyKey;
  return brief;
})();
const videoOnly = (video: unknown): string => `A video.\n\n\`\`\`brief\n${JSON.stringify(video)}\n\`\`\``;
const tagged = (text: string): [string, { kind: string; start: number; end: number }[]] => [`@video ${text}`, [{ kind: "video", start: 0, end: 6 }]];

/** One `--discard-parent` enqueue the stand-in catalog is holding: its transaction has not answered yet. */
interface Held {
  key: string;
  parent: string;
  answer: (result: unknown) => void;
}
let held: Held[];

let home: string;
let server: Server;
let base: string;
let drafts: InstanceType<typeof Drafts>;
let videoStore: InstanceType<typeof RecordStore<VideoJobRecord>>;
let videoRunner: InstanceType<typeof VideoRunner>;

beforeEach(async () => {
  home = path.join(tmpdir(), `studio-replace-revise-${Date.now()}-${Math.random()}`);
  process.env.STUDIO_HOME = home;
  await mkdir(home, { recursive: true });
  for (const fn of Object.values(catalogMock)) fn.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.diagramList.mockResolvedValue(ok({ diagrams: [] }));
  catalogMock.videoList.mockResolvedValue(ok({ videos: [] }));
  catalogMock.videoShow.mockResolvedValue(ok({ video: null }));
  catalogMock.preferenceGet.mockResolvedValue(ok({ value: null }));
  held = [];
  catalogMock.jobEnqueue.mockImplementation(async (briefFile: string, options: { discardParent?: string } = {}) => {
    if (options.discardParent === undefined) return ok({ job: {} });
    const document = JSON.parse(await readFile(briefFile, "utf8")) as { idempotencyKey: string };
    return new Promise((answer) => held.push({ key: document.idempotencyKey, parent: options.discardParent!, answer }));
  });
  await fake.script([]);

  const store = new JobStore();
  videoStore = new RecordStore<VideoJobRecord>("video");
  videoRunner = new VideoRunner(videoStore, { doctor });
  // No job runs: what matters is what each press leaves behind.
  await videoRunner.drain();
  const runner = {
    busy: 0,
    enqueue: vi.fn(),
    admit: vi.fn(),
    assertUnderCap: vi.fn(),
    canvasOpen: () => false,
    capStatus: () => ({ capUsd: null, exceeded: false, totalUsd: 0, jobs: 0, oldestCountedAt: null, oldestAgesOutAt: null, plannerUsd: 0, plannerTurns: 0 }),
  } as unknown as Runner;
  drafts = new Drafts(store, runner, { store: videoStore as never, runner: videoRunner });
  server = createApi({ store, runner, mirrors: new Mirrors(), drafts, video: { store: videoStore, runner: videoRunner, doctor } });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await drafts.drain();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(home, { recursive: true, force: true });
});

afterAll(async () => {
  await fake.cleanup();
  delete process.env.STUDIO_VIDEO_KIND;
});

/** A draft whose video is in review, with a newer brief on its slug in force: Make video would replace it. */
async function inReviewWithNewerBrief(): Promise<{ draftId: string; parentId: string }> {
  await fake.script([{ text: videoOnly({ kind: "video", ...videoBrief }) }, { text: videoOnly({ kind: "video", ...videoBrief, title: "Two boxes, slower" }) }]);
  const { record } = await drafts.create({});
  await drafts.send(record.id, ...tagged("two boxes"));
  await drafts.settled(record.id);
  const { jobId: parentId } = await drafts.drawOne(record.id, "v1", "video");
  await videoStore.update(parentId, { state: "running" });
  await videoStore.update(parentId, { state: "awaiting_review", gate: { durationSeconds: 61.2, findings: [] } as never });
  await until(() => drafts.get(record.id)?.undelivered.some((note) => note.includes("is ready for review")) === true, "the review note never came");
  await drafts.send(record.id, ...tagged("say it slower"));
  await drafts.settled(record.id);
  expect((await drafts.view(record.id)).slots.video).toMatchObject({ jobId: parentId, busy: null, replaces: { jobId: parentId } });
  return { draftId: record.id, parentId };
}

type Side = "replace" | "revise";

/**
 * Press both, let the catalog's lock pick `winner`, and hand the two answers
 * back in `order`, each side finishing before the next answer is given.
 */
async function race(winner: Side, order: "winner-first" | "loser-first") {
  const { draftId, parentId } = await inReviewWithNewerBrief();
  const replace = drafts.drawOne(draftId, "v2", "video").then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: error as { status: number; message: string } }),
  );
  const revise = fetch(`${base}/api/jobs/${parentId}/revise`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ changes: "the arrow in scene two points at the wrong box" }),
  }).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> }));

  await until(() => held.length === 2, () => `both presses should reach the catalog; ${held.length} did`);
  const sideOf = (entry: Held): Side => (entry.key.includes(":revise:") ? "revise" : "replace");
  const catalogSays = (entry: Held) =>
    sideOf(entry) === winner
      ? ok({ created: true, job: {}, discarded: { id: parentId, from: "awaiting_review", to: "discarded" } })
      : {
          ok: false,
          json: null,
          // The catalog's own sentence, word for word (`discardForChange`).
          error:
            `job ${parentId} is discarded, not awaiting_review, so there is nothing to discard for this change. ` +
            `Enqueue without --discard-parent.`,
          offline: false,
        };
  const first = held.find((entry) => (sideOf(entry) === winner) === (order === "winner-first"))!;
  const second = held.find((entry) => entry !== first)!;
  const settled = { replace, revise };
  first.answer(catalogSays(first));
  await settled[sideOf(first)];
  second.answer(catalogSays(second));
  return { draftId, parentId, replaced: await replace, revised: await revise };
}

describe("Replace and Revise of one video in review, pressed together", () => {
  for (const winner of ["replace", "revise"] as const) {
    for (const order of ["winner-first", "loser-first"] as const) {
      it(`makes one child, followed by the draft, when ${winner} wins and the ${order === "winner-first" ? "winner's" : "loser's"} answer comes back first`, async () => {
        const { draftId, parentId, replaced, revised } = await race(winner, order);

        // One child of the parent, holding the draft, and it is the draft's newest.
        const children = videoStore.list().filter((job) => job.parentJobId === parentId);
        expect(children).toHaveLength(1);
        const child = children[0]!;
        expect(child).toMatchObject({ draftId, state: "queued" });
        expect(videoStore.get(parentId)?.state).toBe("discarded");
        await until(() => drafts.get(draftId)?.slots?.video?.jobId === child.id, "the draft never followed the child");
        await drafts.settled(draftId);
        const record = drafts.get(draftId)!;
        expect(record.jobIds).toEqual([parentId, child.id]);
        expect(record.slots?.video).toMatchObject({ jobId: child.id, state: "drawing" });

        if (winner === "replace") {
          expect(replaced).toMatchObject({ ok: true, value: { jobId: child.id, created: true, replaces: parentId } });
          // The loser is a conflict with the press that got there first, not a bad request.
          expect(revised.status).toBe(409);
          expect(String(revised.body.error)).toContain("left review");
          // The slot drew the newer brief.
          expect(record.slots?.video?.drawnSeq).toBe(record.slots?.video?.briefSeq);
        } else {
          expect(revised).toMatchObject({ status: 201, body: { jobId: child.id, parentJob: parentId } });
          expect(child.changes).toBe("the arrow in scene two points at the wrong box");
          expect(replaced).toMatchObject({ ok: false, error: { status: 409 } });
          if (!replaced.ok) expect(replaced.error.message).toContain("left review");
          // The revise redrew the reviewed brief, so the newer one is still in force and undrawn.
          expect(record.slots?.video?.drawnSeq).not.toBe(record.slots?.video?.briefSeq);
        }

        // The loser left nothing: no record, no workspace.
        expect(videoStore.list()).toHaveLength(2);
        const loserKey = held.find((entry) => (entry.key.includes(":revise:") ? "revise" : "replace") !== winner)!.key;
        expect(videoStore.byIdempotencyKey(loserKey)).toBeUndefined();

        // The parent's discard was a replacement, never a verdict told to the planner as one.
        const { transcript } = await drafts.view(draftId);
        expect(transcript.filter((entry) => entry.text.includes("was discarded; nothing landed"))).toEqual([]);
        const events = (await readFile(path.join(home, "drafts", draftId, "transcript.ndjson"), "utf8"))
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line) as { type: string; jobId?: string; state?: string; replaced?: boolean });
        expect(events.filter((event) => event.type === "job" && event.jobId === parentId && event.state === "discarded")).toEqual([
          expect.objectContaining({ replaced: true }),
        ]);
        expect(videoStore.get(parentId)?.replacedBy).toBe(child.id);
        await expect(stat(path.join(home, "jobs", child.id))).resolves.toBeTruthy();
      });
    }
  }
});
