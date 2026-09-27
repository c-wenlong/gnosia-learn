import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadVocabulary, validateBrief, type ValidBrief } from "../src/brief";
import { absolute, sessionLogPath, targetPath, targetSvgPath, CANDIDATES_DIR } from "../src/paths";
import { allSettled, until } from "./wait";

/**
 * The daily spend cap, and the half of it that is not the cap.
 *
 * Phase 7's hard part is that `cost_usd` was only ever written on a clean
 * finish, so a cap reading that column alone lets a cancelled, timed-out or
 * interrupted attempt spend for free. Three of these tests are about that —
 * each terminal path recording a figure — and the rest are about the cap
 * itself: the rolling window at its boundary, the 429's shape, and unset
 * meaning unset.
 *
 * The agent is stubbed, but not silently: the fake emits real `stream-json`
 * lines from the committed fixture through `onLine`, which is the same path the
 * real one uses, so the meter under test is doing its actual job rather than
 * being handed a number.
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

const reviewMock = vi.hoisted(() => ({
  dirtyFiles: vi.fn(async () => [] as string[]),
  accept: vi.fn(),
  discard: vi.fn(),
  reindex: vi.fn(),
}));
vi.mock("../src/review", () => reviewMock);

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

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const ok = { ok: true, json: {}, error: null, offline: false };

/** The exact figure the fixture's own result event reports. */
const EXACT_USD = 0.131777;
/** What its intermediate usage events add up to, with no result event. */
const ESTIMATED_USD = 0.119827;

const outcome = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  exitCode: 0,
  signal: null,
  turns: 9,
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
 * An agent that replays a recorded session down `onLine`, then stops.
 *
 * `hang` leaves it running after the lines are out, which is what a fifteen
 * minute drawing looks like from the runner's side and what the cancel and
 * ceiling tests need: the spend has happened, the process has not exited.
 */
function stageAgent(fixture: string, hang: boolean): void {
  agentMock.startAgent.mockImplementation(async (options: Record<string, unknown>) => {
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
    const body = await readFile(path.join(FIXTURES, `${fixture}.ndjson`), "utf8");
    const onLine = options.onLine as (line: string) => void;
    for (const line of body.split("\n")) {
      if (line.trim() !== "") onLine(line);
    }
    if (!hang) settle(outcome());
    return agent;
  });
}

/**
 * Wait for a job to reach `state` **and** for the runner to be done with it.
 *
 * The second half is the whole point. A terminal state is not the end of the
 * runner's work on a record: `finish` writes the state into the store's
 * in-memory map first, and then persists `job.json`, calls `jobFinish`, writes
 * any catalog error back onto the record and closes the session. A test that
 * stopped at the state flip was reading `jobFinish.mock.calls` before the call
 * had been made, and editing a `job.json` the runner was about to overwrite
 * with its own terminal record.
 *
 * It lost, too. Running this file alone on a loaded machine, eight runs in
 * twenty failed on `jobFinish.mock.calls.at(-1)` being `undefined`, and a probe
 * at the flip found `jobFinish` uncalled in three samples out of ten and
 * `job.json` still saying `running` in a fourth.
 *
 * `runner.settled` resolves after the last of those writes, so this waits for
 * the signal that actually means what the state flip was being read as.
 */
async function reached(id: string, state: string): Promise<void> {
  await until(() => store.get(id)?.state === state, `it never reached ${state}`);
  await runner.settled(id);
}

const SLUG = "studio-cap-fixture";

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
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-cap-${Date.now()}-${Math.random()}`);
  delete process.env.STUDIO_DAILY_USD;
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
  stageAgent("session-clean", false);
  store = new JobStore();
  runner = new Runner(store);
  await mkdir(absolute(CANDIDATES_DIR), { recursive: true });
});

afterEach(async () => {
  await runner.drain();
  // The job writes its terminal record after the agent stops, so the workspace
  // has to outlive the drain by however long those writes take. `settled`
  // knows that; the 150ms sleep this replaced only guessed.
  await allSettled(runner, store);
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  await rm(absolute(targetPath(SLUG)), { force: true });
  await rm(absolute(targetSvgPath(SLUG)), { force: true });
  await rm(absolute(`${CANDIDATES_DIR}/${SLUG}.tldr`), { force: true });
  await rm(absolute(`${CANDIDATES_DIR}/${SLUG}.svg`), { force: true });
  delete process.env.STUDIO_HOME;
  delete process.env.STUDIO_DAILY_USD;
});

/* -------------------------------------------------------------------------- */
/* Every attempt that spends, records                                         */
/* -------------------------------------------------------------------------- */

describe("a job that finished cleanly", () => {
  it("records the agent's own figure and says it is exact", async () => {
    const { record } = await runner.enqueue(await brief());
    await reached(record.id, "awaiting_review");

    const held = store.get(record.id)!;
    expect(held.costUsd).toBeCloseTo(EXACT_USD, 6);
    expect(held.costSource).toBe("result");
    // And it reaches the catalog, which is the column the cap ultimately reads
    // when somebody queries Postgres rather than the disk record.
    const finish = catalogMock.jobFinish.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(finish.costUsd).toBeCloseTo(EXACT_USD, 6);
    expect(finish.costSource).toBe("result");
  });
});

describe("a job somebody cancelled mid-run", () => {
  it("records what it had spent, marked as an estimate", async () => {
    // The whole point of the phase. Before it, this row said nothing at all
    // for an agent that had already burned two hundred thousand cached tokens.
    stageAgent("session-truncated", true);
    const { record } = await runner.enqueue(await brief());
    await until(() => started.length === 1, "the agent never started");
    await until(
      () => (store.get(record.id)?.costUsd ?? 0) > 0,
      "the meter never saw the stream",
    );

    await runner.cancel(record.id);
    await reached(record.id, "cancelled");

    const held = store.get(record.id)!;
    expect(held.costUsd).toBeCloseTo(ESTIMATED_USD, 6);
    expect(held.costSource).toBe("stream");
    expect(held.errorKind).toBe("cancelled");
  });
});

describe("a job that ran past its ceiling", () => {
  it("records what it had spent, and is still a timeout rather than a cancel", async () => {
    stageAgent("session-truncated", true);
    const { record } = await runner.enqueue(await brief());
    await until(() => started.length === 1, "the agent never started");
    await until(() => (store.get(record.id)?.costUsd ?? 0) > 0, "the meter never saw the stream");

    // The ceiling and a person share one mechanism and not one verdict: A2 says
    // a job past forty-five minutes is `failed` with `timeout`, and only a job
    // somebody stopped is `cancelled`.
    await runner.cancel(record.id, "job-timeout");
    await reached(record.id, "failed");

    const held = store.get(record.id)!;
    expect(held.errorKind).toBe("timeout");
    expect(held.costUsd).toBeCloseTo(ESTIMATED_USD, 6);
    expect(held.costSource).toBe("stream");
  });
});

describe("a job whose runner died under it", () => {
  /**
   * What a restart actually finds: a `job.json` still saying `running`, and a
   * `session.ndjson` the dead process left behind.
   *
   * Built on disk rather than by killing a live runner, because a live runner
   * goes on writing to that same `job.json` while the test reads it — which
   * made this flake one run in five, and which is not the situation being
   * modelled anyway. Nothing is running when a reconcile pass looks.
   */
  async function abandonedJob(fixture: string): Promise<string> {
    const { record } = await runner.enqueue(await brief());
    const id = record.id;
    await until(() => started.length === 1, "the agent never started");
    await runner.drain();
    // `drain` stops the agent; it does not wait for the runner to write the
    // verdict. `settled` does, and everything below here edits the record the
    // runner would otherwise still be writing to.
    await until(() => store.get(id)?.state !== "running", "it never stopped");
    await runner.settled(id);

    // Put it back the way a killed process leaves it: `running`, no cost, and
    // the whole transcript on disk.
    await store.update(id, {
      state: "running",
      costUsd: null,
      costSource: null,
      finishedAt: null,
      errorKind: null,
      error: null,
    });
    await writeFile(
      sessionLogPath(id),
      await readFile(path.join(FIXTURES, `${fixture}.ndjson`), "utf8"),
      "utf8",
    );
    return id;
  }

  it("rebuilds the spend from the write-ahead log on the next start", async () => {
    // The reconcile pass is the only place a cost cannot be read live, because
    // the process that would read it is the process that died. Phase 3 recorded
    // this as a known gap and three interrupted rows saying $0.00.
    const id = await abandonedJob("session-clean");

    const reborn = new JobStore();
    await reborn.load();
    const { interrupted } = await new Runner(reborn).reconcile();

    expect(interrupted).toContain(id);
    const held = reborn.get(id)!;
    expect(held.state).toBe("interrupted");
    // This log carries a complete session, so the replay finds its result event
    // and the figure is the exact one rather than an accumulation.
    expect(held.costUsd).toBeCloseTo(EXACT_USD, 6);
    expect(held.costSource).toBe("result");
    // And it reaches the catalog, which is where the gap was visible.
    const finish = catalogMock.jobFinish.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(finish.state).toBe("interrupted");
    expect(finish.costUsd).toBeCloseTo(EXACT_USD, 6);
    expect(finish.costSource).toBe("result");
  });

  it("estimates when the log stops before a result event", async () => {
    const id = await abandonedJob("session-truncated");

    const reborn = new JobStore();
    await reborn.load();
    await new Runner(reborn).reconcile();

    const held = reborn.get(id)!;
    expect(held.costUsd).toBeCloseTo(ESTIMATED_USD, 6);
    expect(held.costSource).toBe("stream");
  });

  it("records nothing rather than zero when the log is gone", async () => {
    const id = await abandonedJob("session-clean");
    await rm(sessionLogPath(id), { force: true });

    const reborn = new JobStore();
    await reborn.load();
    await new Runner(reborn).reconcile();

    // Null, not zero. Zero is a claim that nothing was spent, and nobody knows
    // that about a job whose only record of its spending has been deleted.
    expect(reborn.get(id)?.state).toBe("interrupted");
    expect(reborn.get(id)?.costUsd).toBeNull();
    expect(reborn.get(id)?.costSource).toBeNull();
  });
});

describe("a record written before this column existed", () => {
  it("loads with a null cost source rather than a missing one", async () => {
    // `job.json` is a plain JSON.parse cast, so a field added after a job was
    // written is absent on that record — and `undefined` is not `null`. The API
    // then omits `costSource` instead of reporting it null, which breaks the
    // shape the web app is typed against, for exactly the historical jobs
    // nothing will ever rewrite: the reconcile pass touches `running` rows and
    // every one of these is terminal. Caught by Greptile on the phase 7 PR.
    const { record } = await runner.enqueue(await brief());
    await reached(record.id, "awaiting_review");

    const file = path.join(process.env.STUDIO_HOME ?? "", "jobs", record.id, "job.json");
    const held = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    delete held.costSource;
    delete held.costUsd;
    await writeFile(file, JSON.stringify(held, null, 1), "utf8");

    const reborn = new JobStore();
    await reborn.load();
    const loaded = reborn.get(record.id)!;
    expect("costSource" in loaded).toBe(true);
    expect(loaded.costSource).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The cap                                                                    */
/* -------------------------------------------------------------------------- */

describe("the cap", () => {
  it("does nothing at all when STUDIO_DAILY_USD is unset", async () => {
    // Unset is the default and stays the default: one user on one machine has
    // nothing to meter, which is the design's own reason for this phase being
    // last and optional.
    const first = await runner.enqueue(await brief());
    await reached(first.record.id, "awaiting_review");
    await store.update(first.record.id, { state: "discarded" });

    expect(runner.capStatus().capUsd).toBeNull();
    expect(runner.capStatus().exceeded).toBe(false);
    // Spent well past any plausible cap, and the next one is still taken.
    await expect(runner.enqueue(await brief({ slug: SLUG }))).resolves.toBeDefined();
  });

  it("refuses with a 429 once the rolling day's spend has crossed it", async () => {
    process.env.STUDIO_DAILY_USD = "0.10";
    const first = await runner.enqueue(await brief());
    await reached(first.record.id, "awaiting_review");
    await store.update(first.record.id, { state: "discarded" });

    const refused = await runner.enqueue(await brief({ slug: SLUG })).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(JobRefused);
    const error = refused as InstanceType<typeof JobRefused>;
    // 429 rather than 409: nothing about this brief is wrong, and the same
    // request succeeds later.
    expect(error.status).toBe(429);
    const detail = error.detail as Record<string, unknown>;
    expect(detail.reason).toBe("daily-cap");
    expect(detail.capUsd).toBe(0.1);
    expect(detail.totalUsd).toBeCloseTo(EXACT_USD, 6);
    expect(detail.windowHours).toBe(24);
    // The two facts that let somebody decide what to do: what is spent against
    // what, and when the total can first fall.
    expect(typeof detail.oldestAgesOutAt).toBe("string");
    expect(error.message).toContain("$0.13");
    expect(error.message).toContain("$0.10");
    expect(error.message).toContain("STUDIO_DAILY_USD");
    // And nothing was queued.
    expect(store.list({ state: "queued" })).toHaveLength(0);
  });

  it("counts an estimated figure towards the cap", async () => {
    // A cap that summed only the clean finishes would be a cap anybody could
    // walk past by pressing Cancel, which is exactly what phase 7 is for.
    process.env.STUDIO_DAILY_USD = "0.10";
    stageAgent("session-truncated", true);
    const { record } = await runner.enqueue(await brief());
    await until(() => started.length === 1, "the agent never started");
    await until(() => (store.get(record.id)?.costUsd ?? 0) > 0, "the meter never saw the stream");
    await runner.cancel(record.id);
    await reached(record.id, "cancelled");

    expect(store.get(record.id)?.costSource).toBe("stream");
    const refused = await runner.enqueue(await brief({ slug: SLUG })).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(JobRefused);
    expect((refused as InstanceType<typeof JobRefused>).status).toBe(429);
  });

  it("stops counting an attempt once it is 24 hours old", async () => {
    process.env.STUDIO_DAILY_USD = "0.10";
    const first = await runner.enqueue(await brief());
    await reached(first.record.id, "awaiting_review");
    // Backdated a millisecond past the window: rolling, so the boundary is a
    // moving floor rather than a midnight everybody can spend against. Both
    // timestamps, because a job is counted from the later of the two.
    const old = new Date(Date.now() - 24 * 3_600_000 - 1).toISOString();
    await store.update(first.record.id, {
      state: "discarded",
      startedAt: old,
      finishedAt: old,
    });

    expect(runner.capStatus().totalUsd).toBe(0);
    await expect(runner.enqueue(await brief({ slug: SLUG }))).resolves.toBeDefined();
  });

  it("does not stop a job that is already running", async () => {
    // Killing paid work halfway is a bill with nothing to show for it, and the
    // 45 minute ceiling is already the guard for a job that will not stop.
    process.env.STUDIO_DAILY_USD = "0.01";
    stageAgent("session-clean", true);
    const { record } = await runner.enqueue(await brief());
    await until(() => started.length === 1, "the agent never started");
    await until(() => (store.get(record.id)?.costUsd ?? 0) > 0, "the meter never saw the stream");

    expect(runner.capStatus().exceeded).toBe(true);
    expect(store.get(record.id)?.state).toBe("running");
  });

  it("is checked after A10's own guards, not instead of them", async () => {
    // One guard on top of five, in that order. The lease and the mode check
    // both belong to this brief and both still answer first, so a cap does not
    // turn "that path is spoken for" into "come back tomorrow".
    process.env.STUDIO_DAILY_USD = "0.001";
    stageAgent("session-clean", true);
    const { record } = await runner.enqueue(await brief());
    await until(() => started.length === 1, "the agent never started");
    await until(() => (store.get(record.id)?.costUsd ?? 0) > 0, "the meter never saw the stream");
    expect(runner.capStatus().exceeded).toBe(true);

    // The lease: same slug, and the running job is holding it.
    const held = await runner.enqueue(await brief({ slug: SLUG })).catch((e: unknown) => e);
    expect((held as InstanceType<typeof JobRefused>).status).toBe(409);
    expect((held as Error).message).toContain("already held");

    // The mode check: a different slug with nothing at the target path.
    const wrongMode = await runner
      .enqueue(await brief({ slug: "studio-cap-absent", mode: "extend" }))
      .catch((e: unknown) => e);
    expect((wrongMode as InstanceType<typeof JobRefused>).status).toBe(409);
    expect((wrongMode as Error).message).toContain("nothing to extend");

    // And only a brief that passes all of them meets the cap.
    const capped = await runner.enqueue(await brief({ slug: "studio-cap-other" })).catch((e: unknown) => e);
    expect((capped as InstanceType<typeof JobRefused>).status).toBe(429);
  });

  it("reports the same window on capStatus that it refuses on", async () => {
    process.env.STUDIO_DAILY_USD = "5";
    const first = await runner.enqueue(await brief());
    await reached(first.record.id, "awaiting_review");

    const status = runner.capStatus();
    expect(status.capUsd).toBe(5);
    expect(status.exceeded).toBe(false);
    expect(status.totalUsd).toBeCloseTo(EXACT_USD, 6);
    expect(status.jobs).toBe(1);
    // The instant it *stopped* spending, not the one it started at: `cost_usd`
    // is every attempt summed, and hanging that on the first attempt expires a
    // retry's spend early.
    expect(status.oldestCountedAt).toBe(store.get(first.record.id)?.finishedAt);
  });

  it.each(["ten dollars", "0.2oops", "1,50", "-5", "0", " ", "1e3", "NaN"])(
    "treats STUDIO_DAILY_USD=%j as unset rather than as a cap",
    async (value) => {
      // Refusing every job because a dotenv has a typo in it is the worst of
      // both answers. `0.2oops` is the one that matters: `parseFloat` takes a
      // numeric prefix, so a typo used to become a real $0.20 budget that then
      // started refusing jobs.
      process.env.STUDIO_DAILY_USD = value;
      expect(runner.capStatus().capUsd).toBeNull();
      expect(runner.capStatus().exceeded).toBe(false);
    },
  );

  it("still reads a plain number, with or without decimals", () => {
    process.env.STUDIO_DAILY_USD = "5";
    expect(runner.capStatus().capUsd).toBe(5);
    process.env.STUDIO_DAILY_USD = "0.25";
    expect(runner.capStatus().capUsd).toBe(0.25);
  });

  it("counts a job from when it stopped spending, not when it started", async () => {
    process.env.STUDIO_DAILY_USD = "0.10";
    const first = await runner.enqueue(await brief());
    await reached(first.record.id, "awaiting_review");

    // A job whose first attempt began just outside the window and whose last
    // finished just inside it. Attributed to `started_at`, its whole bill —
    // every attempt's — would have aged out already.
    const now = Date.now();
    await store.update(first.record.id, {
      state: "discarded",
      startedAt: new Date(now - 24 * 3_600_000 - 60_000).toISOString(),
      finishedAt: new Date(now - 23 * 3_600_000).toISOString(),
    });

    expect(runner.capStatus().totalUsd).toBeCloseTo(EXACT_USD, 6);
    const refused = await runner.enqueue(await brief({ slug: SLUG })).catch((e: unknown) => e);
    expect((refused as InstanceType<typeof JobRefused>).status).toBe(429);
  });
});
