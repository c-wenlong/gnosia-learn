import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeQwen, type FakeQwen } from "./fake-qwen";
import { topicListAnswer } from "./vocabulary";

/**
 * The BYOK harness end to end through a fake `qwen`: the stored config, the
 * spawn's argv and environment, the draft's `.qwen` seal, and the picker's
 * writes on `harness`. The catalog is stubbed, as `drafts.test.ts` stubs it;
 * no request leaves the machine.
 */

let fake: FakeQwen;
// Read at import by config.ts, so set before the first import below.
const fakeReady = fakeQwen().then((made) => {
  fake = made;
  process.env.STUDIO_QWEN_BIN = made.bin;
});
await fakeReady;
// A key left in this shell, to prove it never reaches the spawn's provider set.
process.env.ANTHROPIC_API_KEY = "sk-ant-stray";
process.env.OPENAI_API_KEY = "sk-stray";

const catalogMock = vi.hoisted(() => ({
  draftUpsert: vi.fn(),
  topicList: vi.fn(),
  topicAddDryRun: vi.fn(),
  topicAdd: vi.fn(),
  diagramList: vi.fn(),
}));
vi.mock("../src/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/catalog")>()),
  ...catalogMock,
}));
const canvasMock = vi.hoisted(() => ({ doctor: vi.fn() }));
vi.mock("../src/canvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/canvas")>()),
  doctor: canvasMock.doctor,
}));

const { Drafts } = await import("../src/drafts");
const { JobStore } = await import("../src/store");
const { JobRefused } = await import("../src/runner");
const { saveByok, loadByok, byokStatus } = await import("../src/byok");
const { draftDir, draftTmpDir } = await import("../src/paths");

type DraftsT = InstanceType<typeof Drafts>;

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

let store: InstanceType<typeof JobStore>;
let drafts: DraftsT;
let runner: {
  enqueue: ReturnType<typeof vi.fn>;
  admit: ReturnType<typeof vi.fn>;
  assertUnderCap: ReturnType<typeof vi.fn>;
  canvasOpen: () => boolean;
};

beforeAll(async () => {
  await fakeReady;
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await fake.cleanup();
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-byok-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  catalogMock.draftUpsert.mockReset().mockResolvedValue(ok());
  catalogMock.topicList.mockReset().mockResolvedValue(topicListAnswer());
  catalogMock.topicAddDryRun.mockReset().mockResolvedValue(ok({ nearMatches: [] }));
  catalogMock.topicAdd.mockReset().mockResolvedValue(ok());
  catalogMock.diagramList.mockReset().mockResolvedValue(ok({ diagrams: [] }));
  canvasMock.doctor.mockReset().mockResolvedValue({ code: 0, stdout: "", stderr: "", json: null, signal: null, timedOut: false });
  runner = {
    enqueue: vi.fn(async () => ({ record: { id: "job-1" }, created: true, jobsAhead: 0 })),
    admit: vi.fn(async () => ({ exists: false, revision: null, hash: null })),
    assertUnderCap: vi.fn(),
    canvasOpen: () => false,
  };
  await fake.script([]);
  store = new JobStore();
  drafts = new Drafts(store, runner as never);
});

afterEach(async () => {
  await drafts.drain();
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

/** The dialog's Connect, as the runner stores it. */
function connect(provider = "openrouter", model = "anthropic/claude-sonnet-4.5") {
  return saveByok({ provider, apiKey: "sk-or-test-key-0001", model });
}

describe("the byok.json store", () => {
  it("round-trips the config, mode 0600, and reports everything but the key", async () => {
    expect(await loadByok()).toBeNull();
    const saved = await connect("openai", "gpt-5.4");
    expect(saved).toEqual({ configured: true, provider: "openai", model: "gpt-5.4", last4: "0001" });
    expect(await byokStatus()).toEqual(saved);
    const stored = JSON.parse(await readFile(path.join(process.env.STUDIO_HOME!, "byok.json"), "utf8"));
    expect(stored).toEqual({ provider: "openai", apiKey: "sk-or-test-key-0001", model: "gpt-5.4" });
  });

  it("refuses a provider the table does not have, an empty key, and an empty model", async () => {
    await expect(saveByok({ provider: "anthropicx", apiKey: "k", model: "m" })).rejects.toThrow(JobRefused);
    await expect(saveByok({ provider: "openai", apiKey: "", model: "m" })).rejects.toThrow(JobRefused);
    await expect(saveByok({ provider: "openai", apiKey: "k", model: " " })).rejects.toThrow(JobRefused);
    await expect(loadByok()).resolves.toBeNull();
  });
});

describe("a byok conversation", () => {
  it("refuses creation before a provider and key are stored", async () => {
    await expect(drafts.create({ idempotencyKey: "k1", harness: "byok" })).rejects.toThrow(/BYOK is not set up/);
  });

  it("refuses a harness the picker only pretends to have", async () => {
    await expect(drafts.create({ idempotencyKey: "k1", harness: "codex" })).rejects.toThrow(/placeholder/);
    await expect(drafts.create({ idempotencyKey: "k1", harness: "perl" })).rejects.toThrow(JobRefused);
  });

  it("runs its turns on qwen, sealed, on the configured key, resuming after the first", async () => {
    await connect();
    await fake.script([{ text: "First answer." }, { text: "Second answer." }]);
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "byok" });
    expect(record.harness).toBe("byok");
    expect((await drafts.view(record.id)).harness).toBe("byok");

    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    let view = await drafts.view(record.id);
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", text: "First answer." });

    await drafts.send(record.id, "and again");
    await drafts.settled(record.id);
    view = await drafts.view(record.id);
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", text: "Second answer." });

    const argvs = await fake.argvs();
    expect(argvs).toHaveLength(2);
    // No `-p`: the prompt is stdin, as the claude spawn's is.
    for (const argv of argvs) {
      expect(argv).not.toContain("-p");
      expect(argv).toContain("--output-format");
      expect(argv).toContain("stream-json");
      expect(argv).toContain("--approval-mode");
      expect(argv).toContain("default");
      expect(argv).toContain("--safe-mode");
      expect(argv).toContain("--exclude-tools");
      // Every built-in the real binary lists, so the init's `tools` is [].
      expect(argv).toContain("run_shell_command");
      expect(argv).toContain("manage_memory");
      expect(argv).toContain("--max-session-turns");
      expect(argv).toContain("2");
      expect(argv).toContain("anthropic/claude-sonnet-4.5");
    }
    expect(argvs[0]).toContain("--session-id");
    expect(argvs[1]).toContain("--resume");
    expect(argvs[1]![argvs[1]!.indexOf("--resume") + 1]).toBe(record.plannerSessionId);
    const prompts = await fake.prompts();
    expect(prompts[0]).toContain("hello");
    expect(prompts[1]).toContain("and again");

    const envs = await fake.envs();
    for (const env of envs) {
      expect(env.openaiKey).toBe("sk-or-test-key-0001");
      expect(env.openaiBase).toBe("https://openrouter.ai/api/v1");
      expect(env.openaiModel).toBe("anthropic/claude-sonnet-4.5");
      expect(env.systemMd).toBe(path.join(draftDir(record.id), "planner-system.md"));
      // HOME is the draft's `tmp`, so the owner's ~/.qwen is never read.
      expect(env.home).toBe(draftTmpDir(record.id));
      // The shell's stray Anthropic key was stripped by the same seal as claude's.
      expect(env.anthropicKey).toBeNull();
    }
  });

  it("seals a turn whose init reports an MCP server", async () => {
    await connect();
    await fake.script([{ text: "should not arrive", mcpServers: [{ name: "gmail" }] }]);
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "byok" });
    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.error?.kind).toBe("agent");
    expect(view.error?.message).toMatch(/MCP server/);
  });

  it("fails a turn the way a missing binary does when the config is cleared", async () => {
    await connect();
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "byok" });
    await rm(path.join(process.env.STUDIO_HOME!, "byok.json"), { force: true });
    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.error?.kind).toBe("agent");
    expect(view.error?.message).toMatch(/the planner never started: BYOK is not set up/);
  });
});

describe("the pick", () => {
  it("moves before the first turn and is locked after it", async () => {
    await connect();
    const { record } = await drafts.create({ idempotencyKey: "k1" });
    expect(record.harness ?? "claude").toBe("claude");

    await expect(drafts.setHarness(record.id, "codex")).rejects.toThrow(/placeholder/);
    await expect(drafts.setHarness(record.id, "byok")).resolves.toMatchObject({ changed: true });
    expect(drafts.get(record.id)?.harness).toBe("byok");

    await fake.script([{ text: "Hello." }]);
    await drafts.send(record.id, "hi");
    await drafts.settled(record.id);

    await expect(drafts.setHarness(record.id, "claude")).rejects.toThrow(/keeps the harness it started on/);
  });

  it("refuses byok without a stored key", async () => {
    const { record } = await drafts.create({ idempotencyKey: "k1" });
    await expect(drafts.setHarness(record.id, "byok")).rejects.toThrow(/BYOK is not set up/);
  });
});
