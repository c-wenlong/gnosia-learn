import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { JOB_STATES, JOB_TRANSITIONS, canTransition } from "@gnosia/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateBrief, BriefError, type ValidBrief, type Vocabulary } from "../src/diagram/brief";
import { noteFor, phaseFromLine } from "../src/diagram/runner";
import type { JobRecord } from "../src/data/store";
import { testVocabulary } from "./vocabulary";

/**
 * The state machine, the lease, and the refusals a brief earns before anything
 * is spent.
 *
 * `JOB_TRANSITIONS` lives in `@gnosia/schema` and the runner reads it from
 * there rather than keeping its own copy, so what is worth testing here is that
 * the runner *asks* — that a cancel, an accept and a discard each refuse the
 * states the table refuses — and that every state has something a person can
 * read.
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
vi.mock("../src/data/catalog", () => catalogMock);

const { Runner, JobRefused } = await import("../src/diagram/runner");
const { JobStore } = await import("../src/data/store");

const ok = { ok: true, json: {}, error: null };

function record(over: Partial<JobRecord> = {}): JobRecord {
  const slug = over.slug ?? "state-fixture";
  return {
    id: over.id ?? "job-state",
    kind: "diagram",
    state: "queued",
    phase: null,
    brief: {
      intent: "i",
      topic: "vector-and-linear-algebra-basics",
      slug,
      title: "t",
      mode: "new",
      elements: [{ label: "a" }],
      relations: [],
      concepts: [],
      model: "sonnet",
      idempotencyKey: over.idempotencyKey ?? "k",
    },
    targetPath: `learn/assets/${slug}.tldr`,
    targetSvgPath: `learn/assets/${slug}.svg`,
    candidatePath: `learn/assets/.candidates/${slug}.tldr`,
    candidateSvgPath: `learn/assets/.candidates/${slug}.svg`,
    topic: "vector-and-linear-algebra-basics",
    slug,
    attempt: 0,
    sessionId: null,
    agentSessionId: null,
    parentJobId: null,
    changes: null,
    idempotencyKey: over.idempotencyKey ?? "k",
    targetHashBefore: null,
    requestedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
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
    ...over,
  };
}

let store: InstanceType<typeof JobStore>;
let runner: InstanceType<typeof Runner>;

beforeEach(() => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-state-${Date.now()}-${Math.random()}`);
  for (const fn of Object.values(catalogMock)) fn.mockReset().mockResolvedValue(ok);
  store = new JobStore();
  runner = new Runner(store);
});

afterEach(async () => {
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  delete process.env.STUDIO_HOME;
});

describe("cancel follows the table", () => {
  it("takes a queued job straight to cancelled, because nothing started", async () => {
    await store.create(record({ id: "q", state: "queued" }));
    const cancelled = await runner.cancel("q");
    expect(cancelled.state).toBe("cancelled");
    expect(canTransition(JOB_TRANSITIONS, "queued", "cancelled")).toBe(true);
  });

  it("leaves a running job running until the browser is actually gone", async () => {
    await store.create(record({ id: "r", state: "running", startedAt: new Date().toISOString() }));
    const cancelling = await runner.cancel("r");
    // S2: a job being cancelled is still running until the runner has killed
    // Chromium, and the row should say so. `cancel_requested_at` is a timestamp
    // for exactly this reason.
    expect(cancelling.state).toBe("running");
    expect(cancelling.cancelRequestedAt).not.toBeNull();
  });

  it("refuses every terminal state", async () => {
    for (const state of JOB_STATES) {
      if (state === "queued" || state === "running") continue;
      await store.create(record({ id: `t-${state}`, state, slug: `slug-${state}` }));
      await expect(runner.cancel(`t-${state}`)).rejects.toBeInstanceOf(JobRefused);
    }
  });

  it("refuses a job that does not exist", async () => {
    await expect(runner.cancel("nothing")).rejects.toThrow(/no job/);
  });
});

describe("the lease", () => {
  it("is held by a queued, running or awaiting_review job and by nothing else", async () => {
    for (const state of JOB_STATES) {
      const store2 = new JobStore();
      await store2.create(record({ id: `l-${state}`, state, slug: "leased" }));
      const held = store2.activeOn("learn/assets/leased.tldr") !== undefined;
      expect(held).toBe(
        state === "queued" || state === "running" || state === "awaiting_review",
      );
    }
  });

  it("refuses a second job on a held path, naming the holder", async () => {
    const vocabulary = testVocabulary();
    const brief = validateBrief(
      {
        intent: "show how a dot product projects one vector onto another",
        topic: "vector-and-linear-algebra-basics",
        slug: "state-fixture",
        title: "Dot product",
        mode: "new",
        elements: [{ label: "vector a" }],
        relations: [],
        idempotencyKey: "second",
      },
      vocabulary,
    );
    await store.create(record({ id: "holder", state: "awaiting_review" }));
    await expect(runner.enqueue(brief)).rejects.toThrow(/already held by job holder/);
  });

  it("returns the existing job for a repeated idempotency key rather than queueing twice", async () => {
    const vocabulary = testVocabulary();
    const brief = validateBrief(
      {
        intent: "an intent",
        topic: "vector-and-linear-algebra-basics",
        slug: "state-fixture",
        title: "Dot product",
        mode: "new",
        elements: [{ label: "vector a" }],
        relations: [],
        idempotencyKey: "same-key",
      },
      vocabulary,
    );
    await store.create(record({ id: "first", idempotencyKey: "same-key" }));
    const result = await runner.enqueue(brief);
    expect(result.created).toBe(false);
    expect(result.record.id).toBe("first");
    expect(catalogMock.jobEnqueue).not.toHaveBeenCalled();
  });
});

describe("every state says something a person can read", () => {
  it("has a note for all eight", () => {
    for (const state of JOB_STATES) {
      const note = noteFor(record({ state, written: ["learn/assets/x.tldr"] }));
      expect(note.length).toBeGreaterThan(10);
      expect(note).not.toBe(state);
    }
  });
});

describe("the phase label", () => {
  it("comes from the command the agent ran, not from what it said", () => {
    const toolUse = (command: string) =>
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] },
      });
    expect(phaseFromLine(toolUse("npm run --silent canvas -- run x.tldr --code s.js"))).toBe("drawing");
    expect(phaseFromLine(toolUse("npm run --silent canvas -- inspect x.tldr --json"))).toBe("linting");
    expect(phaseFromLine(toolUse("npm run --silent canvas -- verify x.svg --json"))).toBe("verifying");
    // Prose about what it is about to do moves nothing.
    expect(phaseFromLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "now exporting the canvas" }] } }))).toBeNull();
  });
});

describe("a brief is refused before anything is spent", () => {
  let vocabulary: Vocabulary;
  const base = {
    intent: "show the projection",
    topic: "vector-and-linear-algebra-basics",
    slug: "a-diagram",
    title: "A diagram",
    mode: "new",
    elements: [{ label: "vector a" }, { label: "vector b" }],
    relations: [{ from: "vector a", to: "vector b", label: "projects onto" }],
  };

  beforeEach(async () => {
    vocabulary = testVocabulary();
  });

  it("accepts a complete one", () => {
    const brief: ValidBrief = validateBrief(base, vocabulary);
    // No model filled in: the runner takes it from the settings panel at job
    // start, and `sonnet` only when the owner never saved one (D53).
    expect(brief).not.toHaveProperty("model");
    expect(brief.idempotencyKey).toContain("a-diagram");
  });

  it("keeps a model the brief names, and refuses one it does not allow", () => {
    expect(validateBrief({ ...base, model: "opus" }, vocabulary).model).toBe("opus");
    expect(() => validateBrief({ ...base, model: "--dangerously-skip-permissions" }, vocabulary)).toThrow(BriefError);
  });

  it("refuses a topic that is not in the vocabulary, with the field named", () => {
    try {
      validateBrief({ ...base, topic: "not-a-topic" }, vocabulary);
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(BriefError);
      expect((error as BriefError).field).toBe("topic");
    }
  });

  it("refuses a slug that is a sentence", () => {
    expect(() => validateBrief({ ...base, slug: "Draw me a nice diagram" }, vocabulary)).toThrow(
      /is not a slug/,
    );
  });

  it("caps a free-text field so it cannot carry a second prompt", () => {
    expect(() => validateBrief({ ...base, intent: "x".repeat(5_000) }, vocabulary)).toThrow(
      /the cap is/,
    );
  });

  it("refuses an arrow that does not join two elements the diagram will draw", () => {
    expect(() =>
      validateBrief(
        { ...base, relations: [{ from: "vector a", to: "a shape nobody mentioned" }] },
        vocabulary,
      ),
    ).toThrow(/is not one of the elements/);
  });

  it("tells an empty relations array apart from a missing one", () => {
    expect(validateBrief({ ...base, relations: [] }, vocabulary).relations).toEqual([]);
    const withoutRelations: Record<string, unknown> = { ...base };
    delete withoutRelations.relations;
    expect(() => validateBrief(withoutRelations, vocabulary)).toThrow(/must be an array/);
  });
});
