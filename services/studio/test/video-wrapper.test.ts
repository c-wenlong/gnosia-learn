import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rebasePaths } from "../src/video/checkout";
import { stillWorking } from "../src/video/runner";
import { videoPaths, type VideoPaths } from "../src/video/paths";
import { writeWrapper, type WrapperConfig } from "../src/video/wrapper";

/**
 * The wrapper, run for real with a stand-in `sandbox-exec` that records what
 * it was asked to run and with what environment: every verb and name outside
 * its lists refused without echoing it, every child's environment built from
 * the compiled-in allowlist whatever the caller exported, and one line per
 * call in `calls.ndjson`.
 *
 * macOS only: the wrapper's first line is `#!/usr/bin/env -i <node>`, which
 * relies on the kernel splitting a shebang on spaces, as macOS does and Linux
 * does not (and the video kind is off on Linux, V4).
 */

const execFileAsync = promisify(execFile);
let root: string;
let paths: VideoPaths;
let record: string;

async function config(): Promise<WrapperConfig> {
  const fake = path.join(root, "fake-sandbox-exec");
  record = path.join(root, "sandbox-calls.ndjson");
  await writeFile(
    fake,
    `#!${process.execPath}\nrequire("node:fs").appendFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }) + "\\n");\n`,
    "utf8",
  );
  await chmod(fake, 0o755);
  return {
    jobId: "job",
    sandboxExec: fake,
    python3: "/usr/bin/python3",
    checkout: paths.checkout,
    sceneFile: paths.sceneFile,
    topicDir: paths.topicDir,
    calls: paths.calls,
    inflight: paths.inflight,
    profiles: { render: paths.renderProfile, narrate: paths.narrateProfile },
    env: { render: { PATH: "/usr/bin:/bin", MANIMKC_HOME: paths.render }, narrate: { PATH: "/usr/bin:/bin", HF_HUB_OFFLINE: "1" } },
    scenes: ["TB1_WhyItMatters", "TB2_Recap"],
    apiNames: ["DataTable", "labeled_box"],
    narrated: true,
    sheets: { TB1_WhyItMatters: path.join(paths.scenes, "TB1_WhyItMatters.sheet.png"), TB2_Recap: path.join(paths.scenes, "TB2_Recap.sheet.png") },
    deliverable: paths.deliverable,
    jobs: 2,
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "studio-video-wrapper-"));
  paths = rebasePaths(videoPaths("job", "two-boxes"), root);
  await mkdir(paths.topicDir, { recursive: true });
  await writeFile(paths.sceneFile, "print('scene')\n", "utf8");
  await writeWrapper(process.execPath, paths, await config());
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function video(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(paths.wrapper, args, { env });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

async function sandboxCalls(): Promise<{ argv: string[]; env: Record<string, string> }[]> {
  const body = await readFile(record, "utf8").catch(() => "");
  return body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { argv: string[]; env: Record<string, string> });
}

describe.skipIf(process.platform !== "darwin")("the wrapper", () => {
  it("is read-and-execute only", async () => {
    expect((await stat(paths.wrapper)).mode & 0o777).toBe(0o555);
  });

  it("refuses any verb, name or scene outside its lists, and never repeats what it was passed", async () => {
    for (const args of [["rm", "-rf", "/"], ["preview", "TB9_Evil"], ["api", "os.system"], ["lint", "--root", "/tmp"], ["build", "TB1_WhyItMatters"], ["preview", "TB1_WhyItMatters", "TB1_WhyItMatters"]]) {
      const result = await video(args);
      expect(result.code).toBe(2);
      for (const arg of args.slice(1)) expect(`${result.stdout}${result.stderr}`).not.toContain(arg);
    }
    expect(await sandboxCalls()).toEqual([]);
    const calls = (await readFile(paths.calls, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { verb: string });
    expect(calls.every((call) => call.verb === "refused")).toBe(true);
    expect(await readFile(paths.calls, "utf8")).not.toContain("TB9_Evil");
  });

  it("builds the child's environment from nothing, whatever the caller exported", async () => {
    const result = await video(["lint"], { ...process.env, PYTHONPATH: "/evil", NODE_OPTIONS: `--require ${paths.sceneFile}`, ANTHROPIC_API_KEY: "sk-leak" });
    expect(result.code).toBe(0);
    const [call] = await sandboxCalls();
    expect(call?.argv).toEqual(["-f", paths.renderProfile, "/usr/bin/python3", `${paths.checkout}/tools/cli/manimkc`, "--root", paths.checkout, "lint", paths.sceneFile]);
    expect(call?.env.PYTHONPATH).toBeUndefined();
    expect(call?.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(call?.env.MANIMKC_HOME).toBe(paths.render);
  });

  it("voices under the narration profile before a preview, and records the call", async () => {
    const result = await video(["preview", "TB2_Recap"]);
    expect(result.code).toBe(0);
    const calls = await sandboxCalls();
    expect(calls.map((call) => call.argv[1])).toEqual([paths.narrateProfile, paths.renderProfile]);
    expect(calls[0]?.argv.slice(2)).toEqual([`${paths.checkout}/.venv/bin/python`, "lib/narration.py", paths.sceneFile]);
    expect(calls[0]?.env).toEqual({ PATH: "/usr/bin:/bin", HF_HUB_OFFLINE: "1", ...(calls[0]?.env.__CF_USER_TEXT_ENCODING === undefined ? {} : { __CF_USER_TEXT_ENCODING: calls[0]!.env.__CF_USER_TEXT_ENCODING }) });
    expect(calls[1]?.argv.slice(-6)).toEqual(["preview", paths.sceneFile, "TB2_Recap", "--no-narration", "--jobs", "2"]);
    const [line] = (await readFile(paths.calls, "utf8")).trim().split("\n").map((entry) => JSON.parse(entry) as Record<string, unknown>);
    expect(line).toMatchObject({ verb: "preview", scenes: ["TB2_Recap"], exitCode: 0, rendered: [] });
    expect(line?.sceneSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("marks a call in flight while it renders, so a short hang window does not read it as silence", async () => {
    // A render that takes a second and a half, against a 100 ms window.
    const slow = path.join(root, "slow-sandbox-exec");
    await writeFile(slow, `#!${process.execPath}\nsetTimeout(() => {}, 1500);\n`, "utf8");
    await chmod(slow, 0o755);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: slow });
    const call = video(["lint"]);
    let seen = false;
    for (let waited = 0; waited < 1200 && !seen; waited += 50) {
      seen = (await readdir(paths.inflight).catch(() => [] as string[])).length > 0;
      if (!seen) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(seen).toBe(true);
    expect(await readFile(paths.calls, "utf8").catch(() => "")).toBe("");
    expect(await stillWorking(paths, 100)).toBe(true);
    expect((await call).code).toBe(0);
    // Ended: the marker is gone and the call's line is in calls.ndjson.
    expect(await readdir(paths.inflight)).toEqual([]);
    expect(await stillWorking(paths, 100, Date.now() + 1_000)).toBe(false);
  });

  it("builds the whole topic with --no-register, since a job checkout has no README to register in", async () => {
    const result = await video(["build"]);
    expect(result.code).toBe(0);
    const calls = await sandboxCalls();
    expect(calls.at(-1)?.argv.slice(-5)).toEqual(["build", paths.topicDir, "--no-register", "--jobs", "2"]);
  });
});
