import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { CatalogResult } from "../src/catalog";

import { fakeClaude, proposing, type FakeClaude } from "./fake-claude";
import { topicListAnswer } from "./vocabulary";
import { until } from "./wait";

/**
 * Pruning (D40 of docs/STUDIO-CHAT-FIRST.md): a draft untouched for seven
 * days goes, row and workspace, only when no job names it on disk or in
 * Postgres, and nothing goes while Postgres cannot be asked. The row's delete
 * is a stand-in holding what Postgres would: which drafts have rows and which
 * job rows name them. The SQL itself is `catalog draft delete`'s, tested in
 * services/catalog/test/drafts.test.ts.
 */

const fake: FakeClaude = await fakeClaude();
process.env.STUDIO_CLAUDE_BIN = fake.bin;

const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
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
const { pruneDrafts, DraftPruner } = await import("../src/prune");
const { draftDir, jobDir, jobJsonPath } = await import("../src/paths");

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });
const DAY = 24 * 60 * 60 * 1000;
const eightDaysOn = () => Date.now() + 8 * DAY;

const good = {
  intent: "Show how a sender's window reacts to loss.",
  title: "TCP congestion window",
  topic: "tcp-congestion-control",
  slug: "tcp-congestion-window",
  mode: "new",
  elements: [{ label: "Sender" }, { label: "Receiver" }],
  relations: [{ from: "Sender", to: "Receiver" }],
};

let store: InstanceType<typeof JobStore>;
let drafts: InstanceType<typeof Drafts>;
let runner: { enqueue: ReturnType<typeof vi.fn>; admit: ReturnType<typeof vi.fn>; assertUnderCap: ReturnType<typeof vi.fn>; canvasOpen: () => boolean };

/** What Postgres holds, as far as pruning asks: draft rows, and the drafts job rows name. */
let rows: Set<string>;
let jobRows: Set<string>;
let deleteRow: Mock<(id: string) => Promise<CatalogResult>>;

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-prune-${Date.now()}-${Math.random()}`);
  await mkdir(path.join(process.env.STUDIO_HOME, "jobs"), { recursive: true });
  await fake.script([]);
  rows = new Set();
  jobRows = new Set();
  catalogMock.draftUpsert.mockReset().mockImplementation(async (file: string) => {
    rows.add(path.basename(path.dirname(file)));
    return ok();
  });
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  deleteRow = vi.fn(async (id: string): Promise<CatalogResult> => {
    if (!rows.has(id)) return ok({ outcome: "no-draft" });
    if (jobRows.has(id)) return ok({ outcome: "has-jobs" });
    rows.delete(id);
    return ok({ outcome: "deleted" });
  });
  runner = {
    enqueue: vi.fn(async (brief: { slug: string }, _parent: unknown, options: { draftId: string }) => ({
      record: { id: `job-${Math.random().toString(36).slice(2, 8)}`, state: "queued", slug: brief.slug, draftId: options.draftId },
      created: true,
      jobsAhead: 0,
    })),
    admit: vi.fn(async () => ({ exists: false, revision: null, hash: null })),
    assertUnderCap: vi.fn(),
    canvasOpen: () => false,
  };
  store = new JobStore();
  drafts = new Drafts(store, runner as never);
});

afterEach(async () => {
  await drafts.drain();
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

afterAll(async () => {
  await fake.cleanup();
});

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** A draft with a row, as every write leaves one. */
async function draft(): Promise<string> {
  const { record } = await drafts.create({});
  await drafts.settled(record.id);
  await until(() => rows.has(record.id), "the draft's row never landed");
  return record.id;
}

/** A briefed draft, pressed once: its job is recorded on the draft. */
async function drew(): Promise<{ id: string; jobId: string }> {
  await fake.script([{ text: proposing(good) }]);
  const id = await draft();
  await drafts.send(id, "draw it");
  await drafts.settled(id);
  const { jobId } = await drafts.draw(id, "press");
  jobRows.add(id);
  return { id, jobId };
}

describe("pruning drafts (D40)", () => {
  it("removes a draft untouched for eight days from disk and from Postgres", async () => {
    const id = await draft();
    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    expect(report).toMatchObject({ skipped: null, pruned: [id], kept: [] });
    expect(rows.has(id)).toBe(false);
    expect(await exists(draftDir(id))).toBe(false);
    expect(drafts.get(id)).toBeUndefined();
    expect(drafts.list()).toEqual([]);
  });

  it("leaves a draft touched within the week alone, and asks Postgres nothing", async () => {
    const id = await draft();
    const report = await pruneDrafts(drafts, store, { now: () => Date.now() + 6 * DAY, deleteRow });
    expect(report.pruned).toEqual([]);
    expect(deleteRow).not.toHaveBeenCalled();
    expect(drafts.get(id)).toBeDefined();
  });

  it("keeps a draft that produced a job, and a briefed draft whose only job failed", async () => {
    const { id, jobId } = await drew();
    await mkdir(path.join(jobDir(jobId), "scratch"), { recursive: true });
    await store.create({ id: jobId, state: "running", slug: good.slug, topic: good.topic, draftId: id, brief: { ...good, model: "sonnet" }, gate: null, error: null } as never);
    await store.update(jobId, { state: "failed", error: "the gate found no Receiver" });
    await until(() => drafts.get(id)?.state === "briefed", "the failed job never put the draft back at briefed");
    await drafts.settled(id);

    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    expect(report.pruned).toEqual([]);
    expect(report.kept).toEqual([{ draftId: id, reason: `it started job ${jobId}` }]);
    // The disk said so first; Postgres was never asked to delete it.
    expect(deleteRow).not.toHaveBeenCalled();
    expect(rows.has(id)).toBe(true);
    expect(await exists(draftDir(id))).toBe(true);
    expect(drafts.get(id)?.state).toBe("briefed");
  });

  it("keeps a draft whose only job was enqueued with Postgres down: a job.json and no row", async () => {
    const id = await draft();
    // The runner died before the draft recorded the job, and this store never loaded it:
    // only the job's own record on disk says the draft has a job.
    await mkdir(jobDir("job-offline"), { recursive: true });
    await writeFile(jobJsonPath("job-offline"), JSON.stringify({ id: "job-offline", state: "queued", draftId: id }, null, 1));
    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    expect(report.kept).toEqual([{ draftId: id, reason: "jobs/job-offline/job.json names it" }]);
    expect(deleteRow).not.toHaveBeenCalled();
    expect(await exists(draftDir(id))).toBe(true);
  });

  it("keeps a draft a job row names even when the disk has no job for it", async () => {
    const id = await draft();
    jobRows.add(id);
    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    expect(report.kept).toEqual([{ draftId: id, reason: "a job row names it" }]);
    expect(await exists(draftDir(id))).toBe(true);
    expect(drafts.get(id)).toBeDefined();
  });

  it("prunes nothing while Postgres is down, and says why", async () => {
    const first = await draft();
    const second = await draft();
    deleteRow.mockResolvedValue({ ok: false, json: null, error: "catalog draft delete exited 3: connect ECONNREFUSED", offline: true });
    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    expect(report.pruned).toEqual([]);
    expect(report.skipped).toMatch(/Postgres cannot be reached/);
    // The pass stopped at the first draft it could not ask about.
    expect(deleteRow).toHaveBeenCalledTimes(1);
    for (const id of [first, second]) {
      expect(await exists(draftDir(id))).toBe(true);
      expect(drafts.get(id)).toBeDefined();
    }
  });

  it("removes the workspace of a draft whose row never landed", async () => {
    const id = await draft();
    rows.delete(id);
    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    expect(report.pruned).toEqual([id]);
    expect(await exists(draftDir(id))).toBe(false);
  });

  it("does not prune a draft while its planner is answering, and answers 404 for one being pruned", async () => {
    await fake.script([{ text: "thinking", hangMs: 400 }]);
    const busy = await draft();
    await drafts.send(busy, "hello");
    let resolveDelete: () => void = () => undefined;
    const idle = await draft();
    deleteRow.mockImplementationOnce(async (id: string) => {
      // While the row is being deleted, the draft is gone to every route.
      expect(drafts.get(id)).toBeUndefined();
      await expect(drafts.send(id, "wait")).rejects.toMatchObject({ status: 404 });
      await new Promise<void>((resolve) => {
        resolveDelete = resolve;
        setTimeout(resolve, 10);
      });
      rows.delete(id);
      return ok({ outcome: "deleted" });
    });
    const report = await pruneDrafts(drafts, store, { now: eightDaysOn, deleteRow });
    resolveDelete();
    expect(report.pruned).toEqual([idle]);
    expect(drafts.get(busy)).toBeDefined();
    await drafts.settled(busy);
  });

  it("runs once at a time from the runner's pruner, and logs what it did", async () => {
    const id = await draft();
    const lines: string[] = [];
    const pruner = new DraftPruner(drafts, store, (line) => lines.push(line), { now: eightDaysOn, deleteRow });
    const first = pruner.run();
    expect(pruner.run()).toBe(first);
    await first;
    await pruner.drain();
    expect(pruner.run()).toBeNull();
    expect(lines).toEqual([expect.stringMatching(/^pruned 1 draft untouched since /)]);
    expect(drafts.get(id)).toBeUndefined();
  });
});
