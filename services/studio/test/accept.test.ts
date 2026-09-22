import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  absolute,
  candidatePath,
  candidateSvgPath,
  targetPath,
  targetSvgPath,
  CANDIDATES_DIR,
} from "../src/paths";
import { stopChild } from "../src/mirrors";
import type { JobRecord } from "../src/store";
import { fixtureDocument } from "./fixture-document";

/**
 * Accept, and the ordering that makes its two failure windows survivable.
 *
 * The test that matters is the forced export failure: everything that can fail
 * has to happen before anything moves, so a failed export must leave the
 * candidate where it was and `learn/assets/` untouched. The alternative
 * ordering — rename first, export onto the committed path — passes a happy-path
 * test and loses the work the first time the export throws, because a retry
 * cannot repeat a rename that already happened.
 */

const canvasMock = vi.hoisted(() => ({ canvas: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/canvas")>();
  return { ...actual, canvas: canvasMock.canvas };
});

const catalogMock = vi.hoisted(() => ({ jobAccept: vi.fn(), jobDiscard: vi.fn() }));
vi.mock("../src/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog")>();
  return { ...actual, jobAccept: catalogMock.jobAccept, jobDiscard: catalogMock.jobDiscard };
});

const { accept, discard } = await import("../src/review");
const { JobStore } = await import("../src/store");

const SLUG = "studio-accept-fixture";
const files = {
  candidate: absolute(candidatePath(SLUG)),
  candidateSvg: absolute(candidateSvgPath(SLUG)),
  target: absolute(targetPath(SLUG)),
  targetSvg: absolute(targetSvgPath(SLUG)),
};

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
    candidatePath: candidatePath(SLUG),
    candidateSvgPath: candidateSvgPath(SLUG),
    topic: "vector-and-linear-algebra-basics",
    slug: SLUG,
    attempt: 1,
    sessionId: "studio-job-accept",
    agentSessionId: "00000000-0000-4000-8000-000000000000",
    parentJobId: null,
    changes: null,
    idempotencyKey: "k",
    targetHashBefore: null,
    requestedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    reviewedAt: null,
    heartbeatAt: null,
    cancelRequestedAt: null,
    exitCode: 0,
    turns: 8,
    costUsd: 0.4,
    gate: {
      ok: true,
      steps: [],
      findings: [],
      shapes: 12,
      lints: 0,
      svg: { path: candidateSvgPath(SLUG), bytes: 2048 },
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

/**
 * The record, in the store. `accept` and `discard` write it themselves — the
 * disk record before the database row, which is rule 7 — so a fixture that only
 * built the object would be testing a path the routes do not take.
 */
const place = async (over: Partial<JobRecord> = {}): Promise<JobRecord> =>
  store.create(record(over));

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-test-${Date.now()}`);
  store = new JobStore();
  canvasMock.canvas.mockReset();
  catalogMock.jobAccept.mockReset();
  catalogMock.jobAccept.mockResolvedValue({ ok: true, json: {}, error: null });
  catalogMock.jobDiscard.mockResolvedValue({ ok: true, json: {}, error: null });
  await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
  await writeFile(files.candidate, fixtureDocument(), "utf8");
  await writeFile(files.candidateSvg, "<svg/>", "utf8");
});

afterEach(async () => {
  for (const file of Object.values(files)) await rm(file, { force: true });
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

describe("a forced export failure", () => {
  it("moves nothing, so the candidate and the target are both where they were", async () => {
    await rm(files.candidateSvg, { force: true });
    canvasMock.canvas.mockImplementationOnce(() => reply(4));
    const result = await accept(
      store,
      await place({ gate: { ...record().gate!, svg: null, exportFailed: true } }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("export-failed");
    expect(await exists(files.candidate)).toBe(true);
    expect(await exists(files.target)).toBe(false);
    // The job is still awaiting review, so Accept, Discard and a follow-up job
    // are all still available. That is the whole point of the ordering.
    expect(result.written).toHaveLength(0);
  });
});

describe("a verify that refuses the export", () => {
  it("also moves nothing, because the loop does not end at export", async () => {
    canvasMock.canvas.mockImplementationOnce(() =>
      reply(3, { checks: [{ rule: "text-visible", ok: false, detail: "text outside the frame" }] }),
    );
    const result = await accept(store, await place());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("verify-failed");
    expect(await exists(files.target)).toBe(false);
    expect(await exists(files.candidate)).toBe(true);
  });
});

describe("a clean accept", () => {
  it("renames both files and then records them, in that order", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    const result = await accept(store, await place());

    expect(result.ok).toBe(true);
    expect(result.written).toEqual([targetPath(SLUG), targetSvgPath(SLUG)]);
    expect(await exists(files.target)).toBe(true);
    expect(await exists(files.targetSvg)).toBe(true);
    expect(await exists(files.candidate)).toBe(false);
    // One call, both paths: the asserts and the transition share the catalog's
    // own transaction, so a job can never be accepted with no output row.
    expect(catalogMock.jobAccept).toHaveBeenCalledWith("job-accept", [
      targetPath(SLUG),
      targetSvgPath(SLUG),
    ]);
    // The disk record moved before the catalog call, so a crash in between
    // leaves a job that says what actually happened to the two files.
    expect(store.get("job-accept")?.state).toBe("accepted");
    expect(store.get("job-accept")?.written).toEqual([targetPath(SLUG), targetSvgPath(SLUG)]);
  });

  it("lands the files and reports indexed: false when Postgres is unreachable", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    catalogMock.jobAccept.mockResolvedValue({
      ok: false,
      json: null,
      error: "connection refused",
    });
    const result = await accept(store, await place());

    expect(result.ok).toBe(true);
    expect(result.indexed).toBe(false);
    expect(result.note).toContain("connection refused");
    // D16: the files are the output and the index is derived from them.
    expect(await exists(files.target)).toBe(true);
  });
});

describe("a human edit that landed while the job ran", () => {
  it("refuses rather than overwriting it", async () => {
    await writeFile(files.target, "someone else's work", "utf8");
    const result = await accept(
      store,
      await place({ targetHashBefore: createHash("sha256").update("something older").digest("hex") }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("target-moved");
    expect(await readFile(files.target, "utf8")).toBe("someone else's work");
  });
});

/**
 * A6, end to end: the rename happens behind a writer that is already gone.
 *
 * The three tests above mock the close, so they pin *when* accept asks for it
 * and not whether asking achieves anything. This one wires `closeMirror` to the
 * real `stopChild` over a real process that ignores `SIGTERM` for a quarter of
 * a second, which is the shape of the bug: `serve` holds the document as its
 * tab last loaded it, so a save landing between the close and the rename PUTs
 * the old diagram back over the accepted one, silently, with a `git diff`
 * nobody is looking at as the only evidence.
 *
 * The assertion is read from inside the child's own `exit` handler, because
 * that is the one moment where "is the writer still alive?" and "has the file
 * been replaced?" can be asked of each other. With the close sending a signal
 * and returning, the rename had already happened by then.
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

  it("is gone before the candidate is renamed over it", async () => {
    canvasMock.canvas.mockImplementationOnce(() => reply(0, { checks: [] }));
    // Detached, like a real mirror: the close signals the process group.
    child = spawn(
      process.execPath,
      ["-e", 'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(0), 250); console.log("up");'],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const writer = child;
    await new Promise<void>((resolve) => writer.stdout?.once("data", () => resolve()));

    let targetWhenTheWriterDied: string | null = null;
    writer.on("exit", () => {
      targetWhenTheWriterDied = existsSync(files.target) ? "already renamed" : "not yet renamed";
    });

    const result = await accept(store, await place(), {
      closeMirror: async () => {
        await stopChild(writer, 5_000);
        return true;
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mirrorClosed).toBe(true);
    expect(targetWhenTheWriterDied).toBe("not yet renamed");
    expect(await exists(files.target)).toBe(true);
  });
});

describe("the state guard", () => {
  it("refuses to accept a job that is not awaiting review", async () => {
    const result = await accept(store, await place({ state: "failed" }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("wrong-state");
    expect(await exists(files.target)).toBe(false);
  });
});

describe("discard", () => {
  it("deletes both candidates and leaves learn/assets/ alone", async () => {
    const result = await discard(store, await place());
    expect(result.ok).toBe(true);
    expect(await exists(files.candidate)).toBe(false);
    expect(await exists(files.candidateSvg)).toBe(false);
    expect(await exists(files.target)).toBe(false);
    expect(store.get("job-accept")?.state).toBe("discarded");
  });
});
