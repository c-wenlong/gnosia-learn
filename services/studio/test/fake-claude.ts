import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A stand-in `claude` for the planner's tests: a real executable, spawned
 * the way the runner spawns the real one, that answers from a script instead
 * of calling the API. No test here ever reaches Anthropic.
 *
 * Each spawn takes the next reply off `replies.json`, records its argv in
 * `argv.ndjson`, and prints the `stream-json` shape the installed CLI prints
 * (measured on 2.1.274): a `system/init` event, the text as
 * `stream_event` deltas, the `assistant` message with its usage, and a
 * `result` with `total_cost_usd`.
 */

export interface FakeReply {
  /** The reply's text. */
  text?: string;
  /** What the result event reports as `total_cost_usd`. */
  cost?: number;
  /** A refused first request: `is_error` with this as the result text, and no reply text. */
  refused?: string;
  /** What the init event lists, to break a seal. */
  tools?: string[];
  mcpServers?: unknown[];
  /** Wait this long before the result, printing the deltas first. */
  hangMs?: number;
  /** Stream this text, then end the session in an error with `failed` as its result. */
  failed?: string;
  /** Exit like a `--resume` of a session this machine does not have: stderr, exit 1, nothing on stdout. */
  noSession?: boolean;
}

const SCRIPT = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.FAKE_CLAUDE_DIR;
const argv = process.argv.slice(2);
fs.appendFileSync(dir + "/argv.ndjson", JSON.stringify(argv) + "\n");
// The real CLI reads the prompt from stdin under -p when no positional names one.
const prompt = fs.readFileSync(0, "utf8");
fs.appendFileSync(dir + "/prompts.ndjson", JSON.stringify(prompt) + "\n");
// The real CLI's option parser refuses anything after the flags that looks like
// one it does not know; so does this, so a prompt leaking into argv fails here too.
const known = new Set(["-p","--system-prompt-file","--tools","--strict-mcp-config","--mcp-config","--safe-mode","--disable-slash-commands","--setting-sources","--settings","--permission-prompts","--max-turns","--output-format","--verbose","--include-partial-messages","--model","--resume","--session-id"]);
const takesValue = new Set(["--system-prompt-file","--tools","--mcp-config","--setting-sources","--settings","--permission-prompts","--max-turns","--output-format","--model","--resume","--session-id"]);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!known.has(arg)) { process.stderr.write("error: unexpected argument " + JSON.stringify(arg) + "\n"); process.exit(1); }
  if (takesValue.has(arg)) i += 1;
}
// The real CLI (2.1.274) reads the system prompt file before any request, and
// stops with this line and exit 1 when it is not there.
const systemFile = argv.includes("--system-prompt-file") ? argv[argv.indexOf("--system-prompt-file") + 1] : null;
if (systemFile !== null) {
  if (!fs.existsSync(systemFile)) { process.stderr.write("Error: System prompt file not found: " + systemFile + "\n"); process.exit(1); }
  fs.appendFileSync(dir + "/systems.ndjson", JSON.stringify(fs.readFileSync(systemFile, "utf8")) + "\n");
}
const replies = JSON.parse(fs.readFileSync(dir + "/replies.json", "utf8"));
const countFile = dir + "/count";
const n = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, "utf8")) : 0;
fs.writeFileSync(countFile, String(n + 1));
const reply = replies[Math.min(n, replies.length - 1)] || {};
const out = (event) => process.stdout.write(JSON.stringify(event) + "\n");
if (reply.noSession && argv.includes("--resume")) {
  process.stderr.write("No conversation found with session ID: " + argv[argv.indexOf("--resume") + 1] + "\n");
  process.exit(1);
}
const session = argv.includes("--resume") ? argv[argv.indexOf("--resume") + 1] : argv[argv.indexOf("--session-id") + 1];
out({ type: "system", subtype: "init", session_id: session, tools: reply.tools || [], mcp_servers: reply.mcpServers || [], model: "claude-sonnet-5", apiKeySource: "none" });
const usage = { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1000 }, output_tokens: 5 };
const text = reply.refused ? "" : (reply.text || "");
const failed = reply.refused || reply.failed;
const finish = () => {
  if (text !== "") {
    out({ type: "assistant", message: { id: "msg_" + n, model: "claude-sonnet-5", role: "assistant", content: [{ type: "text", text }], usage } });
  }
  out({ type: "result", subtype: failed ? "error_during_execution" : "success", is_error: !!failed, result: failed || text, num_turns: 1, total_cost_usd: reply.cost === undefined ? 0.01 : reply.cost, usage });
  process.exit(0);
};
out({ type: "stream_event", event: { type: "message_start", message: { id: "msg_" + n, model: "claude-sonnet-5", usage } } });
const third = Math.ceil(text.length / 3);
for (let i = 0; i < text.length; i += third || 1) {
  out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + (third || 1)) } } });
}
if (reply.hangMs) setTimeout(finish, reply.hangMs);
else finish();
`;

export interface FakeClaude {
  bin: string;
  dir: string;
  /** Replace the script of replies, and start counting spawns again. */
  script(replies: FakeReply[]): Promise<void>;
  /** Every spawn's argv so far, oldest first. */
  argvs(): Promise<string[][]>;
  /** What each spawn read on stdin, oldest first. */
  prompts(): Promise<string[]>;
  /** The system prompt each spawn read from its `--system-prompt-file`, oldest first. */
  systems(): Promise<string[]>;
  cleanup(): Promise<void>;
}

export async function fakeClaude(): Promise<FakeClaude> {
  const dir = await mkdtemp(path.join(tmpdir(), "fake-claude-"));
  const bin = path.join(dir, "claude");
  await writeFile(bin, SCRIPT, "utf8");
  await chmod(bin, 0o755);
  process.env.FAKE_CLAUDE_DIR = dir;
  const fake: FakeClaude = {
    bin,
    dir,
    async script(replies) {
      await writeFile(path.join(dir, "replies.json"), JSON.stringify(replies), "utf8");
      await rm(path.join(dir, "count"), { force: true });
      await rm(path.join(dir, "argv.ndjson"), { force: true });
      await rm(path.join(dir, "prompts.ndjson"), { force: true });
      await rm(path.join(dir, "systems.ndjson"), { force: true });
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
    async systems() {
      const body = await readFile(path.join(dir, "systems.ndjson"), "utf8").catch(() => "");
      return body
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as string);
    },
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
  await fake.script([]);
  return fake;
}

/** A reply that proposes `brief`, as the planner prompt asks: a summary, then one fenced block. */
export function proposing(brief: Record<string, unknown>, extra = ""): string {
  return `Here is the brief: ${String(brief.title)}.${extra}\n\n\`\`\`brief\n${JSON.stringify(brief)}\n\`\`\``;
}
