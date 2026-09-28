import { mkdir, rm, stat, writeFile } from "node:fs/promises";
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
import type { JobRecord } from "../src/store";
import { fixtureDocument } from "./fixture-document";

/**
 * The three things accept could not survive, each one a window rather than a
 * bug in a line: a commit that lands while the export is running, a second
 * request arriving while the first is halfway through, and a job row that
 * fails to record an accept whose diagram already landed.
 *
 * All three are timing, so all three are tested by controlling when the two
 * subprocess calls return rather than by asserting on an ordering in the code.
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

/** The diagram as the fake catalog holds it. */
const diagram = { revision: 3, revisionJob: null as string | null };

const { accept, discard, reindex } = await import("../src/review");
const { JobStore } = await import("../src/store");

const SLUG = "studio-recovery-fixture";
/**
 * The four files a test looks at. The candidates are in the job's workspace
 * under this test's `STUDIO_HOME`, so they are named once it is set.
 */
function filesNow() {
  return {
    candidate: candidatePath("job-recovery", SLUG),
    candidateSvg: candidateSvgPath("job-recovery", SLUG),
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
    id: "job-recovery",
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
    candidatePath: candidatePath("job-recovery", SLUG),
    candidateSvgPath: candidateSvgPath("job-recovery", SLUG),
    topic: "vector-and-linear-algebra-basics",
    slug: SLUG,
    attempt: 1,
    sessionId: "studio-job-recovery",
    agentSessionId: "00000000-0000-4000-8000-000000000000",
    parentJobId: null,
    changes: null,
    idempotencyKey: "k",
    targetHashBefore: null,
    targetRevisionBefore: 3,
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
      svg: { path: candidateSvgPath("job-recovery", SLUG), bytes: 2048 },
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

const place = async (over: Partial<JobRecord> = {}): Promise<JobRecord> => store.create(record(over));

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-recovery-${Date.now()}-${Math.random()}`);
  store = new JobStore();
  canvasMock.canvas.mockReset();
  catalogMock.jobAccept.mockReset();
  catalogMock.jobAccept.mockResolvedValue({ ok: true, json: {}, error: null, reachable: true });
  catalogMock.jobDiscard.mockResolvedValue({ ok: true, json: {}, error: null, reachable: true });
  diagram.revision = 3;
  diagram.revisionJob = null;
  catalogMock.diagramShow.mockReset();
  catalogMock.diagramShow.mockImplementation(async () => ({
    ok: true,
    json: { diagram: { revision: diagram.revision, revisionJob: diagram.revisionJob }, checkout: null },
    error: null,
    offline: false,
  }));
  catalogMock.diagramPut.mockReset();
  catalogMock.diagramPut.mockImplementation(async (input: { jobId: string; base?: number | null }) => {
    // The catalog's own base check, which is what the late look races.
    if (input.base !== undefined && input.base !== diagram.revision && diagram.revisionJob !== input.jobId) {
      return { ok: false, json: { ok: false, code: "stale-base" }, error: "moved on", offline: false };
    }
    diagram.revision += 1;
    diagram.revisionJob = input.jobId;
    return { ok: true, json: { revision: diagram.revision, changed: true }, error: null, offline: false };
  });
  catalogMock.diagramCheckout.mockResolvedValue({ ok: true, json: { exists: true, revision: 4, note: "checked out" }, error: null, offline: false });
  files = filesNow();
  await mkdir(path.dirname(files.candidate), { recursive: true });
  await writeFile(files.candidate, fixtureDocument(), "utf8");
  await writeFile(files.candidateSvg, "<svg/>", "utf8");
});

afterEach(async () => {
  for (const file of Object.values(files)) await rm(file, { force: true });
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

describe("a commit that lands while accept is exporting", () => {
  it("is not written over, because the base is asked again with nothing left to await", async () => {
    // The verify is the last subprocess before the put, and it is where a
    // person committing from the canvas lands: an export and a verify are a
    // Chromium launch each, so the check at the top of accept is minutes old.
    canvasMock.canvas.mockImplementationOnce(async () => {
      diagram.revision = 4;
      diagram.revisionJob = null;
      return reply(0, { checks: [] });
    });

    const result = await accept(store, await place());
    expect(result.ok).toBe(false);
    expect(result.error).toBe("target-moved");
    expect(await exists(files.candidate)).toBe(true);
    expect(catalogMock.diagramPut).not.toHaveBeenCalled();
    // The whole point: their commit is still the latest revision.
    expect(diagram.revision).toBe(4);
  });
});

describe("two review actions arriving at once", () => {
  it("serialises them, so the second sees the state the first left", async () => {
    canvasMock.canvas.mockImplementation(() => reply(0, { checks: [] }));
    const job = await place();

    // Both hold the record they fetched before either ran, which is what a pair
    // of HTTP handlers holds.
    const [first, second] = await Promise.all([accept(store, job), accept(store, job)]);

    const outcomes = [first, second];
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
    const refused = outcomes.find((result) => !result.ok);
    // A refusal a caller can act on, not a second put.
    expect(refused?.error).toBe("wrong-state");
    expect(catalogMock.diagramPut).toHaveBeenCalledTimes(1);
    expect(catalogMock.jobAccept).toHaveBeenCalledTimes(1);
  });

  it("does not let a discard delete a candidate an accept is landing", async () => {
    canvasMock.canvas.mockImplementation(() => reply(0, { checks: [] }));
    const job = await place();

    const [accepted, discarded] = await Promise.all([accept(store, job), discard(store, job)]);

    expect(accepted.ok).toBe(true);
    expect(discarded.ok).toBe(false);
    // The record says what happened, rather than "discarded" over a diagram
    // that landed.
    expect(store.get("job-recovery")?.state).toBe("accepted");
    expect(catalogMock.diagramPut).toHaveBeenCalledTimes(1);
  });
});

describe("an accept whose diagram landed and whose job row did not record it", () => {
  it("is finished by reindex, which is the one recovery the record allows", async () => {
    canvasMock.canvas.mockImplementation(() => reply(0, { checks: [] }));
    catalogMock.jobAccept.mockResolvedValueOnce({
      ok: false,
      json: null,
      error: "connection refused",
      reachable: false,
    });

    const accepted = await accept(store, await place());
    expect(accepted.ok).toBe(true);
    expect(accepted.indexed).toBe(false);
    expect(accepted.note).toContain("reindex");

    // `accepted` is terminal, so a second accept cannot re-enter it: without a
    // reindex the provenance is lost and only a person with psql can fix it.
    const again = await accept(store, store.get("job-recovery")!);
    expect(again.ok).toBe(false);
    expect(again.error).toBe("wrong-state");

    const repaired = await reindex(store, store.get("job-recovery")!);
    expect(repaired.ok).toBe(true);
    expect(repaired.indexed).toBe(true);
    expect(store.get("job-recovery")?.indexed).toBe(true);
    // Only the job row: the diagram landed the first time and is not put again.
    expect(catalogMock.jobAccept).toHaveBeenLastCalledWith("job-recovery");
    expect(catalogMock.diagramPut).toHaveBeenCalledTimes(1);
  });

  it("says so rather than pretending, when the database is still down", async () => {
    canvasMock.canvas.mockImplementation(() => reply(0, { checks: [] }));
    catalogMock.jobAccept.mockResolvedValue({
      ok: false,
      json: null,
      error: "connection refused",
      reachable: false,
    });
    await accept(store, await place());

    const repaired = await reindex(store, store.get("job-recovery")!);
    expect(repaired.ok).toBe(false);
    expect(repaired.error).toBe("catalog-failed");
    expect(store.get("job-recovery")?.indexed).toBe(false);
  });

  it("refuses a job that never got as far as landing anything", async () => {
    const repaired = await reindex(store, await place());
    expect(repaired.ok).toBe(false);
    expect(repaired.error).toBe("wrong-state");
  });
});
