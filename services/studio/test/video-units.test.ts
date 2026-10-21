import { execFileSync } from "node:child_process";
import { link, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import ignore from "ignore";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BriefError } from "../src/brief";
import { normalisePreference, readClaudeDefaults, resolveAgentSettings, resolveSetting } from "../src/video/agent-model";
import { predictedSeconds, validateVideoBrief } from "../src/video/brief";
import { buildSettings } from "../src/settings";
import { commandPathProblem, GUARD_REFUSAL, guardSource, wrapperCommandAllowed } from "../src/video/bash-guard";
import { runVideoDoctor } from "../src/video/doctor";
import { appendRead, LineQueue, readReads, ReadTracker } from "../src/video/calls";
import { prefixFor, rebasePaths } from "../src/video/checkout";
import { CopyRefused, safeCopy } from "../src/video/copy";
import { videoPaths, type VideoPaths } from "../src/video/paths";
import { buildProfile, renderJobs, sandboxEnv } from "../src/video/sandbox";
import { keepClips, keysFromReply, seedClips } from "../src/video/seed";
import { buildVideoSettings } from "../src/video/settings";
import { deriveSteps, type StepFacts } from "../src/video/steps";
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
    const settings = buildVideoSettings({ jobId: "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", paths, manimkcRoot: "/opt/manimkc", manimkcHome: "/opt/manimkc-home", guard: "/usr/local/bin/node /x/bin/bash-guard.cjs" });
    const { allow, deny } = settings.permissions;
    expect(allow.filter((rule) => rule.startsWith("Bash("))).toEqual([`Bash(${paths.wrapper}:*)`]);
    expect(allow.filter((rule) => rule.startsWith("Edit("))).toEqual([`Edit(/${paths.sceneFile})`]);
    expect(allow.every((rule) => rule.includes("("))).toBe(true);
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    expect(deny).toEqual(expect.arrayContaining(["WebFetch", "WebSearch", "Bash(python3:*)", "Bash(curl:*)", `Edit(/${paths.topicYml})`, "Read(//opt/manimkc/topics/**)", "Read(//opt/manimkc-home/**)"]));
    expect(deny).toContain(`Edit(/${paths.lib}/**)`);
    expect(deny).toContain(`Read(/${paths.bin}/**)`);
    expect(settings.hooks).toEqual({ PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/usr/local/bin/node /x/bin/bash-guard.cjs" }] }] });
    // The diagram agent's file carries its own guard, in the same block.
    expect(buildSettings({ jobId: "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", slug: "two-boxes", guard: "/usr/local/bin/node /x/bash-guard.cjs" }).hooks).toEqual({ PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/usr/local/bin/node /x/bash-guard.cjs" }] }] });
  });

  it("denies every other job's workspace and none of its own working directories", () => {
    const id = "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc";
    const settings = buildVideoSettings({ jobId: id, paths, manimkcRoot: "/opt/manimkc", manimkcHome: null, guard: "/usr/local/bin/node /x/bin/bash-guard.cjs" });
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

describe("paths the one command cannot carry", () => {
  it("names a space, or any other character that needs quoting, in the studio home or node's path", () => {
    expect(commandPathProblem("/Users/me/.gnosia/studio", "/opt/homebrew/bin/node")).toBeNull();
    expect(commandPathProblem("/Users/me/My Studio", "/opt/homebrew/bin/node")).toBe("the studio home path contains a space; video jobs need a path without one (/Users/me/My Studio)");
    expect(commandPathProblem("/Users/me/studio's", "/opt/homebrew/bin/node")).toMatch(/^the studio home path contains a character other than/);
    expect(commandPathProblem("/Users/me/studio", "/Applications/My Node/node")).toBe("the node path contains a space; video jobs need a path without one (/Applications/My Node/node)");
  });

  it("fails the video doctor, so health says so and no job is queued, before any setup runs", async () => {
    const saved = { MANIMKC_ROOT: process.env.MANIMKC_ROOT };
    process.env.STUDIO_HOME = path.join(root, "My Studio");
    process.env.MANIMKC_ROOT = path.join(root, "no-manimkc");
    try {
      const report = await runVideoDoctor();
      expect(report.ok).toBe(false);
      expect(report.checks).toContainEqual({ name: "studio home", ok: false, detail: `the studio home path contains a space; video jobs need a path without one (${path.join(root, "My Studio")})` });
      // A plain name that is a link to a folder with a space: every job path
      // is resolved, so it is refused too, by its resolved spelling.
      await mkdir(path.join(root, "Linked Studio"));
      await symlink(path.join(root, "Linked Studio"), path.join(root, "studio-link"));
      process.env.STUDIO_HOME = path.join(root, "studio-link");
      const linked = await runVideoDoctor();
      expect(linked.checks.find((check) => check.name === "studio home")?.detail).toMatch(/^the studio home path contains a space; video jobs need a path without one \(.*Linked Studio\)$/);
    } finally {
      if (saved.MANIMKC_ROOT === undefined) delete process.env.MANIMKC_ROOT;
      else process.env.MANIMKC_ROOT = saved.MANIMKC_ROOT;
    }
  }, 60_000);
});

describe("the video agent's Bash guard", () => {
  const wrapper = "/srv/studio/jobs/j1/bin/video";
  const allowed = [`${wrapper} lint`, `${wrapper}`, `${wrapper} preview TB1_WhyItMatters TB2_Recap`, `${wrapper} api ACCENT labeled_box`, `  ${wrapper} build  `];
  // Every form the review named, each spelling the CLI was measured to treat
  // differently, and the rest a shell could make of one line.
  const refused = [
    `${wrapper} lint $(cat /x)`,
    `${wrapper} lint $(/bin/cat /x)`,
    `${wrapper} lint \`grep x /y\``,
    `${wrapper} lint <(grep x /y)`,
    `${wrapper} lint >(tee /y)`,
    `${wrapper} lint; grep x /y`,
    `${wrapper} lint && /bin/cat /x`,
    `${wrapper} lint || grep x /y`,
    `${wrapper} lint | base64`,
    `${wrapper} lint\ngrep x /y`,
    `${wrapper} lint > /tmp/out`,
    `${wrapper} lint &`,
    `${wrapper} lint $HOME`,
    `${wrapper} lint "a b"`,
    `${wrapper} lint *`,
    `${wrapper}x lint`,
    `/srv/studio/jobs/j2/bin/video lint`,
    `cd /tmp && ${wrapper} lint`,
    `NODE_OPTIONS=x ${wrapper} lint`,
    "/bin/cat /x",
    "grep x /y",
  ];

  it("allows the wrapper with plain words after it, and nothing else", () => {
    for (const command of allowed) expect({ command, ok: wrapperCommandAllowed(command, wrapper) }).toEqual({ command, ok: true });
    for (const command of refused) expect({ command, ok: wrapperCommandAllowed(command, wrapper) }).toEqual({ command, ok: false });
  });

  it("runs as the hook the CLI calls: exit 2 with a fixed sentence to refuse, and closed on anything it cannot read", async () => {
    const file = path.join(root, "bash-guard.cjs");
    await writeFile(file, guardSource(wrapper), "utf8");
    const call = (stdin: string): { code: number; stderr: string } => {
      try {
        execFileSync(process.execPath, [file], { input: stdin, stdio: ["pipe", "pipe", "pipe"] });
        return { code: 0, stderr: "" };
      } catch (error) {
        const failed = error as { status: number; stderr: Buffer };
        return { code: failed.status, stderr: failed.stderr.toString() };
      }
    };
    const bash = (command: string): string => JSON.stringify({ session_id: "s", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    for (const command of allowed) expect({ command, ...call(bash(command)) }).toEqual({ command, code: 0, stderr: "" });
    for (const command of refused) {
      const result = call(bash(command));
      expect({ command, code: result.code }).toEqual({ command, code: 2 });
      expect(result.stderr).toBe(`${GUARD_REFUSAL}\n`);
    }
    expect(call("not json").code).toBe(2);
    expect(call(JSON.stringify({ tool_name: "Bash", tool_input: {} })).code).toBe(2);
    expect(call(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "/x" } })).code).toBe(0);
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
    expect(result).toEqual({ wanted: 3, seeded: 1, fromShared: 1, fromParent: 1, timed: 0 });
    expect((await readdir(paths.audio)).sort()).toEqual(["aaaaaaaaaaaaaaaa.wav", "eeeeeeeeeeeeeeee.wav"]);
    const after = await Promise.all((await readdir(shared)).map(async (name) => `${name}:${(await stat(path.join(shared, name)).catch(() => null))?.mtimeMs}`));
    expect(after).toEqual(before);
  });

  it("brings each seeded clip's word times with it, when they parse, and none for a clip it did not seed", async () => {
    const shared = path.join(root, "shared");
    const parent = path.join(root, "parent-clips");
    await mkdir(shared, { recursive: true });
    await mkdir(parent, { recursive: true });
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]);
    const times = JSON.stringify({ source: "kokoro", duration: 1.2, words: [{ word: "miss", start: 0.1, end: 0.4 }] });
    // In the shared cache: a clip with its times, a clip whose times do not parse, and times with no clip.
    await writeFile(path.join(shared, "aaaaaaaaaaaaaaaa.wav"), wav);
    await writeFile(path.join(shared, "aaaaaaaaaaaaaaaa.words.json"), times);
    await writeFile(path.join(shared, "cccccccccccccccc.wav"), wav);
    await writeFile(path.join(shared, "cccccccccccccccc.words.json"), '{"source": "kokoro", "words": "not a list"}');
    await writeFile(path.join(shared, "bbbbbbbbbbbbbbbb.words.json"), times);
    // A hard-linked shared clip is still seeded, as gnosia-audio lets a caller link one.
    await link(path.join(shared, "aaaaaaaaaaaaaaaa.words.json"), path.join(root, "a-link"));
    // A parent's kept clip, with its times, and a parent clip whose times are someone else's link.
    await writeFile(path.join(parent, "eeeeeeeeeeeeeeee.wav"), wav);
    await writeFile(path.join(parent, "eeeeeeeeeeeeeeee.words.json"), times);
    await writeFile(path.join(parent, "9999999999999999.wav"), wav);
    await symlink(path.join(shared, "aaaaaaaaaaaaaaaa.words.json"), path.join(parent, "9999999999999999.words.json"));

    const result = await seedClips(paths, ["aaaaaaaaaaaaaaaa.wav", "bbbbbbbbbbbbbbbb.wav", "cccccccccccccccc.wav", "eeeeeeeeeeeeeeee.wav"], { shared, parentClips: parent });
    expect(result).toEqual({ wanted: 4, seeded: 3, fromShared: 2, fromParent: 2, timed: 2 });
    expect((await readdir(paths.audio)).sort()).toEqual([
      "9999999999999999.wav",
      "aaaaaaaaaaaaaaaa.wav",
      "aaaaaaaaaaaaaaaa.words.json",
      "cccccccccccccccc.wav",
      "eeeeeeeeeeeeeeee.wav",
      "eeeeeeeeeeeeeeee.words.json",
    ]);
    expect(await readFile(path.join(paths.audio, "aaaaaaaaaaaaaaaa.words.json"), "utf8")).toBe(times);
  });

  it("keeps the final source's clips with their word times, for a change job", async () => {
    await mkdir(paths.audio, { recursive: true });
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]);
    const times = JSON.stringify({ source: "estimate", duration: 1, words: [] });
    await writeFile(path.join(paths.audio, "aaaaaaaaaaaaaaaa.wav"), wav);
    await writeFile(path.join(paths.audio, "aaaaaaaaaaaaaaaa.words.json"), times);
    await writeFile(path.join(paths.audio, "bbbbbbbbbbbbbbbb.wav"), wav);
    await writeFile(path.join(paths.audio, "bbbbbbbbbbbbbbbb.words.json"), "{");
    await writeFile(path.join(paths.audio, "cccccccccccccccc.wav"), wav);
    expect(await keepClips(paths, ["aaaaaaaaaaaaaaaa.wav", "bbbbbbbbbbbbbbbb.wav"])).toBe(2);
    expect((await readdir(paths.clips)).sort()).toEqual(["aaaaaaaaaaaaaaaa.wav", "aaaaaaaaaaaaaaaa.words.json", "bbbbbbbbbbbbbbbb.wav"]);
  });
});

describe("naming the clips through gnosia-audio's keys reply", () => {
  const audio = "/private/tmp/job/render/cache/audio";
  const reply = (body: unknown, code = 0) => ({ code, stdout: JSON.stringify(body), stderr: "" });

  it("takes each clip's name from its path in this job's audio cache", () => {
    const lines = [
      { text: "One.", spoken: "One.", key: "0123456789abcdef", clip: `${audio}/0123456789abcdef.wav`, cached: false },
      { text: "Two.", spoken: "Two.", key: "fedcba9876543210", clip: `${audio}/fedcba9876543210.wav`, cached: true },
    ];
    expect(keysFromReply(reply({ schema: 1, version: "0.1.0", lines }), 2, audio)).toEqual(["0123456789abcdef.wav", "fedcba9876543210.wav"]);
  });

  it("refuses a reply it cannot trust: another schema, an error, a count or name that does not fit, or another cache", () => {
    const one = [{ clip: `${audio}/0123456789abcdef.wav` }];
    expect(() => keysFromReply(reply({ schema: 2, lines: one }), 1, audio)).toThrow(/schema 2/);
    expect(() => keysFromReply(reply({ schema: 1, error: { kind: "request", message: "lines must be non-empty strings" } }, 2), 1, audio)).toThrow(/non-empty strings/);
    expect(() => keysFromReply(reply({ schema: 1, lines: one }), 2, audio)).toThrow(/shape/);
    expect(() => keysFromReply(reply({ schema: 1, lines: [{ clip: `${audio}/../x.wav` }] }), 1, audio)).toThrow(/shape/);
    expect(() => keysFromReply(reply({ schema: 1, lines: [{ clip: "/Users/me/.gnosia/manimkc/cache/audio/0123456789abcdef.wav" }] }), 1, audio)).toThrow(/not this job's audio cache/);
    expect(() => keysFromReply({ code: 1, stdout: "Traceback", stderr: "ModuleNotFoundError: No module named 'gnosia_audio'" }, 1, audio)).toThrow(/gnosia_audio/);
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
    // About 55 seconds of lines: never told to set a target the range refuses.
    expect(() => validateVideoBrief(short, testVocabulary())).toThrow(/add about \d+ characters; a video is at least 60 seconds, so the lines must fill a minute$/);
    const doubled = base();
    for (const scene of doubled.scenes as { beats: { say: string }[] }[]) for (const beat of scene.beats) beat.say = `${beat.say} ${beat.say}`;
    expect(() => validateVideoBrief(doubled, testVocabulary())).toThrow(/cut about \d+ characters or set targetSeconds to \d+$/);
    expect(() => validateVideoBrief({ ...base(), targetSeconds: 45 }, testVocabulary())).toThrow(/at least a minute and at most ten/);
    expect(() => validateVideoBrief({ ...base(), voice: "zz_nobody" }, testVocabulary())).toThrow(/kokoro voice/);
    expect(() => validateVideoBrief({ ...base(), scenes: [(base().scenes as unknown[])[0]] }, testVocabulary())).toThrow(/2 to 8 scenes/);
  });

  it("keeps a model the conversation's picker stamped (D90), and refuses one the CLI would not take", () => {
    expect(validateVideoBrief({ ...base(), model: "fable" }, testVocabulary()).model).toBe("fable");
    expect(validateVideoBrief({ ...base() }, testVocabulary())).not.toHaveProperty("model");
    expect(() => validateVideoBrief({ ...base(), model: "opus; rm -rf /" }, testVocabulary())).toThrow(/model/);
    expect(() => validateVideoBrief({ ...base(), model: 7 }, testVocabulary())).toThrow(/model/);
  });
});

describe("the sandbox profiles", () => {
  const tools: Toolchain = {
    platform: "darwin",
    sandboxKind: "seatbelt",
    sandboxExec: "/usr/bin/sandbox-exec",
    libs: [],
    manimkcRoot: "/opt/manimkc",
    manimkcDirs: { manim: "/opt/manimkc/manim", venv: "/opt/manimkc/.venv", venvTts: "/opt/manimkc/.venv-tts", tools: "/opt/manimkc/tools" },
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
    narration: null,
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
      // No filterless allow of anything but the process basics: a bare
      // mach-lookup let a background NSURLSession out, a bare metadata read
      // was a stat oracle over the owner's home.
      expect(profile).not.toMatch(/\(allow mach-lookup\)/);
      expect(profile).not.toMatch(/\(allow file-read-metadata\)/);
      expect(profile).not.toContain("com.apple.nsurlsessiond");
    }
    expect(render).toContain('(allow mach-lookup\n  (global-name "com.apple.MTLCompilerService"))');
    expect(narrate).not.toContain("mach-lookup");
    expect(gate).not.toContain("mach-lookup");
    expect(() => buildProfile("render", { tools, paths: { ...paths, render: '/tmp/a"b' }, home: "/Users/me" })).toThrow(/cannot go in a sandbox profile/);
  });

  it("denies the studio home and the jobs root before it re-allows this job", () => {
    // A studio home outside the owner's home and every other denied place.
    const studioHome = "/srv/studio";
    const job = rebasePaths(paths, "/srv/studio/jobs/j1");
    for (const kind of ["render", "narrate", "gate"] as const) {
      const profile = buildProfile(kind, { tools, paths: job, home: "/Users/me", studioHome });
      const denied = profile.indexOf('(deny file-read*');
      const deniedBlock = profile.slice(denied, profile.indexOf("\n(allow", denied));
      expect(deniedBlock).toContain('(subpath "/srv/studio")');
      expect(deniedBlock).toContain('(subpath "/srv/studio/jobs")');
      const reallowed = profile.indexOf(kind === "gate" ? `(subpath "${job.candidate}")` : `(subpath "${job.checkout}")`, denied);
      expect(reallowed).toBeGreaterThan(denied);
      // The way down to this job is stat-able, and nothing beside it.
      const metadata = profile.slice(profile.indexOf("(allow file-read-metadata"), profile.indexOf("(allow file-write*"));
      expect(metadata).toContain('(literal "/srv/studio/jobs/j1")');
      expect(metadata).toContain('(literal "/srv/studio/jobs")');
      expect(metadata).not.toContain("subpath");
    }
    // Without a studio home named, the jobs root is still denied by name.
    expect(buildProfile("render", { tools, paths: job, home: "/Users/me" })).toContain('(subpath "/srv/studio/jobs")');
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

describe("handling the stream's lines", () => {
  it("handles lines in order and settles only once the last sheet Read is on disk", async () => {
    const queue = new LineQueue();
    const reads = path.join(root, "reads.ndjson");
    const order: string[] = [];
    const slow = (name: string, ms: number) => async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      order.push(name);
      await appendRead(reads, { path: `/x/${name}.sheet.png`, at: new Date().toISOString() });
    };
    queue.push(slow("A", 60));
    queue.push(async () => {
      throw new Error("one line's work failed");
    });
    queue.push(slow("B", 5));
    // The session has ended; the gate asks for the reads now.
    await queue.settled();
    expect(order).toEqual(["A", "B"]);
    expect((await readReads(reads)).map((read) => path.basename(read.path))).toEqual(["A.sheet.png", "B.sheet.png"]);
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

describe("the scene-class prefix", () => {
  it("takes the slug's initials, cut to manimkc's four letters", () => {
    expect(prefixFor("dot-product-in-one-number")).toBe("DPIO");
    expect(prefixFor("two-boxes")).toBe("TB");
    expect(prefixFor("attention")).toBe("AT");
    expect(prefixFor("3d-rotation")).toBe("R");
  });
});

describe("the job view's narration step", () => {
  const facts = (over: Partial<StepFacts> = {}): StepFacts => ({
    narrated: true,
    seeded: null,
    setupDone: true,
    edits: 0,
    calls: [],
    reads: [],
    sheets: {},
    gate: null,
    gateRunning: false,
    ready: false,
    agentRunning: true,
    ...over,
  });
  const narration = (over: Partial<StepFacts> = {}) => deriveSteps(facts(over)).find((step) => step.name === "narration");

  it("stays pending until the agent's first narrate call, with the seeding as a note", () => {
    expect(narration()).toMatchObject({ state: "pending", rounds: 0, note: null });
    // Seeding is the runner copying clips before the agent starts: a note, not the step running.
    expect(narration({ seeded: { wanted: 5, seeded: 3 } })).toMatchObject({
      state: "pending",
      rounds: 0,
      note: "3 of 5 lines already voiced",
    });
  });

  it("is done or failed by the agent's own narrate calls", () => {
    const call = (exitCode: number) => ({
      verb: "preview" as const,
      startedAt: "2026-09-29T00:00:00Z",
      endedAt: "2026-09-29T00:00:10Z",
      exitCode,
      steps: [{ step: "narrate", exitCode }],
    });
    expect(narration({ seeded: { wanted: 5, seeded: 3 }, calls: [call(0)] as never })).toMatchObject({ state: "done", rounds: 1 });
    expect(narration({ calls: [call(1)] as never })).toMatchObject({ state: "failed", rounds: 1 });
  });
});
