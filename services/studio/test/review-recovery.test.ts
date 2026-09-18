import { createHash } from "node:crypto";
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
  CANDIDATES_DIR,
} from "../src/paths";
import type { JobRecord } from "../src/store";

/**
 * The three things accept could not survive, each one a window rather than a
 * bug in a line: an edit that lands while the export is running, a second
 * request arriving while the first is halfway through, and a catalog call that
 * fails after the files have already moved.
 *
 * All three are timing, so all three are tested by controlling when the two
 * subprocess calls return rather than by asserting on an ordering in the code.
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

const { accept, discard, reindex } = await import("../src/review");
const { JobStore } = await import("../src/store");

const SLUG = "studio-recovery-fixture";
const files = {
  candidate: absolute(candidatePath(SLUG)),
  candidateSvg: absolute(candidateSvgPath(SLUG)),
  target: absolute(targetPath(SLUG)),
  targetSvg: absolute(targetSvgPath(SLUG)),
};

const exists = async (file: string): Promise<boolean> =>
  (await stat(file).catch(() => null)) !== null;

const sha = (body: string): string => createHash("sha256").update(body).digest("hex");

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
    candidatePath: candidatePath(SLUG),
    candidateSvgPath: candidateSvgPath(SLUG),
    topic: "vector-and-linear-algebra-basics",
    slug: SLUG,
    attempt: 1,
    sessionId: "studio-job-recovery",
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

const place = async (over: Partial<JobRecord> = {}): Promise<JobRecord> => store.create(record(over));

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-recovery-${Date.now()}-${Math.random()}`);
  store = new JobStore();
  canvasMock.canvas.mockReset();
  catalogMock.jobAccept.mockReset();
  catalogMock.jobAccept.mockResolvedValue({ ok: true, json: {}, error: null, reachable: true });
  catalogMock.jobDiscard.mockResolvedValue({ ok: true, json: {}, error: null, reachable: true });
  await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
  await writeFile(files.candidate, "{}", "utf8");
  await writeFile(files.candidateSvg, "<svg/>", "utf8");
});

afterEach(async () => {
  for (const file of Object.values(files)) await rm(file, { force: true });
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

describe("a human edit that lands while accept is exporting", () => {
  it("is not overwritten, because the hash is asked again with nothing left to await", async () => {
    // The job started against this version of the committed file.
    await writeFile(files.target, "the version the job saw", "utf8");
    const before = sha("the version the job saw");

    // The verify is the last subprocess before the rename, and it is where a
    // person saving in the mirror lands: an export and a verify are a Chromium
    // launch each, so the check at the top of accept is minutes old by now.
    canvasMock.canvas.mockImplementationOnce(async () => {
      await writeFile(files.target, "someone's edit, mid-accept", "utf8");
      return reply(0, { checks: [] });
    });

    const result = await accept(store, await place({ targetHashBefore: before }));

    expect(result.ok).toBe(false);
    expect(result.error).toBe("target-moved");
    expect(await exists(files.candidate)).toBe(true);
    // The whole point: their edit is still on disk.
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(files.target, "utf8")).toBe("someone's edit, mid-accept");
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
    // A refusal a caller can act on, not an ENOENT from a rename that had
    // already happened.
    expect(refused?.error).toBe("wrong-state");
    expect(await exists(files.target)).toBe(true);
    expect(catalogMock.jobAccept).toHaveBeenCalledTimes(1);
  });

  it("does not let a discard delete a candidate an accept is landing", async () => {
    canvasMock.canvas.mockImplementation(() => reply(0, { checks: [] }));
    const job = await place();

    const [accepted, discarded] = await Promise.all([accept(store, job), discard(store, job)]);

    expect(accepted.ok).toBe(true);
    expect(discarded.ok).toBe(false);
    // The record says what happened to the files, rather than "discarded" over
    // two files that are in learn/assets/.
    expect(store.get("job-recovery")?.state).toBe("accepted");
    expect(await exists(files.target)).toBe(true);
  });
});

describe("an accept whose files landed and whose catalog call did not", () => {
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
    // The same two paths, so `assert-output` upserts the rows it already has.
    expect(catalogMock.jobAccept).toHaveBeenLastCalledWith("job-recovery", [
      targetPath(SLUG),
      targetSvgPath(SLUG),
    ]);
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
