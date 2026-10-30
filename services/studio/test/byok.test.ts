import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { saveProviderKey, removeProviderKey } from "@gnosia/tutor/server/provider-keys";

import { migratedScratchDatabase, type Scratch } from "../../catalog/test/scratch-database";
import { fakeQwen, type FakeQwen } from "./fake-qwen";
import { topicListAnswer } from "./vocabulary";

/**
 * The BYOK harness end to end through a fake `qwen`: the stored settings, the
 * keys opened from a real scratch catalog (docs/BYOK.md, D12), the spawn's
 * argv and environment, the draft's `.qwen` seal, and the picker's writes on
 * `harness`. The catalog CLI is stubbed, as `drafts.test.ts` stubs it; the
 * sealed keys sit in a scratch database the runner opens itself. No request
 * leaves the machine.
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
// The runner's secrets as a launcher hands them over: taken out of the
// environment at start, so a spawn below must see none of them.
const SECRET = "test-auth-secret-0123456789abcdef-test";
process.env.AUTH_SECRET = SECRET;
process.env.OWNER_PASSWORD = "owner-password-for-this-test";
process.env.SESSION_EPOCH = "3";
process.env.GNOSIA_LOCAL_TOKEN = "local-token-for-this-test";
const OWNER = "local";
const OPENROUTER_KEY = "sk-or-v1-test-key-0001";
const OPENAI_KEY = "sk-oai-test-key-0002";

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
const { saveByok, loadByokSettings, byokStatus, listByokModels, saveByokModels, setByokActive, removeByokProvider, resolveByok, resolveByokPick, migrateLegacyByok, storedKeyForModels } =
  await import("../src/agent/byok");
const keys = await import("../src/agent/byok-keys");
keys.takeKeySecret();
const { draftDir, draftTmpDir } = await import("../src/paths");

type DraftsT = InstanceType<typeof Drafts>;

const ok = (json: unknown = {}) => ({ ok: true, json, error: null, offline: false });

let scratch: Scratch;
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
  delete process.env.CATALOG_DB;
  await keys.closeKeys();
  await fake.cleanup();
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-byok-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  scratch = await migratedScratchDatabase();
  process.env.CATALOG_DB = scratch.url;
  keys.setKeySecret(SECRET);
  // Saved in Settings, as the web app saves them: sealed under AUTH_SECRET.
  await saveProviderKey(scratch.db, OWNER, "openrouter", OPENROUTER_KEY, { AUTH_SECRET: SECRET });
  await saveProviderKey(scratch.db, OWNER, "openai", OPENAI_KEY, { AUTH_SECRET: SECRET });
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
  await keys.closeKeys();
  await scratch.drop();
  await rm(process.env.STUDIO_HOME!, { recursive: true, force: true });
});

/** The dialog's Connect, as the runner stores it: a provider whose key is saved in Settings. */
function connect(provider = "openrouter", model = "anthropic/claude-sonnet-4.5") {
  return saveByok({ provider, model });
}

/** Every file under the studio's home, read as text, for the "no key on disk" checks. */
async function everythingOnDisk(): Promise<string> {
  const home = process.env.STUDIO_HOME!;
  const names = (await readdir(home, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
  const bodies = await Promise.all(names.map((entry) => readFile(path.join(entry.parentPath, entry.name), "utf8").catch(() => "")));
  return bodies.join("\n");
}

describe("the settings file and the saved keys (D12)", () => {
  it("keeps no key on disk: the settings hold the picks, the status the key's tail", async () => {
    expect(await loadByokSettings()).toBeNull();
    const saved = await connect("openai", "gpt-5.4");
    expect(saved).toEqual({
      configured: true,
      active: "openai",
      model: "gpt-5.4",
      providers: [{ provider: "openai", last4: "0002", models: { default: "gpt-5.4" } }],
      error: null,
    });
    expect(await byokStatus()).toEqual(saved);
    const stored = JSON.parse(await readFile(path.join(process.env.STUDIO_HOME!, "byok-settings.json"), "utf8"));
    expect(stored).toEqual({ active: "openai", providers: { openai: { models: { default: "gpt-5.4" } } } });
    expect(existsSync(path.join(process.env.STUDIO_HOME!, "byok.json"))).toBe(false);
    const disk = await everythingOnDisk();
    expect(disk).not.toContain(OPENAI_KEY);
    expect(disk).not.toContain(OPENROUTER_KEY);
  });

  it("refuses a body carrying a key, and writes nothing", async () => {
    const refused = await saveByok({ provider: "openrouter", apiKey: "sk-or-v1-a-key-sent-to-the-runner", model: "m" }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(JobRefused);
    expect((refused as InstanceType<typeof JobRefused>).status).toBe(400);
    expect((refused as InstanceType<typeof JobRefused>).detail).toMatchObject({ reason: "byok-key-refused" });
    expect(await loadByokSettings()).toBeNull();
    expect(await everythingOnDisk()).not.toContain("sk-or-v1-a-key-sent-to-the-runner");
  });

  it("refuses a provider with no key saved in Settings", async () => {
    const refused = await saveByok({ provider: "anthropic", model: "claude-sonnet-4-5" }).catch((e: unknown) => e);
    expect((refused as InstanceType<typeof JobRefused>).detail).toMatchObject({ reason: "byok-no-key" });
    expect((refused as Error).message).toMatch(/Settings, Providers/);
  });

  it("holds several providers, switches the active one, and merges tier models", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    const second = await connect("openai", "gpt-5.4");
    expect(second.active).toBe("openai");
    expect(second.providers).toHaveLength(2);
    // Active is the one just connected; switching back is its own write.
    const back = await setByokActive({ provider: "openrouter" });
    expect(back.active).toBe("openrouter");
    await expect(setByokActive({ provider: "google" })).rejects.toThrow(/not connected/);
    // Tier picks merge over what a provider has; an empty one clears it.
    const tiers = await saveByokModels({ provider: "openrouter", models: { lite: "m-lite", max: "m-max" } });
    expect(tiers.providers.find((entry) => entry.provider === "openrouter")!.models).toEqual({ default: "anthropic/claude-sonnet-4.5", lite: "m-lite", max: "m-max" });
    expect((await saveByokModels({ provider: "openrouter", models: { lite: "" } })).providers.find((entry) => entry.provider === "openrouter")!.models).toEqual({
      default: "anthropic/claude-sonnet-4.5",
      max: "m-max",
    });
    // The web's call after a key save connects without moving the pick.
    expect((await saveByok({ provider: "openai", activate: false })).active).toBe("openrouter");
  });

  it("serializes overlapping writes — a tier save and a provider switch both land", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    await connect("openai", "gpt-5.4");
    const [tiers, active] = await Promise.all([
      saveByokModels({ provider: "openrouter", models: { lite: "m-lite" } }),
      setByokActive({ provider: "openrouter" }),
    ]);
    expect(tiers.providers.find((entry) => entry.provider === "openrouter")!.models.lite).toBe("m-lite");
    expect(active.active).toBe("openrouter");
    const held = await loadByokSettings();
    expect(held?.active).toBe("openrouter");
    expect(held?.providers.openrouter?.models.lite).toBe("m-lite");
  });

  it("refuses a provider the table does not have, and a provider with no Default model cannot run", async () => {
    await expect(saveByok({ provider: "anthropicx", model: "m" })).rejects.toThrow(JobRefused);
    // Inherited object members are not providers either.
    await expect(saveByok({ provider: "constructor", model: "m" })).rejects.toThrow(/"provider" is one of/);
    await saveByok({ provider: "openai", model: " " });
    expect(resolveByokPick(await loadByokSettings(), null)).toBeNull();
    expect((await byokStatus()).configured).toBe(false);
    expect(await resolveByok(null)).toEqual({ problem: expect.stringMatching(/BYOK is not set up/) });
  });

  it("resolves a tier pick to the active provider's model, and opens the saved key for the spawn", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    await saveByokModels({ provider: "openrouter", models: { max: "anthropic/claude-opus-4.6" } });
    const settings = await loadByokSettings();
    expect(resolveByokPick(settings, null)).toEqual({ provider: "openrouter", model: "anthropic/claude-sonnet-4.5" });
    expect(resolveByokPick(settings, "lite")).toMatchObject({ model: "anthropic/claude-sonnet-4.5" });
    expect(resolveByokPick(settings, "max")).toMatchObject({ model: "anthropic/claude-opus-4.6" });
    expect(await resolveByok("max")).toEqual({ provider: "openrouter", apiKey: OPENROUTER_KEY, model: "anthropic/claude-opus-4.6" });
    expect(await storedKeyForModels("openrouter")).toBe(OPENROUTER_KEY);
  });

  it("reads a key replaced in Settings at the next spawn, and drops a provider whose key is removed", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    await saveProviderKey(scratch.db, OWNER, "openrouter", "sk-or-v1-rotated-key-0009", { AUTH_SECRET: SECRET });
    expect(await resolveByok(null)).toMatchObject({ apiKey: "sk-or-v1-rotated-key-0009" });
    expect((await byokStatus()).providers[0]!.last4).toBe("0009");
    await removeProviderKey(scratch.db, OWNER, "openrouter");
    const status = await byokStatus();
    // Still listed, tiers and all, so nothing is lost while the key is away; it cannot run.
    expect(status.providers).toEqual([{ provider: "openrouter", last4: "", models: { default: "anthropic/claude-sonnet-4.5" }, keyMissing: true }]);
    expect(status.configured).toBe(false);
    expect(status.model).toBeNull();
    // Back in Settings, back in Studio with the same tiers.
    await saveProviderKey(scratch.db, OWNER, "openrouter", "sk-or-v1-returned-key-0010", { AUTH_SECRET: SECRET });
    expect(await byokStatus()).toMatchObject({ configured: true, providers: [{ provider: "openrouter", last4: "0010", models: { default: "anthropic/claude-sonnet-4.5" } }] });
    await removeProviderKey(scratch.db, OWNER, "openrouter");
    expect(await resolveByok(null)).toEqual({ problem: expect.stringMatching(/no openrouter key is saved/) });
    // Studio's Remove takes the provider out of Studio and leaves the key in Settings alone.
    await connect("openai", "gpt-5.4");
    await removeByokProvider({ provider: "openai" });
    expect(await keys.openSavedKey("openai")).toBe(OPENAI_KEY);
  });

  it("reads keys sealed under another AUTH_SECRET as missing, never as a crash", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    keys.setKeySecret("a-different-auth-secret-0123456789abcdef");
    const status = await byokStatus();
    expect(status.providers).toEqual([{ provider: "openrouter", last4: "", models: { default: "anthropic/claude-sonnet-4.5" }, keyMissing: true }]);
    expect(status.configured).toBe(false);
    expect(status.error).toBeNull();
    expect(await resolveByok(null)).toEqual({ problem: expect.stringMatching(/no openrouter key is saved/) });
  });

  it("without AUTH_SECRET: BYOK is off and says why, the settings stay, and nothing is spawned", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    keys.setKeySecret(null);
    const status = await byokStatus();
    expect(status.configured).toBe(false);
    expect(status.error).toMatch(/AUTH_SECRET is not set/);
    expect(keys.keyAccessNow()).toMatchObject({ ok: false, reason: "no-secret" });
    const refused = await connect("openai", "gpt-5.4").catch((e: unknown) => e);
    expect((refused as InstanceType<typeof JobRefused>).status).toBe(503);
    expect(await resolveByok(null)).toEqual({ problem: expect.stringMatching(/AUTH_SECRET is not set/) });
    await expect(drafts.create({ idempotencyKey: "k-nosecret", harness: "byok" })).rejects.toThrow(/BYOK is not set up: AUTH_SECRET is not set/);
    // A Claude conversation does not depend on it.
    await expect(drafts.create({ idempotencyKey: "k-claude" })).resolves.toMatchObject({ created: true });
    expect((await loadByokSettings())?.providers.openrouter).toBeDefined();
  });

  it("makes the first provider connected after a key save the one that runs", async () => {
    // The web's call after a key save does not move the pick; into an empty list, the first provider is the pick.
    await saveByok({ provider: "openrouter", activate: false });
    await saveByokModels({ provider: "openrouter", models: { default: "anthropic/claude-sonnet-4.5" } });
    expect(await byokStatus()).toMatchObject({ configured: true, active: "openrouter" });
    expect(await resolveByok(null)).toMatchObject({ provider: "openrouter", apiKey: OPENROUTER_KEY });
  });

  it("reports a catalog it cannot read as a reason, in the status and in health, until a read succeeds", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    const garbage = path.join(process.env.STUDIO_HOME!, "not-a-catalog.db");
    await writeFile(garbage, "this is not a SQLite file at all, but it is long enough to look like one".repeat(20));
    process.env.CATALOG_DB = garbage;
    const status = await byokStatus();
    expect(status.configured).toBe(false);
    expect(status.error).toMatch(/the catalog could not be read for the saved provider keys \(SQLITE_NOTADB\)/);
    expect(keys.keyAccessNow()).toMatchObject({ ok: false, reason: "catalog-unreadable" });
    expect(await resolveByok(null)).toEqual({ problem: expect.stringMatching(/BYOK cannot run: the catalog could not be read/) });
    process.env.CATALOG_DB = scratch.url;
    expect((await byokStatus()).configured).toBe(true);
    expect(keys.keyAccessNow()).toMatchObject({ ok: true });
  });

  it("opens keys from the web's catalog file when the runner was given one", async () => {
    await connect("openrouter", "anthropic/claude-sonnet-4.5");
    process.env.CATALOG_DB = path.join(process.env.STUDIO_HOME!, "elsewhere", "catalog.db");
    expect((await byokStatus()).error).toMatch(/does not exist/);
    keys.setCatalogFile(scratch.url);
    try {
      expect(await byokStatus()).toMatchObject({ configured: true, error: null });
    } finally {
      keys.setCatalogFile(null);
    }
  });

  it("never creates a catalog where none is", async () => {
    const missing = path.join(process.env.STUDIO_HOME!, "nowhere", "catalog.db");
    process.env.CATALOG_DB = missing;
    const status = await byokStatus();
    expect(status.error).toContain(missing);
    expect(existsSync(missing)).toBe(false);
    expect(existsSync(path.dirname(missing))).toBe(false);
  });
});

describe("the runner's secrets", () => {
  it("are taken out of the environment, found or not", () => {
    const env: NodeJS.ProcessEnv = { AUTH_SECRET: ` ${SECRET} `, OWNER_PASSWORD: "pw", SESSION_EPOCH: "2", GNOSIA_LOCAL_TOKEN: "t", PATH: "/bin" };
    expect(keys.takeKeySecret(env)).toBe(SECRET);
    expect(env).toEqual({ PATH: "/bin" });
    const none: NodeJS.ProcessEnv = { OWNER_PASSWORD: "pw" };
    keys.setKeySecret(null);
    expect(keys.takeKeySecret(none)).toBeNull();
    expect(none).toEqual({});
    expect(keys.hasKeySecret()).toBe(false);
  });

  it("refuse a secret too short to seal with, and say so", () => {
    keys.setKeySecret(null);
    expect(keys.takeKeySecret({ AUTH_SECRET: "short" })).toBeNull();
    expect(keys.keyAccessNow().problem).toMatch(/AUTH_SECRET is shorter than/);
  });

  it("were taken from this process at import, before any spawn", () => {
    for (const name of keys.RUNNER_SECRET_VARS) expect(process.env[name]).toBeUndefined();
  });
});

describe("the first start after the upgrade", () => {
  const legacy = () => path.join(process.env.STUDIO_HOME!, "byok.json");

  it("deletes the plaintext byok.json, carries its picks and tiers, and names the keys Settings does not have", async () => {
    await writeFile(
      legacy(),
      JSON.stringify({
        active: "anthropic",
        providers: {
          openrouter: { apiKey: OPENROUTER_KEY, models: { default: "anthropic/claude-sonnet-4.5", max: "m-max" } },
          anthropic: { apiKey: "sk-ant-only-in-the-old-file-0003", models: { default: "claude-sonnet-4-5" } },
        },
      }),
      { mode: 0o600 },
    );
    await writeFile(`${legacy()}.4242.tmp`, JSON.stringify({ active: null, providers: { openai: { apiKey: "sk-half-written-0004" } } }));
    const migrated = await migrateLegacyByok();
    expect(migrated).toEqual({ removed: true, carried: ["openrouter", "anthropic"], keyless: ["anthropic"] });
    expect(existsSync(legacy())).toBe(false);
    expect(await readdir(process.env.STUDIO_HOME!)).toEqual(["byok-settings.json"]);
    expect(await loadByokSettings()).toEqual({
      active: "anthropic",
      providers: {
        openrouter: { models: { default: "anthropic/claude-sonnet-4.5", max: "m-max" } },
        anthropic: { models: { default: "claude-sonnet-4-5" } },
      },
    });
    const disk = await everythingOnDisk();
    for (const key of [OPENROUTER_KEY, "sk-ant-only-in-the-old-file-0003", "sk-half-written-0004"]) expect(disk).not.toContain(key);
    // The provider whose key Settings has can run; the other waits for its key, its tiers kept.
    const status = await byokStatus();
    expect(status.providers.map((entry) => [entry.provider, entry.keyMissing ?? false])).toEqual([
      ["openrouter", false],
      ["anthropic", true],
    ]);
    // The active one is the keyless Anthropic, so nothing runs until its key is saved.
    expect(status.configured).toBe(false);
    // Nothing to do the second time.
    expect(await migrateLegacyByok()).toEqual({ removed: false, carried: [], keyless: [] });
  });

  it("reads the v1 shape, keeps settings already written, and deletes the file without AUTH_SECRET", async () => {
    await connect("openai", "gpt-5.4");
    await writeFile(legacy(), JSON.stringify({ provider: "openrouter", apiKey: "sk-old-v1-key-0005", model: "m-old" }));
    keys.setKeySecret(null);
    const migrated = await migrateLegacyByok();
    expect(migrated).toEqual({ removed: true, carried: ["openrouter"], keyless: null });
    expect(existsSync(legacy())).toBe(false);
    expect((await loadByokSettings())?.active).toBe("openai");
    expect(await everythingOnDisk()).not.toContain("sk-old-v1-key-0005");
  });

  it("deletes a file it cannot read, and each leftover on its own", async () => {
    await writeFile(legacy(), JSON.stringify({ provider: "openrouter", apiKey: "sk-unreadable-0007", model: "m" }), { mode: 0o000 });
    await writeFile(`${legacy()}.1.tmp`, "sk-left-over-0008");
    const migrated = await migrateLegacyByok();
    expect(migrated.removed).toBe(true);
    expect(existsSync(legacy())).toBe(false);
    expect(existsSync(`${legacy()}.1.tmp`)).toBe(false);
  });

  it("keeps the picks, without the keys, when the settings cannot be written", async () => {
    await writeFile(legacy(), JSON.stringify({ active: "openrouter", providers: { openrouter: { apiKey: "sk-stranded-0009", models: { default: "m-keep" } } } }));
    // A directory where the settings file goes makes its rename fail.
    await mkdir(path.join(process.env.STUDIO_HOME!, "byok-settings.json"));
    const migrated = await migrateLegacyByok();
    expect(migrated).toMatchObject({ removed: true, carried: [] });
    expect(await everythingOnDisk()).not.toContain("sk-stranded-0009");
    expect(JSON.parse(await readFile(legacy(), "utf8"))).toEqual({ active: "openrouter", providers: { openrouter: { models: { default: "m-keep" } } } });
    // The next start, with the way clear, carries them over and deletes the file.
    await rm(path.join(process.env.STUDIO_HOME!, "byok-settings.json"), { recursive: true });
    expect(await migrateLegacyByok()).toMatchObject({ removed: true, carried: ["openrouter"] });
    expect(existsSync(legacy())).toBe(false);
    expect((await loadByokSettings())?.providers.openrouter?.models.default).toBe("m-keep");
  });

  it("deletes a file it cannot parse", async () => {
    await writeFile(legacy(), "{ not json sk-garbled-0006");
    expect(await migrateLegacyByok()).toEqual({ removed: true, carried: [], keyless: [] });
    expect(existsSync(legacy())).toBe(false);
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
      // The key saved in Settings, opened from the catalog for this spawn.
      expect(env.openaiKey).toBe(OPENROUTER_KEY);
      // The runner's own secrets never reach a spawn.
      expect(env.authSecret).toBeNull();
      expect(env.ownerPassword).toBeNull();
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

  it("fails a turn the way a missing binary does when the settings are cleared", async () => {
    await connect();
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "byok" });
    await rm(path.join(process.env.STUDIO_HOME!, "byok-settings.json"), { force: true });
    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.error?.kind).toBe("agent");
    expect(view.error?.message).toMatch(/the planner never started: BYOK is not set up/);
  });

  it("fails a turn whose key was removed in Settings, naming it", async () => {
    await connect();
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "byok" });
    await removeProviderKey(scratch.db, OWNER, "openrouter");
    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.error?.message).toMatch(/the planner never started: BYOK cannot run: no openrouter key is saved/);
    expect(await fake.argvs()).toHaveLength(0);
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
