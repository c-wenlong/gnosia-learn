import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadVocabulary, validateBrief, type ValidBrief } from "../src/brief";
import type { JobRecord } from "../src/store";
import { absolute, jobDir, targetPath, targetSvgPath, CANDIDATES_DIR } from "../src/paths";
import { fixtureDocument } from "./fixture-document";

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

/**
 * The before side of the comparison launches Chromium twice — `inspect` and
 * `shot` over the committed file — and none of that is what these tests are
 * about. Only the reader is stubbed: the arithmetic around it is pure, lives in
 * `compare.test.ts`, and a runner calling a stubbed version of it would stop
 * being the runner under test.
 *
 * It matters more than a speed-up. Left real, the two subprocesses hold the
 * `execute` path open for seconds, and every assertion here about what happened
 * *before the agent started* would pass by looking at a job that had not
 * started yet — the extend tests would have gone green on nothing.
 */
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
vi.mock("../src/compare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/compare")>()),
  ...compareMock,
}));

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

const ok = { ok: true, json: {}, error: null, offline: false };

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

/**
 * Let the queue get on with it.
 *
 * Twenty milliseconds was a bet that an enqueue, two `mkdir`s and a `writeFile`
 * land inside one tick, and on a laptop running eleven vitest workers that bet
 * loses every few runs — as a job that had not started yet, or a gate nothing
 * had called. The wait is longer now, and every assertion about *when*
 * something happened goes through `gateInput` or `agentsStarted` instead, which
 * wait for the thing rather than for a duration.
 */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 150));

/** Wait until the agent has been started `count` times, or say it never was. */
async function agentsStarted(count: number, budgetMs = 5_000): Promise<void> {
  const until = Date.now() + budgetMs;
  while (agentMock.startAgent.mock.calls.length < count) {
    if (Date.now() > until) {
      throw new Error(
        `the agent was started ${agentMock.startAgent.mock.calls.length} times, not ${count}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Wait for the gate to have been called, rather than for 20 milliseconds.
 *
 * `settled()` is a fixed tick, and a fixed tick is a bet that one enqueue, two
 * `mkdir`s and a `writeFile` land inside it. On a laptop running eleven vitest
 * workers that bet loses every few runs, and the test then reads `calls[0]` of
 * a mock nothing has called yet. Every assertion about what the gate was handed
 * waits for the call instead.
 */
async function gateInput<T>(budgetMs = 5_000): Promise<T> {
  const until = Date.now() + budgetMs;
  for (;;) {
    const call = gateMock.runGate.mock.calls.at(-1)?.[0];
    if (call !== undefined) return call as T;
    if (Date.now() > until) throw new Error("the gate was never called");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The sha256 the reconcile pass would have recorded for this content. */
const hash = (body: string): string => createHash("sha256").update(body).digest("hex");

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

/**
 * A finished parent job on disk, without running one.
 *
 * Enqueuing a real one would hold this target's lease and refuse the job under
 * test, which is the lease doing its job and not the thing being checked here.
 * Only the fields the code under test reads are meaningful; the rest are the
 * record's own shape.
 */
function parentRecord(
  id: string,
  startedAtMs: number,
  state = "interrupted",
  /** What the reconcile pass hashed at the candidate path, when it wrote `interrupted`. */
  candidateHash: string | null = null,
): JobRecord {
  const at = new Date(startedAtMs).toISOString();
  return {
    id,
    kind: "diagram",
    state,
    phase: "drawing",
    brief: {
      intent: "x",
      topic: "vector-and-linear-algebra-basics",
      slug: SLUG,
      title: "Dot product",
      mode: "new",
      elements: [{ label: "vector a" }],
      relations: [],
      concepts: [],
      model: "sonnet",
      idempotencyKey: `${id}-key`,
    },
    targetPath: targetPath(SLUG),
    targetSvgPath: targetSvgPath(SLUG),
    candidatePath: `${CANDIDATES_DIR}/${SLUG}.tldr`,
    candidateSvgPath: `${CANDIDATES_DIR}/${SLUG}.svg`,
    topic: "vector-and-linear-algebra-basics",
    slug: SLUG,
    attempt: 1,
    sessionId: `studio-${id}`,
    agentSessionId: "77777777-7777-4777-8777-777777777777",
    parentJobId: null,
    changes: null,
    idempotencyKey: `${id}-key`,
    targetHashBefore: null,
    candidateHash,
    requestedAt: at,
    startedAt: at,
    finishedAt: at,
    reviewedAt: null,
    heartbeatAt: null,
    cancelRequestedAt: null,
    exitCode: null,
    turns: null,
    costUsd: null,
    gate: null,
    errorKind: null,
    error: null,
    written: [],
    indexed: false,
    catalogErrors: [],
  } as JobRecord;
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
  // The candidates directory is shared with the real one, so a fixture left
  // there is a fixture the next `catalog index` reads.
  await rm(absolute(`${CANDIDATES_DIR}/${SLUG}.tldr`), { force: true });
  await rm(absolute(`${CANDIDATES_DIR}/${SLUG}.svg`), { force: true });
  delete process.env.STUDIO_HOME;
});

describe("a catalog that cannot be reached", () => {
  it("keeps the job rather than deleting the only record of it", async () => {
    catalogMock.jobEnqueue.mockResolvedValue({
      ok: false,
      json: null,
      error: "catalog job enqueue exited 1: connect ECONNREFUSED 127.0.0.1:5432",
      offline: true,
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
    await agentsStarted(1);
    expect(agentMock.startAgent).toHaveBeenCalledTimes(1);
  });

  it("still refuses, and forgets the job, when the catalog answered and said no", async () => {
    catalogMock.jobEnqueue.mockResolvedValue({
      ok: false,
      json: null,
      error: `no topic "x" in the catalog. Add it to content/topics.yaml`,
      offline: false,
    });

    await expect(runner.enqueue(await brief())).rejects.toBeInstanceOf(JobRefused);
    // Forgotten, not merely deleted from disk: a record left in memory goes on
    // holding this target's lease against every brief that follows it.
    expect(store.list()).toHaveLength(0);
    expect(store.activeOn(targetPath(SLUG))).toBeUndefined();
  });
});

describe("a database that is alive and refused this process", () => {
  /**
   * The dangerous middle case. Bad credentials, `too many clients`, a server
   * still starting up: the error reads like a connection problem, but the
   * database is up and a correctly configured runner may be working against it
   * right now. Degrading to lease-free there puts two agents on one file.
   */
  for (const error of [
    "catalog job enqueue exited 1: password authentication failed for user \"kaichen\"",
    "catalog job enqueue exited 1: sorry, too many clients already",
    "catalog job enqueue exited 1: the database system is starting up",
    "catalog job enqueue exited 1: Connection terminated unexpectedly",
  ]) {
    it(`refuses rather than running lease-free: ${error.split(": ")[1]}`, async () => {
      catalogMock.jobEnqueue.mockResolvedValue({ ok: false, json: null, error, offline: false });
      await expect(runner.enqueue(await brief())).rejects.toBeInstanceOf(JobRefused);
      await settled();
      expect(agentMock.startAgent).not.toHaveBeenCalled();
    });
  }
});

describe("a claim the catalog refuses", () => {
  it("ends the job instead of starting a second paid agent on the same file", async () => {
    catalogMock.jobClaim.mockResolvedValue({
      ok: false,
      json: null,
      error: `job x is running, and running → running is not a transition.`,
      offline: false,
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
      offline: true,
    });

    await runner.enqueue(await brief());
    await settled();
    await agentsStarted(1);
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
    await agentsStarted(1);
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

    await agentsStarted(1);
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

    await agentsStarted(1);
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

    await agentsStarted(2);
    expect(agentMock.startAgent).toHaveBeenCalledTimes(2);
    const second = started[1]?.options ?? {};
    expect(second.sessionId).not.toBe("22222222-2222-4222-8222-222222222222");
    expect(second.resume).toBe(false);
    expect(String(second.prompt)).toContain("You are drawing one teaching diagram");
  });
});

describe("a resume", () => {
  it("opens the parent's session with no change request, because there is nothing to change", async () => {
    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "44444444-4444-4444-8444-444444444444",
      changes: null,
    });
    await settled();

    await agentsStarted(1);
    const options = started[0]?.options ?? {};
    expect(options.sessionId).toBe("44444444-4444-4444-8444-444444444444");
    expect(options.resume).toBe(true);
    expect(String(options.prompt)).toContain("stopped part-way");
    // Not the revise prompt: nobody asked for anything to be different.
    expect(String(options.prompt)).not.toContain("a change has been asked for");
  });

  /**
   * The bug this catches made Resume a button that could only fail.
   *
   * The gate's first step refuses a candidate older than the job, because such
   * a file is something else's output. A resumed job's candidate is older by
   * construction — it is the work being resumed — so every resume failed step
   * 1 three times and then failed the job. Measured against three real runs in
   * phase 3.
   */
  it("measures the candidate's age from the parent, not from itself", async () => {
    const parentStart = Date.now() - 600_000;
    const partial = fixtureDocument({ title: "half-drawn" });
    await writeFile(absolute(`${CANDIDATES_DIR}/${SLUG}.tldr`), partial, "utf8");
    await store.create(parentRecord("parent-job", parentStart, "interrupted", hash(partial)));

    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "55555555-5555-4555-8555-555555555555",
      changes: null,
    });
    await settled();

    const input = await gateInput<{ startedAtMs: number }>();
    expect(input.startedAtMs).toBeLessThanOrEqual(parentStart);
  });

  /**
   * A resume that began by deleting what it was resuming.
   *
   * `resume` re-derives `extend` from the target existing, and every extend job
   * copies the committed file over the candidate before the agent starts — so a
   * resume of a job that was extending a committed diagram overwrote the
   * partial drawing the reconcile pass had deliberately left on disk. Caught in
   * review on the phase 3 PR.
   */
  it("leaves the partial candidate alone rather than copying the target over it", async () => {
    await writeFile(absolute(targetPath(SLUG)), fixtureDocument({ title: "committed" }), "utf8");
    const candidate = absolute(`${CANDIDATES_DIR}/${SLUG}.tldr`);
    const partial = fixtureDocument({ title: "half-drawn" });
    await writeFile(candidate, partial, "utf8");
    await store.create(parentRecord("parent-three", Date.now() - 300_000, "interrupted", hash(partial)));

    await runner.enqueue(await brief({ mode: "extend" }), {
      jobId: "parent-three",
      agentSessionId: "88888888-8888-4888-8888-888888888888",
      changes: null,
    });
    await settled();

    expect(await readFile(candidate, "utf8")).toContain("half-drawn");
    // And no `unchangedHash`: the candidate is not the runner's copy of
    // anything, so "byte-identical to the copy" is not a question about it.
    const input = await gateInput<{ unchangedHash?: string | null }>();
    expect(input.unchangedHash).toBeNull();
  });

  /**
   * The other half of the same question, which the first fix did not ask.
   *
   * The candidate path is per slug, and an interrupted job holds no lease on
   * its target — so a later job for the same slug can write that path and leave
   * its own file there. Resuming would then adopt somebody else's artifact and
   * offer it for review under this job's name. The hash the reconcile pass took
   * is what tells them apart. Caught in review on the phase 3 PR.
   */
  it("does not adopt a candidate that is not the one it was interrupted with", async () => {
    await writeFile(absolute(targetPath(SLUG)), fixtureDocument({ title: "committed" }), "utf8");
    const candidate = absolute(`${CANDIDATES_DIR}/${SLUG}.tldr`);
    await writeFile(candidate, fixtureDocument({ title: "somebody else's" }), "utf8");
    // The parent was interrupted holding something *else* at that path.
    await store.create(
      parentRecord("parent-five", Date.now() - 300_000, "interrupted", hash("what this job drew")),
    );

    await runner.enqueue(await brief({ mode: "extend" }), {
      jobId: "parent-five",
      agentSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      changes: null,
    });
    await settled();

    // Treated as a fresh extend: the committed file is copied over it, and the
    // gate measures freshness from this job rather than from the parent.
    expect(await readFile(candidate, "utf8")).toContain("committed");
    const input = await gateInput<{ unchangedHash?: string | null; startedAtMs: number; }>();
    expect(typeof input.unchangedHash).toBe("string");
    expect(input.startedAtMs).toBeGreaterThan(Date.now() - 60_000);
  });

  it("still copies the target when a revision extends it, because nothing is half-drawn", async () => {
    await writeFile(absolute(targetPath(SLUG)), fixtureDocument({ title: "committed" }), "utf8");
    await rm(absolute(`${CANDIDATES_DIR}/${SLUG}.tldr`), { force: true });
    await store.create(parentRecord("parent-four", Date.now() - 300_000, "accepted"));

    await runner.enqueue(await brief({ mode: "extend" }), {
      jobId: "parent-four",
      agentSessionId: "99999999-9999-4999-8999-999999999999",
      changes: "make it wider",
    });
    await settled();

    const input = await gateInput<{ unchangedHash?: string | null }>();
    expect(typeof input.unchangedHash).toBe("string");
  });

  it("keeps its own start when it is a revision, where nothing of the parent is left", async () => {
    await store.create(parentRecord("parent-two", Date.now() - 600_000, "discarded"));

    await runner.enqueue(await brief(), {
      jobId: "parent-two",
      agentSessionId: "66666666-6666-4666-8666-666666666666",
      changes: "wider",
    });
    await settled();

    const input = await gateInput<{ startedAtMs: number }>();
    expect(input.startedAtMs).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("extend mode", () => {
  it("tells the gate what the copy looked like, so an untouched one cannot pass", async () => {
    await writeFile(absolute(targetPath(SLUG)), fixtureDocument(), "utf8");

    await runner.enqueue(await brief({ mode: "extend" }));
    await settled();

    const input = await gateInput<{ unchangedHash?: string | null }>();
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

    const input = await gateInput<{ elements: unknown[]; relations: unknown[]; }>();
    expect(input.elements).toHaveLength(2);
    expect(input.relations).toHaveLength(1);
  });
});
