import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeCodex, FAKE_CODEX_THREAD, type FakeCodex } from "./fake-codex";
import { topicListAnswer } from "./vocabulary";

/**
 * The Codex harness end to end through a fake `codex`: the sign-in gate, the
 * spawn's argv and sealed environment (`codex.ts`), codex's own NDJSON
 * translated by `codexEvent`, and the `thread_id` resume hands back. The
 * catalog is stubbed, as `byok.test.ts` stubs it; no request leaves the
 * machine.
 */

let fake: FakeCodex;
// Read at import by config.ts, so set before the first import below.
const fakeReady = fakeCodex().then((made) => {
  fake = made;
  process.env.STUDIO_CODEX_BIN = made.bin;
});
await fakeReady;
// A key left in this shell, to prove it never reaches the spawn's env.
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

/** A temp `CODEX_HOME` holding a login, so `codexSignedIn` answers yes. */
async function signIn() {
  const home = path.join(process.env.STUDIO_HOME!, "codex-real-home");
  await mkdir(home, { recursive: true });
  await writeFile(path.join(home, "auth.json"), "{}", "utf8");
  process.env.CODEX_HOME = home;
  return home;
}

beforeAll(async () => {
  await fakeReady;
});

afterAll(async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.CODEX_HOME;
  await fake.cleanup();
});

beforeEach(async () => {
  process.env.STUDIO_HOME = path.join(tmpdir(), `studio-codex-${Date.now()}-${Math.random()}`);
  await mkdir(process.env.STUDIO_HOME, { recursive: true });
  delete process.env.CODEX_HOME;
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

describe("a codex conversation", () => {
  it("refuses the pick when no codex login exists", async () => {
    // An API key in the runner's env counts too, so it has to be gone first,
    // and `CODEX_HOME` points at a home with no `auth.json` in it.
    delete process.env.OPENAI_API_KEY;
    process.env.CODEX_HOME = path.join(process.env.STUDIO_HOME!, "empty-codex-home");
    await mkdir(process.env.CODEX_HOME, { recursive: true });
    await expect(drafts.create({ idempotencyKey: "k1", harness: "codex" })).rejects.toThrow(/codex is not signed in/);
    delete process.env.CODEX_HOME;
    process.env.OPENAI_API_KEY = "sk-stray";
  });

  it("refuses a harness the picker never had", async () => {
    await expect(drafts.create({ idempotencyKey: "k1", harness: "perl" })).rejects.toThrow(JobRefused);
  });

  it("moves a spoken-for-free draft to codex and stays locked after a turn", async () => {
    await signIn();
    const { record } = await drafts.create({ idempotencyKey: "k1" });
    await expect(drafts.setHarness(record.id, "codex")).resolves.toMatchObject({ changed: true });
    expect(drafts.get(record.id)?.harness).toBe("codex");

    await fake.script([{ text: "Hello." }]);
    await drafts.send(record.id, "hi");
    await drafts.settled(record.id);
    await expect(drafts.setHarness(record.id, "claude")).rejects.toThrow(/keeps the harness it started on/);
  });

  it("runs its turns on codex, sealed, and resumes the thread it minted", async () => {
    const realHome = await signIn();
    await fake.script([{ text: "First answer." }, { text: "Second answer." }]);
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "codex" });
    expect(record.harness).toBe("codex");

    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    let view = await drafts.view(record.id);
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", text: "First answer." });

    // Codex mints its own thread id: the record's placeholder became what
    // `thread.started` reported, and the next turn resumes that.
    const stored = JSON.parse(await readFile(path.join(draftDir(record.id), "draft.json"), "utf8"));
    expect(stored.plannerSessionId).toBe(FAKE_CODEX_THREAD);

    await drafts.send(record.id, "and again");
    await drafts.settled(record.id);
    view = await drafts.view(record.id);
    expect(view.transcript.at(-1)).toMatchObject({ role: "planner", text: "Second answer." });

    const argvs = await fake.argvs();
    expect(argvs).toHaveLength(2);
    expect(argvs[0]![0]).toBe("exec");
    for (const argv of argvs) {
      expect(argv).toContain("--json");
      expect(argv).toContain("--skip-git-repo-check");
      expect(argv).toContain('sandbox_mode="read-only"');
      expect(argv).toContain('approval_policy="never"');
      expect(argv).toContain("project_doc_max_bytes=0");
      expect(argv).toContain("mcp_servers={}");
      expect(argv).toContain("include_environment_context=false");
      expect(argv).toContain(`model_instructions_file=${JSON.stringify(path.join(draftDir(record.id), "planner-system.md"))}`);
      // The prompt rides stdin, never argv: `-` is the only prompt argument.
      expect(argv.at(-1)).toBe("-");
      expect(argv).not.toContain("hello");
    }
    expect(argvs[1]!.slice(0, 3)).toEqual(["exec", "resume", FAKE_CODEX_THREAD]);
    const prompts = await fake.prompts();
    expect(prompts[0]).toContain("hello");
    expect(prompts[1]).toContain("and again");

    const envs = await fake.envs();
    for (const env of envs) {
      // HOME and CODEX_HOME are the draft's, so the owner's codex config,
      // skills and plugins are all sealed away from the spawn.
      expect(env.home).toBe(draftTmpDir(record.id));
      expect(env.codexHome).toBe(path.join(draftTmpDir(record.id), "codex-home"));
      // Neither side's ambient key reaches the spawn: the login the
      // symlinked auth.json carries is the only credential.
      expect(env.openaiKey).toBeNull();
      expect(env.anthropicKey).toBeNull();
    }
    // The sealed home holds only the real login, as a symlink to it.
    expect(await readFile(path.join(draftTmpDir(record.id), "codex-home", "auth.json"), "utf8")).toBe("{}");
    expect(path.join(draftTmpDir(record.id), "codex-home", "auth.json")).not.toBe(realHome);
  });

  it("reports the harness's own error when the turn fails", async () => {
    await signIn();
    await fake.script([{ refused: "[API Error: 401 Missing Authentication header]" }]);
    const { record } = await drafts.create({ idempotencyKey: "k1", harness: "codex" });
    await drafts.send(record.id, "hello");
    await drafts.settled(record.id);
    const view = await drafts.view(record.id);
    expect(view.error?.kind).toBe("agent");
    expect(view.error?.message).toMatch(/401 Missing Authentication/);
  });
});
