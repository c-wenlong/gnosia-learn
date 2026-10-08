import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backendFor } from "../src/video/backend";
import { secondsForLines } from "../src/video/brief";
import { HELD_TAIL_SECONDS, runVideoGate, type GateTools, type SceneParse } from "../src/video/gate";
import type { VideoPaths } from "../src/video/paths";
import { freePair, JOB_PORTS, profilePorts } from "../src/video/ports";
import { DOCTOR_PORTS as REVIDEOKC_DOCTOR_PORTS } from "../src/video/revideokc/ports";
import { buildRemotionkcCheckout, scaffoldRemotionkc, stubComposition } from "../src/video/remotionkc/checkout";
import { DOCTOR_PORTS, renderKey } from "../src/video/remotionkc/doctor";
import { MAX_EXTRA_FRAMES_AT_30, remotionkcManualText } from "../src/video/remotionkc/manual";
import { remotionkcPaths, remotionkcVideoPaths } from "../src/video/remotionkc/paths";
import { buildRemotionkcProfile, CHROME_RENDEZVOUS, remotionkcEnv, RENDER_XPC_SERVICES } from "../src/video/remotionkc/sandbox";
import { buildRemotionkcSettings } from "../src/video/remotionkc/settings";
import { COMBINED_HASH_JS, currentSourceHash } from "../src/video/remotionkc/source";
import { findHeadlessShell, remotionkcProblems, scriptShells, type RemotionkcToolchain } from "../src/video/remotionkc/toolchain";
import { remotionkcWrapperConfig, writeRemotionkcWrapper } from "../src/video/remotionkc/wrapper";
import { combinedHash, readSources } from "../src/video/source-set";
import type { WrapperCall } from "../src/video/calls";

import { mp4Bytes, narratedBrief } from "./video-fixture";
import { wrapperPorts } from "./wrapper-ports";

/**
 * The remotionkc backend (phase 3 of docs/STUDIO-VIDEO-TOOLS.md) without
 * running Chrome or a voice: the three profiles' allowances pinned as
 * revideokc's are, the job's port pair and nothing else on the network, the
 * environment built from nothing, the wrapper's verbs and its source hash
 * held equal to the runner's, the checkout, the permission file, the
 * scaffold, and the gate's remotionkc steps over recorded parses. The
 * sandbox measured for real is `video-remotionkc-sandbox.test.ts`.
 */

let root: string;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME };

beforeEach(async () => {
  root = realpathSync(await mkdtemp(path.join(tmpdir(), "studio-video-remotionkc-")));
  process.env.STUDIO_HOME = path.join(root, "home");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const REMOTIONKC = "/Users/me/self-learn/tools/remotionkc";
const SHELL = `${REMOTIONKC}/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64`;
const TSC = `${REMOTIONKC}/node_modules/@typescript/typescript-darwin-arm64/lib/tsc`;
const PARSER = "/Users/me/self-learn/node_modules/typescript/lib/typescript.js";

/** A toolchain that names programs without running any. */
function fixedTools(): RemotionkcToolchain {
  return {
    platform: "darwin",
    sandboxKind: "seatbelt",
    sandboxExec: "/usr/bin/sandbox-exec",
    libs: [],
    manimkcRoot: "/Users/me/self-learn/tools/manimkc",
    manimkcDirs: { manim: "/m/manim", venv: "/m/.venv", venvTts: "/Users/me/self-learn/tools/manimkc/.venv-tts", tools: "/m/tools" },
    ffmpeg: { link: "/opt/homebrew/bin/ffmpeg", real: "/opt/homebrew/Cellar/ffmpeg/9/bin/ffmpeg", home: "/opt/homebrew/Cellar/ffmpeg/9" },
    ffprobe: { link: "/opt/homebrew/bin/ffprobe", real: "/opt/homebrew/Cellar/ffmpeg/9/bin/ffprobe", home: "/opt/homebrew/Cellar/ffmpeg/9" },
    python3: null,
    venvPython: null,
    ttsPython: { link: "/Users/me/self-learn/tools/manimkc/.venv-tts/bin/python", real: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12", home: "/Library/Frameworks/Python.framework" },
    node: "/usr/local/bin/node",
    hfHubCache: "/Users/me/.cache/huggingface/hub",
    kokoroModel: "/Users/me/.cache/huggingface/hub/models--hexgrad--Kokoro-82M",
    voicesInstalled: ["af_heart"],
    sharedAudioCache: "/Users/me/.self-learn/manimkc/cache/audio",
    remotionkc: {
      root: REMOTIONKC,
      nodeModules: `${REMOTIONKC}/node_modules`,
      venv: `${REMOTIONKC}/.venv`,
      gnosiaPython: { link: `${REMOTIONKC}/.venv/bin/python`, real: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12", home: "/Library/Frameworks/Python.framework" },
      scriptShells: [],
      headlessShell: { binary: `${SHELL}/chrome-headless-shell`, dir: SHELL },
      compositor: `${REMOTIONKC}/node_modules/@remotion/compositor-darwin-arm64`,
      esbuild: `${REMOTIONKC}/node_modules/@esbuild/darwin-arm64/bin/esbuild`,
      tsc: TSC,
      remotion: "4.0.530",
      sandboxReady: true,
      nodeVersion: "22.23.1",
      ownerHome: "/Users/me/.self-learn/remotionkc",
      parser: PARSER,
      libs: [],
    },
  };
}

async function jobPaths(id = "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc"): Promise<VideoPaths> {
  return remotionkcVideoPaths(id, "two-boxes");
}

const profileFor = (kind: "render" | "narrate" | "gate", paths: VideoPaths, base = 47012): string =>
  buildRemotionkcProfile(kind, { tools: fixedTools(), paths, home: "/Users/me", studioHome: path.join(root, "home"), base });

/** A block's rules, one per line, from the line after `(head` to the line that closes it. */
function block(text: string, head: string): string[] {
  const start = text.indexOf(`(${head}\n`);
  if (start < 0) return [];
  const out: string[] = [];
  let depth = 1;
  for (const line of text.slice(text.indexOf("\n", start) + 1).split("\n")) {
    out.push(line.trim());
    for (const char of line.replace(/"[^"]*"/g, "")) depth += char === "(" ? 1 : char === ")" ? -1 : 0;
    if (depth <= 0) break;
  }
  return out;
}

describe("the remotionkc profiles", () => {
  it("let the render profile start node, the Headless Shell, the compositor, esbuild, tsc and ffmpeg, and no Python and no shell", async () => {
    const paths = await jobPaths();
    const text = profileFor("render", paths);
    expect(block(text, "allow process-exec")).toEqual([
      '(literal "/usr/local/bin/node")',
      `(subpath "${SHELL}")`,
      `(subpath "${REMOTIONKC}/node_modules/@remotion/compositor-darwin-arm64")`,
      `(literal "${REMOTIONKC}/node_modules/@esbuild/darwin-arm64/bin/esbuild")`,
      `(literal "${TSC}")`,
      '(literal "/opt/homebrew/bin/ffmpeg")',
      '(literal "/opt/homebrew/Cellar/ffmpeg/9/bin/ffmpeg")',
      '(subpath "/opt/homebrew/Cellar/ffmpeg/9")',
      '(literal "/opt/homebrew/bin/ffprobe")',
      '(literal "/opt/homebrew/Cellar/ffmpeg/9/bin/ffprobe")',
      ")",
    ].map((line, i, all) => (i === all.length - 2 ? `${line})` : line)).slice(0, -1));
    expect(text).not.toMatch(/python|Python\.framework|\/bin\/sh"|\/bin\/bash|\/usr\/bin\/env|Google Chrome/);
  });

  it("let the render profile read the job and node_modules, write render/ only, link only in its temporary directory, and refuse a hard link", async () => {
    const paths = await jobPaths();
    const text = profileFor("render", paths);
    expect(block(text, "allow file-read*").join(" ")).toBe(`(subpath "${paths.checkout}") (subpath "${paths.render}") (subpath "${REMOTIONKC}/node_modules"))`);
    expect(block(text, "allow file-write*")).toEqual([`(subpath "${paths.render}")`, '(literal "/dev/null")', '(literal "/dev/dtracehelper"))']);
    expect(text).toContain("(deny file-link)");
    expect(text).toContain("(deny file-write-create (vnode-type SYMLINK))");
    expect(text).toContain(`(allow file-write-create (require-all (vnode-type SYMLINK) (subpath "${paths.renderTmp}")))`);
    // The owner's home is denied, and the repository with it, before the job is let back in.
    expect(block(text, "deny file-read*")).toContain('(subpath "/Users/me")');
  });

  it("open exactly the job's two ports, and no unix socket at all", async () => {
    const paths = await jobPaths();
    const text = profileFor("render", paths, 47012);
    expect(profilePorts(text)).toEqual([47012, 47013]);
    expect(block(text, "allow network-outbound")).toEqual(['(remote ip "localhost:47012")', '(remote ip "localhost:47013"))']);
    expect(text.split("\n").filter((line) => line.includes("network"))).toEqual(["(allow network-bind network-inbound", "(allow network-outbound"]);
    expect(text).not.toContain("unix-socket");
    const other = profileFor("render", paths, 48100);
    expect(profilePorts(other)).toEqual([48100, 48101]);
    expect(other.replaceAll(":48100", ":47012").replaceAll(":48101", ":47013")).toBe(text);
  });

  it("look up Metal's compiler as an XPC service and Chrome's rendezvous, and nothing else, and register Chrome's rendezvous only", async () => {
    const text = profileFor("render", await jobPaths());
    expect(block(text, "allow mach-lookup")).toEqual(['(xpc-service-name "com.apple.MTLCompilerService")', `(global-name-regex #"${CHROME_RENDEZVOUS}"))`]);
    expect(RENDER_XPC_SERVICES).toEqual(["com.apple.MTLCompilerService"]);
    expect(text).toContain(`(allow mach-register (global-name-regex #"${CHROME_RENDEZVOUS}"))`);
    expect(CHROME_RENDEZVOUS).toBe(String.raw`^org\.chromium\.Chromium\.MachPortRendezvousServer\.`);
    expect(text).not.toContain("global-name \"");
  });

  it("give the narration profile its two interpreters, the console script and the model, no network and no Mach service", async () => {
    const paths = await jobPaths();
    const own = remotionkcPaths(paths);
    const text = profileFor("narrate", paths);
    const exec = block(text, "allow process-exec").join(" ");
    expect(exec).toContain(`(literal "${REMOTIONKC}/.venv/bin/gnosia-audio")`);
    expect(exec).toContain(`(literal "${REMOTIONKC}/.venv/bin/python")`);
    expect(exec).toContain('(literal "/Users/me/self-learn/tools/manimkc/.venv-tts/bin/python")');
    expect(exec).not.toMatch(/chrome-headless-shell|compositor|esbuild|\/bin\/sh"|\/bin\/bash/);
    // A console script uv wrote in its `#!/bin/sh` form needs sh and the shell sh runs, and only then.
    const shelled = buildRemotionkcProfile("narrate", { tools: { ...fixedTools(), remotionkc: { ...fixedTools().remotionkc, scriptShells: ["/bin/sh", "/bin/bash"] } }, paths, home: "/Users/me", studioHome: path.join(root, "home"), base: 47012 });
    expect(block(shelled, "allow process-exec").join(" ")).toContain('(literal "/bin/sh") (literal "/bin/bash")');
    expect(text).not.toMatch(/network|mach-lookup|mach-register/);
    expect(block(text, "allow file-read*").join(" ")).toContain("models--hexgrad--Kokoro-82M");
    expect(block(text, "allow file-write*")).toEqual([
      `(subpath "${paths.audio}")`,
      `(subpath "${own.publicDir}")`,
      `(subpath "${own.buildWork}")`,
      `(subpath "${paths.outTopic}")`,
      `(subpath "${paths.renderTmp}")`,
      '(literal "/dev/null")',
      '(literal "/dev/dtracehelper"))',
    ]);
    expect(text).toContain("(deny file-link)");
  });

  it("let the gate profile run node and the media programs, read candidate/ and the studio's TypeScript, and write the poster alone", async () => {
    const paths = await jobPaths();
    const text = profileFor("gate", paths);
    expect(block(text, "allow file-read*").join(" ")).toBe(`(subpath "${paths.candidate}") (subpath "/Users/me/self-learn/node_modules/typescript"))`);
    expect(block(text, "allow file-write*")).toEqual([`(literal "${paths.poster}")`, '(literal "/dev/null")', '(literal "/dev/dtracehelper"))']);
    expect(text).not.toMatch(/network|mach-lookup/);
  });

  it("refuse a port pair no profile can name, and a path that would end a string", async () => {
    const paths = await jobPaths();
    expect(() => profileFor("render", paths, 80)).toThrow(/not a base port/);
    expect(() => profileFor("render", { ...paths, render: '/x/"evil' }, 47012)).toThrow(/cannot go in a sandbox profile/);
  });
});

describe("the remotionkc environment", () => {
  it("is built from nothing: the render's names the port and turns the bundle cache off, the narration's the voice, and none passes a secret on", async () => {
    const paths = await jobPaths();
    process.env.ANTHROPIC_API_KEY = "sk-not-for-the-job";
    process.env.NODE_OPTIONS = "--require /evil.js";
    try {
      const input = { tools: fixedTools(), paths, home: "/Users/me", voice: "af_heart", base: 47012 };
      const render = remotionkcEnv("render", input);
      expect(render).toEqual({
        PATH: "/opt/homebrew/bin:/usr/bin:/bin",
        HOME: "/Users/me",
        LANG: "en_US.UTF-8",
        TMPDIR: paths.renderTmp,
        REMOTIONKC_HOME: paths.render,
        REMOTIONKC_ROOT: paths.checkout,
        MAC_CHROMIUM_TMPDIR: paths.renderTmp,
        REMOTIONKC_PORT: "47012",
        REMOTIONKC_BUNDLE_CACHE: "off",
      });
      const narrate = remotionkcEnv("narrate", input);
      expect(narrate).toMatchObject({ MANIMKC_HOME: paths.render, NARRATION_BACKEND: "kokoro", NARRATION_KOKORO_VOICE: "af_heart", HF_HUB_OFFLINE: "1", REMOTIONKC_HOME: paths.render });
      expect(narrate).not.toHaveProperty("REMOTIONKC_PORT");
      expect(narrate).not.toHaveProperty("MANIMKC_ROOT");
      for (const env of [render, narrate, remotionkcEnv("gate", input)]) {
        expect(Object.keys(env).some((key) => /KEY|TOKEN|SECRET|NODE_OPTIONS/.test(key))).toBe(false);
      }
      expect(() => remotionkcEnv("render", { ...input, base: undefined })).toThrow(/needs the job's port/);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.NODE_OPTIONS;
    }
  });
});

describe("the doctor's ports", () => {
  it("sit outside the jobs' range and away from revideokc's doctor's, which may render at the same moment", () => {
    expect(DOCTOR_PORTS.last).toBeLessThan(JOB_PORTS.first);
    expect(DOCTOR_PORTS.last + 1).toBeLessThan(REVIDEOKC_DOCTOR_PORTS.first);
    expect(DOCTOR_PORTS.first % 2).toBe(0);
  });

  it("skip a pair something already listens on", async () => {
    const base = await freePair(DOCTOR_PORTS);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(base, "127.0.0.1", resolve));
    try {
      const next = await freePair(DOCTOR_PORTS, base);
      expect(next).not.toBe(base);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("the source", () => {
  it("hashes the same in the wrapper's program as in the runner, needs composition.tsx, and moves with any file of it", async () => {
    const dir = path.join(root, "topic");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "narration.json"), "[]\n");
    await writeFile(path.join(dir, "series.ts"), "export const x = 1;\n");
    const wrapperHash = new Function("fs", "crypto", `${COMBINED_HASH_JS}\nreturn sourceHash;`)(await import("node:fs"), await import("node:crypto")) as (dir: string) => string | null;
    expect(await currentSourceHash(dir)).toBeNull();
    expect(wrapperHash(dir)).toBeNull();
    // A revideokc scene file is not a remotionkc composition.
    await writeFile(path.join(dir, "scene.tsx"), "export default 1;\n");
    expect(await currentSourceHash(dir)).toBeNull();
    await rm(path.join(dir, "scene.tsx"));
    await writeFile(path.join(dir, "composition.tsx"), "export default 1;\n");
    await writeFile(path.join(dir, "topic.yml"), "topic: x\n");
    const before = await currentSourceHash(dir);
    expect(before).not.toBeNull();
    expect(wrapperHash(dir)).toBe(before);
    expect((await readSources(dir)).map((file) => file.name)).toEqual(["composition.tsx", "narration.json", "series.ts"]);
    await writeFile(path.join(dir, "topic.yml"), "topic: y\n");
    expect(await currentSourceHash(dir)).toBe(before);
    await writeFile(path.join(dir, "series.ts"), "export const x = 2;\n");
    expect(await currentSourceHash(dir)).not.toBe(before);
    expect(wrapperHash(dir)).toBe(await currentSourceHash(dir));
    const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
    expect(combinedHash([{ name: "b", sha256: sha("1") }, { name: "a", sha256: sha("2") }])).toBe(combinedHash([{ name: "a", sha256: sha("2") }, { name: "b", sha256: sha("1") }]));
  });
});

describe("the checkout and the scaffold", () => {
  it("copies the code and Remotion's guides, links node_modules and .venv, and makes the render folders", async () => {
    const real = path.join(root, "remotionkc");
    for (const dir of ["lib", "src", "tools/cli", "node_modules/remotion", ".venv/bin", ".claude/skills/remotion-best-practices/remotion-markup/assets", "topics/cs/a"]) {
      await mkdir(path.join(real, dir), { recursive: true });
    }
    for (const [file, body] of [
      ["lib/index.ts", "export {};\n"],
      ["src/Root.tsx", "export {};\n"],
      ["tools/cli/remotionkc.mjs", "// cli\n"],
      ["package.json", "{}\n"],
      ["tsconfig.json", "{}\n"],
      ["remotion.config.ts", "// config\n"],
      ["requirements-narration.txt", "gnosia-audio\n"],
      [".claude/skills/remotion-best-practices/remotion-markup/timing.md", "# timing\n"],
      [".claude/skills/remotion-best-practices/remotion-markup/assets/icon.svg", "<svg/>\n"],
      ["topics/cs/a/composition.tsx", "// another topic\n"],
    ] as const) {
      await writeFile(path.join(real, file), body);
    }
    const tools = { ...fixedTools(), remotionkc: { ...fixedTools().remotionkc, root: real, nodeModules: path.join(real, "node_modules"), venv: path.join(real, ".venv") } };
    const paths = await jobPaths();
    const own = remotionkcPaths(paths);
    await buildRemotionkcCheckout(tools, paths);
    expect((await readdir(paths.checkout)).sort()).toEqual([".venv", "docs", "lib", "node_modules", "package.json", "remotion.config.ts", "requirements-narration.txt", "src", "tools", "tsconfig.json"]);
    expect(await readdir(own.docs)).toEqual(["timing.md"]);
    expect(realpathSync(own.nodeModules)).toBe(realpathSync(path.join(real, "node_modules")));
    for (const dir of [paths.renderTmp, paths.audio, own.publicDir, own.stillsRoot, own.buildWork, own.state]) expect((await readdir(dir)).length).toBe(0);
  });

  it("writes topic.yml, the brief's lines as narration.json, and a stub that cues no word the brief may not say", async () => {
    const paths = await jobPaths();
    const brief = { ...narratedBrief(), tool: "remotionkc" as const };
    const made = await scaffoldRemotionkc(paths, brief, null);
    expect(made.classes).toEqual(["TB1_WhyItMatters", "TB2_Recap"]);
    const yml = await readFile(paths.topicYml, "utf8");
    expect(yml).toContain(`topic: ${brief.topic}`);
    expect(yml).toContain("  composition: composition.tsx\n");
    expect(yml).toContain("  output: two_boxes.mp4\n");
    const narration = JSON.parse(await readFile(remotionkcPaths(paths).narration, "utf8")) as { scene: string; title: string; lines: string[] }[];
    expect(narration.map((chapter) => chapter.scene)).toEqual(made.classes);
    expect(narration[0]!.title).toBe("Why it matters");
    expect(narration.map((chapter) => chapter.lines)).toEqual(brief.scenes.map((scene) => scene.beats.map((beat) => beat.say)));
    const stub = await readFile(paths.sceneFile, "utf8");
    expect(path.basename(paths.sceneFile)).toBe("composition.tsx");
    expect(stub).not.toMatch(/cue\.at\(/);
    expect(stub).toContain('extraFrames: { "TB2_Recap": 30 }');
    expect(stubComposition('Bad "title"\nhere', ["A1_X"])).toContain("// Bad titlehere\n");
    expect(paths.deliverable.endsWith(path.join("out", "studio", "two-boxes", "two_boxes.mp4"))).toBe(true);
  });

  it("refuses a silent brief, and takes a change's files, dropping anything that is not a remotionkc source", async () => {
    const paths = await jobPaths();
    await expect(scaffoldRemotionkc(paths, { ...narratedBrief(), voice: "none" }, null)).rejects.toThrow(/narrated/);
    const files = new Map<string, Buffer>([
      ["composition.tsx", Buffer.from("export default 1;\n")],
      ["narration.json", Buffer.from("[]\n")],
      ["topic.yml", Buffer.from("topic: old\nprefix: TB\n")],
      ["evil.py", Buffer.from("import os\n")],
      ["data.json", Buffer.from("{}\n")],
      ["../escape.ts", Buffer.from("x")],
    ]);
    await scaffoldRemotionkc(paths, { ...narratedBrief(), tool: "remotionkc" }, files);
    expect(await readFile(paths.topicYml, "utf8")).toContain(`topic: ${narratedBrief().topic}`);
    await expect(readFile(path.join(paths.topicDir, "evil.py"))).rejects.toThrow();
    await expect(readFile(path.join(paths.topicDir, "data.json"))).rejects.toThrow();
    await expect(readFile(path.join(paths.job, "checkout", "topics", "studio", "escape.ts"))).rejects.toThrow();
  });
});

describe("the permission file", () => {
  it("lets the agent edit the composition, the narration and TypeScript beside them, read its guides and sheets, and nothing of the owner's videos", async () => {
    const paths = await jobPaths();
    const own = remotionkcPaths(paths);
    const settings = buildRemotionkcSettings({
      jobId: "j",
      paths,
      remotionkcRoot: REMOTIONKC,
      remotionkcHome: "/Users/me/.self-learn/remotionkc",
      manimkcRoot: "/Users/me/self-learn/tools/manimkc",
      manimkcHome: "/Users/me/.self-learn/manimkc",
      guard: "/usr/local/bin/node /jobs/j/bin/bash-guard.cjs",
    });
    const { allow, deny } = settings.permissions;
    expect(allow).toEqual([
      `Bash(${paths.wrapper}:*)`,
      `Edit(/${paths.sceneFile})`,
      `Edit(/${own.narration})`,
      `Edit(/${paths.topicDir}/*.ts)`,
      `Edit(/${paths.topicDir}/*.tsx)`,
      `Read(/${paths.topicDir}/**)`,
      `Read(/${paths.lib}/**)`,
      `Read(/${own.docs}/**)`,
      `Read(/${paths.out}/**)`,
      `Read(/${own.stillsRoot}/**)`,
    ]);
    expect(path.basename(paths.sceneFile)).toBe("composition.tsx");
    for (const rule of [
      `Edit(/${paths.topicYml})`,
      `Edit(/${paths.lib}/**)`,
      `Edit(/${paths.render}/**)`,
      `Edit(/${path.join(paths.checkout, "remotion.config.ts")})`,
      `Read(/${REMOTIONKC}/topics/**)`,
      "Read(//Users/me/.self-learn/remotionkc/**)",
      "Read(//Users/me/self-learn/tools/manimkc/topics/**)",
      `Read(/${path.join(paths.job, "ports.json")})`,
      "WebFetch",
    ]) {
      expect(deny, rule).toContain(rule);
    }
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
  });
});

describe("the backend's own parts", () => {
  it("keeps the stills sheet and the build's, counts a sheet only at their paths, and adds the guides and stills as directories", async () => {
    const paths = await jobPaths();
    const own = remotionkcPaths(paths);
    const backend = backendFor("remotionkc");
    expect(backend.tool).toBe("remotionkc");
    expect(backend.sheets(paths, ["TB1_A", "TB2_B"])).toEqual([
      { id: "stills", title: "Stills", file: own.stillsSheet, kept: "stills.sheet.png", scenes: ["TB1_A", "TB2_B"] },
      { id: "build", title: "The build", file: own.buildSheet, kept: "two_boxes.sheet.png", scenes: [] },
    ]);
    expect(backend.isSheet(paths, own.stillsSheet)).toBe(true);
    expect(backend.isSheet(paths, own.buildSheet)).toBe(true);
    expect(backend.isSheet(paths, path.join(paths.topicDir, "x.sheet.png"))).toBe(false);
    expect(backend.addDirs(paths)).toEqual([paths.lib, own.docs, paths.out, own.stillsRoot]);
    expect(backend.sheet(paths, "TB1_A")).toBe(own.stillsSheet);
    expect(backend.sourcePattern.test("composition.tsx")).toBe(true);
    expect(backend.sourcePattern.test("narration.json")).toBe(true);
    expect(backend.sourcePattern.test("data.json")).toBe(false);
    expect(backend.sourcePattern.test("two_boxes.py")).toBe(false);
  });

  it("says why a toolchain without the sandbox-ready CLI, the Headless Shell, tsc or gnosia-audio cannot run a job", async () => {
    const tools = fixedTools();
    expect(remotionkcProblems(tools).join("\n")).toMatch(/is not a remotionkc checkout/);
    const checkout = path.join(root, "remotionkc");
    await mkdir(path.join(checkout, "tools", "cli"), { recursive: true });
    await writeFile(path.join(checkout, "tools", "cli", "remotionkc.mjs"), "");
    const broken: RemotionkcToolchain = {
      ...tools,
      remotionkc: { ...tools.remotionkc, root: checkout, sandboxReady: false, headlessShell: null, tsc: null, parser: null, gnosiaPython: null, nodeVersion: "22.10.0" },
    };
    expect(remotionkcProblems(broken).join("\n")).toMatch(/no build --no-narrate[\s\S]*22\.18[\s\S]*npx remotion browser ensure[\s\S]*native compiler[\s\S]*typescript package[\s\S]*narration-deps/);
  });

  it("finds the Headless Shell where Remotion downloads it, and nothing where it has not", async () => {
    const modules = path.join(root, "node_modules");
    expect(findHeadlessShell(modules)).toBeNull();
    expect(findHeadlessShell(null)).toBeNull();
    const dir = path.join(modules, ".remotion", "chrome-headless-shell", "mac-arm64", "chrome-headless-shell-mac-arm64");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "chrome-headless-shell"), "");
    expect(findHeadlessShell(modules)).toEqual({ binary: path.join(dir, "chrome-headless-shell"), dir });
  });
});

describe("the console script's shells", () => {
  it("are none for a script that names its interpreter, and sh with the shell it runs for uv's /bin/sh form", async () => {
    const direct = path.join(root, "direct");
    const shelled = path.join(root, "shelled");
    await writeFile(direct, "#!/x/.venv/bin/python\nimport sys\n");
    await writeFile(shelled, "#!/bin/sh\n'''exec' '/x/.venv/bin/python' \"$0\" \"$@\"\n' '''\n");
    expect(scriptShells(direct)).toEqual([]);
    expect(scriptShells(path.join(root, "missing"))).toEqual([]);
    const shells = scriptShells(shelled);
    expect(shells[0]).toBe("/bin/sh");
    if (process.platform === "darwin") expect(shells[1]).toBe(realpathSync("/private/var/select/sh"));
  });
});

describe("the doctor's kept build", () => {
  it("is keyed on the code a render runs: a change to lib/, src/, the CLI or the render renders again, node_modules does not count", async () => {
    const checkout = path.join(root, "remotionkc-code");
    for (const dir of ["lib", "src", "tools/cli", "tools/render", "node_modules/x"]) await mkdir(path.join(checkout, dir), { recursive: true });
    await writeFile(path.join(checkout, "lib", "topic.tsx"), "export const a = 1;\n");
    await writeFile(path.join(checkout, "src", "Root.tsx"), "export default 1;\n");
    await writeFile(path.join(checkout, "tools", "cli", "remotionkc.mjs"), "// the CLI\n");
    await writeFile(path.join(checkout, "tools", "render", "render.mjs"), "// the render\n");
    const tools = { ...fixedTools(), remotionkc: { ...fixedTools().remotionkc, root: checkout } };
    const first = await renderKey(tools, "af_heart");
    expect(await renderKey(tools, "af_heart")).toBe(first);
    await writeFile(path.join(checkout, "node_modules", "x", "index.js"), "changed\n");
    expect(await renderKey(tools, "af_heart")).toBe(first);
    for (const [file, body] of [["lib/topic.tsx", "export const a = 2;\n"], ["src/Root.tsx", "export default 2;\n"], ["tools/cli/remotionkc.mjs", "// changed\n"], ["tools/render/render.mjs", "// changed\n"]] as const) {
      const before = await renderKey(tools, "af_heart");
      await writeFile(path.join(checkout, file), body);
      expect(await renderKey(tools, "af_heart"), file).not.toBe(before);
    }
    expect(await renderKey(tools, "am_michael")).not.toBe(await renderKey(tools, "af_heart"));
  });

  it("is keyed on what is installed: a reinstall or an upgrade at the same paths renders again", async () => {
    // Greptile on #293: the key was paths, so `npm ci` after a lockfile bump
    // or a new Headless Shell kept a passing verdict for six hours.
    const checkout = path.join(root, "remotionkc-installed");
    const nodeModules = path.join(checkout, "node_modules");
    const put = async (relative: string, body: string): Promise<void> => {
      await mkdir(path.dirname(path.join(checkout, relative)), { recursive: true });
      await writeFile(path.join(checkout, relative), body);
    };
    const pkg = (name: string, version: string): string => JSON.stringify({ name, version });
    await put("package-lock.json", "{}\n");
    await put("node_modules/.package-lock.json", "{}\n");
    await put("node_modules/remotion/package.json", pkg("remotion", "4.0.530"));
    await put("node_modules/@remotion/renderer/package.json", pkg("@remotion/renderer", "4.0.530"));
    await put("node_modules/react/package.json", pkg("react", "19.0.0"));
    await put("node_modules/.remotion/chrome-headless-shell/VERSION", "1\n");
    const tools = { ...fixedTools(), remotionkc: { ...fixedTools().remotionkc, root: checkout, nodeModules } };
    const first = await renderKey(tools, "af_heart");
    expect(await renderKey(tools, "af_heart")).toBe(first);
    // A package the render does not name, with neither lockfile moved, is not a reinstall.
    await put("node_modules/react/package.json", pkg("react", "19.0.1"));
    expect(await renderKey(tools, "af_heart")).toBe(first);
    for (const [file, body] of [
      ["node_modules/remotion/package.json", pkg("remotion", "4.0.531")],
      ["node_modules/@remotion/renderer/package.json", pkg("@remotion/renderer", "4.0.531")],
      ["node_modules/@remotion/media/package.json", pkg("@remotion/media", "4.0.531")],
      ["node_modules/.remotion/chrome-headless-shell/VERSION", "2\n"],
      ["node_modules/.package-lock.json", "{\"lockfileVersion\":3}\n"],
      ["package-lock.json", "{\"lockfileVersion\":3}\n"],
    ] as const) {
      const before = await renderKey(tools, "af_heart");
      await put(file, body);
      expect(await renderKey(tools, "af_heart"), file).not.toBe(before);
    }
    const before = await renderKey(tools, "af_heart");
    await rm(path.join(nodeModules, ".remotion"), { recursive: true });
    expect(await renderKey(tools, "af_heart"), "the Headless Shell gone").not.toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* The wrapper                                                                */
/* -------------------------------------------------------------------------- */

const execFileAsync = promisify(execFile);

// The wrapper's shebang is `#!/usr/bin/env -i <node>` on macOS, which the
// kernel splits on spaces, and `#!/usr/bin/env -S -i <node>` on Linux, where
// coreutils does the splitting (`wrapperSource` in src/video/wrapper.ts).
describe("the remotionkc wrapper", () => {
  let paths: VideoPaths;
  let recordFile: string;

  beforeEach(async () => {
    paths = await jobPaths();
    recordFile = path.join(root, "sandbox-calls.ndjson");
    const fake = path.join(root, "fake-sandbox-exec");
    // Records what it was asked to run, and stands in for a still's render by writing the stills sheet.
    const sheet = remotionkcPaths(paths).stillsSheet;
    await writeFile(
      fake,
      `#!${process.execPath}\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(recordFile)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }) + "\\n");\nif (process.argv.includes("still")) { fs.mkdirSync(${JSON.stringify(path.dirname(sheet))}, { recursive: true }); fs.writeFileSync(${JSON.stringify(sheet)}, "png"); }\n`,
      "utf8",
    );
    await chmod(fake, 0o755);
    await mkdir(paths.topicDir, { recursive: true });
    await writeFile(paths.sceneFile, "export default 1;\n");
    await writeFile(remotionkcPaths(paths).narration, "[]\n");
    const tools = { ...fixedTools(), sandboxExec: fake, node: process.execPath };
    const base = await wrapperPorts("remotionkc");
    const config = remotionkcWrapperConfig({ tools, paths, home: "/Users/me", voice: "af_heart", base, scenes: ["TB1_A", "TB2_B"], apiNames: ["sceneCues", "defineTopic"] });
    await writeRemotionkcWrapper(process.execPath, paths, config);
  });

  async function video(args: string[]): Promise<{ code: number; stderr: string }> {
    try {
      const { stderr } = await execFileAsync(paths.wrapper, args, { env: { ...process.env, NODE_OPTIONS: "--require /nowhere.js" } });
      return { code: 0, stderr };
    } catch (error) {
      const failed = error as { code: number; stderr: string };
      return { code: failed.code, stderr: failed.stderr };
    }
  }

  /** A verb that must run: a refusal fails here, in the wrapper's own words, rather than later as a missing call. */
  async function succeeds(args: string[]): Promise<void> {
    const result = await video(args);
    expect(result.code, result.stderr).toBe(0);
  }

  async function sandboxCalls(): Promise<{ argv: string[]; env: Record<string, string> }[]> {
    const body = await readFile(recordFile, "utf8").catch(() => "");
    return body.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as { argv: string[]; env: Record<string, string> });
  }

  async function calls(): Promise<WrapperCall[]> {
    const body = await readFile(paths.calls, "utf8").catch(() => "");
    return body.split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as WrapperCall);
  }

  it("refuses a verb, a name or a moment outside its lists, without echoing it", async () => {
    for (const args of [["previewzz"], ["api", "evilzz"], ["still", "$(catzz)"], ["still", "1.2zz"], ["build", "--workerszz"], ["narrate", "xzz"], ["lint", "-pzz"]]) {
      const result = await video(args);
      expect(result.code, args.join(" ")).toBe(2);
      expect(result.stderr).not.toContain("zz");
    }
    expect(await sandboxCalls()).toEqual([]);
    expect((await calls()).every((call) => call.verb === "refused")).toBe(true);
  });

  it("runs build as narrate, then a render with no narration, then the sidecars in the narration profile", async () => {
    await succeeds(["build"]);
    const ran = await sandboxCalls();
    expect(ran.map((call) => [call.argv[1], call.argv.slice(3).filter((arg) => !arg.startsWith("/")).join(" ")])).toEqual([
      [paths.narrateProfile, "--root narrate studio/two-boxes"],
      [paths.renderProfile, "--root build studio/two-boxes --no-narrate"],
      [paths.narrateProfile, "--root sidecars studio/two-boxes"],
    ]);
    expect(ran[1]!.env.REMOTIONKC_PORT).toMatch(/^\d+$/);
    expect(ran[1]!.env.REMOTIONKC_BUNDLE_CACHE).toBe("off");
    expect(ran[0]!.env).not.toHaveProperty("REMOTIONKC_PORT");
    for (const call of ran) expect(call.env).not.toHaveProperty("NODE_OPTIONS");
    const [made] = await calls();
    expect(made).toMatchObject({ verb: "build", exitCode: 0, sceneSha256: await currentSourceHash(paths.topicDir), deliverable: { written: false } });
    expect(made!.steps!.map((step) => step.step)).toEqual(["narrate", "render", "sidecars"]);
  });

  it("runs still as narrate and then a render that reads what narrate left, and lint as the native tsc", async () => {
    await succeeds(["still", "12", "3.5s"]);
    await succeeds(["lint"]);
    const ran = await sandboxCalls();
    expect(ran[1]!.argv.slice(-5)).toEqual(["still", "studio/two-boxes", "12", "3.5s", "--no-narrate"]);
    // tsc is a native program, started directly rather than through node.
    expect(ran[2]!.argv.slice(2)).toEqual([TSC, "--noEmit", "--pretty", "false", "-p", path.join(paths.checkout, "tsconfig.json")]);
    expect((await calls()).map((call) => call.verb)).toEqual(["still", "lint"]);
  });

  it("records a still of every scene as rendering them all, and a still of chosen moments as rendering none", async () => {
    await succeeds(["still"]);
    await succeeds(["still", "4.5s"]);
    expect((await calls()).map((call) => [call.verb, call.rendered])).toEqual([
      ["still", ["TB1_A", "TB2_B"]],
      ["still", []],
    ]);
  });

  it("relays a step's output as it comes, all of it, without stopping a step that says a lot", async () => {
    // 80 MiB on stdout, more than any buffer the wrapper could have held, then a last line on each stream.
    const fake = path.join(root, "fake-sandbox-exec");
    await writeFile(
      fake,
      `#!${process.execPath}\nconst chunk = Buffer.alloc(1024 * 1024, 120);\nfor (let i = 0; i < 80; i++) require("node:fs").writeSync(1, chunk);\nprocess.stdout.write("\\nlast line\\n");\nprocess.stderr.write("to stderr\\n");\n`,
      "utf8",
    );
    await chmod(fake, 0o755);
    const out = path.join(root, "wrapper-out.txt");
    const err = path.join(root, "wrapper-err.txt");
    const { openSync, closeSync, statSync, readFileSync } = await import("node:fs");
    const outFd = openSync(out, "w");
    const errFd = openSync(err, "w");
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(paths.wrapper, ["api"], { stdio: ["ignore", outFd, errFd] });
    closeSync(outFd);
    closeSync(errFd);
    expect(result.status).toBe(0);
    expect(statSync(out).size).toBe(80 * 1024 * 1024 + "\nlast line\n".length);
    expect(readFileSync(err, "utf8")).toContain("to stderr");
    expect((await calls()).at(-1)).toMatchObject({ verb: "api", exitCode: 0, steps: [{ step: "render", exitCode: 0 }] });
  });

  it("keeps the step going and stderr flowing when stdout's reader goes away", async () => {
    const fake = path.join(root, "fake-sandbox-exec");
    await writeFile(fake, `#!${process.execPath}\nconst fs = require("node:fs");\nconst chunk = Buffer.alloc(1024 * 1024, 120);\nfor (let i = 0; i < 4; i++) fs.writeSync(1, chunk);\nfs.writeSync(2, "the last diagnostic\\n");\n`, "utf8");
    await chmod(fake, 0o755);
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
    expect((await calls()).at(-1)).toMatchObject({ verb: "api", exitCode: 0, steps: [{ step: "render", exitCode: 0 }] });
  });

  it("refuses to render while one of the job's ports is held, and says so", async () => {
    const config = JSON.parse(/const CONFIG = ([\s\S]*?);\n/.exec(await readFile(paths.wrapper, "utf8"))![1]!) as { ports: number[] };
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(config.ports[1], "127.0.0.1", resolve));
    try {
      const result = await video(["build"]);
      expect(result.code).toBe(3);
      expect(result.stderr).toContain(`port ${config.ports[1]} is still held`);
      expect(await sandboxCalls()).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The gate's remotionkc steps                                                 */
/* -------------------------------------------------------------------------- */

describe("the gate, for a remotionkc job", () => {
  const classes = ["TB1_WhyItMatters", "TB2_Recap"];

  /** A parse that reads string literals with a pattern: the test's own sources only. */
  const parseScene = async (source: string): Promise<SceneParse> => ({
    ok: !source.includes("SYNTAX ERROR"),
    error: source.includes("SYNTAX ERROR") ? "line 1: ';' expected." : null,
    strings: [...source.matchAll(/'([^']*)'/g)].filter((match) => !source.slice(0, match.index).endsWith("from ")).map((match) => match[1]!),
    defaultExport: source.includes("export default"),
    imports: [...source.matchAll(/from '([^']*)'/g)].map((match) => match[1]!),
  });

  function tools(duration: number): GateTools {
    return {
      scan: async () => ({ ok: false, error: "unused", classes: [] }),
      lint: async () => ({ errors: [], warnings: [] }),
      parseScene,
      probe: async () => ({ streams: ["video", "audio"], duration }),
      poster: async (_input, out) => {
        await writeFile(out, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
        return true;
      },
    };
  }

  async function layOutJob(lines: string[][], options: { scene?: string; narration?: unknown; lastTail?: number } = {}) {
    const paths = await jobPaths();
    const own = remotionkcPaths(paths);
    const brief = { ...narratedBrief(), tool: "remotionkc" as const };
    await mkdir(paths.topicDir, { recursive: true });
    await mkdir(paths.outTopic, { recursive: true });
    await writeFile(paths.sceneFile, options.scene ?? "export default defineTopic({ component: () => { const a = 'Client'; const b = 'API'; } });\n");
    await writeFile(own.narration, JSON.stringify(options.narration ?? classes.map((scene, i) => ({ scene, title: `Chapter ${i + 1}`, lines: lines[i] }))));
    await writeFile(paths.topicYml, `topic: ${brief.topic}\nprefix: TB\n`);
    const voiced = lines.flat();
    let at = 0;
    const segments = lines.flatMap((chapter, i) =>
      chapter.map((text) => {
        at += 10;
        return { scene: classes[i], end: at, text };
      }),
    );
    await writeFile(paths.deliverable, mp4Bytes());
    await writeFile(paths.transcript, JSON.stringify({ segments }));
    await writeFile(
      paths.chapters,
      JSON.stringify(classes.map((scene, i) => ({ scene, end: (segments.filter((s) => s.scene === scene).at(-1)?.end ?? 0) + (i === classes.length - 1 ? (options.lastTail ?? 1) : 1) }))),
    );
    await writeFile(paths.vtt, "WEBVTT\n");
    const hash = (await currentSourceHash(paths.topicDir))!;
    return { paths, own, brief, voiced, hash };
  }

  const at = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();
  const still = (when: string, hash: string, rendered: string[] = classes): WrapperCall => ({ verb: "still", scenes: classes, startedAt: when, endedAt: when, exitCode: 0, sceneSha256: hash, rendered });
  const built = (when: string, hash: string): WrapperCall => ({ verb: "build", startedAt: when, endedAt: when, exitCode: 0, sceneSha256: hash, rendered: [], deliverable: { written: true } });

  it("passes a job whose narration is the brief's, whose labels are on screen, and whose two sheets were read, copying every source file", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const { paths, own, voiced, hash } = await layOutJob(lines);
    const result = await runVideoGate({
      brief: { ...brief, tool: "remotionkc" },
      paths,
      classes,
      startedAtMs: Date.now() - 60_000,
      sourceHashBefore: null,
      calls: [still(at(-5_000), hash), built(at(-2_000), hash)],
      reads: [
        { path: own.stillsSheet, at: at(-4_000) },
        { path: own.buildSheet, at: at(-1_000) },
      ],
      tools: tools(Math.round(secondsForLines(voiced))),
      backend: backendFor("remotionkc"),
    });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual(["source", "lint", "script", "topic", "build", "probe", "sync", "length", "poster", "looked"]);
    expect(Object.keys(result.copies ?? {}).filter((name) => name.startsWith("source/")).sort()).toEqual(["source/composition.tsx", "source/narration.json", "source/topic.yml"]);
    expect(result.looked).toMatchObject({ build: { readAt: expect.any(String) } });
  });

  it("judges a scene's extraFrames where it lands, by the picture after its last line, as the manual says", async () => {
    // Greptile on #293: the manual capped extraFrames at 90 and nothing
    // checked it. The rule is now the one step 7 measures in the build, so a
    // computed value or another frame rate cannot slip past it.
    const manual = remotionkcManualText("/job/remotionkc", "", await jobPaths());
    expect(manual).toContain(`refuses one whose picture runs more than ${HELD_TAIL_SECONDS} seconds past the end of its last line, the 0.4 s tail included: at 30 fps that is \`extraFrames\` of at most ${MAX_EXTRA_FRAMES_AT_30}.`);
    expect(MAX_EXTRA_FRAMES_AT_30).toBe(108);
    expect(manual).not.toContain("at most 90");
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const gateWith = async (lastTail: number) => {
      const { paths, own, voiced, hash } = await layOutJob(lines, { lastTail });
      return runVideoGate({
        brief: { ...brief, tool: "remotionkc" },
        paths,
        classes,
        startedAtMs: Date.now() - 60_000,
        sourceHashBefore: null,
        calls: [still(at(-5_000), hash), built(at(-2_000), hash)],
        reads: [
          { path: own.stillsSheet, at: at(-4_000) },
          { path: own.buildSheet, at: at(-1_000) },
        ],
        tools: tools(Math.round(secondsForLines(voiced))),
        backend: backendFor("remotionkc"),
      });
    };
    // The most the manual allows: the 0.4 s tail and 108 frames at 30 fps.
    const most = await gateWith(0.4 + MAX_EXTRA_FRAMES_AT_30 / 30);
    expect(most.steps.find((step) => step.name === "sync")).toMatchObject({ ok: true });
    // 120 frames (four seconds) on top of the tail is past it.
    const over = await gateWith(0.4 + 120 / 30);
    expect(over.ok).toBe(false);
    expect(over.findings.join(" ")).toContain("TB2_Recap holds 4.4s of picture after its last line; four is the most");
  });

  it("holds the build to every source file, and asks for the build's sheet to be read", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const { paths, own, voiced, hash } = await layOutJob(lines);
    const base = { brief: { ...brief, tool: "remotionkc" as const }, paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, tools: tools(Math.round(secondsForLines(voiced))), backend: backendFor("remotionkc") };
    const unread = await runVideoGate({ ...base, calls: [still(at(-5_000), hash), built(at(-2_000), hash)], reads: [{ path: own.stillsSheet, at: at(-4_000) }] });
    expect(unread.ok).toBe(false);
    expect(unread.findings.join(" ")).toContain("look at the build's sheet");
    // An edit to the narration after the build: the video is not the source.
    await writeFile(own.narration, JSON.stringify(classes.map((scene, i) => ({ scene, title: "x", lines: lines[i] }))));
    const stale = await runVideoGate({ ...base, calls: [still(at(-5_000), hash), built(at(-2_000), hash)], reads: [] });
    expect(stale.steps.find((step) => step.name === "build")).toMatchObject({ ok: false });
  });

  it("counts a look at the stills only of the source it checked, and only before a later still replaced the sheet", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const { paths, own, voiced, hash } = await layOutJob(lines);
    const base = { brief: { ...brief, tool: "remotionkc" as const }, paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, tools: tools(Math.round(secondsForLines(voiced))), backend: backendFor("remotionkc") };
    const buildRead = { path: own.buildSheet, at: at(-500) };
    // Looked at, then the scene was edited, then built: the stills were of another source.
    const edited = await runVideoGate({ ...base, calls: [still(at(-6_000), "an-earlier-source"), built(at(-2_000), hash)], reads: [{ path: own.stillsSheet, at: at(-5_000) }, buildRead] });
    expect(edited.ok).toBe(false);
    expect(edited.findings.join(" ")).toContain("the source changed after the last still of every scene");
    // A whole still, then one of chosen moments that replaced its sheet before it was Read.
    const replaced = await runVideoGate({
      ...base,
      calls: [still(at(-6_000), hash), still(at(-5_000), hash, []), built(at(-2_000), hash)],
      reads: [{ path: own.stillsSheet, at: at(-4_000) }, buildRead],
    });
    expect(replaced.ok).toBe(false);
    expect(replaced.findings.join(" ")).toContain("was replaced by a later still before it was Read");
    // Only stills of chosen moments: no still of every scene at all.
    const partial = await runVideoGate({ ...base, calls: [still(at(-5_000), hash, []), built(at(-2_000), hash)], reads: [{ path: own.stillsSheet, at: at(-4_000) }, buildRead] });
    expect(partial.findings.join(" ")).toContain("there is no still of every scene");
    // Read before the moments still replaced it: it counts.
    const read = await runVideoGate({
      ...base,
      calls: [still(at(-6_000), hash), still(at(-4_000), hash, []), built(at(-2_000), hash)],
      reads: [{ path: own.stillsSheet, at: at(-5_000) }, buildRead],
    });
    expect(read.findings).toEqual([]);
    // A still refused for a held port ran no step and wrote no sheet: a Read after it still counts.
    const refused: WrapperCall = { verb: "still", startedAt: at(-5_000), endedAt: at(-5_000), exitCode: 3, steps: [], sceneSha256: hash, rendered: [] };
    const afterRefusal = await runVideoGate({
      ...base,
      calls: [still(at(-6_000), hash), refused, built(at(-2_000), hash)],
      reads: [{ path: own.stillsSheet, at: at(-4_000) }, buildRead],
    });
    expect(afterRefusal.findings).toEqual([]);
    // One that ran and failed did replace it: remotionkc clears the stills before it renders.
    const failed: WrapperCall = { ...refused, exitCode: 1, steps: [{ step: "render", exitCode: 1, ms: 900 }] };
    const afterFailure = await runVideoGate({
      ...base,
      calls: [still(at(-6_000), hash), failed, built(at(-2_000), hash)],
      reads: [{ path: own.stillsSheet, at: at(-4_000) }, buildRead],
    });
    expect(afterFailure.findings.join(" ")).toContain("was replaced by a later still before it was Read");
  });

  it("refuses a source bigger than Accept stores, and counts labels only in files the scene reaches", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const gate = async (job: Awaited<ReturnType<typeof layOutJob>>) =>
      runVideoGate({ brief: { ...brief, tool: "remotionkc" }, paths: job.paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, calls: [], reads: [], tools: tools(60), backend: backendFor("remotionkc") });

    // Two files each under the per-file cap, together over the catalog's total.
    const big = await layOutJob(lines);
    await writeFile(path.join(big.paths.topicDir, "data.ts"), `export const blob = '${"x".repeat(300 * 1024)}';\n`);
    await writeFile(path.join(big.paths.topicDir, "more.ts"), `export const more = '${"y".repeat(300 * 1024)}';\n`);
    const sized = await gate(big);
    expect(sized.steps).toEqual([{ name: "source", ok: false, detail: expect.stringMatching(/over the 524288 Accept stores/) }]);

    await rm(path.join(big.paths.topicDir, "data.ts"));
    await rm(path.join(big.paths.topicDir, "more.ts"));
    // The label "API" only in a helper nothing imports: not shown.
    const unused = await layOutJob(lines, { scene: "export default defineTopic({ component: () => { const a = 'Client'; } });\n" });
    await writeFile(path.join(unused.paths.topicDir, "parts.ts"), "export const label = 'API';\n");
    expect((await gate(unused)).findings.join(" ")).toContain('never shows the label "API"');
    // The same helper, imported by the scene: shown.
    await writeFile(unused.paths.sceneFile, "import {label} from './parts';\nexport default defineTopic({ component: () => { const a = 'Client'; } });\n");
    expect((await gate(unused)).findings.join(" ")).not.toContain("never shows the label");
  });

  it("reports reworded lines, and refuses chapters out of order, a missing label, any hold and a composition that does not parse", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const reworded = [[`${lines[0]![0]!} Plainly.`], lines[1]!];
    const gate = async (job: Awaited<ReturnType<typeof layOutJob>>) =>
      runVideoGate({ brief: { ...brief, tool: "remotionkc" }, paths: job.paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, calls: [], reads: [], tools: tools(60), backend: backendFor("remotionkc") });

    const changed = await gate(await layOutJob(reworded));
    expect(changed.script?.changes.filter((change) => change.kind !== "unchanged")).toEqual([
      { scene: classes[0], kind: "reworded", brief: lines[0]![0], voiced: [reworded[0]![0]] },
    ]);

    const swapped = await gate(await layOutJob(lines, { narration: [...classes].reverse().map((scene) => ({ scene, title: "t", lines: ["a line"] })) }));
    expect(swapped.findings.join(" ")).toContain(`must be exactly ${classes.join(", ")}`);

    const unlabelled = await gate(await layOutJob(lines, { scene: "export default defineTopic({ component: () => { const a = 'Client'; } });\n" }));
    expect(unlabelled.findings.join(" ")).toContain('never shows the label "API"');

    const held = await gate(await layOutJob(lines, { narration: classes.map((scene, i) => ({ scene, title: "t", hold: 1, lines: lines[i] })) }));
    expect(held.findings.join(" ")).toContain('has a "hold", which this tool does not read; a scene holds with extraFrames in defineTopic');

    const broken = await gate(await layOutJob(lines, { scene: "SYNTAX ERROR export default 1" }));
    expect(broken.steps).toEqual([{ name: "source", ok: false, detail: "composition.tsx: line 1: ';' expected." }]);

    const noExport = await gate(await layOutJob(lines, { scene: "const a = 'Client'; const b = 'API';\n" }));
    expect(noExport.findings.join(" ")).toContain("composition.tsx must `export default defineTopic({ component })`");
  });
});
