import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backendFor, type BackendJob } from "../src/video/backend";
import { secondsForLines } from "../src/video/brief";
import { runVideoGate, type VideoGateChecks } from "../src/video/gate";
import { buildVideoPrompt, buildVideoResumePrompt, buildVideoRetryPrompt, buildVideoRevisePrompt } from "../src/video/prompt";
import { buildProfile, resolvedStudioHome } from "../src/video/sandbox";
import { buildVideoSettings } from "../src/video/settings";
import type { Toolchain } from "../src/video/toolchain";
import { briefTool, VIDEO_TOOLS } from "../src/video/tools";
import { wrapperConfig, wrapperSource } from "../src/video/wrapper";

import { build, layOut, narratedBrief, preview, recordedTools } from "./video-fixture";

/**
 * The backend seam of D75 (docs/STUDIO-VIDEO-TOOLS.md, phase 2a): manimkc
 * moved behind `VideoBackend` with no change in behaviour. What the backend
 * writes for a job (the three profiles, the wrapper, the permission file)
 * and the prompts it builds are compared, byte for byte, with what the
 * modules the runner called directly produce for the same inputs. And the
 * gate is shown to ask the job's backend, not manimkc, for its source steps
 * and its sheets.
 */

let root: string;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME };

beforeEach(async () => {
  root = realpathSync(await mkdtemp(path.join(tmpdir(), "studio-video-backend-")));
  process.env.STUDIO_HOME = path.join(root, "home");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** A toolchain that names programs without running one: `false` answers the listing, so it reads as unavailable. */
function fixedTools(manimkcRoot: string): Toolchain {
  return {
    platform: "darwin",
    sandboxExec: "/usr/bin/sandbox-exec",
    manimkcRoot,
    manimkcDirs: { manim: `${manimkcRoot}/manim`, venv: `${manimkcRoot}/.venv`, venvTts: `${manimkcRoot}/.venv-tts`, tools: `${manimkcRoot}/tools` },
    ffmpeg: { link: "/opt/homebrew/bin/ffmpeg", real: "/opt/homebrew/Cellar/ffmpeg/9/bin/ffmpeg", home: "/opt/homebrew/Cellar/ffmpeg/9" },
    ffprobe: { link: "/opt/homebrew/bin/ffprobe", real: "/opt/homebrew/Cellar/ffmpeg/9/bin/ffprobe", home: "/opt/homebrew/Cellar/ffmpeg/9" },
    python3: { link: "/usr/bin/false", real: "/usr/bin/false", home: null },
    venvPython: { link: `${manimkcRoot}/.venv/bin/python`, real: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12", home: "/Library/Frameworks/Python.framework" },
    ttsPython: { link: `${manimkcRoot}/.venv-tts/bin/python`, real: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12", home: "/Library/Frameworks/Python.framework" },
    node: "/usr/local/bin/node",
    hfHubCache: "/Users/me/.cache/huggingface/hub",
    kokoroModel: "/Users/me/.cache/huggingface/hub/models--hexgrad--Kokoro-82M",
    voicesInstalled: ["af_heart"],
    sharedAudioCache: "/Users/me/.self-learn/manimkc/cache/audio",
  };
}

async function fixedJob(): Promise<BackendJob> {
  const manimkcRoot = path.join(root, "manimkc");
  await mkdir(path.join(manimkcRoot, "lib"), { recursive: true });
  await writeFile(path.join(manimkcRoot, "lib", "narration.py"), "# the narration step\n", "utf8");
  const paths = await backendFor("manimkc").paths("0f0f0f0f-aaaa-4bbb-8ccc-123456789abc", "two-boxes");
  return { tools: fixedTools(manimkcRoot), paths, home: "/Users/me", voice: "af_heart" };
}

describe("backendFor", () => {
  it("gives manimkc its backend, and a brief with no tool the same one", () => {
    const manimkc = backendFor("manimkc");
    expect(manimkc.tool).toBe("manimkc");
    const untooled = narratedBrief();
    expect("tool" in untooled).toBe(false);
    expect(backendFor(briefTool(untooled))).toBe(manimkc);
    expect(backendFor(briefTool({ ...untooled, tool: "manimkc" }))).toBe(manimkc);
  });

  it("throws naming the tool for remotionkc, which the studio cannot make yet, and has revideokc's (phase 2c)", () => {
    expect(backendFor("revideokc").tool).toBe("revideokc");
    expect(() => backendFor("remotionkc")).toThrow(/no video backend for remotionkc/);
  });

  it("has a backend for exactly the tools tools.ts says are in the studio", () => {
    for (const info of VIDEO_TOOLS) {
      const has = (() => {
        try {
          return backendFor(info.name).tool === info.name;
        } catch {
          return false;
        }
      })();
      expect(has, info.name).toBe(info.inStudio);
    }
  });

  it("takes a topic's scene modules and topic.yml as manimkc's source, and nothing else", () => {
    const { sourcePattern } = backendFor("manimkc");
    for (const name of ["two_boxes.py", "topic.yml"]) expect(sourcePattern.test(name), name).toBe(true);
    for (const name of ["Two.py", "two-boxes.py", "notes.md", "topic.yml.bak", "x.pyc"]) expect(sourcePattern.test(name), name).toBe(false);
  });
});

describe("the manimkc backend writes what the runner wrote before it", () => {
  it("builds the three profiles byte for byte as buildProfile does, in the order they were written", async () => {
    const job = await fixedJob();
    const profiles = backendFor("manimkc").profiles(job);
    expect(profiles.map((profile) => [profile.kind, profile.file])).toEqual([
      ["render", job.paths.renderProfile],
      ["narrate", job.paths.narrateProfile],
      ["gate", job.paths.gateProfile],
    ]);
    for (const profile of profiles) {
      const before = buildProfile(profile.kind, { tools: job.tools, paths: job.paths, home: job.home, studioHome: resolvedStudioHome() });
      expect(profile.text).toBe(before);
    }
  });

  it("writes those profiles, and the checkout around them, in prepare", async () => {
    const job = await fixedJob();
    await backendFor("manimkc").prepare(job);
    for (const kind of ["render", "narrate", "gate"] as const) {
      const file = kind === "render" ? job.paths.renderProfile : kind === "narrate" ? job.paths.narrateProfile : job.paths.gateProfile;
      expect(await readFile(file, "utf8")).toBe(buildProfile(kind, { tools: job.tools, paths: job.paths, home: job.home, studioHome: resolvedStudioHome() }));
    }
    expect(await readFile(path.join(job.paths.lib, "narration.py"), "utf8")).toBe("# the narration step\n");
    expect(await readFile(path.join(job.paths.render, ".env"), "utf8")).toBe("NARRATION_BACKEND=kokoro\nNARRATION_KOKORO_VOICE=af_heart\n");
  });

  it("writes the wrapper byte for byte as wrapperConfig and writeWrapper did, and says when the listing could not be read", async () => {
    const job = await fixedJob();
    const scenes = ["TB1_WhyItMatters", "TB2_Recap"];
    const listing = await backendFor("manimkc").wrapper(job, { scenes, narrated: true });
    expect(listing).toBeNull();
    const before = wrapperSource(job.tools.node, wrapperConfig({ ...job, scenes, apiNames: [], narrated: true }));
    expect(await readFile(job.paths.wrapper, "utf8")).toBe(before);
  });

  it("builds the permission file as buildVideoSettings did, with manimkc's data root above its shared cache", async () => {
    const job = await fixedJob();
    const guard = "/usr/local/bin/node /jobs/j/bin/bash-guard.cjs";
    const source = path.join(root, "note.md");
    const settings = backendFor("manimkc").settings(job, { jobId: "j", guard, source });
    const before = buildVideoSettings({ jobId: "j", paths: job.paths, manimkcRoot: job.tools.manimkcRoot, manimkcHome: "/Users/me/.self-learn/manimkc", guard, source });
    expect(JSON.stringify(settings, null, 1)).toBe(JSON.stringify(before, null, 1));
    const noCache = { ...job, tools: { ...job.tools, sharedAudioCache: null } };
    expect(JSON.stringify(backendFor("manimkc").settings(noCache, { jobId: "j", guard }))).toBe(
      JSON.stringify(buildVideoSettings({ jobId: "j", paths: job.paths, manimkcRoot: job.tools.manimkcRoot, manimkcHome: null, guard })),
    );
  });

  it("builds each of the four prompts as the prompt module does", async () => {
    const { paths } = await fixedJob();
    const backend = backendFor("manimkc");
    const brief = narratedBrief();
    const classes = ["TB1_WhyItMatters", "TB2_Recap"];
    expect(backend.prompt({ kind: "first", brief, paths, classes, source: "/note.md", seededNote: "1 of 2", change: true })).toBe(
      buildVideoPrompt({ brief, paths, classes, source: "/note.md", seededNote: "1 of 2", change: true }),
    );
    expect(backend.prompt({ kind: "first", brief, paths, classes, change: false })).toBe(buildVideoPrompt({ brief, paths, classes, change: false }));
    expect(backend.prompt({ kind: "retry", findings: ["a", "b"], paths })).toBe(buildVideoRetryPrompt(["a", "b"], paths));
    expect(backend.prompt({ kind: "revise", changes: "bigger", paths })).toBe(buildVideoRevisePrompt("bigger", paths));
    expect(backend.prompt({ kind: "resume", paths })).toBe(buildVideoResumePrompt(paths));
  });
});

describe("the gate asks the job's backend", () => {
  it("takes steps 1 to 3 and the sheets from the backend it is given, and runs its own steps after", async () => {
    const { paths } = await fixedJob();
    const brief = narratedBrief();
    const classes = ["TB1_WhyItMatters", "TB2_Recap"];
    const voiced = brief.scenes.map((scene) => scene.beats[0]!.say);
    // No Python: the source steps are the stand-in's, so nothing parses the file.
    const laid = await layOut(paths, {
      source: "not a scene file anyone could parse",
      topic: brief.topic,
      narrated: true,
      segments: [
        { scene: classes[0]!, end: 20, text: voiced[0]! },
        { scene: classes[1]!, end: 45, text: voiced[1]! },
      ],
      chapters: [
        { scene: classes[0]!, end: 21 },
        { scene: classes[1]!, end: 46 },
      ],
    });
    const sheet = (scene: string): string => path.join(paths.job, "elsewhere", `${scene}.png`);
    const standIn: VideoGateChecks = {
      async checkSource(_input, report) {
        report.step("source", true, "the stand-in's");
        report.warning("from the stand-in");
        return { ok: true, script: { classes, changes: [] }, sourceHash: laid.sourceHash, voiced };
      },
      sheet: (_paths, scene) => sheet(scene),
    };
    const at = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();
    const noted: string[] = [];
    const result = await runVideoGate({
      brief,
      paths,
      classes,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [preview(at(-5_000), classes, laid.sourceHash), build(at(-1_000), laid.sourceHash)],
      reads: classes.map((scene) => ({ path: sheet(scene), at: at(-4_000) })),
      tools: recordedTools({ duration: Math.round(secondsForLines(voiced)) }),
      backend: standIn,
      onStep: (step) => noted.push(step.name),
    });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(noted).toEqual(["source", "topic", "build", "probe", "sync", "length", "poster", "looked"]);
    expect(result.warnings).toEqual(["from the stand-in"]);
    expect(result.script).toEqual({ classes, changes: [] });
  });

  it("stops where the backend's source steps fail, keeping the script they reached", async () => {
    const { paths } = await fixedJob();
    const script = { classes: ["TB1_WhyItMatters"], changes: [] };
    const failing: VideoGateChecks = {
      async checkSource(_input, report) {
        report.step("script", false, "one scene short");
        report.finding("The script: one scene short.");
        return { ok: false, script };
      },
      sheet: (_paths, scene) => scene,
    };
    const result = await runVideoGate({
      brief: narratedBrief(),
      paths,
      classes: ["TB1_WhyItMatters", "TB2_Recap"],
      startedAtMs: 0,
      sourceHashBefore: null,
      calls: [],
      reads: [],
      tools: recordedTools(),
      backend: failing,
    });
    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.name)).toEqual(["script"]);
    expect(result.findings).toEqual(["The script: one scene short."]);
    expect(result.script).toEqual(script);
  });
});
