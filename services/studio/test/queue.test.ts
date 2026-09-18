import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadVocabulary, validateBrief, type ValidBrief } from "../src/brief";
import { absolute, jobDir, targetPath, targetSvgPath, CANDIDATES_DIR } from "../src/paths";

/**
 * What the queue does when something other than the drawing goes wrong: the
 * database is unreachable, the catalog will not hand the job over, the ceiling
 * fires, or the agent never starts.
 *
 * Each of these has a right answer that differs from the neighbouring one by a
 * single fact, and getting them the same way round is how a job is lost, run
 * twice, or recorded as something a person did. The agent, the gate and the
 * catalog are all stubbed, because none of them is what is under test here.
 */

const catalogMock = vi.hoisted(() => ({
  jobEnqueue: vi.fn(),
  jobClaim: vi.fn(),
  jobFinish: vi.fn(),
  jobAccept: vi.fn(),
  jobDiscard: vi.fn(),
  sessionStart: vi.fn(),
  sessionEnd: vi.fn(),
  status: vi.fn(),
}));
vi.mock("../src/catalog", () => catalogMock);

const gateMock = vi.hoisted(() => ({ runGate: vi.fn(), narrate: vi.fn(() => "a step") }));
vi.mock("../src/gate", () => gateMock);

const reviewMock = vi.hoisted(() => ({
  dirtyFiles: vi.fn(async () => [] as string[]),
  accept: vi.fn(),
  discard: vi.fn(),
  reindex: vi.fn(),
}));
vi.mock("../src/review", () => reviewMock);

/** One controllable agent run: the test decides when it finishes and how. */
interface FakeAgent {
  done: Promise<Record<string, unknown>>;
  stop: (reason: string) => Promise<void>;
  settle: (outcome: Record<string, unknown>) => void;
  options: Record<string, unknown>;
}

const agentMock = vi.hoisted(() => ({
  startAgent: vi.fn(),
  sweepOrphans: vi.fn(async () => [] as number[]),
  AgentRun: class {},
}));
vi.mock("../src/agent", () => agentMock);

const { Runner, JobRefused } = await import("../src/runner");
const { JobStore } = await import("../src/store");

const ok = { ok: true, json: {}, error: null, reachable: true };

const outcome = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  exitCode: 0,
  signal: null,
  turns: 9,
  costUsd: 0.2,
  subtype: "success",
  isError: false,
  spawnFailed: false,
  denials: [],
  stopReason: null,
  stderr: "",
  ...over,
});

const started: FakeAgent[] = [];

/**
 * An agent that finishes cleanly the moment it is started.
 *
 * `hang` is the variant the cancellation tests want: it never settles until
 * something stops it, which is what a real fifteen-minute drawing looks like
 * from the runner's side.
 */
function stageAgent(hang = false): void {
  agentMock.startAgent.mockImplementation((options: Record<string, unknown>) => {
    let settle: (value: Record<string, unknown>) => void = () => undefined;
    const done = new Promise<Record<string, unknown>>((resolve) => {
      settle = resolve;
    });
    const agent: FakeAgent = {
      done,
      options,
      settle,
      stop: async (reason: string) => {
        settle(outcome({ stopReason: reason, exitCode: null }));
      },
    };
    started.push(agent);
    if (!hang) settle(outcome());
    return Promise.resolve(agent);
  });
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

const SLUG = "studio-queue-fixture";

async function brief(over: Record<string, unknown> = {}): Promise<ValidBrief> {
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
      ...over,
    },
    await loadVocabulary(),
  );
}

let store: InstanceType<typeof JobStore>;
let runner: InstanceType<typeof Runner>;

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-queue-${Date.now()}-${Math.random()}`);
  for (const fn of Object.values(catalogMock)) fn.mockReset().mockResolvedValue(ok);
  agentMock.startAgent.mockReset();
  agentMock.sweepOrphans.mockReset().mockResolvedValue([]);
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
  started.length = 0;
  stageAgent();
  store = new JobStore();
  runner = new Runner(store);
  await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
});

afterEach(async () => {
  await runner.drain();
  // The job writes its terminal record after the agent stops, so the workspace
  // has to outlive the drain by a tick or the test deletes it mid-write.
  await settled();
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  await rm(absolute(targetPath(SLUG)), { force: true });
  await rm(absolute(targetSvgPath(SLUG)), { force: true });
  delete process.env.STUDIO_HOME;
});

describe("a catalog that cannot be reached", () => {
  it("keeps the job rather than deleting the only record of it", async () => {
    catalogMock.jobEnqueue.mockResolvedValue({
      ok: false,
      json: null,
      error: "catalog job enqueue exited 1: connect ECONNREFUSED 127.0.0.1:5432",
      reachable: false,
    });

    const { record, created } = await runner.enqueue(await brief());

    // D16 and U3: a missing `dist/` refuses a job and a missing Postgres does
    // not. Deleting the workspace here made the database the one outage that
    // loses work, in the service whose write path is a disk record first.
    expect(created).toBe(true);
    expect(record.state).toBe("queued");
    expect(await stat(jobDir(record.id)).then(() => true)).toBe(true);
    expect(store.get(record.id)).toBeDefined();
    expect(store.get(record.id)?.catalogErrors.join(" ")).toContain("ECONNREFUSED");
    // And it actually runs, which is the half of "keeps the job" that matters.
    await settled();
    expect(agentMock.startAgent).toHaveBeenCalledTimes(1);
  });

  it("still refuses, and forgets the job, when the catalog answered and said no", async () => {
    catalogMock.jobEnqueue.mockResolvedValue({
      ok: false,
      json: null,
      error: `no topic "x" in the catalog. Add it to content/topics.yaml`,
      reachable: true,
    });

    await expect(runner.enqueue(await brief())).rejects.toBeInstanceOf(JobRefused);
    // Forgotten, not merely deleted from disk: a record left in memory goes on
    // holding this target's lease against every brief that follows it.
    expect(store.list()).toHaveLength(0);
    expect(store.activeOn(targetPath(SLUG))).toBeUndefined();
  });
});

describe("a claim the catalog refuses", () => {
  it("ends the job instead of starting a second paid agent on the same file", async () => {
    catalogMock.jobClaim.mockResolvedValue({
      ok: false,
      json: null,
      error: `job x is running, and running → running is not a transition.`,
      reachable: true,
    });

    const { record } = await runner.enqueue(await brief());
    await settled();

    expect(agentMock.startAgent).not.toHaveBeenCalled();
    expect(store.get(record.id)?.state).toBe("failed");
    expect(store.get(record.id)?.errorKind).toBe("not-claimed");
    // The row belongs to whoever holds it, so finishing it would transition
    // *their* running job.
    expect(catalogMock.jobFinish).not.toHaveBeenCalled();
  });

  it("runs anyway when the claim failed because nothing answered", async () => {
    catalogMock.jobClaim.mockResolvedValue({
      ok: false,
      json: null,
      error: "could not run the catalog CLI: spawn npm ENOENT",
      reachable: false,
    });

    await runner.enqueue(await brief());
    await settled();
    expect(agentMock.startAgent).toHaveBeenCalledTimes(1);
  });
});

describe("the job ceiling", () => {
  beforeEach(() => {
    agentMock.startAgent.mockReset();
    started.length = 0;
    stageAgent(true);
  });

  it("records a timeout, not a cancellation somebody never asked for", async () => {
    const { record } = await runner.enqueue(await brief());
    await settled();
    expect(started).toHaveLength(1);

    // The path the 45-minute timer takes, without waiting 45 minutes for it.
    await runner.cancel(record.id, "job-timeout");
    await settled();

    const finished = store.get(record.id);
    expect(finished?.state).toBe("failed");
    expect(finished?.errorKind).toBe("timeout");
    expect(finished?.error).toContain("ceiling");
    // A2 keeps the session id so a revise can continue rather than paying again.
    expect(finished?.agentSessionId).not.toBeNull();
  });

  it("still calls a cancellation a cancellation", async () => {
    const { record } = await runner.enqueue(await brief());
    await settled();
    await runner.cancel(record.id);
    await settled();

    expect(store.get(record.id)?.state).toBe("cancelled");
    expect(store.get(record.id)?.errorKind).toBe("cancelled");
  });
});

describe("an agent that never started", () => {
  it("fails the job rather than asking the gate about a file it did not write", async () => {
    agentMock.startAgent.mockImplementation(() =>
      Promise.resolve({
        done: Promise.resolve(
          outcome({
            exitCode: null,
            turns: null,
            costUsd: null,
            subtype: null,
            isError: true,
            spawnFailed: true,
            stderr: "could not start claude: spawn claude ENOENT",
          }),
        ),
        stop: async () => undefined,
      }),
    );

    const { record } = await runner.enqueue(await brief());
    await settled();

    expect(gateMock.runGate).not.toHaveBeenCalled();
    expect(store.get(record.id)?.state).toBe("failed");
    expect(store.get(record.id)?.errorKind).toBe("spawn");
    // One attempt, not three: two more would be two more missing binaries.
    expect(agentMock.startAgent).toHaveBeenCalledTimes(1);
  });
});

describe("a revision", () => {
  it("continues the parent's session instead of paying for the drawing again", async () => {
    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "11111111-1111-4111-8111-111111111111",
      changes: "make the arrow labels bigger",
    });
    await settled();

    const options = started[0]?.options ?? {};
    expect(options.sessionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(options.resume).toBe(true);
    // The change request, not the whole brief: that is what `revise` buys.
    expect(String(options.prompt)).toContain("a change has been asked for");
    expect(String(options.prompt)).toContain("make the arrow labels bigger");
  });

  it("mints its own session when the parent kept none, and draws from the brief", async () => {
    await runner.enqueue(await brief());
    await settled();

    expect(started[0]?.options.resume).toBe(false);
    expect(String(started[0]?.options.prompt)).toContain("You are drawing one teaching diagram");
  });

  it("falls back to a fresh session when the stored one cannot be resumed", async () => {
    // `--resume` against a transcript this machine no longer has exits without
    // taking a turn. Spending two more attempts on the same missing session is
    // two attempts spent on nothing.
    agentMock.startAgent.mockImplementationOnce((options: Record<string, unknown>) => {
      started.push({ options } as FakeAgent);
      return Promise.resolve({
        done: Promise.resolve(outcome({ exitCode: 1, turns: null, costUsd: null, isError: true })),
        stop: async () => undefined,
      });
    });

    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "22222222-2222-4222-8222-222222222222",
      changes: "make it clearer",
    });
    await settled();

    expect(agentMock.startAgent).toHaveBeenCalledTimes(2);
    const second = started[1]?.options ?? {};
    expect(second.sessionId).not.toBe("22222222-2222-4222-8222-222222222222");
    expect(second.resume).toBe(false);
    expect(String(second.prompt)).toContain("You are drawing one teaching diagram");
  });
});

describe("extend mode", () => {
  it("tells the gate what the copy looked like, so an untouched one cannot pass", async () => {
    await writeFile(absolute(targetPath(SLUG)), '{"records":[]}', "utf8");

    await runner.enqueue(await brief({ mode: "extend" }));
    await settled();

    const input = gateMock.runGate.mock.calls[0]?.[0] as { unchangedHash?: string | null };
    expect(typeof input.unchangedHash).toBe("string");
  });

  it("passes the brief's elements and relations to the gate", async () => {
    await runner.enqueue(
      await brief({
        elements: [{ label: "vector a" }, { label: "vector b" }],
        relations: [{ from: "vector a", to: "vector b", label: "projects onto" }],
      }),
    );
    await settled();

    const input = gateMock.runGate.mock.calls[0]?.[0] as {
      elements: unknown[];
      relations: unknown[];
    };
    expect(input.elements).toHaveLength(2);
    expect(input.relations).toHaveLength(1);
  });
});
