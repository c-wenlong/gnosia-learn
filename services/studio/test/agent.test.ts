import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Which credential the spawned agent gets, and what the runner learns when the
 * agent's first request is refused.
 *
 * Tested against a real child process, a stand-in `claude` that behaves the
 * way the real CLI did on the job that prompted this: it reports where its key
 * came from in the `system/init` event and, handed an `ANTHROPIC_API_KEY`, it
 * fails its first request with the API's own 400 and an `is_error` result after
 * one turn. It also prints what it can see of its own environment, which is the
 * only honest way to test what a spawn passes: asserting on the object handed
 * to `spawn` would test this file's arithmetic and not the child.
 */

const HOME = path.join(tmpdir(), `studio-agent-${process.pid}-${Date.now()}`);
const FAKE = path.join(HOME, "fake-claude.mjs");

/** Read before the modules that read it: config resolves `CLAUDE_BIN` at import. */
process.env.STUDIO_HOME = HOME;
process.env.STUDIO_CLAUDE_BIN = FAKE;

const { AGENT_AUTH_ENV, agentEnv, startAgent } = await import("../src/agent");
const { agentAuth, agentAuthReport } = await import("../src/config");
const { candidateDir, jobDir, scratchDir, tmpDir } = await import("../src/paths");
const { JobCostMeter } = await import("../src/cost");

const API_ERROR =
  "API Error: 400 This API key is not scoped to a workspace, so this request must include " +
  "the anthropic-workspace-id header with the ID of the workspace to use.";

/**
 * The stand-in. Its first line is a report of its own environment: whether a
 * key reached it (never the key), the base URL, `TMPDIR`, and one unrelated
 * variable, so a spawn that stripped everything would be caught as well as one
 * that stripped nothing.
 */
const SCRIPT = `#!${process.execPath}
const key = (process.env.ANTHROPIC_API_KEY ?? "") !== "";
const out = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
out({
  type: "fake_env",
  hasKey: key,
  baseUrl: process.env.ANTHROPIC_BASE_URL ?? null,
  oauthToken: (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "") !== "",
  configDir: process.env.CLAUDE_CONFIG_DIR ?? null,
  tmpdir: process.env.TMPDIR ?? null,
  claudeTmpdir: process.env.CLAUDE_CODE_TMPDIR ?? null,
  marker: process.env.STUDIO_AGENT_TEST_MARKER ?? null,
  addDirs: process.argv.filter((_, i, argv) => argv[i - 1] === "--add-dir"),
  strictMcpConfig: process.argv.includes("--strict-mcp-config"),
  mcpConfig: process.argv.includes("--mcp-config") ? process.argv[process.argv.indexOf("--mcp-config") + 1] : null,
  resumed: process.argv.includes("--resume"),
  manualFile: process.argv.includes("--append-system-prompt-file") ? process.argv[process.argv.indexOf("--append-system-prompt-file") + 1] : null,
  appendText: process.argv.includes("--append-system-prompt"),
  model: process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : null,
  effort: process.argv.includes("--effort") ? process.argv[process.argv.indexOf("--effort") + 1] : null,
  partial: process.argv.includes("--include-partial-messages"),
});
out({ type: "system", subtype: "init", model: "claude-sonnet-test", apiKeySource: key ? "ANTHROPIC_API_KEY" : "none" });
if (key) {
  out({ type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text: ${JSON.stringify(API_ERROR)} }] }, is_api_error_message: true });
  out({ type: "result", subtype: "success", is_error: true, num_turns: 1, total_cost_usd: 0, api_error_status: 400, result: ${JSON.stringify(API_ERROR)} });
  process.exit(1);
}
if (process.argv.includes("--include-partial-messages")) {
  // The frames the real CLI prints around one message, as it printed them.
  const usage = { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 }, output_tokens: 1 };
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "msg_fake", model: "claude-sonnet-5", usage } } });
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "drew it" } } });
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 0 } });
  out({ type: "assistant", message: { id: "msg_fake", model: "claude-sonnet-5", usage, content: [{ type: "text", text: "drew it" }] } });
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { ...usage, output_tokens: 250 } } });
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_stop" } });
}
out({ type: "result", subtype: "success", is_error: false, num_turns: 4, total_cost_usd: 0.01, result: "drew it" });
`;

/** What the variables under test were before this file touched them. */
const saved: Record<string, string | undefined> = {};
const TOUCHED = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CONFIG_DIR",
  "STUDIO_AGENT_AUTH",
  "STUDIO_AGENT_TEST_MARKER",
];

beforeAll(async () => {
  await mkdir(HOME, { recursive: true });
  await writeFile(FAKE, SCRIPT, "utf8");
  await chmod(FAKE, 0o755);
  for (const name of TOUCHED) saved[name] = process.env[name];
});

afterEach(() => {
  for (const name of TOUCHED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

afterAll(async () => {
  await rm(HOME, { recursive: true, force: true });
  delete process.env.STUDIO_CLAUDE_BIN;
  delete process.env.STUDIO_HOME;
});

/** A key that looks like one and is not, in the environment the runner would have. */
function shellWithKey(): void {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
  process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-test-not-a-real-token";
  process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-config-test";
  process.env.STUDIO_AGENT_TEST_MARKER = "kept";
}

async function runFake(
  jobId: string,
  auth?: "login" | "env",
  resume = false,
  manualPath?: string | null,
  flags: { model: string | null; effort?: string | null } = { model: "sonnet" },
) {
  const lines: string[] = [];
  const inits: { apiKeySource: string | null }[] = [];
  const agent = await startAgent({
    jobId,
    slug: "studio-agent-fixture",
    prompt: "draw it",
    ...flags,
    sessionId: "00000000-0000-4000-8000-00000000abcd",
    resume,
    ...(auth === undefined ? {} : { auth }),
    ...(manualPath === undefined ? {} : { manualPath }),
    onLine: (line) => lines.push(line),
    onInit: (init) => inits.push(init),
  });
  const outcome = await agent.done;
  const env = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  return { outcome, env, inits, lines };
}

describe("the agent's working directories", () => {
  it("are its scratch and its candidate directory, and not the workspace that holds the runner's records", async () => {
    const { env } = await runFake("job-dirs");
    expect(env.addDirs).toEqual([scratchDir("job-dirs"), candidateDir("job-dirs")]);
    expect(env.addDirs).not.toContain(jobDir("job-dirs"));
  });
});

describe("the agent's stream", () => {
  it("asks for the partial frames, and passes on the two the cost meter reads and none of the rest", async () => {
    // Phase 2 measured: without `message_delta` the stream never says how many
    // tokens a message wrote, and a killed video job recorded a third too little.
    const { env, lines } = await runFake("job-partial");
    expect(env.partial).toBe(true);
    const frames = lines
      .map((line) => JSON.parse(line) as { type: string; event?: { type: string } })
      .filter((event) => event.type === "stream_event")
      .map((event) => event.event?.type);
    expect(frames).toEqual(["message_start", "message_delta"]);
    const meter = new JobCostMeter("sonnet");
    for (const line of lines) {
      if (JSON.parse(line).type !== "result") meter.observe(line);
    }
    expect(meter.read().usage.outputTokens).toBe(250);
  });
});

describe("the agent's model and effort", () => {
  it("are passed as --model and --effort when the runner resolved them", async () => {
    const { env } = await runFake("job-model", undefined, false, undefined, { model: "opus", effort: "low" });
    expect(env.model).toBe("opus");
    expect(env.effort).toBe("low");
  });

  it("are left off entirely when the runner resolved no value, so the CLI's own default applies", async () => {
    const { env } = await runFake("job-no-model", undefined, false, undefined, { model: null, effort: null });
    expect(env.model).toBeNull();
    expect(env.effort).toBeNull();
    // Absent is the same as null: a caller that predates effort passes none.
    const { env: before } = await runFake("job-no-effort", undefined, false, undefined, { model: "sonnet" });
    expect(before.model).toBe("sonnet");
    expect(before.effort).toBeNull();
  });
});

describe("the tldraw manual on the agent's system prompt", () => {
  it("is passed as a file with --append-system-prompt-file, never as argv text", async () => {
    const file = path.join(HOME, "manual", "abc.md");
    const { env } = await runFake("job-manual", undefined, false, file);
    expect(env.manualFile).toBe(file);
    // The text form would put about 38,000 characters of manual in every argv.
    expect(env.appendText).toBe(false);
  });

  it("is passed on a resumed attempt too, the job's own file", async () => {
    const file = path.join(HOME, "manual", "abc.md");
    const { env } = await runFake("job-manual-resume", undefined, true, file);
    expect(env.resumed).toBe(true);
    expect(env.manualFile).toBe(file);
  });

  it("is left off entirely when the job has none", async () => {
    const { env } = await runFake("job-no-manual", undefined, false, null);
    expect(env.manualFile).toBeNull();
    const { env: unset } = await runFake("job-no-manual-2");
    expect(unset.manualFile).toBeNull();
  });
});

describe("the agent's seal from this machine's own MCP servers", () => {
  it("carries --strict-mcp-config and an empty --mcp-config on every spawn", async () => {
    // D34/open question 4 of docs/STUDIO-CHAT-FIRST.md: without this seal, a
    // spawn on this machine can load its claude.ai connectors (Gmail, Slack,
    // Drive...) regardless of --permission-prompts none, since that refuses a
    // call but does not stop the tool definitions riding every request.
    const { env } = await runFake("job-mcp-seal");
    expect(env.strictMcpConfig).toBe(true);
    expect(env.mcpConfig).toBe('{"mcpServers":{}}');
    expect(() => JSON.parse(env.mcpConfig as string) as unknown).not.toThrow();
    expect(JSON.parse(env.mcpConfig as string)).toEqual({ mcpServers: {} });
  });
  it("carries the same seal when a revision or a later attempt resumes the session", async () => {
    const { env } = await runFake("job-mcp-seal-resume", undefined, true);
    expect(env.resumed).toBe(true);
    expect(env.strictMcpConfig).toBe(true);
    expect(env.mcpConfig).toBe('{"mcpServers":{}}');
  });
});

describe("the agent's environment", () => {
  it("strips the shell's key by default, so the CLI falls back to the login", async () => {
    shellWithKey();
    delete process.env.STUDIO_AGENT_AUTH;

    const { outcome, env, inits } = await runFake("job-login");

    expect(env.hasKey).toBe(false);
    expect(env.baseUrl).toBeNull();
    expect(env.oauthToken).toBe(false);
    // Where the login lives is not an auth override, and stripping it would
    // move the agent off the very account this exists to put it on.
    expect(env.configDir).toBe("/tmp/claude-config-test");
    // Everything else still arrives, TMPDIR pointed into the job as before.
    expect(env.marker).toBe("kept");
    expect(env.tmpdir).toBe(tmpDir("job-login"));
    // And the CLI's own temp root with it, so the session's scratchpad, which
    // the CLI lets it write without asking any rule, is inside the job.
    expect(env.claudeTmpdir).toBe(tmpDir("job-login"));

    expect(inits).toEqual([{ apiKeySource: "none", model: "claude-sonnet-test" }]);
    expect(outcome.apiKeySource).toBe("none");
    expect(outcome.isError).toBe(false);
    expect(outcome.result).toBe("drew it");
    // Nothing was deleted from the runner's own environment on the way.
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-not-a-real-key");
  }, 20_000);

  it("passes the key through under STUDIO_AGENT_AUTH=env", async () => {
    shellWithKey();
    process.env.STUDIO_AGENT_AUTH = "env";

    const { env } = await runFake("job-env");

    expect(env.hasKey).toBe(true);
    expect(env.baseUrl).toBe("https://api.anthropic.com");
    expect(env.oauthToken).toBe(true);
  }, 20_000);

  it("takes the rule the runner recorded over the setting as it is now", async () => {
    // The runner reads the setting once per job and hands it down, so a job
    // runs every attempt under the rule its record names.
    shellWithKey();
    process.env.STUDIO_AGENT_AUTH = "env";

    const { env } = await runFake("job-pinned", "login");

    expect(env.hasKey).toBe(false);
  }, 20_000);

  it("names every variable it strips, and leaves the rest of the environment alone", () => {
    const base: NodeJS.ProcessEnv = { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/c" };
    for (const name of AGENT_AUTH_ENV) base[name] = "x";

    const login = agentEnv(base, "login", "/tmp/job");
    for (const name of AGENT_AUTH_ENV) expect(login[name], name).toBeUndefined();
    expect(login.PATH).toBe("/usr/bin");
    expect(login.CLAUDE_CONFIG_DIR).toBe("/c");
    expect(login.TMPDIR).toBe("/tmp/job");
    expect(login.CLAUDE_CODE_TMPDIR).toBe("/tmp/job");

    const env = agentEnv(base, "env", "/tmp/job");
    for (const name of AGENT_AUTH_ENV) expect(env[name], name).toBe("x");
    // A copy, never an edit of what it was given.
    expect(base.ANTHROPIC_API_KEY).toBe("x");
    expect(base.TMPDIR).toBeUndefined();
  });

  it("moves the CLI's temp root into the job even when the runner has one of its own", () => {
    // A runner started from inside a Claude session can inherit this variable
    // naming that session's root. The agent must not share it: its scratchpad
    // would land in somebody else's temp directory.
    const env = agentEnv({ CLAUDE_CODE_TMPDIR: "/tmp/parent-session" }, "login", "/tmp/job");
    expect(env.CLAUDE_CODE_TMPDIR).toBe("/tmp/job");
  });
});

describe("a first request the API refuses", () => {
  it("comes back as an error after one turn, with the API's own words", async () => {
    shellWithKey();
    process.env.STUDIO_AGENT_AUTH = "env";

    const { outcome, inits } = await runFake("job-refused");

    expect(outcome.isError).toBe(true);
    expect(outcome.turns).toBe(1);
    // The CLI said `success` on exactly this session, so the subtype cannot be
    // what tells the runner something went wrong.
    expect(outcome.subtype).toBe("success");
    expect(outcome.result).toBe(API_ERROR);
    expect(outcome.apiKeySource).toBe("ANTHROPIC_API_KEY");
    expect(outcome.spawnFailed).toBe(false);
    expect(outcome.exitCode).toBe(1);
    expect(inits[0]?.apiKeySource).toBe("ANTHROPIC_API_KEY");
  }, 20_000);
});

describe("the setting", () => {
  it("defaults to login, and reads anything but env as login", () => {
    delete process.env.STUDIO_AGENT_AUTH;
    expect(agentAuth()).toBe("login");
    process.env.STUDIO_AGENT_AUTH = " ENV ";
    expect(agentAuth()).toBe("env");
    process.env.STUDIO_AGENT_AUTH = "evn";
    expect(agentAuth()).toBe("login");
  });

  it("reports whether a key is set without ever carrying it", () => {
    shellWithKey();
    process.env.STUDIO_AGENT_AUTH = "evn";
    const report = agentAuthReport();
    expect(report).toMatchObject({ mode: "login", setting: "evn", apiKeySet: true });
    expect(report.note).toContain("stripped");
    expect(JSON.stringify(report)).not.toContain("sk-ant-test");

    process.env.STUDIO_AGENT_AUTH = "env";
    delete process.env.ANTHROPIC_API_KEY;
    expect(agentAuthReport()).toMatchObject({ mode: "env", apiKeySet: false });
  });
});
