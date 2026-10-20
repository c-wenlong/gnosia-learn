import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { byokEnv } from "../src/agent/byok";
import { qwenPlannerArgv } from "../src/drafts/planner";

/**
 * The installed `qwen` itself, opt-in: `STUDIO_QWEN_LIVE=1` turns this on.
 * Every other BYOK test runs against `fake-qwen.ts`; this one asks the real
 * binary to take the runner's argv and seals and to print its init event,
 * which it does before any provider request — so the key is fake, the
 * endpoint unreachable, and no request leaves the machine. The process is
 * killed as soon as the init line arrives.
 *
 * Measured on Qwen Code 0.25.0.
 */

const LIVE = process.env.STUDIO_QWEN_LIVE === "1";

(LIVE ? describe : describe.skip)("the installed qwen (STUDIO_QWEN_LIVE=1)", () => {
  it("takes the runner's argv and reports an empty tools and MCP list", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "qwen-live-"));
    try {
      const systemFile = path.join(home, "planner-system.md");
      await writeFile(systemFile, "Answer briefly.", "utf8");
      const env = byokEnv(process.env, { provider: "openrouter", apiKey: "sk-none", model: "test-model" }, home, systemFile);
      // An endpoint nothing can answer on, so even a raced request fails at
      // once rather than reaching a provider.
      env.OPENAI_BASE_URL = "http://127.0.0.1:9";
      const child = spawn("qwen", qwenPlannerArgv({ sessionId: randomUUID(), resume: false, model: "test-model" }), {
        cwd: home,
        env,
        stdio: ["pipe", "pipe", "ignore"],
      });
      try {
        const init = await new Promise<Record<string, unknown>>((resolve, reject) => {
          let buffer = "";
          const timer = setTimeout(() => reject(new Error("qwen printed no init event in 30s")), 30_000);
          child.stdout!.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            const line = buffer.split("\n", 1)[0]!;
            if (!buffer.includes("\n")) return;
            clearTimeout(timer);
            resolve(JSON.parse(line));
          });
          child.on("error", reject);
          child.stdin!.end("say hi\n");
        });
        expect(init.type).toBe("system");
        expect(init.subtype).toBe("init");
        expect(init.tools).toEqual([]);
        expect(init.mcp_servers).toEqual([]);
      } finally {
        child.kill("SIGTERM");
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 45_000);
});
