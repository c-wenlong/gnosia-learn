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
vi.mock("../src/data/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/data/catalog")>()),
  ...catalogMock,
}));
const canvasMock = vi.hoisted(() => ({ doctor: vi.fn() }));
vi.mock("../src/canvas/canvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/canvas/canvas")>()),
  doctor: canvasMock.doctor,
}));

const { Drafts } = await import("../src/drafts/drafts");
const { JobStore } = await import("../src/data/store");
const { JobRefused } = await import("../src/diagram/runner");
const { saveByok, loadByok, byokStatus, listByokModels, saveByokModels, setByokActive, resolveByok } = await import("../src/agent/byok");
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
    expect(saved).toEqual({
      configured: true,
      active: "openai",
      model: "gpt-5.4",
      providers: [{ provider: "openai", last4: "0001", models: { default: "gpt-5.4" } }],
    });
    expect(await byokStatus()).toEqual(saved);
    const stored = JSON.parse(await readFile(path.join(process.env.STUDIO_HOME!, "byok.json"), "utf8"));
    expect(stored).toEqual({ active: "openai", providers: { openai: { apiKey: "sk-or-test-key-0001", models: { default: "gpt-5.4" } } } });
  });

  it("reads a v1 file as one provider on its Default tier, active", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(process.env.STUDIO_HOME!, "byok.json"), JSON.stringify({ provider: "openrouter", apiKey: "sk-old", model: "m-old" }));
    expect(await loadByok()).toEqual({
      active: "openrouter",
      providers: { openrouter: { apiKey: "sk-old", models: { default: "m-old" } } },
    });
  });

  it("holds several providers, switches the active one, and merges tier models", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    const second = await saveByok({ provider: "openai", apiKey: "sk-oai-2", model: "gpt-5.4" });
    expect(second.active).toBe("openai");
    expect(second.providers).toHaveLength(2);
    // Active is the one just connected; switching back is its own write.
    const back = await setByokActive({ provider: "openrouter" });
    expect(back.active).toBe("openrouter");
    await expect(setByokActive({ provider: "google" })).rejects.toThrow(/not connected/);
    // Tier picks merge over what a provider has; an empty one clears it.
    const tiers = await saveByokModels({ provider: "openrouter", models: { lite: "m-lite", max: "m-max" } });
    expect(tiers.providers[0]!.models).toEqual({ default: "anthropic/claude-sonnet-4.5", lite: "m-lite", max: "m-max" });
    expect((await saveByokModels({ provider: "openrouter", models: { lite: "" } })).providers[0]!.models).toEqual({
      default: "anthropic/claude-sonnet-4.5",
      max: "m-max",
    });
  });

  it("serializes overlapping writes — a tier save and a provider switch both land", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    await saveByok({ provider: "openai", apiKey: "sk-oai-2", model: "gpt-5.4" });
    const [tiers, active] = await Promise.all([
      saveByokModels({ provider: "openrouter", models: { lite: "m-lite" } }),
      setByokActive({ provider: "openrouter" }),
    ]);
    expect(tiers.providers[0]!.models.lite).toBe("m-lite");
    expect(active.active).toBe("openrouter");
    const held = await loadByok();
    expect(held?.active).toBe("openrouter");
    expect(held?.providers.openrouter?.models.lite).toBe("m-lite");
  });

  it("refuses a provider the table does not have, and a keyless first connect", async () => {
    await expect(saveByok({ provider: "anthropicx", apiKey: "k", model: "m" })).rejects.toThrow(JobRefused);
    // Inherited object members are not providers either.
    await expect(saveByok({ provider: "constructor", apiKey: "k", model: "m" })).rejects.toThrow(/"provider" is one of/);
    await expect(saveByok({ provider: "openai", apiKey: "", model: "m" })).rejects.toThrow(JobRefused);
    // A key with no Default model connects but cannot run: the pick gate asks
    // `resolveByok`, which needs a `default` tier, not just a file.
    await saveByok({ provider: "openai", apiKey: "sk-keyless-model", model: " " });
    expect(resolveByok(await loadByok(), null)).toBeNull();
    expect((await byokStatus()).configured).toBe(false);
  });

  it("resolves a tier pick to the active provider's model, Default when a tier is unset", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    await saveByokModels({ provider: "openrouter", models: { max: "anthropic/claude-opus-4.6" } });
    const config = await loadByok();
    expect(resolveByok(config, null)).toEqual({ provider: "openrouter", apiKey: "sk-or-test-key-0001", model: "anthropic/claude-sonnet-4.5" });
    expect(resolveByok(config, "lite")).toMatchObject({ model: "anthropic/claude-sonnet-4.5" });
    expect(resolveByok(config, "max")).toMatchObject({ model: "anthropic/claude-opus-4.6" });
  });

  it("keeps the stored key on a save that names no new one, same provider only", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    const again = await saveByok({ provider: "openrouter", apiKey: "", model: "anthropic/claude-opus-4.6" });
    expect(again.model).toBe("anthropic/claude-opus-4.6");
    expect((await loadByok())?.providers.openrouter?.apiKey).toBe("sk-or-test-key-0001");
    // A provider change needs its own key; the old one is never moved across.
    await expect(saveByok({ provider: "openai", apiKey: "", model: "gpt-5.4" })).rejects.toThrow(/"apiKey"/);
  });
});

describe("the provider's model list (D93)", () => {
  function stubbed(json: unknown, status = 200) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(url), headers: init?.headers ?? {} });
      return new Response(JSON.stringify(json), { status });
    });
    return calls;
  }

  it("asks the provider's /models on the given key and normalizes the rows", async () => {
    const calls = stubbed({ data: [{ id: "gpt-5.4" }, { id: "gpt-5.4" }, { id: "gpt-5-mini" }, { id: "other", display_name: "Other 1" }, { id: "" }, "junk"] });
    const models = await listByokModels("openai", "sk-test");
    expect(calls).toEqual([{ url: "https://api.openai.com/v1/models", headers: { authorization: "Bearer sk-test" } }]);
    expect(models).toEqual([
      { value: "gpt-5-mini", label: null },
      { value: "gpt-5.4", label: null },
      { value: "other", label: "Other 1" },
    ]);
    vi.unstubAllGlobals();
  });

  it("signs anthropic's with x-api-key and the version header", async () => {
    const calls = stubbed({ data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }] });
    const models = await listByokModels("anthropic", "sk-ant-test");
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/models");
    expect(calls[0]!.headers).toEqual({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01" });
    expect(models).toEqual([{ value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }]);
    vi.unstubAllGlobals();
  });

  it("reports the provider's refusal, never as a crash", async () => {
    stubbed({ error: { message: "bad key" } }, 401);
    await expect(listByokModels("openrouter", "sk-bad")).rejects.toThrow(/refused: HTTP 401/);
    vi.unstubAllGlobals();
  });
});

describe("a byok conversation", () => {
  it("refuses creation before a provider and key are stored", async () => {
    await expect(drafts.create({ idempotencyKey: "k1", harness: "byok" })).rejects.toThrow(/BYOK is not set up/);
  });

  it("refuses a harness the picker never had", async () => {
    // Codex is a real pick now — `codex.test.ts` owns its refusals.
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

    await expect(drafts.setHarness(record.id, "perl")).rejects.toThrow(JobRefused);
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
