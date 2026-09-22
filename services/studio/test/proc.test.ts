import { spawn, type ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { stopChild } from "../src/proc";

/**
 * Stopping a writer, against a real process that does not want to stop.
 *
 * The rest of this file deliberately avoids spawning anything, and this part
 * deliberately does not, because the bug it guards is entirely about a real
 * process's real exit. `stopChild` used to send `SIGTERM` and return, so accept
 * renamed the committed file with the mirror still up and able to save over it
 * (A6). Against a cooperative process that difference is microseconds and
 * invisible; against one that takes a moment to shut down it is the whole bug.
 * So these spawn a child that ignores `SIGTERM` for long enough to see.
 */
describe("waiting for a mirror's process to actually go", () => {
  const spawned: ChildProcess[] = [];

  afterEach(() => {
    for (const child of spawned) {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone, which is the outcome every test here wants */
      }
    }
    spawned.length = 0;
  });

  /**
   * Detached, like a real mirror: `stopChild` signals the process group, so a
   * child that is not a group leader would not be the thing under test.
   */
  async function stubborn(script: string): Promise<ChildProcess> {
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    spawned.push(child);
    // Wait for it to say so, or the signal can arrive before the handler that
    // ignores it is installed and the test passes for the wrong reason.
    await new Promise<void>((resolve) => child.stdout?.once("data", () => resolve()));
    return child;
  }

  it("does not resolve until the child has exited", async () => {
    const child = await stubborn(
      'process.on("SIGTERM", () => {}); setTimeout(() => process.exit(0), 250); console.log("up");',
    );
    let exitedAt: number | null = null;
    child.on("exit", () => {
      exitedAt = Date.now();
    });

    const started = Date.now();
    await expect(stopChild(child, 5_000)).resolves.toBe(true);

    // The assertion the old one-line `stop` fails: it returned while the child
    // was still running, so nothing had exited by the time accept renamed.
    expect(exitedAt).not.toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(child.exitCode).toBe(0);
  });

  it("escalates to SIGKILL when the grace runs out, and waits for that too", async () => {
    const child = await stubborn(
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); console.log("up");',
    );

    await expect(stopChild(child, 300)).resolves.toBe(true);
    expect(child.signalCode).toBe("SIGKILL");
  });

  it("returns straight away for a child that never got a pid", async () => {
    await expect(stopChild({ pid: undefined } as ChildProcess, 5_000)).resolves.toBe(true);
  });
});
