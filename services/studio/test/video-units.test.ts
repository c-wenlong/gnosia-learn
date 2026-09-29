import { execFileSync } from "node:child_process";
import { link, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import ignore from "ignore";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BriefError } from "../src/brief";
import { normalisePreference, readClaudeDefaults, resolveAgentSettings, resolveSetting } from "../src/video/agent-model";
import { predictedSeconds, validateVideoBrief } from "../src/video/brief";
import { ReadTracker } from "../src/video/calls";
import { rebasePaths } from "../src/video/checkout";
import { CopyRefused, safeCopy } from "../src/video/copy";
import { videoPaths, type VideoPaths } from "../src/video/paths";
import { buildProfile, renderJobs, sandboxEnv } from "../src/video/sandbox";
import { seedClips } from "../src/video/seed";
import { buildVideoSettings } from "../src/video/settings";
import type { Toolchain } from "../src/video/toolchain";

import { testVocabulary } from "./vocabulary";

/**
 * The video kind's pure parts: the gate's copy, the permission file, the
 * seeding, the model and effort resolution, the brief, and the profiles'
 * text. The parts that need a real sandbox are in `video-sandbox.test.ts`.
 */

let root: string;
let paths: VideoPaths;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "studio-video-units-"));
  process.env.STUDIO_HOME = path.join(root, "home");
  paths = rebasePaths(videoPaths("0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", "two-boxes"), path.join(root, "home", "jobs", "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  if (saved.STUDIO_HOME === undefined) delete process.env.STUDIO_HOME;
  else process.env.STUDIO_HOME = saved.STUDIO_HOME;
});

describe("the gate's copy", () => {
  it("copies a regular file once and hashes it", async () => {
    await writeFile(path.join(root, "a.mp4"), "bytes");
    const copied = await safeCopy(path.join(root, "a.mp4"), path.join(root, "out", "a.mp4"));
    expect(copied.bytes).toBe(5);
    expect(copied.sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(safeCopy(path.join(root, "a.mp4"), path.join(root, "out", "a.mp4"))).rejects.toMatchObject({ reason: "exists" });
  });

  it("refuses a symbolic link, a hard link and a non-regular file", async () => {
    await writeFile(path.join(root, "secret"), "outside");
    await symlink(path.join(root, "secret"), path.join(root, "sym.mp4"));
    await expect(safeCopy(path.join(root, "sym.mp4"), path.join(root, "o1"))).rejects.toBeInstanceOf(CopyRefused);
    await link(path.join(root, "secret"), path.join(root, "hard.mp4"));
    await expect(safeCopy(path.join(root, "hard.mp4"), path.join(root, "o2"))).rejects.toMatchObject({ reason: "linked" });
    execFileSync("mkfifo", [path.join(root, "fifo.mp4")]);
    await expect(safeCopy(path.join(root, "fifo.mp4"), path.join(root, "o3"))).rejects.toMatchObject({ reason: "not-regular" });
    await mkdir(path.join(root, "dir.mp4"));
    await expect(safeCopy(path.join(root, "dir.mp4"), path.join(root, "o4"))).rejects.toMatchObject({ reason: "not-regular" });
    expect((await readdir(root)).filter((name) => name.startsWith("o"))).toEqual([]);
  });
});

describe("the video agent's permission file", () => {
  it("allows one Bash prefix, edits the scene file only, and names no bare tool", () => {
    const settings = buildVideoSettings({ jobId: "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", paths, manimkcRoot: "/opt/manimkc", manimkcHome: "/opt/manimkc-home" });
    const { allow, deny } = settings.permissions;
    expect(allow.filter((rule) => rule.startsWith("Bash("))).toEqual([`Bash(${paths.wrapper}:*)`]);
    expect(allow.filter((rule) => rule.startsWith("Edit("))).toEqual([`Edit(/${paths.sceneFile})`]);
    expect(allow.every((rule) => rule.includes("("))).toBe(true);
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    expect(deny).toEqual(expect.arrayContaining(["WebFetch", "WebSearch", "Bash(python3:*)", "Bash(curl:*)", `Edit(/${paths.topicYml})`, "Read(//opt/manimkc/topics/**)", "Read(//opt/manimkc-home/**)"]));
    expect(deny).toContain(`Edit(/${paths.lib}/**)`);
    expect(deny).toContain(`Read(/${paths.bin}/**)`);
  });

  it("denies every other job's workspace and none of its own working directories", () => {
    const id = "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc";
    const settings = buildVideoSettings({ jobId: id, paths, manimkcRoot: "/opt/manimkc", manimkcHome: null });
    const home = process.env.STUDIO_HOME!;
    const globs = settings.permissions.deny
      .filter((rule) => rule.startsWith("Read(/") && rule.includes(`${home}/jobs/`))
      .map((rule) => rule.slice("Read(//".length, -1).slice(`${home}/`.slice(1).length));
    const matcher = ignore().add(globs);
    expect(matcher.ignores(`jobs/${id}/checkout/topics/studio/two-boxes/two_boxes.py`)).toBe(false);
    expect(matcher.ignores(`jobs/${id}/render/out/studio/two-boxes/scenes/TB1_A.sheet.png`)).toBe(false);
    expect(matcher.ignores("jobs/1f0f0f0f-aaaa-4bbb-8ccc-123456789abc/job.json")).toBe(true);
    expect(matcher.ignores(`jobs/${id}0/job.json`)).toBe(true);
  });
});

describe("seeding the job's TTS cache", () => {
  it("copies only the brief's clips the shared cache holds, and never writes the shared cache", async () => {
    const shared = path.join(root, "shared");
    await mkdir(shared, { recursive: true });
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]);
    await writeFile(path.join(shared, "aaaaaaaaaaaaaaaa.wav"), wav);
    await writeFile(path.join(shared, "cccccccccccccccc.wav"), wav);
    await symlink(path.join(root, "nowhere"), path.join(shared, "dddddddddddddddd.wav"));
    const before = await Promise.all((await readdir(shared)).map(async (name) => `${name}:${(await stat(path.join(shared, name)).catch(() => null))?.mtimeMs}`));
    const parent = path.join(root, "parent-clips");
    await mkdir(parent);
    await writeFile(path.join(parent, "eeeeeeeeeeeeeeee.wav"), wav);
    await writeFile(path.join(parent, "ffffffffffffffff.wav"), "not a wav");

    const result = await seedClips(paths, ["aaaaaaaaaaaaaaaa.wav", "bbbbbbbbbbbbbbbb.wav", "dddddddddddddddd.wav"], { shared, parentClips: parent });
    expect(result).toEqual({ wanted: 3, seeded: 1, fromShared: 1, fromParent: 1 });
    expect((await readdir(paths.audio)).sort()).toEqual(["aaaaaaaaaaaaaaaa.wav", "eeeeeeeeeeeeeeee.wav"]);
    const after = await Promise.all((await readdir(shared)).map(async (name) => `${name}:${(await stat(path.join(shared, name)).catch(() => null))?.mtimeMs}`));
    expect(after).toEqual(before);
  });
});

describe("the agent's model and effort", () => {
  it("passes a panel value, else the owner's Claude Code setting, else no flag", () => {
    expect(resolveSetting("opus", "claude-fable-5-1[1m]")).toEqual({ requested: "opus", passed: "opus", source: "panel" });
    expect(resolveSetting("default", "claude-fable-5-1[1m]")).toEqual({ requested: "default", passed: "claude-fable-5-1[1m]", source: "claude-settings" });
    expect(resolveSetting("default", null)).toEqual({ requested: "default", passed: null, source: "cli" });
  });

  it("reads model and effortLevel from the user settings file, and nothing it cannot pass", async () => {
    const file = path.join(root, "settings.json");
    await writeFile(file, JSON.stringify({ model: "claude-fable-5-1[1m]", effortLevel: "high", permissions: { allow: ["Bash"] } }));
    expect(await readClaudeDefaults(file)).toEqual({ model: "claude-fable-5-1[1m]", effort: "high" });
    await writeFile(file, JSON.stringify({ model: "sonnet; rm -rf /", effortLevel: "extreme" }));
    expect(await readClaudeDefaults(file)).toEqual({ model: null, effort: null });
    expect(await readClaudeDefaults(path.join(root, "missing.json"))).toEqual({ model: null, effort: null });
    const resolved = await resolveAgentSettings({ model: "default", effort: "max" }, { model: "claude-fable-5-1", effort: "high" });
    expect(resolved).toEqual({
      model: { requested: "default", passed: "claude-fable-5-1", source: "claude-settings" },
      effort: { requested: "max", passed: "max", source: "panel" },
    });
  });

  it("normalises a stored preference to default for anything missing or unusable", () => {
    expect(normalisePreference(null)).toEqual({ model: "default", effort: "default" });
    expect(normalisePreference({ model: "opus", effort: "xhigh" })).toEqual({ model: "opus", effort: "xhigh" });
    expect(normalisePreference({ model: "--dangerously", effort: 3 })).toEqual({ model: "default", effort: "default" });
  });
});

describe("the video brief", () => {
  const line = "A request starts at the client and ends at the database, and every step between is one box. ".repeat(3).trim();
  const base = (): Record<string, unknown> => ({
    title: "Two boxes",
    topic: "tcp-congestion-control",
    slug: "two-boxes",
    mode: "new",
    idea: "A request crosses an API.",
    audience: "familiar",
    targetSeconds: 60,
    voice: "af_heart",
    scenes: [
      { name: "why_it_matters", beats: [{ say: line, show: "two boxes", labels: ["Client"] }, { say: line, show: "an arrow", labels: [] }] },
      { name: "recap", beats: [{ say: line, show: "a recap", labels: [] }] },
    ],
    concepts: [],
  });

  it("takes a brief whose script fills its target", () => {
    const brief = validateVideoBrief(base(), testVocabulary());
    expect(Math.abs(predictedSeconds(brief) - 60)).toBeLessThan(12);
  });

  it("refuses a line that would end its literal, a script too short for its target, and an unknown voice", () => {
    const quote = base();
    (quote.scenes as { beats: { say: string }[] }[])[0]!.beats[0]!.say = 'She said "hi"';
    expect(() => validateVideoBrief(quote, testVocabulary())).toThrow(BriefError);
    const short = { ...base(), targetSeconds: 300 };
    expect(() => validateVideoBrief(short, testVocabulary())).toThrow(/add about \d+ characters or set targetSeconds/);
    expect(() => validateVideoBrief({ ...base(), voice: "zz_nobody" }, testVocabulary())).toThrow(/kokoro voice/);
    expect(() => validateVideoBrief({ ...base(), scenes: [(base().scenes as unknown[])[0]] }, testVocabulary())).toThrow(/2 to 8 scenes/);
  });
});

describe("the sandbox profiles", () => {
  const tools: Toolchain = {
    platform: "darwin",
    sandboxExec: "/usr/bin/sandbox-exec",
    manimkcRoot: "/opt/manimkc",
    ffmpeg: { link: "/opt/homebrew/bin/ffmpeg", real: "/opt/homebrew/Cellar/ffmpeg/9/bin/ffmpeg", home: "/opt/homebrew/Cellar/ffmpeg/9" },
    ffprobe: { link: "/opt/homebrew/bin/ffprobe", real: "/opt/homebrew/Cellar/ffmpeg/9/bin/ffprobe", home: "/opt/homebrew/Cellar/ffmpeg/9" },
    python3: { link: "/opt/homebrew/bin/python3", real: "/opt/homebrew/Cellar/python/3/bin/python3", home: "/opt/homebrew/Cellar/python/3" },
    venvPython: { link: "/opt/manimkc/.venv/bin/python", real: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12", home: "/Library/Frameworks/Python.framework" },
    ttsPython: null,
    node: "/usr/local/bin/node",
    hfHubCache: "/Users/me/.cache/huggingface/hub",
    kokoroModel: "/Users/me/.cache/huggingface/hub/models--hexgrad--Kokoro-82M",
    voicesInstalled: ["af_heart"],
    sharedAudioCache: null,
  };

  it("denies by default, opens no network, and writes only where each profile may", () => {
    const render = buildProfile("render", { tools, paths, home: "/Users/me" });
    expect(render).toContain("(deny default)");
    expect(render).not.toMatch(/network/);
    expect(render).toContain(`(allow file-write*\n  (subpath "${paths.render}")`);
    expect(render).not.toContain("Kokoro");
    const narrate = buildProfile("narrate", { tools, paths, home: "/Users/me" });
    expect(narrate).toContain(`(subpath "${tools.kokoroModel}")`);
    expect(narrate).toContain(`(subpath "${paths.audio}")`);
    expect(narrate).not.toContain(`(subpath "${paths.render}")\n  (literal "/dev/null")`);
    expect(narrate).not.toContain('"/bin/bash"');
    const gate = buildProfile("gate", { tools, paths, home: "/Users/me" });
    expect(gate).toContain(`(literal "${paths.poster}")`);
    expect(gate).not.toContain("python");
    expect(gate).not.toContain(paths.render);
    for (const profile of [render, narrate, gate]) {
      expect(profile).toContain('(deny file-write-create (vnode-type SYMLINK))');
      expect(profile).toContain('(global-name "com.apple.dnssd.service")');
    }
    expect(() => buildProfile("render", { tools, paths: { ...paths, render: '/tmp/a"b' }, home: "/Users/me" })).toThrow(/cannot go in a sandbox profile/);
  });

  it("builds every child's environment from nothing, with no key and no inherited PYTHONPATH", () => {
    process.env.PYTHONPATH = "/evil";
    const env = sandboxEnv("narrate", { tools, paths, home: "/Users/me", voice: "af_heart" });
    delete process.env.PYTHONPATH;
    expect(Object.keys(env).sort()).toEqual(
      ["HF_HOME", "HF_HUB_CACHE", "HF_HUB_OFFLINE", "HOME", "LANG", "MANIMKC_HOME", "MANIMKC_RENDER_JOBS", "MANIMKC_ROOT", "MPLCONFIGDIR", "NARRATION_BACKEND", "NARRATION_KOKORO_VOICE", "PATH", "TMPDIR", "TRANSFORMERS_OFFLINE"].sort(),
    );
    expect(env.HF_HOME?.startsWith(paths.renderTmp)).toBe(true);
    expect(Object.keys(sandboxEnv("gate", { tools, paths, home: "/Users/me", voice: "af_heart" })).sort()).toEqual(["HOME", "LANG", "PATH", "TMPDIR"]);
    expect(renderJobs(12, 24 * 2 ** 30)).toBe(4);
    expect(renderJobs(4, 8 * 2 ** 30)).toBe(1);
  });
});

describe("tracking Reads in the stream", () => {
  it("counts a Read once its result arrives without an error", () => {
    const tracker = new ReadTracker();
    const use = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/x/A.sheet.png" } }, { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/x/B.sheet.png" } }] } });
    expect(tracker.observe(use)).toEqual([]);
    const result = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1" }, { type: "tool_result", tool_use_id: "t2", is_error: true }] } });
    expect(tracker.observe(result)).toEqual(["/x/A.sheet.png"]);
  });
});

void readFile;
