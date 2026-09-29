import { spawn } from "node:child_process";

import { stopChild } from "../proc";
import { sandboxed, sandboxEnv, type ProfileKind } from "./sandbox";
import type { VideoPaths } from "./paths";
import type { Toolchain } from "./toolchain";

/**
 * The runner's own sandboxed calls: the gate's lint, scan, probe and poster,
 * the clip keys, the doctor's fixture. The agent's calls go through the
 * wrapper instead, which does the same thing in its own process.
 */

export interface SandboxRun {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Raw stdout, for a caller that reads bytes. */
  bytes: Buffer;
  timedOut: boolean;
}

export interface SandboxCall {
  tools: Toolchain;
  paths: VideoPaths;
  home: string;
  voice: string;
  kind: ProfileKind;
  /** The profile file on disk, already written. */
  profile: string;
  argv: string[];
  cwd: string;
  stdin?: string;
  timeoutMs?: number;
  /** Kept to this many bytes, the tail. */
  maxOutput?: number;
}

export function runSandboxed(call: SandboxCall): Promise<SandboxRun> {
  const argv = sandboxed(call.tools, call.profile, call.argv);
  const env = sandboxEnv(call.kind, { tools: call.tools, paths: call.paths, home: call.home, voice: call.voice });
  const limit = call.maxOutput ?? 16 * 2 ** 20;
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: call.cwd,
      env,
      stdio: [call.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      detached: true,
    });
    const out: Buffer[] = [];
    let outSize = 0;
    let stderr = "";
    let timedOut = false;
    child.stdout?.on("data", (chunk: Buffer) => {
      outSize += chunk.length;
      if (outSize <= limit) out.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-20_000);
    });
    if (call.stdin !== undefined) {
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(call.stdin);
    }
    const timer =
      call.timeoutMs === undefined
        ? null
        : setTimeout(() => {
            timedOut = true;
            void stopChild(child);
          }, call.timeoutMs);
    child.on("error", (error) => {
      if (timer !== null) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer !== null) clearTimeout(timer);
      const bytes = Buffer.concat(out);
      resolve({ code, stdout: bytes.toString("utf8"), stderr, bytes, timedOut });
    });
  });
}
