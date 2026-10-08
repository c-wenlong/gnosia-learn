import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A stand-in `codex` for the Codex harness's tests, the way `fake-qwen.ts`
 * stands in for `qwen`: a real executable, spawned the way the runner spawns
 * the real one, that answers from a script. No test here ever reaches
 * OpenAI.
 *
 * Each spawn takes the next reply off `replies.json`, records its argv in
 * `argv.ndjson`, its stdin in `prompts.ndjson`, and the environment's seal
 * variables in `env.ndjson`, and prints the `--json` shape the real CLI
 * prints (measured on codex-cli 0.161.0): `thread.started` carrying the
 * `thread_id` a resume takes, `turn.started`, an `agent_message` item, and
 * `turn.completed`. A `refused` reply is the error event instead.
 */

/** The `thread_id` every spawn reports; the real CLI mints a UUID per thread. */
export const FAKE_CODEX_THREAD = "01234567-89ab-cdef-0123-456789abcdef";

export interface FakeCodexReply {
  /** The reply's text. */
  text?: string;
  /** A failed turn: an `error` event with this as the message, exit 1. */
  refused?: string;
}

const SCRIPT = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const dir = process.env.FAKE_CODEX_DIR;
const argv = process.argv.slice(2);
fs.appendFileSync(dir + "/argv.ndjson", JSON.stringify(argv) + "\n");
// The prompt arrives on stdin: the real CLI reads piped input headlessly.
const prompt = fs.readFileSync(0, "utf8");
fs.appendFileSync(dir + "/prompts.ndjson", JSON.stringify(prompt) + "\n");
// What the spawn's environment set, so a test can check the seal held.
fs.appendFileSync(dir + "/env.ndjson", JSON.stringify({
  openaiKey: process.env.OPENAI_API_KEY ?? null,
  openaiBase: process.env.OPENAI_BASE_URL ?? null,
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? null,
  home: process.env.HOME ?? null,
  codexHome: process.env.CODEX_HOME ?? null,
}) + "\n");
const replies = JSON.parse(fs.readFileSync(dir + "/replies.json", "utf8"));
const countFile = dir + "/count";
const n = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, "utf8")) : 0;
fs.writeFileSync(countFile, String(n + 1));
const reply = replies[Math.min(n, replies.length - 1)] || {};
const out = (event) => process.stdout.write(JSON.stringify(event) + "\n");
out({ type: "thread.started", thread_id: "01234567-89ab-cdef-0123-456789abcdef" });
out({ type: "turn.started" });
if (reply.refused) {
  out({ type: "error", message: reply.refused });
  process.exit(1);
}
out({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: reply.text || "" } });
out({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } });
process.exit(0);
`;

export interface FakeCodex {
  bin: string;
  dir: string;
  /** Replace the script of replies, and start counting spawns again. */
  script(replies: FakeCodexReply[]): Promise<void>;
  /** Every spawn's argv so far, oldest first. */
  argvs(): Promise<string[][]>;
  /** What each spawn read on stdin, oldest first. */
  prompts(): Promise<string[]>;
  /** The seal variables each spawn's environment carried, oldest first. */
  envs(): Promise<Record<string, string | null>[]>;
  cleanup(): Promise<void>;
}

export async function fakeCodex(): Promise<FakeCodex> {
  const dir = await mkdtemp(path.join(tmpdir(), "fake-codex-"));
  const bin = path.join(dir, "codex");
  await writeFile(bin, SCRIPT, "utf8");
  await chmod(bin, 0o755);
  process.env.FAKE_CODEX_DIR = dir;
  const fake: FakeCodex = {
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
