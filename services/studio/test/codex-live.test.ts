import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { codexEnv, codexSignedIn, sealCodexHome } from "../src/codex";
import { codexEvent, codexPlannerArgv } from "../src/planner";

/**
 * The installed `codex` itself, opt-in: `STUDIO_CODEX_LIVE=1` turns this on.
 * Every other Codex test runs against `fake-codex.ts`; this one asks the real
 * binary to take the runner's argv and seals and to print its first event —
 * `thread.started`, which precedes any model request — so the sandbox never
 * sees a paid call before the process is killed. Skipped entirely when no
 * codex login exists on the machine running it.
 *
 * Measured on codex-cli 0.161.0.
 */

const LIVE = process.env.STUDIO_CODEX_LIVE === "1";

(LIVE ? describe : describe.skip)("the installed codex (STUDIO_CODEX_LIVE=1)", () => {
  it("takes the runner's argv and reports its thread id first", async () => {
    if (!(await codexSignedIn(process.env))) {
      console.log("no codex login on this machine; skipping");
      return;
    }
    const tmp = await mkdtemp(path.join(tmpdir(), "codex-live-"));
    try {
      const home = await sealCodexHome(tmp, process.env);
      const systemFile = path.join(tmp, "planner-system.md");
      await writeFile(systemFile, "Answer briefly.", "utf8");
      const child = spawn("codex", codexPlannerArgv({ sessionId: "unused", resume: false, systemPromptFile: systemFile }), {
        cwd: tmp,
        env: codexEnv(process.env, tmp, home),
        stdio: ["pipe", "pipe", "ignore"],
      });
      try {
        const init = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
          let buffer = "";
          const timer = setTimeout(() => reject(new Error("codex printed no thread.started in 30s")), 30_000);
          child.stdout!.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            if (!buffer.includes("\n")) return;
            clearTimeout(timer);
            resolve(codexEvent(buffer.split("\n", 1)[0]!));
          });
          child.on("error", reject);
          child.stdin!.end("say hi\n");
        });
        // The translator makes it the init event `PlannerRun` waits for.
        expect(init).not.toBeNull();
        expect(init!.type).toBe("system");
        expect(init!.subtype).toBe("init");
        expect(typeof init!.session_id).toBe("string");
        expect(init!.tools).toEqual([]);
        expect(init!.mcp_servers).toEqual([]);
      } finally {
        child.kill("SIGTERM");
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 45_000);
});
