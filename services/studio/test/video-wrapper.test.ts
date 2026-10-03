import { execFile, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rebasePaths } from "../src/video/checkout";
import { stillWorking } from "../src/video/runner";
import { videoPaths, type VideoPaths } from "../src/video/paths";
import { writeWrapper, type WrapperConfig } from "../src/video/wrapper";

import { until } from "./wait";

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
    // A render that lasts until the test releases it, against a 100 ms window. A fixed sleep here was a
    // bet that the wrapper's own start fit inside it, which a loaded machine lost. The fake also ends
    // once the temp root is gone, so a failed run leaves nothing waiting behind it.
    const release = path.join(root, "release-render");
    const slow = path.join(root, "slow-sandbox-exec");
    await writeFile(
      slow,
      `#!${process.execPath}\nconst fs = require("node:fs");\nconst wait = () => (fs.existsSync(${JSON.stringify(release)}) || !fs.existsSync(${JSON.stringify(root)}) ? undefined : setTimeout(wait, 10));\nwait();\n`,
      "utf8",
    );
    await chmod(slow, 0o755);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: slow });
    const call = video(["lint"]);
    const markers = () => (existsSync(paths.inflight) ? readdirSync(paths.inflight) : []);
    await until(() => markers().length > 0, "the wrapper never wrote its in-flight marker", 15_000);
    // Renamed into place whole: only the marker, never the temporary file.
    expect((await readdir(paths.inflight)).every((name) => /^[0-9]+\.json$/.test(name))).toBe(true);
    expect(await readFile(paths.calls, "utf8").catch(() => "")).toBe("");
    expect(await stillWorking(paths, 100)).toBe(true);
    await writeFile(release, "", "utf8");
    expect((await call).code).toBe(0);
    // Ended: the marker is gone and the call's line is in calls.ndjson.
    expect(await readdir(paths.inflight)).toEqual([]);
    expect(await stillWorking(paths, 100, Date.now() + 1_000)).toBe(false);
  }, 30_000);

  it("relays a step's output as it comes, all of it, without stopping a step that says a lot", async () => {
    // 80 MiB on stdout, more than any buffer the wrapper could have held, then a last line on each stream.
    // The step also says what its own standard streams are: pipes of the wrapper's, never the file the
    // wrapper was given (the CLI runs Bash with stdout and stderr on a file the profiles refuse to read).
    const loud = path.join(root, "loud-sandbox-exec");
    await writeFile(
      loud,
      `#!${process.execPath}\nconst fs = require("node:fs");\nconst chunk = Buffer.alloc(1024 * 1024, 120);\nfor (let i = 0; i < 80; i++) fs.writeSync(1, chunk);\nprocess.stdout.write("\\nlast line\\n");\nconst kind = (fd) => (fs.fstatSync(fd).isFile() ? "a file" : "a stream");\nprocess.stderr.write("to stderr; stdout is " + kind(1) + ", stderr is " + kind(2) + "\\n");\n`,
      "utf8",
    );
    await chmod(loud, 0o755);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: loud });
    const out = path.join(root, "wrapper-out.txt");
    const err = path.join(root, "wrapper-err.txt");
    const outFd = openSync(out, "w");
    const errFd = openSync(err, "w");
    const result = spawnSync(paths.wrapper, ["api"], { stdio: ["ignore", outFd, errFd] });
    closeSync(outFd);
    closeSync(errFd);
    expect(result.status).toBe(0);
    expect(statSync(out).size).toBe(80 * 1024 * 1024 + "\nlast line\n".length);
    expect(readFileSync(err, "utf8")).toContain("to stderr; stdout is a stream, stderr is a stream");
    const [line] = (await readFile(paths.calls, "utf8")).trim().split("\n").map((entry) => JSON.parse(entry) as Record<string, unknown>);
    expect(line).toMatchObject({ verb: "api", exitCode: 0, steps: [{ step: "render", exitCode: 0 }] });
  });

  it("waits on a reader that is slow, and keeps the step going when its reader goes away", async () => {
    // 16 MiB, far past a pipe's buffer, so the wrapper's own stdout fills.
    const loud = path.join(root, "loud-sandbox-exec");
    await writeFile(loud, `#!${process.execPath}\nconst chunk = Buffer.alloc(1024 * 1024, 120);\nfor (let i = 0; i < 16; i++) require("node:fs").writeSync(1, chunk);\n`, "utf8");
    await chmod(loud, 0o755);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: loud });
    const { spawn } = await import("node:child_process");
    const run = (onStdout: (stream: NodeJS.ReadableStream) => void) =>
      new Promise<number | null>((resolve) => {
        const child = spawn(paths.wrapper, ["api"], { stdio: ["ignore", "pipe", "ignore"] });
        onStdout(child.stdout);
        child.on("close", (code) => resolve(code));
      });

    // A reader that waits a second before it reads: every byte still arrives.
    let bytes = 0;
    const slow = await run((stdout) => {
      stdout.pause();
      setTimeout(() => {
        stdout.on("data", (chunk: Buffer) => (bytes += chunk.length));
        stdout.resume();
      }, 1_000);
    });
    expect(slow).toBe(0);
    expect(bytes).toBe(16 * 1024 * 1024);

    // A reader that goes away at once: the step still finishes, the call is recorded, the marker removed.
    const gone = await run((stdout) => (stdout as unknown as { destroy(): void }).destroy());
    expect(gone).toBe(0);
    const lines = (await readFile(paths.calls, "utf8")).trim().split("\n").map((entry) => JSON.parse(entry) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines.at(-1)).toMatchObject({ verb: "api", exitCode: 0, steps: [{ step: "render", exitCode: 0 }] });
    expect(await readdir(paths.inflight)).toEqual([]);
  });

  it("keeps relaying stderr when only stdout's reader has gone", async () => {
    const both = path.join(root, "both-sandbox-exec");
    await writeFile(both, `#!${process.execPath}\nconst fs = require("node:fs");\nconst chunk = Buffer.alloc(1024 * 1024, 120);\nfor (let i = 0; i < 4; i++) fs.writeSync(1, chunk);\nfs.writeSync(2, "the last diagnostic\\n");\n`, "utf8");
    await chmod(both, 0o755);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: both });
    const { spawn } = await import("node:child_process");
    let stderr = "";
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(paths.wrapper, ["api"], { stdio: ["ignore", "pipe", "pipe"] });
      (child.stdout as unknown as { destroy(): void }).destroy();
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      child.on("close", (exit) => resolve(exit));
    });
    expect(code).toBe(0);
    expect(stderr).toContain("the last diagnostic");
  });

  it("records a step that fails to start, or is killed by a signal, as no exit code, and the call as 1", async () => {
    const dying = path.join(root, "dying-sandbox-exec");
    await writeFile(dying, `#!${process.execPath}\nprocess.kill(process.pid, "SIGKILL");\n`, "utf8");
    await chmod(dying, 0o755);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: dying });
    expect((await video(["lint"])).code).toBe(1);
    await writeWrapper(process.execPath, paths, { ...(await config()), sandboxExec: path.join(root, "no-such-program") });
    expect((await video(["lint"])).code).toBe(1);
    const lines = (await readFile(paths.calls, "utf8")).trim().split("\n").map((entry) => JSON.parse(entry) as { exitCode: number | null; steps: { exitCode: number | null; signal: string | null }[] });
    expect(lines.map((entry) => [entry.exitCode, entry.steps[0]?.exitCode, entry.steps[0]?.signal])).toEqual([[null, null, "SIGKILL"], [null, null, null]]);
    expect(await readdir(paths.inflight)).toEqual([]);
  });

  it("builds the whole topic with --no-register, since a job checkout has no README to register in", async () => {
    const result = await video(["build"]);
    expect(result.code).toBe(0);
    const calls = await sandboxCalls();
    expect(calls.at(-1)?.argv.slice(-5)).toEqual(["build", paths.topicDir, "--no-register", "--jobs", "2"]);
  });
});
