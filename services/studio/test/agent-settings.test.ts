import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateBrief, type ValidBrief } from "../src/brief";
import { cachePath } from "../src/content-cache";
import { absolute, candidatePath, candidateSvgPath, jobJsonPath, targetPath, targetSvgPath, workPath } from "../src/paths";
import type { JobRecord } from "../src/store";

import { allSettled, until } from "./wait";
import { testVocabulary } from "./vocabulary";

/**
 * The diagram agent's model and effort (D53 of docs/STUDIO-VIDEOS.md): the
 * rule `agent-settings.ts` states, and the runner spawning with what it says.
 *
 * The owner's Claude Code settings file is a temp one, named by
 * `CLAUDE_CONFIG_DIR`, so "your Claude Code default" is a value this file
 * chose rather than whatever the machine running the suite has. The stored
 * row comes through a stubbed `catalog preference get`; the agent, the gate
 * and the rest of the catalog are stubbed as `queue.test.ts` stubs them,
 * since none of them is under test.
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
  preferenceGet: vi.fn(),
  diagramShow: vi.fn(async () => ({ ok: false, json: null, error: "unreachable", offline: true })),
  diagramCheckout: vi.fn(async () => ({ ok: false, json: null, error: "unreachable", offline: true })),
}));
vi.mock("../src/catalog", () => catalogMock);

const gateMock = vi.hoisted(() => ({ runGate: vi.fn(), narrate: vi.fn(() => "a step") }));
vi.mock("../src/gate", () => gateMock);

const compareMock = vi.hoisted(() => ({
  readSide: vi.fn(async () => ({ shapes: 3, bindings: 1, lints: [], svgBytes: null, shot: false, at: new Date().toISOString() })),
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

const agentMock = vi.hoisted(() => ({
  startAgent: vi.fn(),
  sweepOrphans: vi.fn(async () => [] as number[]),
  AgentRun: class {},
}));
vi.mock("../src/agent", () => agentMock);

const { Runner } = await import("../src/runner");
const { JobStore } = await import("../src/store");
const { diagramAgentSettings, resolveDiagramAgent, resolveVideoAgent } = await import("../src/agent-settings");
const { readStoredPreference } = await import("../src/video/agent-model");

const ok = { ok: true, json: {}, error: null, offline: false };
const down = { ok: false, json: null, error: "catalog preference get exited 3: connect ECONNREFUSED", offline: true };
const row = (value: unknown) => ({ ok: true, json: { ok: true, value, updatedAt: value === null ? null : "2026-09-29T00:00:00.000Z" }, error: null, offline: false });

const SLUG = "studio-agent-settings-fixture";
const OWNER_DEFAULTS = { model: "claude-fable-5-1[1m]", effortLevel: "xhigh" };

let configDir: string;
let savedConfigDir: string | undefined;
let store: InstanceType<typeof JobStore>;
let runner: InstanceType<typeof Runner>;

async function ownerSettings(value: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(configDir, "settings.json"), JSON.stringify(value), "utf8");
}

function brief(over: Record<string, unknown> = {}): ValidBrief {
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

/** The options the runner passed to its one agent. */
async function spawned(): Promise<Record<string, unknown>> {
  await until(() => agentMock.startAgent.mock.calls.length >= 1, "the agent was never started");
  return agentMock.startAgent.mock.calls[0]?.[0] as Record<string, unknown>;
}

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-agent-settings-${Date.now()}-${Math.random()}`);
  configDir = path.join(process.env.STUDIO_HOME, "claude-config");
  await mkdir(configDir, { recursive: true });
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  await ownerSettings(OWNER_DEFAULTS);
  for (const fn of Object.values(catalogMock)) fn.mockReset().mockResolvedValue(ok);
  catalogMock.preferenceGet.mockResolvedValue(row(null));
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
  agentMock.startAgent.mockReset().mockImplementation((options: Record<string, unknown>) => {
    // The init event, as the CLI sends it before anything else.
    (options.onInit as ((init: { apiKeySource: string | null; model: string | null }) => void) | undefined)?.({
      apiKeySource: "none",
      model: "claude-opus-5[1m]",
    });
    return Promise.resolve({
      done: Promise.resolve({
        exitCode: 0,
        signal: null,
        turns: 9,
        subtype: "success",
        isError: false,
        result: null,
        apiKeySource: "none",
        spawnFailed: false,
        denials: [],
        stopReason: null,
        stderr: "",
      }),
      stop: async () => undefined,
    });
  });
  store = new JobStore();
  runner = new Runner(store);
});

afterEach(async () => {
  await runner.drain();
  await allSettled(runner, store);
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
  await rm(absolute(targetPath(SLUG)), { force: true });
  await rm(absolute(targetSvgPath(SLUG)), { force: true });
  await rm(workPath(SLUG), { force: true });
  delete process.env.STUDIO_HOME;
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
});

describe("the diagram rule", () => {
  const claude = { model: "claude-fable-5-1[1m]", effort: "xhigh" };

  it("takes a model the brief names over the panel's, and the panel's effort still applies", () => {
    expect(diagramAgentSettings("opus", { model: "sonnet", effort: "low" }, claude)).toEqual({
      model: { requested: "opus", passed: "opus", source: "brief" },
      effort: { requested: "low", passed: "low", source: "panel" },
    });
  });

  it("with no row is sonnet, today's behaviour, and the owner's own effort", () => {
    expect(diagramAgentSettings(null, null, claude)).toEqual({
      model: { requested: "sonnet", passed: "sonnet", source: "default" },
      effort: { requested: "default", passed: "xhigh", source: "claude-settings" },
    });
    // And no effort flag when the owner's settings name none.
    expect(diagramAgentSettings(null, null, { model: null, effort: null }).effort).toEqual({ requested: "default", passed: null, source: "cli" });
  });

  it("with a row of defaults is the owner's Claude Code default, and no flag when that is unset too", () => {
    expect(diagramAgentSettings(null, { model: "default", effort: "default" }, claude)).toEqual({
      model: { requested: "default", passed: "claude-fable-5-1[1m]", source: "claude-settings" },
      effort: { requested: "default", passed: "xhigh", source: "claude-settings" },
    });
    expect(diagramAgentSettings(null, { model: "default", effort: "default" }, { model: null, effort: null })).toEqual({
      model: { requested: "default", passed: null, source: "cli" },
      effort: { requested: "default", passed: null, source: "cli" },
    });
  });

  it("passes a row's values as they are", () => {
    expect(diagramAgentSettings(null, { model: "opus", effort: "low" }, claude)).toEqual({
      model: { requested: "opus", passed: "opus", source: "panel" },
      effort: { requested: "low", passed: "low", source: "panel" },
    });
  });

  it("reports the stored row and the owner's defaults beside what it resolved, for both kinds", async () => {
    catalogMock.preferenceGet.mockImplementation(async (key: string) =>
      key === "studioDiagramAgent" ? row({ model: "opus", effort: "low" }) : row(null),
    );
    expect(await resolveDiagramAgent()).toEqual({
      stored: { model: "opus", effort: "low" },
      claude: { model: "claude-fable-5-1[1m]", effort: "xhigh" },
      model: { requested: "opus", passed: "opus", source: "panel" },
      effort: { requested: "low", passed: "low", source: "panel" },
    });
    // The video agent has no "no row" case of its own: its default is the owner's.
    expect(await resolveVideoAgent()).toEqual({
      stored: null,
      claude: { model: "claude-fable-5-1[1m]", effort: "xhigh" },
      model: { requested: "default", passed: "claude-fable-5-1[1m]", source: "claude-settings" },
      effort: { requested: "default", passed: "xhigh", source: "claude-settings" },
    });
  });
});

describe("reading the stored row", () => {
  it("tells no row from a row of defaults", async () => {
    catalogMock.preferenceGet.mockResolvedValue(row(null));
    expect(await readStoredPreference("studioDiagramAgent")).toBeNull();
    catalogMock.preferenceGet.mockResolvedValue(row({ model: "default", effort: "default" }));
    expect(await readStoredPreference("studioDiagramAgent")).toEqual({ model: "default", effort: "default" });
    // A hand-edited row is still a row, read as defaults rather than as a flag.
    catalogMock.preferenceGet.mockResolvedValue(row({ model: "--dangerously-skip-permissions", effort: 3 }));
    expect(await readStoredPreference("studioDiagramAgent")).toEqual({ model: "default", effort: "default" });
  });

  it("uses the last good read with the catalog down, and no row when there never was one", async () => {
    catalogMock.preferenceGet.mockResolvedValue(down);
    expect(await readStoredPreference("studioDiagramAgent")).toBeNull();

    catalogMock.preferenceGet.mockResolvedValue(row({ model: "opus", effort: "low" }));
    await readStoredPreference("studioDiagramAgent");
    catalogMock.preferenceGet.mockResolvedValue(down);
    expect(await readStoredPreference("studioDiagramAgent")).toEqual({ model: "opus", effort: "low" });

    // A remembered "no row" stays no row, rather than becoming the defaults.
    catalogMock.preferenceGet.mockResolvedValue(row(null));
    await readStoredPreference("studioDiagramAgent");
    catalogMock.preferenceGet.mockResolvedValue(down);
    expect(await readStoredPreference("studioDiagramAgent")).toBeNull();
  });

  it("does not read the previous build's copy as a row, since it could not say whether there was one", async () => {
    const file = cachePath("preferences.studioDiagramAgent");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({ version: 1, type: "preferences.studioDiagramAgent", readAt: new Date().toISOString(), value: { model: "default", effort: "default" } }),
      "utf8",
    );
    catalogMock.preferenceGet.mockResolvedValue(down);
    expect(await readStoredPreference("studioDiagramAgent")).toBeNull();
  });
});

describe("a diagram job", () => {
  it("with no row runs on sonnet at the owner's effort, and records both", async () => {
    const { record } = await runner.enqueue(brief());
    const options = await spawned();
    expect(options.model).toBe("sonnet");
    expect(options.effort).toBe("xhigh");
    await runner.settled(record.id);

    const onDisk = JSON.parse(await readFile(jobJsonPath(record.id), "utf8")) as JobRecord;
    expect(onDisk.agentModel).toEqual({ requested: "sonnet", passed: "sonnet", source: "default" });
    expect(onDisk.agentEffort).toEqual({ requested: "default", passed: "xhigh", source: "claude-settings" });
    // What the session said it was, from its init event.
    expect(onDisk.resolvedModel).toBe("claude-opus-5[1m]");
    expect(catalogMock.preferenceGet).toHaveBeenCalledWith("studioDiagramAgent");
  });

  it("passes a row's model and effort", async () => {
    catalogMock.preferenceGet.mockResolvedValue(row({ model: "opus", effort: "low" }));
    const { record } = await runner.enqueue(brief());
    const options = await spawned();
    expect(options).toMatchObject({ model: "opus", effort: "low" });
    await runner.settled(record.id);
    expect(store.get(record.id)?.agentModel).toEqual({ requested: "opus", passed: "opus", source: "panel" });
    expect(store.get(record.id)?.agentEffort).toEqual({ requested: "low", passed: "low", source: "panel" });
  });

  it("passes the owner's settings file for a row of defaults", async () => {
    catalogMock.preferenceGet.mockResolvedValue(row({ model: "default", effort: "default" }));
    await runner.enqueue(brief());
    expect(await spawned()).toMatchObject({ model: "claude-fable-5-1[1m]", effort: "xhigh" });
  });

  it("passes no flag at all for a row of defaults when the owner's settings name nothing", async () => {
    await ownerSettings({});
    catalogMock.preferenceGet.mockResolvedValue(row({ model: "default", effort: "default" }));
    await runner.enqueue(brief());
    expect(await spawned()).toMatchObject({ model: null, effort: null });
  });

  it("runs on the brief's own model over the panel's", async () => {
    catalogMock.preferenceGet.mockResolvedValue(row({ model: "sonnet", effort: "medium" }));
    const { record } = await runner.enqueue(brief({ model: "opus" }));
    expect(await spawned()).toMatchObject({ model: "opus", effort: "medium" });
    await runner.settled(record.id);
    expect(store.get(record.id)?.agentModel?.source).toBe("brief");
  });

  for (const [kind, state, changes] of [
    ["revision", "discarded", "make the arrow labels bigger"],
    ["resume", "interrupted", null],
  ] as const) {
    it(`in a ${kind} keeps its parent's model and effort, because it continues the parent's session`, async () => {
      const at = new Date(Date.now() - 60_000).toISOString();
      const parent = {
        id: "parent-job",
        kind: "diagram",
        state,
        phase: null,
        brief: brief(),
        targetPath: targetPath(SLUG),
        targetSvgPath: targetSvgPath(SLUG),
        candidatePath: candidatePath("parent-job", SLUG),
        candidateSvgPath: candidateSvgPath("parent-job", SLUG),
        topic: "vector-and-linear-algebra-basics",
        slug: SLUG,
        attempt: 1,
        sessionId: "studio-parent-job",
        agentSessionId: "55555555-5555-4555-8555-555555555555",
        parentJobId: null,
        changes: null,
        idempotencyKey: "parent-key",
        targetHashBefore: null,
        requestedAt: at,
        startedAt: at,
        finishedAt: at,
        reviewedAt: null,
        heartbeatAt: null,
        cancelRequestedAt: null,
        exitCode: 0,
        turns: 9,
        costUsd: null,
        costSource: null,
        gate: null,
        errorKind: null,
        error: null,
        written: [],
        indexed: false,
        catalogErrors: [],
        agentModel: { requested: "opus", passed: "opus", source: "panel" },
        agentEffort: { requested: "high", passed: "high", source: "panel" },
      } as JobRecord;
      await store.create(parent);
      // The panel has moved on since the parent ran.
      catalogMock.preferenceGet.mockResolvedValue(row({ model: "sonnet", effort: "low" }));

      const { record } = await runner.enqueue(brief(), {
        jobId: "parent-job",
        agentSessionId: "55555555-5555-4555-8555-555555555555",
        changes,
      });
      const options = await spawned();
      expect(options).toMatchObject({ resume: true, model: "opus", effort: "high" });
      await runner.settled(record.id);
      expect(store.get(record.id)?.agentModel).toEqual(parent.agentModel);
      expect(store.get(record.id)?.agentEffort).toEqual(parent.agentEffort);
    });
  }
});
