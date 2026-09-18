import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

/** Read before the modules that read it: config resolves its numbers at import. */
process.env.STUDIO_KILL_GRACE_MS = "300";
process.env.STUDIO_HOME = path.join(tmpdir(), `studio-cancel-${process.pid}`);

const { AgentRun, sweepOrphans } = await import("../src/agent");
const { tmpDir } = await import("../src/paths");

/**
 * Cancellation, tested against real processes rather than a mock.
 *
 * The design's own uncertainty is the thing under test. A `finally` never runs
 * under SIGKILL, so the browser the tool opens is not guaranteed to be closed
 * by the code that opened it, and the runner has two mechanisms: a signal to
 * the process group, and a sweep for anything that left the group. Both are
 * exercised here on processes this test starts, because the question — does
 * killing the group reach a grandchild that called `setsid` — has the same
 * answer for a Chromium as for a `node` that did the same thing.
 */

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const started: ChildProcess[] = [];

beforeAll(async () => {
  await mkdir(tmpDir("job-cancel"), { recursive: true });
});

afterEach(async () => {
  for (const child of started.splice(0)) {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          process.kill(child.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
  }
  await rm(process.env.STUDIO_HOME ?? "", { recursive: true, force: true });
});

describe("the process group kill", () => {
  it("takes the child and every descendant that stayed in its group", async () => {
    // A parent that starts a child of its own, the shape of `claude` running
    // `npm run canvas` running the tldrawkc CLI.
    const script = `
      const { spawn } = require("node:child_process");
      const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      process.stdout.write(JSON.stringify({ grandchild: grandchild.pid }) + "\\n");
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    started.push(child);

    let grandchild = 0;
    const run = new AgentRun(child, {
      jobId: "job-cancel",
      slug: "x",
      prompt: "",
      model: "sonnet",
      sessionId: "00000000-0000-4000-8000-000000000000",
      resume: false,
      onLine: (line) => {
        const parsed = JSON.parse(line) as { grandchild?: number };
        if (typeof parsed.grandchild === "number") grandchild = parsed.grandchild;
      },
    });

    await settle(500);
    expect(grandchild).toBeGreaterThan(0);
    expect(alive(grandchild)).toBe(true);

    await run.stop("cancelled");
    const outcome = await run.done;
    await settle(500);

    expect(outcome.stopReason).toBe("cancelled");
    expect(alive(child.pid ?? 0)).toBe(false);
    expect(alive(grandchild)).toBe(false);
  }, 20_000);

  it("does not reach a descendant that made a process group of its own", async () => {
    // This is the case Playwright creates: it launches the browser detached so
    // it can manage that tree itself, which puts the browser outside the
    // group the runner signals. Recording it as a test rather than a comment
    // is what keeps the sweep from looking like belt and braces it is not.
    const script = `
      const { spawn } = require("node:child_process");
      const escaped = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", detached: true });
      escaped.unref();
      process.stdout.write(JSON.stringify({ escaped: escaped.pid }) + "\\n");
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    started.push(child);

    let escaped = 0;
    const run = new AgentRun(child, {
      jobId: "job-cancel",
      slug: "x",
      prompt: "",
      model: "sonnet",
      sessionId: "00000000-0000-4000-8000-000000000000",
      resume: false,
      onLine: (line) => {
        const parsed = JSON.parse(line) as { escaped?: number };
        if (typeof parsed.escaped === "number") escaped = parsed.escaped;
      },
    });

    await settle(500);
    await run.stop("cancelled");
    await run.done;
    await settle(500);

    expect(alive(child.pid ?? 0)).toBe(false);
    expect(alive(escaped)).toBe(true);
    process.kill(escaped, "SIGKILL");
  }, 20_000);
});

describe("the orphan sweep", () => {
  it("kills anything still running out of the job's temporary directory", async () => {
    // Stands in for `chromium --user-data-dir=<TMPDIR>/playwright_…`: what makes
    // it findable is that the job's own path is on its command line, which is
    // why the runner points the agent's TMPDIR at the job workspace.
    const profile = path.join(tmpDir("job-cancel"), "playwright_chromiumdev_profile-abc");
    const orphan = spawn(
      process.execPath,
      // After `--`, node stops reading options and the rest lands in argv, so
      // the command line carries the profile path the way a browser's does.
      ["-e", "setInterval(() => {}, 1000)", "--", `--user-data-dir=${profile}`],
      { detached: true, stdio: "ignore" },
    );
    orphan.unref();
    started.push(orphan);

    await settle(300);
    expect(alive(orphan.pid ?? 0)).toBe(true);

    const swept = await sweepOrphans("job-cancel");
    await settle(300);

    expect(swept).toContain(orphan.pid);
    expect(alive(orphan.pid ?? 0)).toBe(false);
  }, 20_000);

  it("finds nothing when the job left nothing behind", async () => {
    expect(await sweepOrphans("job-with-no-processes")).toEqual([]);
  });
});
