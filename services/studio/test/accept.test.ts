import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  absolute,
  candidatePath,
  candidateSvgPath,
  targetPath,
  targetSvgPath,
} from "../src/paths";
import { stopChild } from "../src/proc";
import type { JobRecord } from "../src/store";
import { fixtureDocument } from "./fixture-document";

/**
 * Accept, and the ordering that makes its failure windows survivable.
 *
 * A diagram lives in the database (Track D of docs/CONTENT-MIGRATION.md), so
 * Accept lands through one `catalog diagram put --job`, and everything that
 * can fail happens before it: a failed export or verify, a stuck canvas, a
 * base that moved or a database that is down all leave the candidate where it
 * was and the put never made. The catalog is faked here as a small in-memory
 * diagram (its own suite, `services/catalog/test/diagrams.test.ts`, holds the
 * put to its word), so these tests pin the order and the refusals.
 */

const canvasMock = vi.hoisted(() => ({ canvas: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, canvas: canvasMock.canvas };
});

const catalogMock = vi.hoisted(() => ({
  jobAccept: vi.fn(),
  jobDiscard: vi.fn(),
  diagramShow: vi.fn(),
  diagramPut: vi.fn(),
  diagramCheckout: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog")>();
  return { ...actual, ...catalogMock };
});

const { accept, discard, reindex } = await import("../src/review");
const { JobStore } = await import("../src/store");

const SLUG = "studio-accept-fixture";
/**
 * The four files a test looks at. The candidates are in the job's workspace
 * under this test's `STUDIO_HOME`, so they are named once it is set.
 */
function filesNow() {
  return {
    candidate: candidatePath("job-accept", SLUG),
    candidateSvg: candidateSvgPath("job-accept", SLUG),
    target: absolute(targetPath(SLUG)),
    targetSvg: absolute(targetSvgPath(SLUG)),
  };
}
let files = filesNow();

const exists = async (file: string): Promise<boolean> =>
  (await stat(file).catch(() => null)) !== null;

function reply(code: number, json: unknown = null) {
  return Promise.resolve({ code, signal: null, stdout: "", stderr: "", json, timedOut: false });
}

function record(over: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-accept",
    kind: "diagram",
    state: "awaiting_review",
    phase: "ready",
    brief: {
      intent: "i",
      topic: "vector-and-linear-algebra-basics",
      slug: SLUG,
      title: "t",
      mode: "new",
      elements: [{ label: "a" }],
      relations: [],
      concepts: [],
      model: "sonnet",
      idempotencyKey: "k",
    },
    targetPath: targetPath(SLUG),
    targetSvgPath: targetSvgPath(SLUG),
    candidatePath: candidatePath("job-accept", SLUG),
    candidateSvgPath: candidateSvgPath("job-accept", SLUG),
    topic: "vector-and-linear-algebra-basics",
    slug: SLUG,
    attempt: 1,
    sessionId: "studio-job-accept",
    agentSessionId: "00000000-0000-4000-8000-000000000000",
    parentJobId: null,
    changes: null,
    idempotencyKey: "k",
    targetHashBefore: null,
    targetRevisionBefore: 5,
    requestedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    reviewedAt: null,
    heartbeatAt: null,
    cancelRequestedAt: null,
    exitCode: 0,
    turns: 8,
    costUsd: 0.4,
    costSource: null,
    gate: {
      ok: true,
      steps: [],
      findings: [],
      shapes: 12,
      lints: 0,
      svg: { path: candidateSvgPath("job-accept", SLUG), bytes: 2048 },
      exportFailed: false,
      checkedAt: new Date().toISOString(),
    },
    errorKind: null,
    error: null,
    written: [],
    indexed: false,
    catalogErrors: [],
    ...over,
  };
}

let store: InstanceType<typeof JobStore>;

/** The diagram as the fake catalog holds it: its latest revision, and which job wrote it. */
const diagram = { revision: 5, revisionJob: null as string | null, documentHash: "d".repeat(64) };

const offline = { ok: false, json: null, error: "connect ECONNREFUSED 127.0.0.1:5432", offline: true };

/**
 * The record, in the store. `accept` and `discard` write it themselves — the
 * disk record before the database row, which is rule 7 — so a fixture that only
 * built the object would be testing a path the routes do not take.
 */
const place = async (over: Partial<JobRecord> = {}): Promise<JobRecord> =>
  store.create(record(over));

/**
 * This file's own `$STUDIO_HOME`, kept in a variable so teardown deletes the
 * directory this test made and nothing else.
 *
 * It used to be `studio-test-${Date.now()}`, a name with nothing unique in it
 * beyond the millisecond. Two overlapping runs that started a test in the same
 * millisecond shared a home, and the first to reach `afterEach` deleted the
 * other's job workspaces out from under it. `mkdtemp` asks the operating
 * system for a name no other process has, which is the only version of this
 * that cannot collide.
 */
let home = "";

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "studio-accept-"));
  process.env.STUDIO_HOME = home;
  store = new JobStore();
  canvasMock.canvas.mockReset();
  catalogMock.jobAccept.mockReset();
  catalogMock.jobAccept.mockResolvedValue({ ok: true, json: {}, error: null });
  catalogMock.jobDiscard.mockResolvedValue({ ok: true, json: {}, error: null });
  diagram.revision = 5;
  diagram.revisionJob = null;
  diagram.documentHash = "d".repeat(64);
  catalogMock.diagramShow.mockReset();
  catalogMock.diagramShow.mockImplementation(async () => ({
    ok: true,
    json: { diagram: { ...diagram }, checkout: null },
    error: null,
    offline: false,
  }));
  catalogMock.diagramPut.mockReset();
  catalogMock.diagramPut.mockImplementation(async (input: { jobId: string }) => {
    diagram.revision += 1;
    diagram.revisionJob = input.jobId;
    return { ok: true, json: { revision: diagram.revision, changed: true }, error: null, offline: false };
  });
  catalogMock.diagramCheckout.mockReset();
  catalogMock.diagramCheckout.mockResolvedValue({ ok: true, json: { exists: true, revision: 6, note: "checked out" }, error: null, offline: false });
  files = filesNow();
  await mkdir(path.dirname(files.candidate), { recursive: true });
  await writeFile(files.candidate, fixtureDocument(), "utf8");
  await writeFile(files.candidateSvg, "<svg/>", "utf8");
});

afterEach(async () => {
  for (const file of Object.values(files)) await rm(file, { force: true });
  // `home`, not `process.env.STUDIO_HOME`: the variable is this file's own
  // directory whatever anything else has done to the environment since.
  if (home !== "") await rm(home, { recursive: true, force: true });
  home = "";
  delete process.env.STUDIO_HOME;
});

describe("a forced export failure", () => {
  it("lands nothing, so the candidate is where it was", async () => {
    await rm(files.candidateSvg, { force: true });
    canvasMock.canvas.mockImplementationOnce(() => reply(4));
    const result = await accept(
      store,
      await place({ gate: { ...record().gate!, svg: null, exportFailed: true } }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("export-failed");
    expect(await exists(files.candidate)).toBe(true);
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
    // The job is still awaiting review, so Accept, Discard and a follow-up job
    // are all still available. That is the whole point of the ordering.
    expect(result.written).toHaveLength(0);
  });
});

describe("a verify that refuses the export", () => {
  it("also lands nothing, because the loop does not end at export", async () => {
    canvasMock.canvas.mockImplementationOnce(() =>
      reply(3, { checks: [{ rule: "text-visible", ok: false, detail: "text outside the frame" }] }),
    );
    const result = await accept(store, await place());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("verify-failed");
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
    expect(await exists(files.candidate)).toBe(true);
  });
});

describe("a clean accept", () => {
  it("puts the candidates with the job's base, records the job, and writes no file under learn/", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    const result = await accept(store, await place());

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(6);
    // What landed, by its logical names; and what was written into the tree,
    // which with the put naming no files is nothing.
    expect(result.landed).toEqual([targetPath(SLUG), targetSvgPath(SLUG)]);
    expect(result.written).toEqual([]);
    expect(catalogMock.diagramPut).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: SLUG,
        tldr: files.candidate,
        svg: files.candidateSvg,
        jobId: "job-accept",
        base: 5,
      }),
    );
    expect(catalogMock.jobAccept).toHaveBeenCalledWith("job-accept");
    // Nothing is renamed into the tree any more: the diagram is its rows.
    expect(await exists(files.target)).toBe(false);
    expect(await exists(files.targetSvg)).toBe(false);
    // The candidates landed, so they go.
    expect(await exists(files.candidate)).toBe(false);
    expect(store.get("job-accept")?.state).toBe("accepted");
    expect(store.get("job-accept")?.indexed).toBe(true);
    expect(result.note).toMatch(/nothing to commit/);
  });

  it("reports indexed: false when the job row does not record it, with the diagram landed", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    catalogMock.jobAccept.mockResolvedValue({ ok: false, json: null, error: "connection refused" });
    const result = await accept(store, await place());

    expect(result.ok).toBe(true);
    expect(result.indexed).toBe(false);
    expect(result.note).toContain("connection refused");
    expect(result.note).toContain("reindex");
    expect(catalogMock.diagramPut).toHaveBeenCalledTimes(1);
    // The disk record says what happened: the diagram is in the database.
    expect(store.get("job-accept")?.state).toBe("accepted");
  });

  it("names the files the put wrote through while the files still own diagrams", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    catalogMock.diagramPut.mockResolvedValue({
      ok: true,
      json: { revision: 6, changed: true, files: [targetPath(SLUG), targetSvgPath(SLUG)] },
      error: null,
      offline: false,
    });
    const result = await accept(store, await place());
    expect(result.ok).toBe(true);
    expect(result.written).toEqual([targetPath(SLUG), targetSvgPath(SLUG)]);
    expect(result.note).toContain(`git add ${targetPath(SLUG)} ${targetSvgPath(SLUG)}`);
  });

  it("is a retry, not a move, when this job's own earlier put is the latest revision", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    diagram.revision = 6;
    diagram.revisionJob = "job-accept";
    const result = await accept(store, await place());
    expect(result.ok).toBe(true);
    expect(catalogMock.diagramPut).toHaveBeenCalledWith(expect.objectContaining({ base: 6 }));
  });
});

describe("a job whose starting revision was never recorded", () => {
  // Enqueued with the database down and given no checkout record: the
  // document hash taken at enqueue is the base instead (review on #142).
  it("lands on the latest revision when the stored document is the one it started from", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    const result = await accept(store, await place({ targetRevisionBefore: undefined, targetHashBefore: "d".repeat(64) }));
    expect(result.ok).toBe(true);
    expect(catalogMock.diagramPut).toHaveBeenCalledWith(expect.objectContaining({ base: 5 }));
  });

  it("refuses when the stored document is not the one it started from", async () => {
    const result = await accept(store, await place({ targetRevisionBefore: undefined, targetHashBefore: "e".repeat(64) }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("target-moved");
    expect(result.note).toMatch(/starting revision was never recorded/);
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
  });
});

describe("the database is down", () => {
  it("refuses, lands nothing and keeps the candidate, since a diagram lives in the database", async () => {
    catalogMock.diagramShow.mockResolvedValue(offline);
    const result = await accept(store, await place());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("catalog-offline");
    expect(result.note).toMatch(/press Accept again once Postgres answers/);
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
    expect(canvasMock.canvas).not.toHaveBeenCalled();
    expect(await exists(files.candidate)).toBe(true);
    expect(store.get("job-accept")?.state).toBe("awaiting_review");
  });
});

describe("a commit that landed while the job ran", () => {
  it("refuses rather than writing over it", async () => {
    diagram.revision = 7;
    diagram.revisionJob = null;
    const result = await accept(store, await place());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("target-moved");
    expect(result.note).toMatch(/revision 5 then, 7 now/);
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
  });

  it("refuses when the catalog's own base check catches it after the last look", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    catalogMock.diagramPut.mockResolvedValue({
      ok: false,
      json: { ok: false, code: "stale-base", error: "moved on" },
      error: "moved on",
      offline: false,
    });
    const result = await accept(store, await place());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("target-moved");
    expect(await exists(files.candidate)).toBe(true);
    expect(store.get("job-accept")?.state).toBe("awaiting_review");
  });
});

/**
 * A6, end to end: the diagram lands behind a canvas that is already gone.
 *
 * The canvas edits the checkout, and the checkout is refreshed to the
 * accepted revision after the put, so a save landing after that would put the
 * old drawing back on it. This wires `closeMirror` to the real `stopChild`
 * over a real process that ignores `SIGTERM` for a quarter of a second, and
 * asks, from inside the child's own `exit` handler, whether the put has
 * happened yet.
 */
describe("the mirror on the target", () => {
  let child: ChildProcess | null = null;

  afterEach(() => {
    try {
      if (child?.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    child = null;
  });

  it("is gone before the diagram lands", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    child = spawn(
      process.execPath,
      ["-e", 'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(0), 250); console.log("up");'],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const writer = child;
    await new Promise<void>((resolve) => writer.stdout?.once("data", () => resolve()));

    let landedWhenTheWriterDied: boolean | null = null;
    writer.on("exit", () => {
      landedWhenTheWriterDied = catalogMock.diagramPut.mock.calls.length > 0;
    });

    const result = await accept(store, await place(), {
      closeMirror: async () => ({ found: true, gone: await stopChild(writer, 5_000) }),
    });

    expect(result.ok).toBe(true);
    expect(result.mirrorClosed).toBe(true);
    expect(landedWhenTheWriterDied).toBe(false);
    expect(catalogMock.diagramPut).toHaveBeenCalledTimes(1);
  });
});

describe("a mirror that will not shut down", () => {
  it("refuses the accept rather than landing behind a live writer", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    const result = await accept(store, await place(), {
      closeMirror: () => Promise.resolve({ found: true, gone: false }),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("mirror-stuck");
    expect(result.mirrorClosed).toBe(true);
    expect(result.written).toHaveLength(0);
    expect(await exists(files.candidate)).toBe(true);
    expect(store.get("job-accept")?.state).toBe("awaiting_review");
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
    expect(catalogMock.jobAccept).not.toHaveBeenCalled();
  });

  it("accepts normally when there was no mirror to close", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    const result = await accept(store, await place(), {
      closeMirror: () => Promise.resolve({ found: false, gone: true }),
    });
    expect(result.ok).toBe(true);
    expect(result.mirrorClosed).toBe(false);
  });
});

describe("the state guard", () => {
  it("refuses to accept a job that is not awaiting review", async () => {
    const result = await accept(store, await place({ state: "failed" }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("wrong-state");
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
  });
});

describe("reindex", () => {
  it("names the files an accept from before Track D wrote, and none for one after the flip", async () => {
    const landed = [targetPath(SLUG), targetSvgPath(SLUG)];
    // Recorded before `files` existed: the accept renamed both into the tree.
    const old = await reindex(store, await place({ state: "accepted", written: landed, indexed: false }));
    expect(old.ok).toBe(true);
    expect(old.written).toEqual(landed);
    expect(old.landed).toEqual(landed);

    const flipped = await reindex(
      store,
      await place({ id: "job-accept-2", state: "accepted", written: landed, files: [], indexed: false }),
    );
    expect(flipped.written).toEqual([]);
    expect(flipped.landed).toEqual(landed);
  });
});

describe("discard", () => {
  it("deletes both candidates and changes nothing in the database", async () => {
    const result = await discard(store, await place());
    expect(result.ok).toBe(true);
    expect(await exists(files.candidate)).toBe(false);
    expect(await exists(files.candidateSvg)).toBe(false);
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
    expect(store.get("job-accept")?.state).toBe("discarded");
  });
});

/**
 * A job recorded before candidates moved into the job workspace names
 * `learn/assets/.candidates/<slug>`, repo-relative. Nothing converts it: its
 * paths resolve against the repository where they are used, so the file is
 * found where it was written and a person can still land it or throw it away.
 */
describe("a record from before candidates moved", () => {
  const legacy = {
    candidatePath: `learn/assets/.candidates/${SLUG}.tldr`,
    candidateSvgPath: `learn/assets/.candidates/${SLUG}.svg`,
  };
  const legacyFiles = () => [absolute(legacy.candidatePath), absolute(legacy.candidateSvgPath)];

  beforeEach(async () => {
    const [tldr, svg] = legacyFiles();
    await mkdir(path.dirname(tldr ?? ""), { recursive: true });
    await writeFile(tldr ?? "", fixtureDocument(), "utf8");
    await writeFile(svg ?? "", "<svg/>", "utf8");
  });
  afterEach(async () => {
    for (const file of legacyFiles()) await rm(file, { force: true });
  });

  it("is discarded where it was written", async () => {
    const result = await discard(store, await place(legacy));
    expect(result.ok).toBe(true);
    for (const file of legacyFiles()) expect(await exists(file)).toBe(false);
    expect(store.get("job-accept")?.state).toBe("discarded");
  });

  it("is accepted from where it was written", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    const result = await accept(store, await place(legacy));
    expect(result.ok).toBe(true);
    expect(catalogMock.diagramPut).toHaveBeenCalledWith(
      expect.objectContaining({ tldr: legacyFiles()[0], svg: legacyFiles()[1] }),
    );
    for (const file of legacyFiles()) expect(await exists(file)).toBe(false);
  });
});
