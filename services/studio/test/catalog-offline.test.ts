import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateBrief, type ValidBrief } from "../src/diagram/brief";
import { absolute, jobDir, targetPath, targetSvgPath } from "../src/paths";
import { allSettled, until } from "./wait";
import { testVocabulary } from "./vocabulary";

/**
 * D16 end to end: the real `catalog` CLI, a real runner, and a database that is
 * not there.
 *
 * `queue.test.ts` proves what the runner does with `offline: true` and `false`
 * by stubbing the catalog module. It could not catch the bug this file exists
 * for, because the stub already answers the question that went wrong: the CLI
 * printed drizzle's `Failed query: <sql>` for a dead port, `catalog.ts` read
 * that as a live database refusing, and every job was refused with the database
 * down. So here nothing between the runner and the socket is stubbed. The
 * agent, the gate, the before-screenshot and the review are, because none of
 * them is what is under test and the agent costs money.
 *
 * No database server is needed. A file whose parent cannot be a directory is
 * "nothing listening" — `open` never reaches SQLite — and the refusal comes
 * from a file that opens and is not a database, the same shape a Postgres
 * server answering 3D000 had.
 */

const gateMock = vi.hoisted(() => ({ runGate: vi.fn(), narrate: vi.fn(() => "a step") }));
vi.mock("../src/diagram/gate", () => gateMock);

const compareMock = vi.hoisted(() => ({
  readSide: vi.fn(async () => ({
    shapes: 3,
    bindings: 1,
    lints: [],
    svgBytes: null,
    shot: false,
    at: new Date().toISOString(),
  })),
}));
vi.mock("../src/diagram/compare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/diagram/compare")>()),
  ...compareMock,
}));

const reviewMock = vi.hoisted(() => ({
  dirtyFiles: vi.fn(async () => [] as string[]),
  accept: vi.fn(),
  discard: vi.fn(),
  reindex: vi.fn(),
}));
vi.mock("../src/diagram/review", () => reviewMock);

const agentMock = vi.hoisted(() => ({
  startAgent: vi.fn(),
  sweepOrphans: vi.fn(async () => [] as number[]),
  AgentRun: class {},
}));
vi.mock("../src/agent/agent", () => agentMock);

const { status } = await import("../src/data/catalog");
const { Runner, JobRefused } = await import("../src/diagram/runner");
const { JobStore } = await import("../src/data/store");

const SLUG = "studio-offline-fixture";

async function brief(): Promise<ValidBrief> {
  return validateBrief(
    {
      intent: "show how a dot product projects one vector onto another",
      topic: "vector-and-linear-algebra-basics",
      slug: SLUG,
      title: "Dot product",
      mode: "new",
      elements: [{ label: "vector a" }, { label: "vector b" }],
      relations: [],
      idempotencyKey: `key-${Math.random()}`,
    },
    testVocabulary(),
  );
}

let store: InstanceType<typeof JobStore>;
let runner: InstanceType<typeof Runner>;

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-offline-${Date.now()}-${Math.random()}`);
  gateMock.runGate.mockReset().mockResolvedValue({
    ok: true,
    steps: [],
    findings: [],
    shapes: 12,
    lints: 0,
    svg: null,
    exportFailed: false,
    checkedAt: new Date().toISOString(),
  });
  reviewMock.dirtyFiles.mockReset().mockResolvedValue([]);
  agentMock.sweepOrphans.mockReset().mockResolvedValue([]);
  // An agent that finishes cleanly the moment it starts. Starting it at all is
  // what this file asserts; what it would have drawn is not.
  agentMock.startAgent.mockReset().mockImplementation(() =>
    Promise.resolve({
      done: Promise.resolve({
        exitCode: 0,
        signal: null,
        turns: 1,
        subtype: "success",
        isError: false,
        result: null,
        apiKeySource: null,
        spawnFailed: false,
        denials: [],
        stopReason: null,
        stderr: "",
      }),
      stop: async () => undefined,
    }),
  );
  store = new JobStore();
  runner = new Runner(store);
});

afterEach(async () => {
  await runner.drain();
  await allSettled(runner, store);
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  await rm(absolute(targetPath(SLUG)), { force: true });
  await rm(absolute(targetSvgPath(SLUG)), { force: true });
  delete process.env.STUDIO_HOME;
  vi.unstubAllEnvs();
});

describe("a catalog with nothing listening", () => {
  // A regular file where the database's parent directory should be: mkdir
  // cannot make it, so no open ever happens — what a refused TCP connection
  // was on Postgres.
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "studio-offline-"));
    const blocker = path.join(dir, "blocking");
    await writeFile(blocker, "a file, not a directory");
    vi.stubEnv("DATABASE_URL", path.join(blocker, "catalog.db"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is offline, and says why", async () => {
    const result = await status();
    expect(result.ok).toBe(false);
    expect(result.offline).toBe(true);
    expect(result.error).toContain("database unreachable: a path component is not a directory");
  });

  it("degrades enqueue: the job is kept, and it runs", async () => {
    const { record, created } = await runner.enqueue(await brief());

    expect(created).toBe(true);
    expect(record.state).toBe("queued");
    expect(await stat(jobDir(record.id)).then(() => true)).toBe(true);
    expect(store.get(record.id)?.catalogErrors.join(" ")).toContain("a path component is not a directory");
    // Session start and the claim are two more real CLI calls before the
    // agent, each a cold `tsx` start, so the budget is theirs and not a sleep.
    await until(
      () => agentMock.startAgent.mock.calls.length >= 1,
      "the agent was never started, so the job was not run without the database",
      25_000,
    );
    await runner.settled(record.id);
  });
});

describe("a catalog whose database answers and refuses", () => {
  // A file that opens but is not a database: `open` answered, the first read
  // says no — the same shape a Postgres answering 3D000 had, and just as much
  // a hard stop rather than "offline".
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "studio-offline-notdb-"));
    await writeFile(path.join(dir, "catalog.db"), "this is not a sqlite database\n");
    vi.stubEnv("DATABASE_URL", path.join(dir, "catalog.db"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses the job and forgets it, rather than running lease-free", async () => {
    await expect(runner.enqueue(await brief())).rejects.toBeInstanceOf(JobRefused);
    expect(store.list()).toHaveLength(0);
    expect(agentMock.startAgent).not.toHaveBeenCalled();
  });
});
