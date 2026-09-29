import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateBrief, type ValidBrief } from "../src/brief";
import type { JobRecord } from "../src/store";
import {
  absolute,
  candidatePath,
  candidateRef,
  candidateSvgPath,
  jobDir,
  REPO_ROOT,
  rejectedDir,
  targetPath,
  targetSvgPath,
  workDir,
  workPath,
} from "../src/paths";

import { fixtureDocument } from "./fixture-document";
import { allSettled, until } from "./wait";
import { testVocabulary } from "./vocabulary";

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
  // The diagram, as the catalog would answer about it. Unreachable here, so the
  // runner answers from the checkout on disk (D16), which is what these tests
  // write when they need a diagram to extend.
  diagramShow: vi.fn(async () => ({ ok: false, json: null, error: "unreachable", offline: true })),
  diagramCheckout: vi.fn(async () => ({ ok: false, json: null, error: "unreachable", offline: true })),
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
  subtype: "success",
  isError: false,
  result: null,
  apiKeySource: null,
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
 * Wait until the agent has been started `count` times, or say it never was.
 *
 * Also the signal that the job is *running with an agent somebody can stop*.
 * The runner persists `running` and awaits that write before it calls
 * `startAgent`, and it assigns the returned run to the entry a microtask
 * later, with no I/O in between. So a poll that sees the call from inside a
 * timer callback, which only runs once the microtask queue has drained, is
 * looking at a job a `cancel` can act on.
 */
async function agentsStarted(count: number, budgetMs = 5_000): Promise<void> {
  await until(
    () => agentMock.startAgent.mock.calls.length >= count,
    () => `the agent was started ${agentMock.startAgent.mock.calls.length} times, not ${count}`,
    budgetMs,
  );
}

/**
 * Wait for the gate to have been called, and hand back what it was given.
 *
 * Every assertion about what the gate was handed goes through this. It is also
 * the signal for everything the runner does *before* the gate: the claim, the
 * copy-or-not decision on an extend, and the agent's whole run all happen
 * first, so a gate call is proof that they are behind us. A sleep in their
 * place was a bet on how long they take.
 */
async function gateInput<T>(budgetMs = 5_000): Promise<T> {
  await until(
    () => gateMock.runGate.mock.calls.at(-1)?.[0] !== undefined,
    "the gate was never called",
    budgetMs,
  );
  return gateMock.runGate.mock.calls.at(-1)?.[0] as T;
}

/** The sha256 the reconcile pass would have recorded for this content. */
const hash = (body: string): string => createHash("sha256").update(body).digest("hex");

const SLUG = "studio-queue-fixture";

/** A diagram to extend: its checkout, which is the file every verb and the runner read. */
async function writeCheckout(body: string, encoding: BufferEncoding): Promise<void> {
  await mkdir(workDir(), { recursive: true });
  await writeFile(workPath(SLUG), body, encoding);
}


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
    testVocabulary(),
  );
}

/** Where candidates lived before they moved into the job workspace, repo-relative. */
const LEGACY_DIR = "learn/assets/.candidates";

/** Write a parent's candidate where its record says it is. */
async function writeCandidate(record: JobRecord, body: string): Promise<string> {
  const file = absolute(record.candidatePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, "utf8");
  return file;
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
  /** A record from before candidates moved: the per-slug path under learn/assets/.candidates/. */
  legacy = false,
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
    candidatePath: legacy ? `${LEGACY_DIR}/${SLUG}.tldr` : candidatePath(id, SLUG),
    candidateSvgPath: legacy ? `${LEGACY_DIR}/${SLUG}.svg` : candidateSvgPath(id, SLUG),
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
    costSource: null,
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
});

afterEach(async () => {
  await runner.drain();
  // The job writes its terminal record after the agent stops, so the workspace
  // has to outlive the drain or the test deletes it mid-write. Not "by a tick":
  // by however long those writes take, which is what `settled` knows and a
  // fixed sleep only guesses.
  await allSettled(runner, store);
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  await rm(absolute(targetPath(SLUG)), { force: true });
  await rm(absolute(targetSvgPath(SLUG)), { force: true });
  await rm(workPath(SLUG), { force: true });
  // The legacy per-slug directory is in the test's repository root, which
  // outlives one test; a record from before the move is written there.
  await rm(absolute(`${LEGACY_DIR}/${SLUG}.tldr`), { force: true });
  await rm(absolute(`${LEGACY_DIR}/${SLUG}.svg`), { force: true });
  delete process.env.STUDIO_HOME;
});

describe("a studio home the diagram agent's Bash guard cannot carry", () => {
  it("refuses the job at enqueue with the reason, and spawns nothing", async () => {
    const saved = process.env.STUDIO_HOME;
    process.env.STUDIO_HOME = path.join(tmpdir(), `studio-queue-$dollar-${Date.now()}`);
    try {
      const refused = await runner.enqueue(await brief()).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(JobRefused);
      expect((refused as InstanceType<typeof JobRefused>).status).toBe(503);
      expect((refused as Error).message).toContain("the diagram agent cannot run from this studio home");
      expect((refused as Error).message).toContain('"$"');
      expect(store.list()).toHaveLength(0);
      expect(agentMock.startAgent).not.toHaveBeenCalled();
    } finally {
      process.env.STUDIO_HOME = saved;
    }
  });
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
      // "No agent was started" cannot be proved by waiting, and the sleep that
      // used to sit here was proving nothing: `startAgent` is several awaits
      // deep inside `execute`, so a runner that wrongly carried on would not
      // have called it by the time a tick expired either. What makes the claim
      // true is the state: the refusal forgot the job before it ever woke the
      // queue, so there is nothing left for this or any later kick to find.
      expect(store.list()).toHaveLength(0);
      expect(runner.busy).toBe(0);
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
    // A refused claim ends the attempt inside `execute`, so the thing to wait
    // for is the runner being finished with the job. `enqueue` kicks the queue
    // synchronously before it returns, so the job is registered by now and
    // `settled` is this job's promise rather than the resolved stand-in a
    // never-started id gets.
    await runner.settled(record.id);

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
    // `cancel` refuses a job that is not `running`, and it has nothing to stop
    // until the runner holds the agent. Both are true once `startAgent` has
    // been called: the runner awaits the `running` write before calling it.
    await agentsStarted(1);
    expect(started).toHaveLength(1);

    // The path the 45-minute timer takes, without waiting 45 minutes for it.
    await runner.cancel(record.id, "job-timeout");
    // `cancel` returns once the agent has been asked to stop. The verdict is
    // written after that, by the `execute` chain, and `settled` is its end.
    await runner.settled(record.id);

    const finished = store.get(record.id);
    expect(finished?.state).toBe("failed");
    expect(finished?.errorKind).toBe("timeout");
    expect(finished?.error).toContain("ceiling");
    // A2 keeps the session id so a revise can continue rather than paying again.
    expect(finished?.agentSessionId).not.toBeNull();
  });

  it("still calls a cancellation a cancellation", async () => {
    const { record } = await runner.enqueue(await brief());
    await agentsStarted(1);
    await runner.cancel(record.id);
    await runner.settled(record.id);

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
    // A spawn failure ends the job on the first attempt, so the runner being
    // finished with it is the moment all three claims below are decided: no
    // gate call, a terminal record, and no second attempt.
    await runner.settled(record.id);

    expect(gateMock.runGate).not.toHaveBeenCalled();
    expect(store.get(record.id)?.state).toBe("failed");
    expect(store.get(record.id)?.errorKind).toBe("spawn");
    // One attempt, not three: two more would be two more missing binaries.
    expect(agentMock.startAgent).toHaveBeenCalledTimes(1);
  });
});

describe("an agent whose first request is refused", () => {
  const API_ERROR =
    "API Error: 400 This API key is not scoped to a workspace, so this request must include " +
    "the anthropic-workspace-id header with the ID of the workspace to use.";

  /**
   * What the real CLI did on the job that prompted this: an init event naming
   * the environment's key, the API's 400 as the only assistant text, and a
   * result with `is_error` after one turn and a subtype of `success`. `write`
   * lets a test have the agent touch the candidate first.
   */
  function refuseFirstRequest(
    over: Record<string, unknown> = {},
    write?: (options: Record<string, unknown>) => Promise<void>,
  ): void {
    agentMock.startAgent.mockImplementation(async (options: Record<string, unknown>) => {
      started.push({ options } as FakeAgent);
      const onInit = options.onInit as ((init: Record<string, unknown>) => void) | undefined;
      onInit?.({ apiKeySource: "ANTHROPIC_API_KEY", model: "claude-sonnet-5" });
      await write?.(options);
      return {
        done: Promise.resolve(
          outcome({
            exitCode: 1,
            turns: 1,
            isError: true,
            result: API_ERROR,
            apiKeySource: "ANTHROPIC_API_KEY",
            ...over,
          }),
        ),
        stop: async () => undefined,
      };
    });
  }

  it("ends the job on the first attempt, with the API's message rather than a gate finding", async () => {
    refuseFirstRequest();

    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    const finished = store.get(record.id);
    expect(finished?.state).toBe("failed");
    expect(finished?.errorKind).toBe("agent");
    expect(finished?.error).toBe(API_ERROR);
    // Not three identical 400s, and no gate asked about a file nobody wrote.
    expect(agentMock.startAgent).toHaveBeenCalledTimes(1);
    expect(gateMock.runGate).not.toHaveBeenCalled();
    expect(finished?.gate).toBeNull();
    // What it ran on, both as the runner chose it and as the CLI reported it.
    expect(finished?.agentAuth).toBe("login");
    expect(finished?.apiKeySource).toBe("ANTHROPIC_API_KEY");
    expect(started[0]?.options.auth).toBe("login");
    // The catalog row says the same thing the record does.
    expect(catalogMock.jobFinish).toHaveBeenCalledWith(
      expect.objectContaining({ state: "failed", errorKind: "agent", error: API_ERROR }),
    );
  });

  it("puts the credential in the job's events, where the panel's log can show it", async () => {
    refuseFirstRequest();

    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);
    // The attempt waits for the note before it goes on, so by the time the job
    // has settled it is in the log, and ahead of the event that ended the job.
    const events = store.subscribe(record.id, 0, () => undefined).replay;
    const credential = events.find((event) => event.note.includes("ANTHROPIC_API_KEY"));
    const ending = events.find((event) => event.type === "error");
    expect(credential?.note).toContain("STUDIO_AGENT_AUTH=login");
    expect(ending).toBeDefined();
    expect(credential?.seq ?? Infinity).toBeLessThan(ending?.seq ?? -Infinity);
  });

  it("still reports a stray write first, because a dirty file is what a person has to look at", async () => {
    reviewMock.dirtyFiles.mockReset().mockResolvedValueOnce([]).mockResolvedValue(["README.md"]);
    refuseFirstRequest();

    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    expect(store.get(record.id)?.errorKind).toBe("wrote-outside");
    expect(store.get(record.id)?.error).toContain("README.md");
  });

  it("moves a resumed job's adopted drawing to its rejected directory, and leaves the parent's own", async () => {
    const partial = fixtureDocument({ title: "half-drawn" });
    const parent = parentRecord("parent-refused", Date.now() - 300_000, "interrupted", hash(partial));
    const parentFile = await writeCandidate(parent, partial);
    await store.create(parent);
    refuseFirstRequest();

    const { record } = await runner.enqueue(await brief(), {
      jobId: "parent-refused",
      agentSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      changes: null,
    });
    await runner.settled(record.id);

    expect(store.get(record.id)?.errorKind).toBe("agent");
    expect(await stat(record.candidatePath).then(() => true, () => false)).toBe(false);
    expect(await readFile(path.join(rejectedDir(record.id), `${SLUG}.tldr`), "utf8")).toContain("half-drawn");
    // The parent's workspace is the parent's: still interrupted, still discardable.
    expect(await readFile(parentFile, "utf8")).toContain("half-drawn");
  });

  it("records STUDIO_AGENT_AUTH=env on the job when that is the setting", async () => {
    process.env.STUDIO_AGENT_AUTH = "env";
    try {
      refuseFirstRequest();
      const { record } = await runner.enqueue(await brief());
      await runner.settled(record.id);
      expect(store.get(record.id)?.agentAuth).toBe("env");
      expect(started[0]?.options.auth).toBe("env");
    } finally {
      delete process.env.STUDIO_AGENT_AUTH;
    }
  });

  it("treats the runner's untouched copy in extend mode as nothing written", async () => {
    await writeCheckout(fixtureDocument({ title: "committed" }), "utf8");
    refuseFirstRequest();

    const { record } = await runner.enqueue(await brief({ mode: "extend" }));
    await runner.settled(record.id);

    expect(store.get(record.id)?.errorKind).toBe("agent");
    expect(gateMock.runGate).not.toHaveBeenCalled();
  });

  it("still asks the gate when the agent erred after taking turns", async () => {
    // Rule 4: an agent that ran and failed may have left work, and the gate,
    // not the exit, decides what is on disk.
    refuseFirstRequest({ turns: 7, result: "error_max_turns" });

    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    expect(gateMock.runGate).toHaveBeenCalled();
    expect(store.get(record.id)?.errorKind).not.toBe("agent");
  });

  it("still asks the gate when the agent erred on its first turn but wrote the candidate", async () => {
    refuseFirstRequest({}, async (options) => {
      await writeFile(candidatePath(String(options.jobId), SLUG), fixtureDocument(), "utf8");
    });

    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    expect(gateMock.runGate).toHaveBeenCalled();
    expect(store.get(record.id)?.errorKind).not.toBe("agent");
  });
});

describe("a revision", () => {
  it("continues the parent's session instead of paying for the drawing again", async () => {
    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "11111111-1111-4111-8111-111111111111",
      changes: "make the arrow labels bigger",
    });
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
        done: Promise.resolve(outcome({ exitCode: 1, turns: null, isError: true })),
        stop: async () => undefined,
      });
    });

    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "22222222-2222-4222-8222-222222222222",
      changes: "make it clearer",
    });
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
    const parent = parentRecord("parent-job", parentStart, "interrupted", hash(partial));
    await writeCandidate(parent, partial);
    await store.create(parent);

    await runner.enqueue(await brief(), {
      jobId: "parent-job",
      agentSessionId: "55555555-5555-4555-8555-555555555555",
      changes: null,
    });
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
  it("carries the partial candidate over rather than copying the target over it", async () => {
    await writeCheckout(fixtureDocument({ title: "committed" }), "utf8");
    const partial = fixtureDocument({ title: "half-drawn" });
    const parent = parentRecord("parent-three", Date.now() - 300_000, "interrupted", hash(partial));
    await writeCandidate(parent, partial);
    await store.create(parent);

    const { record } = await runner.enqueue(await brief({ mode: "extend" }), {
      jobId: "parent-three",
      agentSessionId: "88888888-8888-4888-8888-888888888888",
      changes: null,
    });
    // The gate call first, and then the file. The copy-or-not decision happens
    // in `execute` before the agent runs and the gate runs after it, so a gate
    // call is proof the decision has been made; reading the candidate before
    // that is reading it while the runner may still be about to write it.
    const input = await gateInput<{ unchangedHash?: string | null }>();
    // In this job's own workspace, a copy of the parent's.
    expect(record.candidatePath).toBe(candidatePath(record.id, SLUG));
    expect(await readFile(record.candidatePath, "utf8")).toContain("half-drawn");
    // And no `unchangedHash`: the candidate is not the runner's copy of
    // anything, so "byte-identical to the copy" is not a question about it.
    expect(input.unchangedHash).toBeNull();
  });

  /**
   * The other half of the same question, which the first fix did not ask.
   *
   * A record from before candidates moved names the per-slug path, and an
   * interrupted job holds no lease on its target, so a later job for the same
   * slug can have written that path and left its own file there. Resuming
   * would then adopt somebody else's artifact and offer it for review under
   * this job's name. The hash the reconcile pass took is what tells them
   * apart. Caught in review on the phase 3 PR.
   */
  it("does not adopt a legacy candidate that is not the one it was interrupted with", async () => {
    await writeCheckout(fixtureDocument({ title: "committed" }), "utf8");
    // The parent was interrupted holding something *else* at that path.
    const parent = parentRecord("parent-five", Date.now() - 300_000, "interrupted", hash("what this job drew"), true);
    const legacy = await writeCandidate(parent, fixtureDocument({ title: "somebody else's" }));
    await store.create(parent);

    const { record } = await runner.enqueue(await brief({ mode: "extend" }), {
      jobId: "parent-five",
      agentSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      changes: null,
    });
    // Treated as a fresh extend: the committed file is copied over it, and the
    // gate measures freshness from this job rather than from the parent. The
    // gate call comes first here for the same reason as above: it is what says
    // the copy-or-not decision is behind us.
    const input = await gateInput<{ unchangedHash?: string | null; startedAtMs: number; }>();
    expect(await readFile(record.candidatePath, "utf8")).toContain("committed");
    // And the file in the tree is nobody's business of this job's: left as it was.
    expect(await readFile(legacy, "utf8")).toContain("somebody else's");
    expect(typeof input.unchangedHash).toBe("string");
    expect(input.startedAtMs).toBeGreaterThan(Date.now() - 60_000);
  });

  it("still copies the target when a revision extends it, because nothing is half-drawn", async () => {
    await writeCheckout(fixtureDocument({ title: "committed" }), "utf8");
    await store.create(parentRecord("parent-four", Date.now() - 300_000, "accepted"));

    await runner.enqueue(await brief({ mode: "extend" }), {
      jobId: "parent-four",
      agentSessionId: "99999999-9999-4999-8999-999999999999",
      changes: "make it wider",
    });
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
    const input = await gateInput<{ startedAtMs: number }>();
    expect(input.startedAtMs).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("where a job draws", () => {
  /** Each entry of a directory in the test's repository root, or none when it is absent. */
  const listing = async (relative: string): Promise<string[]> =>
    (await readdir(absolute(relative)).catch(() => [] as string[])).sort();

  it("draws in its own workspace, tells the catalog so relatively, and writes nothing in the tree", async () => {
    const assetsBefore = await listing("learn/assets");
    const legacyBefore = await listing(LEGACY_DIR);
    // An agent that does what the prompt says: the two files at the paths the
    // runner handed it, and nowhere else.
    agentMock.startAgent.mockImplementation(async (options: Record<string, unknown>) => {
      started.push({ options } as FakeAgent);
      const jobId = String(options.jobId);
      await writeFile(candidatePath(jobId, SLUG), fixtureDocument(), "utf8");
      await writeFile(candidateSvgPath(jobId, SLUG), "<svg/>", "utf8");
      return { done: Promise.resolve(outcome()), stop: async () => undefined };
    });

    const { record } = await runner.enqueue(await brief());
    await runner.settled(record.id);

    expect(store.get(record.id)?.state).toBe("awaiting_review");
    expect(record.candidatePath).toBe(path.join(jobDir(record.id), "candidate", `${SLUG}.tldr`));
    expect(record.candidateSvgPath).toBe(path.join(jobDir(record.id), "candidate", `${SLUG}.svg`));
    expect(await readFile(record.candidatePath, "utf8")).toBe(fixtureDocument());
    // The gate judged that file and no other.
    const input = await gateInput<{ candidatePath: string; candidateSvgPath: string }>();
    expect(input.candidatePath).toBe(record.candidatePath);
    expect(input.candidateSvgPath).toBe(record.candidateSvgPath);
    // The catalog is told the workspace path relative to STUDIO_HOME, the form
    // it derives and checks, at enqueue and at finish alike.
    const briefFile = JSON.parse(await readFile(path.join(jobDir(record.id), "brief.json"), "utf8")) as {
      candidate: string;
    };
    expect(briefFile.candidate).toBe(candidateRef(record.id, SLUG));
    expect(briefFile.candidate).toBe(`jobs/${record.id}/candidate/${SLUG}.tldr`);
    const finish = catalogMock.jobFinish.mock.calls.at(-1)?.[0] as { candidatePath?: string };
    expect(finish.candidatePath).toBe(candidateRef(record.id, SLUG));
    // Nothing under learn/assets/ appeared, and the old per-slug directory
    // gained nothing.
    expect(await listing("learn/assets")).toEqual(assetsBefore);
    expect(await listing(LEGACY_DIR)).toEqual(legacyBefore);
    expect(record.candidatePath.startsWith(`${REPO_ROOT}${path.sep}learn`)).toBe(false);
  });

  it("moves a job queued before the move into its own workspace before anything is drawn", async () => {
    const queued = parentRecord("queued-before", Date.now() - 60_000, "queued", null, true);
    await store.create({ ...queued, startedAt: null, finishedAt: null, sessionId: null, agentSessionId: null });

    void runner.kick();
    await agentsStarted(1);
    await runner.settled("queued-before");

    const after = store.get("queued-before");
    expect(after?.candidatePath).toBe(candidatePath("queued-before", SLUG));
    expect(after?.candidateSvgPath).toBe(candidateSvgPath("queued-before", SLUG));
    expect(String(started[0]?.options.prompt)).toContain(candidatePath("queued-before", SLUG));
    const finish = catalogMock.jobFinish.mock.calls.at(-1)?.[0] as { candidatePath?: string };
    expect(finish.candidatePath).toBe(candidateRef("queued-before", SLUG));
  });

  it("continues a revised `new` drawing from the parent's partial, keeping the partial's age", async () => {
    const partial = fixtureDocument({ title: "half-drawn" });
    const parent = parentRecord("parent-timed-out", Date.now() - 600_000, "failed");
    const parentFile = await writeCandidate(parent, partial);
    const old = new Date(Date.now() - 600_000);
    await utimes(parentFile, old, old);
    await store.create(parent);

    const { record } = await runner.enqueue(await brief(), {
      jobId: "parent-timed-out",
      agentSessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      changes: "make the arrows thicker",
    });
    const input = await gateInput<{ startedAtMs: number }>();
    expect(await readFile(record.candidatePath, "utf8")).toContain("half-drawn");
    // The copy is as old as the drawing, and the gate still wants this job to
    // have drawn: a revision is not resumed work.
    expect((await stat(record.candidatePath)).mtimeMs).toBe(old.getTime());
    expect(input.startedAtMs).toBeGreaterThan(Date.now() - 60_000);
    expect(String(started[0]?.options.prompt)).toContain(record.candidatePath);
    expect(String(started[0]?.options.prompt)).toContain("the files have moved");
  });

  it("adopts a legacy parent's drawing from learn/assets/.candidates when it is the one it left", async () => {
    const parentStart = Date.now() - 600_000;
    const partial = fixtureDocument({ title: "half-drawn before the move" });
    const parent = parentRecord("parent-legacy", parentStart, "interrupted", hash(partial), true);
    const legacy = await writeCandidate(parent, partial);
    await store.create(parent);

    const { record } = await runner.enqueue(await brief(), {
      jobId: "parent-legacy",
      agentSessionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      changes: null,
    });
    const input = await gateInput<{ startedAtMs: number }>();
    expect(await readFile(record.candidatePath, "utf8")).toContain("half-drawn before the move");
    expect(input.startedAtMs).toBeLessThanOrEqual(parentStart);
    // Copied, not moved: the parent record still names its file, and a
    // Discard of the parent is what removes it.
    expect(await readFile(legacy, "utf8")).toContain("half-drawn before the move");
  });
});

describe("extend mode", () => {
  it("tells the gate what the copy looked like, so an untouched one cannot pass", async () => {
    await writeCheckout(fixtureDocument(), "utf8");

    await runner.enqueue(await brief({ mode: "extend" }));
    const input = await gateInput<{ unchangedHash?: string | null }>();
    expect(typeof input.unchangedHash).toBe("string");
  });

  it("takes its base from the revision the copied checkout was written from", async () => {
    // The catalog is down here (the mocks above), so enqueue records no
    // revision; the checkout's own record says which one the copy is.
    await writeCheckout(fixtureDocument(), "utf8");
    await writeFile(path.join(workDir(), `${SLUG}.checkout.json`), JSON.stringify({ slug: SLUG, revision: 4 }), "utf8");
    const { record } = await runner.enqueue(await brief({ mode: "extend" }));
    expect(record.targetRevisionBefore).toBeUndefined();
    await gateInput();
    expect(store.get(record.id)?.targetRevisionBefore).toBe(4);
  });

  it("passes the brief's elements and relations to the gate", async () => {
    await runner.enqueue(
      await brief({
        elements: [{ label: "vector a" }, { label: "vector b" }],
        relations: [{ from: "vector a", to: "vector b", label: "projects onto" }],
      }),
    );
    const input = await gateInput<{ elements: unknown[]; relations: unknown[]; }>();
    expect(input.elements).toHaveLength(2);
    expect(input.relations).toHaveLength(1);
  });
});
