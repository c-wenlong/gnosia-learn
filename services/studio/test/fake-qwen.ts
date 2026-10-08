import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A stand-in `qwen` for the BYOK harness's tests, the way `fake-claude.ts`
 * stands in for `claude`: a real executable, spawned the way the runner spawns
 * the real one, that answers from a script. No test here ever reaches a
 * provider.
 *
 * Each spawn takes the next reply off `replies.json`, records its argv in
 * `argv.ndjson`, its stdin in `prompts.ndjson`, and the provider variables its
 * environment carried in `env.ndjson`, and prints the `stream-json` shape the
 * real CLI prints (measured on 0.25.0): a `system/init` event, `stream_event`
 * deltas, an `assistant` message with its usage, and a `result`.
 */

export interface FakeQwenReply {
  /** The reply's text. */
  text?: string;
  /** A refused first request: `is_error` with this as the result text, and no reply text. */
  refused?: string;
  /** What the init event lists, to break the seal. */
  tools?: string[];
  /** MCP servers the init event lists, to break the seal. */
  mcpServers?: unknown[];
}

const SCRIPT = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.FAKE_QWEN_DIR;
const argv = process.argv.slice(2);
fs.appendFileSync(dir + "/argv.ndjson", JSON.stringify(argv) + "\n");
// The prompt arrives on stdin: the real CLI reads piped input headlessly.
const prompt = fs.readFileSync(0, "utf8");
fs.appendFileSync(dir + "/prompts.ndjson", JSON.stringify(prompt) + "\n");
// What the spawn's environment set, so a test can check the seal held.
fs.appendFileSync(dir + "/env.ndjson", JSON.stringify({
  openaiKey: process.env.OPENAI_API_KEY ?? null,
  openaiBase: process.env.OPENAI_BASE_URL ?? null,
  openaiModel: process.env.OPENAI_MODEL ?? null,
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? null,
  systemMd: process.env.QWEN_SYSTEM_MD ?? null,
  home: process.env.HOME ?? null,
}) + "\n");
const replies = JSON.parse(fs.readFileSync(dir + "/replies.json", "utf8"));
const countFile = dir + "/count";
const n = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, "utf8")) : 0;
fs.writeFileSync(countFile, String(n + 1));
const reply = replies[Math.min(n, replies.length - 1)] || {};
const out = (event) => process.stdout.write(JSON.stringify(event) + "\n");
const at = (flag) => argv.indexOf(flag) === -1 ? null : argv[argv.indexOf(flag) + 1];
// Under --exclude-tools <every name> the real init reports an empty tools
// list, the seal the spawn is required to keep.
out({ type: "system", subtype: "init", session_id: at("--resume") ?? at("--session-id"), model: process.env.OPENAI_MODEL ?? null,
  tools: reply.tools || [], mcp_servers: reply.mcpServers || [], permission_mode: "default" });
const text = reply.refused ? "" : (reply.text || "");
const usage = { input_tokens: 10, output_tokens: 5 };
const failed = !!reply.refused;
if (text !== "") {
  const third = Math.ceil(text.length / 3);
  for (let i = 0; i < text.length; i += third || 1) {
    out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + (third || 1)) } } });
  }
  out({ type: "assistant", message: { id: "msg_" + n, role: "assistant", content: [{ type: "text", text }], usage } });
}
out({ type: "result", subtype: failed ? "error_during_execution" : "success", is_error: failed, result: reply.refused || text, num_turns: 1, usage });
process.exit(0);
`;

export interface FakeQwen {
  bin: string;
  dir: string;
  /** Replace the script of replies, and start counting spawns again. */
  script(replies: FakeQwenReply[]): Promise<void>;
  /** Every spawn's argv so far, oldest first. */
  argvs(): Promise<string[][]>;
  /** What each spawn read on stdin, oldest first. */
  prompts(): Promise<string[]>;
  /** The provider variables each spawn's environment carried, oldest first. */
  envs(): Promise<Record<string, string | null>[]>;
  cleanup(): Promise<void>;
}

export async function fakeQwen(): Promise<FakeQwen> {
  const dir = await mkdtemp(path.join(tmpdir(), "fake-qwen-"));
  const bin = path.join(dir, "qwen");
  await writeFile(bin, SCRIPT, "utf8");
  await chmod(bin, 0o755);
  process.env.FAKE_QWEN_DIR = dir;
  const fake: FakeQwen = {
    bin,
    dir,
    async script(replies) {
      await writeFile(path.join(dir, "replies.json"), JSON.stringify(replies), "utf8");
      await rm(path.join(dir, "count"), { force: true });
      await rm(path.join(dir, "argv.ndjson"), { force: true });
      await rm(path.join(dir, "prompts.ndjson"), { force: true });
      await rm(path.join(dir, "env.ndjson"), { force: true });
    },
    async argvs() {
      const body = await readFile(path.join(dir, "argv.ndjson"), "utf8").catch(() => "");
      return body
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as string[]);
    },
    async prompts() {
      const body = await readFile(path.join(dir, "prompts.ndjson"), "utf8").catch(() => "");
      return body
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as string);
    },
    async envs() {
      const body = await readFile(path.join(dir, "env.ndjson"), "utf8").catch(() => "");
      return body
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as Record<string, string | null>);
    },
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
  await fake.script([]);
  return fake;
}
