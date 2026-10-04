import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backendFor } from "../src/video/backend";
import { secondsForLines } from "../src/video/brief";
import { runVideoGate, type GateTools, type SceneParse } from "../src/video/gate";
import type { VideoPaths } from "../src/video/paths";
import { scaffoldRevideokc } from "../src/video/revideokc/checkout";
import { renderKey } from "../src/video/revideokc/doctor";
import { revideokcPaths, revideokcVideoPaths } from "../src/video/revideokc/paths";
import { freePair, jobPortStart, JOB_PORTS, DOCTOR_PORTS } from "../src/video/revideokc/ports";
import { jobPorts, releaseJobPorts } from "../src/video/ports";
import { buildRevideokcProfile, profilePorts, RENDER_SERVICES, revideokcEnv } from "../src/video/revideokc/sandbox";
import { buildRevideokcSettings } from "../src/video/revideokc/settings";
import { combinedHash, COMBINED_HASH_JS, currentSourceHash, readSources } from "../src/video/revideokc/source";
import type { RevideokcToolchain } from "../src/video/revideokc/toolchain";
import { revideokcProblems } from "../src/video/revideokc/toolchain";
import { revideokcWrapperConfig, writeRevideokcWrapper } from "../src/video/revideokc/wrapper";
import type { WrapperCall } from "../src/video/calls";

import { mp4Bytes, narratedBrief } from "./video-fixture";
import { wrapperPorts } from "./wrapper-ports";

/**
 * The revideokc backend (phase 2c of docs/STUDIO-VIDEO-TOOLS.md) without
 * running Chrome or a voice: the three profiles' allowances pinned the way
 * manimkc's are, the job's port pair and nothing else on the network, the
 * environment built from nothing, the wrapper's verbs and its source hash
 * held equal to the runner's, the permission file, the scaffold, and the
 * gate's revideokc steps over recorded parses. The sandbox measured for real
 * is `video-revideokc-sandbox.test.ts`.
 */

let root: string;
const saved = { STUDIO_HOME: process.env.STUDIO_HOME };

beforeEach(async () => {
  root = realpathSync(await mkdtemp(path.join(tmpdir(), "studio-video-revideokc-")));
  process.env.STUDIO_HOME = path.join(root, "home");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const REVIDEOKC = "/Users/me/self-learn/tools/revideokc";

/** A toolchain that names programs without running any. */
function fixedTools(): RevideokcToolchain {
  return {
    platform: "darwin",
    sandboxExec: "/usr/bin/sandbox-exec",
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
    revideokc: {
      root: REVIDEOKC,
      nodeModules: `${REVIDEOKC}/node_modules`,
      venv: `${REVIDEOKC}/.venv`,
      gnosiaPython: { link: `${REVIDEOKC}/.venv/bin/python`, real: "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12", home: "/Library/Frameworks/Python.framework" },
      scriptShells: [] as string[],
      chrome: { binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", bundle: "/Applications/Google Chrome.app" },
      ffmpegInstaller: `${REVIDEOKC}/node_modules/@ffmpeg-installer`,
      ffprobeInstaller: `${REVIDEOKC}/node_modules/@ffprobe-installer`,
      typescript: `${REVIDEOKC}/node_modules/typescript`,
      revideo: "0.11.0",
      splitBuild: true,
      nodeVersion: "22.23.1",
      ownerHome: "/Users/me/.self-learn/revideokc",
    },
  };
}

async function jobPaths(id = "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc"): Promise<VideoPaths> {
  return revideokcVideoPaths(id, "two-boxes");
}

const profileFor = (kind: "render" | "narrate" | "gate", paths: VideoPaths, base = 47012, tools = fixedTools()): string =>
  buildRevideokcProfile(kind, { tools, paths, home: "/Users/me", studioHome: path.join(root, "home"), base });

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

describe("the revideokc profiles", () => {
  it("let the render profile start node, Chrome and Revideo's ffmpeg, and no Python and no shell", async () => {
    const paths = await jobPaths();
    const text = profileFor("render", paths);
    const exec = block(text, "allow process-exec").join(" ");
    expect(exec).toContain('(literal "/usr/local/bin/node")');
    expect(exec).toContain('(subpath "/Applications/Google Chrome.app")');
    expect(exec).toContain(`(subpath "${REVIDEOKC}/node_modules/@ffmpeg-installer")`);
    expect(exec).toContain(`(subpath "${REVIDEOKC}/node_modules/@ffprobe-installer")`);
    expect(exec).not.toMatch(/python|Python\.framework|\/bin\/sh|\/bin\/bash|\/usr\/bin\/env/);
  });

  it("let the render profile write render/ only, make symlinks only in its temporary directory, and refuse a hard link", async () => {
    const paths = await jobPaths();
    const text = profileFor("render", paths);
    expect(block(text, "allow file-write*")).toEqual([`(subpath "${paths.render}")`, '(literal "/dev/null")', '(literal "/dev/dtracehelper"))']);
    expect(text).toContain("(deny file-link)");
    expect(text).toContain("(deny file-write-create (vnode-type SYMLINK))");
    expect(text).toContain(`(allow file-write-create (require-all (vnode-type SYMLINK) (subpath "${paths.renderTmp}")))`);
    // Read: the job, the real node_modules and the Chrome bundle, over the denied places.
    expect(block(text, "allow file-read*").join(" ")).toBe(
      `(subpath "${paths.checkout}") (subpath "${paths.render}") (subpath "${REVIDEOKC}/node_modules") (subpath "/Applications/Google Chrome.app"))`,
    );
    expect(text).toContain('(subpath "/Users/me")');
  });

  it("open exactly the job's two ports, and unix sockets only under render/tmp", async () => {
    const paths = await jobPaths();
    const text = profileFor("render", paths, 47012);
    expect(profilePorts(text)).toEqual([47012, 47013]);
    expect(block(text, "allow network-outbound")).toEqual(['(remote ip "localhost:47012")', '(remote ip "localhost:47013"))']);
    const network = text.split("\n").filter((line) => line.includes("network"));
    expect(network).toEqual([
      "(allow network-bind network-inbound",
      "(allow network-outbound",
      `(allow network* (local unix-socket (subpath "${paths.renderTmp}")))`,
      `(allow network-outbound (remote unix-socket (subpath "${paths.renderTmp}")))`,
    ]);
    // Another job's pair is another job's profile, with nothing else changed.
    const other = profileFor("render", paths, 48100);
    expect(profilePorts(other)).toEqual([48100, 48101]);
    expect(other.replaceAll("4810", "4701").replaceAll(":47010", ":47012").replaceAll(":47011", ":47013")).toBe(text);
  });

  it("look up the spike's Mach services and Chrome's rendezvous only, and register Chrome's names only", async () => {
    const text = profileFor("render", await jobPaths());
    expect(block(text, "allow mach-lookup")).toEqual([
      ...RENDER_SERVICES.map((name) => `(global-name "${name}")`),
      '(global-name-regex #"^com\\.google\\.Chrome\\.MachPortRendezvousServer\\.")',
    ].map((line, i, all) => (i === all.length - 1 ? `${line})` : line)));
    expect(RENDER_SERVICES).toHaveLength(12);
    expect(text).toContain('(allow mach-register (global-name-regex #"^com\\.google\\.Chrome\\."))');
  });

  it("let the narration profile run a shell only for a console script uv wrote in its #!/bin/sh form", async () => {
    const paths = await jobPaths();
    const execOf = (kind: "render" | "narrate", shells: string[]) => {
      const tools = fixedTools();
      tools.revideokc.scriptShells = shells;
      return block(profileFor(kind, paths, 47012, tools), "allow process-exec").join(" ");
    };
    // a script that names its python: no shell at all
    expect(execOf("narrate", [])).not.toMatch(/\/bin\/(ba)?sh/);
    // the #!/bin/sh form: /bin/sh and the shell it execs, in the narration profile only
    const shelled = execOf("narrate", ["/bin/sh", "/bin/bash"]);
    expect(shelled).toContain('(literal "/bin/sh")');
    expect(shelled).toContain('(literal "/bin/bash")');
    expect(execOf("render", ["/bin/sh", "/bin/bash"])).not.toMatch(/\/bin\/(ba)?sh/);
  });

  it("read a console script's shells from its first line", async () => {
    const { scriptShells } = await import("../src/video/script-shells");
    const dir = await mkdtemp(path.join(tmpdir(), "script-shells-"));
    const named = path.join(dir, "named");
    const shelled = path.join(dir, "shelled");
    await writeFile(named, "#!/very/long/venv/bin/python\nimport sys\n");
    await writeFile(shelled, '#!/bin/sh\nexec "/a/path/too/long/for/a/shebang/python" "$0" "$@"\n');
    expect(scriptShells(named)).toEqual([]);
    expect(scriptShells(path.join(dir, "missing"))).toEqual([]);
    const shells = scriptShells(shelled);
    expect(shells[0]).toBe("/bin/sh");
    if (process.platform === "darwin") expect(shells[1]).toBe(realpathSync("/private/var/select/sh"));
    await rm(dir, { recursive: true, force: true });
  });

  it("give the narration profile its two interpreters and the model, no network and no Mach service", async () => {
    const paths = await jobPaths();
    const own = revideokcPaths(paths);
    const text = profileFor("narrate", paths);
    const exec = block(text, "allow process-exec").join(" ");
    expect(exec).toContain(`(literal "${REVIDEOKC}/.venv/bin/gnosia-audio")`);
    expect(exec).toContain(`(literal "${REVIDEOKC}/.venv/bin/python")`);
    expect(exec).toContain('(literal "/Users/me/self-learn/tools/manimkc/.venv-tts/bin/python")');
    expect(exec).not.toContain("Google Chrome");
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

  it("let the gate profile run node and the media programs, read candidate/ and TypeScript, and write the poster alone", async () => {
    const paths = await jobPaths();
    const text = profileFor("gate", paths);
    expect(block(text, "allow file-read*").join(" ")).toBe(`(subpath "${paths.candidate}") (subpath "${REVIDEOKC}/node_modules/typescript"))`);
    expect(block(text, "allow file-write*")).toEqual([`(literal "${paths.poster}")`, '(literal "/dev/null")', '(literal "/dev/dtracehelper"))']);
    expect(text).not.toMatch(/network|mach-lookup/);
  });

  it("refuse a port pair no profile can name, and a path that would end a string", async () => {
    const paths = await jobPaths();
    expect(() => profileFor("render", paths, 80)).toThrow(/not a base port/);
    expect(() => profileFor("render", { ...paths, render: '/x/"evil' }, 47012)).toThrow(/cannot go in a sandbox profile/);
  });
});

describe("the revideokc environment", () => {
  it("is built from nothing: the render's names the port and Chrome's flags, the narration's the voice, and neither passes a secret on", async () => {
    const paths = await jobPaths();
    process.env.ANTHROPIC_API_KEY = "sk-not-for-the-job";
    process.env.NODE_OPTIONS = "--require /evil.js";
    try {
      const input = { tools: fixedTools(), paths, home: "/Users/me", voice: "af_heart", base: 47012 };
      const render = revideokcEnv("render", input);
      expect(render).toMatchObject({ REVIDEOKC_VITE_PORT: "47012", REVIDEOKC_CHROME_ARGS: "--no-sandbox", MAC_CHROMIUM_TMPDIR: paths.renderTmp, DISABLE_TELEMETRY: "true", REVIDEOKC_HOME: paths.render });
      const narrate = revideokcEnv("narrate", input);
      expect(narrate).toMatchObject({ MANIMKC_HOME: paths.render, NARRATION_BACKEND: "kokoro", NARRATION_KOKORO_VOICE: "af_heart", HF_HUB_OFFLINE: "1" });
      expect(narrate).not.toHaveProperty("REVIDEOKC_VITE_PORT");
      expect(narrate).not.toHaveProperty("MANIMKC_ROOT");
      for (const env of [render, narrate, revideokcEnv("gate", input)]) {
        expect(Object.keys(env).some((key) => /KEY|TOKEN|SECRET|NODE_OPTIONS/.test(key))).toBe(false);
      }
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.NODE_OPTIONS;
    }
  });
});

describe("the job's ports", () => {
  it("start where the job's id points, on an even base inside the jobs' range, away from the doctor's", () => {
    for (const id of ["a", "b", "0f0f0f0f-aaaa-4bbb-8ccc-123456789abc"]) {
      const start = jobPortStart(id);
      expect(start % 2).toBe(0);
      expect(start).toBeGreaterThanOrEqual(JOB_PORTS.first);
      expect(start).toBeLessThanOrEqual(JOB_PORTS.last);
    }
    expect(DOCTOR_PORTS.last).toBeLessThan(JOB_PORTS.first);
    expect(jobPortStart("a")).toBe(jobPortStart("a"));
  });

  it("skip a pair something already listens on", async () => {
    // In revideokc's half of the range (`wrapper-ports.ts`), so the port held here is never remotionkc's wrapper's.
    const base = await freePair(JOB_PORTS, 47000);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(base + 1, "127.0.0.1", resolve));
    try {
      const next = await freePair(JOB_PORTS, base);
      expect(next).not.toBe(base);
      expect(next % 2).toBe(0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("are held from setup until the job ends, so two jobs running at once never get one pair", async () => {
    // Two ids whose search starts at the same pair: the case where both
    // setups would find it free, since neither job's render has bound it yet.
    const sharingAStart = (): [string, string] => {
      const seen = new Map<number, string>();
      for (let i = 0; ; i += 1) {
        const id = `job-${i}`;
        const other = seen.get(jobPortStart(id));
        if (other !== undefined) return [other, id];
        seen.set(jobPortStart(id), id);
      }
    };
    const [first, second] = sharingAStart();
    try {
      const [a, b] = await Promise.all([jobPorts(first), jobPorts(second)]);
      expect(a).not.toBe(b);
      // Asked again for one job, the search passes over only the other's pair.
      expect(await jobPorts(second)).toBe(b);
      // Once the first job has ended, its pair is the next search's to take.
      releaseJobPorts(first);
      expect(await jobPorts(second)).toBe(a);
    } finally {
      releaseJobPorts(first);
      releaseJobPorts(second);
    }
  });
});

describe("the source", () => {
  it("hashes the same in the wrapper's program as in the runner, and moves with any file of it", async () => {
    const dir = path.join(root, "topic");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "scene.tsx"), "export default 1;\n");
    await writeFile(path.join(dir, "narration.json"), "[]\n");
    await writeFile(path.join(dir, "parts.ts"), "export const x = 1;\n");
    await writeFile(path.join(dir, "topic.yml"), "topic: x\n");
    await writeFile(path.join(dir, "notes.md"), "not source\n");
    const wrapperHash = new Function("fs", "crypto", `${COMBINED_HASH_JS}\nreturn sourceHash;`)(await import("node:fs"), await import("node:crypto")) as (dir: string) => string | null;
    const before = await currentSourceHash(dir);
    expect(before).not.toBeNull();
    expect(wrapperHash(dir)).toBe(before);
    expect((await readSources(dir)).map((file) => file.name)).toEqual(["narration.json", "parts.ts", "scene.tsx"]);
    // topic.yml and other files are not the source the build is held to.
    await writeFile(path.join(dir, "notes.md"), "changed\n");
    await writeFile(path.join(dir, "topic.yml"), "topic: y\n");
    expect(await currentSourceHash(dir)).toBe(before);
    await writeFile(path.join(dir, "parts.ts"), "export const x = 2;\n");
    expect(await currentSourceHash(dir)).not.toBe(before);
    expect(wrapperHash(dir)).toBe(await currentSourceHash(dir));
    const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
    expect(combinedHash([{ name: "b", sha256: sha("1") }, { name: "a", sha256: sha("2") }])).toBe(combinedHash([{ name: "a", sha256: sha("2") }, { name: "b", sha256: sha("1") }]));
  });
});

describe("the scaffold", () => {
  it("writes topic.yml, the brief's lines as narration.json, and a stub scene, and names the scenes as manimkc does", async () => {
    const paths = await jobPaths();
    const brief = { ...narratedBrief(), tool: "revideokc" as const };
    const made = await scaffoldRevideokc(paths, brief, null);
    expect(made.classes).toEqual(["TB1_WhyItMatters", "TB2_Recap"]);
    const yml = await readFile(paths.topicYml, "utf8");
    expect(yml).toContain(`topic: ${brief.topic}`);
    expect(yml).toContain("prefix: TB\n");
    expect(yml).toContain("  output: two_boxes.mp4\n");
    const narration = JSON.parse(await readFile(revideokcPaths(paths).narration, "utf8")) as { scene: string; title: string; lines: string[] }[];
    expect(narration.map((chapter) => chapter.scene)).toEqual(made.classes);
    expect(narration[0]!.title).toBe("Why it matters");
    expect(narration.map((chapter) => chapter.lines)).toEqual(brief.scenes.map((scene) => scene.beats.map((beat) => beat.say)));
    expect(await readFile(paths.sceneFile, "utf8")).toContain('const SCENES = ["TB1_WhyItMatters","TB2_Recap"];');
    expect(path.basename(paths.sceneFile)).toBe("scene.tsx");
    // A deliverable at manimkc's path, so the gate reads it unchanged.
    expect(paths.deliverable.endsWith(path.join("out", "studio", "two-boxes", "two_boxes.mp4"))).toBe(true);
  });

  it("refuses a silent brief, and takes a change's files, dropping anything that is not a revideokc source", async () => {
    const paths = await jobPaths();
    await expect(scaffoldRevideokc(paths, { ...narratedBrief(), voice: "none" }, null)).rejects.toThrow(/narrated/);
    const files = new Map<string, Buffer>([
      ["scene.tsx", Buffer.from("export default 1;\n")],
      ["narration.json", Buffer.from("[]\n")],
      ["topic.yml", Buffer.from("topic: old\nprefix: TB\n")],
      ["evil.py", Buffer.from("import os\n")],
      ["../escape.ts", Buffer.from("x")],
    ]);
    await scaffoldRevideokc(paths, { ...narratedBrief(), tool: "revideokc" }, files);
    expect(await readFile(paths.topicYml, "utf8")).toContain(`topic: ${narratedBrief().topic}`);
    await expect(readFile(path.join(paths.topicDir, "evil.py"))).rejects.toThrow();
    await expect(readFile(path.join(paths.job, "checkout", "topics", "studio", "escape.ts"))).rejects.toThrow();
  });
});

describe("the permission file", () => {
  it("lets the agent edit the scene, the narration and TypeScript beside them, read its docs and sheets, and nothing of the owner's videos", async () => {
    const paths = await jobPaths();
    const own = revideokcPaths(paths);
    const settings = buildRevideokcSettings({
      jobId: "j",
      paths,
      revideokcRoot: REVIDEOKC,
      revideokcHome: "/Users/me/.self-learn/revideokc",
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
    for (const rule of [
      `Edit(/${paths.topicYml})`,
      `Edit(/${paths.lib}/**)`,
      `Edit(/${paths.render}/**)`,
      `Read(/${REVIDEOKC}/topics/**)`,
      "Read(//Users/me/.self-learn/revideokc/**)",
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
  it("keeps the stills sheet and the build's, counts a sheet only at their paths, and adds the docs and stills as directories", async () => {
    const paths = await jobPaths();
    const own = revideokcPaths(paths);
    const backend = backendFor("revideokc");
    expect(backend.sheets(paths, ["TB1_A", "TB2_B"])).toEqual([
      { id: "stills", title: "Stills", file: own.stillsSheet, kept: "stills.sheet.png", scenes: ["TB1_A", "TB2_B"] },
      { id: "build", title: "The build", file: own.buildSheet, kept: "two_boxes.sheet.png", scenes: [] },
    ]);
    expect(backend.isSheet(paths, own.stillsSheet)).toBe(true);
    expect(backend.isSheet(paths, own.buildSheet)).toBe(true);
    expect(backend.isSheet(paths, path.join(paths.topicDir, "x.sheet.png"))).toBe(false);
    expect(backend.addDirs(paths)).toEqual([paths.lib, own.docs, paths.out, own.stillsRoot]);
    expect(backend.sourcePattern.test("scene.tsx")).toBe(true);
    expect(backend.sourcePattern.test("narration.json")).toBe(true);
    expect(backend.sourcePattern.test("two_boxes.py")).toBe(false);
  });

  it("says why a toolchain without the split build, Chrome or gnosia-audio cannot run a job", async () => {
    const tools = fixedTools();
    const checkout = path.join(root, "revideokc");
    await mkdir(path.join(checkout, "tools", "cli"), { recursive: true });
    await writeFile(path.join(checkout, "tools", "cli", "revideokc.mjs"), "");
    expect(revideokcProblems(tools).join("\n")).toMatch(/is not a revideokc checkout/);
    const broken: RevideokcToolchain = { ...tools, revideokc: { ...tools.revideokc, root: checkout, splitBuild: false, chrome: null, gnosiaPython: null, nodeVersion: "22.10.0" } };
    expect(revideokcProblems(broken).join("\n")).toMatch(
      /no build --no-narrate[\s\S]*22\.18[\s\S]*Chrome[\s\S]*narration-deps/,
    );
  });
});

describe("the doctor's kept build", () => {
  it("is keyed on the code a render runs: a change to lib/, src/ or the CLI renders again, node_modules does not count", async () => {
    const checkout = path.join(root, "revideokc-code");
    for (const dir of ["lib", "src", "tools/cli", "node_modules/x"]) await mkdir(path.join(checkout, dir), { recursive: true });
    await writeFile(path.join(checkout, "lib", "topic.tsx"), "export const a = 1;\n");
    await writeFile(path.join(checkout, "src", "project.ts"), "export default 1;\n");
    await writeFile(path.join(checkout, "tools", "cli", "revideokc.mjs"), "// the CLI\n");
    const tools = { ...fixedTools(), revideokc: { ...fixedTools().revideokc, root: checkout } };
    const first = await renderKey(tools, "af_heart");
    expect(await renderKey(tools, "af_heart")).toBe(first);
    await writeFile(path.join(checkout, "node_modules", "x", "index.js"), "changed\n");
    expect(await renderKey(tools, "af_heart")).toBe(first);
    for (const [file, body] of [["lib/topic.tsx", "export const a = 2;\n"], ["src/project.ts", "export default 2;\n"], ["tools/cli/revideokc.mjs", "// changed\n"]] as const) {
      const before = await renderKey(tools, "af_heart");
      await writeFile(path.join(checkout, file), body);
      expect(await renderKey(tools, "af_heart"), file).not.toBe(before);
    }
    expect(await renderKey(tools, "am_michael")).not.toBe(await renderKey(tools, "af_heart"));
  });

  it("is keyed on what is installed: a reinstall, an upgrade or a Chrome update at the same paths renders again", async () => {
    // Greptile on #293, for remotionkc's doctor and this one alike: the key
    // was paths, so a reinstall kept a passing verdict for six hours.
    const checkout = path.join(root, "revideokc-installed");
    const nodeModules = path.join(checkout, "node_modules");
    const bundle = path.join(checkout, "Chrome.app");
    const binary = path.join(bundle, "Contents", "MacOS", "Chrome");
    const put = async (file: string, body: string): Promise<void> => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    };
    const pkg = (name: string, version: string): string => JSON.stringify({ name, version });
    await put(path.join(checkout, "package-lock.json"), "{}\n");
    await put(path.join(nodeModules, ".package-lock.json"), "{}\n");
    await put(path.join(nodeModules, "@revideo/core/package.json"), pkg("@revideo/core", "0.11.0"));
    await put(path.join(nodeModules, "@revideo/renderer/package.json"), pkg("@revideo/renderer", "0.11.0"));
    await put(path.join(bundle, "Contents", "Info.plist"), "<string>140.0</string>\n");
    await put(binary, "chrome\n");
    const tools = { ...fixedTools(), revideokc: { ...fixedTools().revideokc, root: checkout, nodeModules, chrome: { binary, bundle } } };
    const first = await renderKey(tools, "af_heart");
    expect(await renderKey(tools, "af_heart")).toBe(first);
    for (const [file, body] of [
      [path.join(nodeModules, "@revideo/core/package.json"), pkg("@revideo/core", "0.11.1")],
      [path.join(nodeModules, "@revideo/renderer/package.json"), pkg("@revideo/renderer", "0.11.1")],
      [path.join(nodeModules, ".package-lock.json"), "{\"lockfileVersion\":3}\n"],
      [path.join(checkout, "package-lock.json"), "{\"lockfileVersion\":3}\n"],
      [path.join(bundle, "Contents", "Info.plist"), "<string>141.0</string>\n"],
      [binary, "a newer chrome\n"],
    ] as const) {
      const before = await renderKey(tools, "af_heart");
      await put(file, body);
      expect(await renderKey(tools, "af_heart"), file).not.toBe(before);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The wrapper                                                                */
/* -------------------------------------------------------------------------- */

const execFileAsync = promisify(execFile);

// The wrapper's shebang is `#!/usr/bin/env -i <node>`, which only macOS splits
// into arguments (Linux hands env "-i <node>" as one, and env exits 125); the
// video runner is macOS-only anyway (Seatbelt), as manimkc's wrapper test says.
describe.skipIf(process.platform !== "darwin")("the revideokc wrapper", () => {
  let paths: VideoPaths;
  let recordFile: string;

  beforeEach(async () => {
    paths = await jobPaths();
    recordFile = path.join(root, "sandbox-calls.ndjson");
    const fake = path.join(root, "fake-sandbox-exec");
    // Records what it was asked to run, and stands in for a still's render by writing the stills sheet.
    const sheet = revideokcPaths(paths).stillsSheet;
    await writeFile(
      fake,
      `#!${process.execPath}\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(recordFile)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }) + "\\n");\nif (process.argv.includes("still")) { fs.mkdirSync(${JSON.stringify(path.dirname(sheet))}, { recursive: true }); fs.writeFileSync(${JSON.stringify(sheet)}, "png"); }\n`,
      "utf8",
    );
    await chmod(fake, 0o755);
    await mkdir(paths.topicDir, { recursive: true });
    await writeFile(paths.sceneFile, "export default 1;\n");
    await writeFile(revideokcPaths(paths).narration, "[]\n");
    const tools = { ...fixedTools(), sandboxExec: fake, node: process.execPath };
    const base = await wrapperPorts("revideokc");
    const config = revideokcWrapperConfig({ tools, paths, home: "/Users/me", voice: "af_heart", base, scenes: ["TB1_A", "TB2_B"], apiNames: ["Three", "defineTopic"] });
    await writeRevideokcWrapper(process.execPath, paths, config);
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

  it("runs build as narrate, then a render with no narration and two workers, then the sidecars in the narration profile", async () => {
    await succeeds(["build"]);
    const ran = await sandboxCalls();
    expect(ran.map((call) => [call.argv[1], call.argv.slice(3).filter((arg) => !arg.startsWith("/")).join(" ")])).toEqual([
      [paths.narrateProfile, "--root narrate studio/two-boxes"],
      [paths.renderProfile, "--root build studio/two-boxes --no-narrate --workers 2"],
      [paths.narrateProfile, "--root sidecars studio/two-boxes"],
    ]);
    expect(ran[1]!.env.REVIDEOKC_VITE_PORT).toMatch(/^\d+$/);
    expect(ran[0]!.env).not.toHaveProperty("REVIDEOKC_VITE_PORT");
    for (const call of ran) expect(call.env).not.toHaveProperty("NODE_OPTIONS");
    const [made] = await calls();
    expect(made).toMatchObject({ verb: "build", exitCode: 0, sceneSha256: await currentSourceHash(paths.topicDir), deliverable: { written: false } });
    expect(made!.steps!.map((step) => step.step)).toEqual(["narrate", "render", "sidecars"]);
  });

  it("runs still as narrate and then a render that reads what narrate left, and lint as tsc", async () => {
    await succeeds(["still", "12", "3.5s"]);
    await succeeds(["lint"]);
    const ran = await sandboxCalls();
    expect(ran[1]!.argv.slice(-5)).toEqual(["still", "studio/two-boxes", "12", "3.5s", "--no-narrate"]);
    expect(ran[2]!.argv.slice(3)).toEqual([path.join(revideokcPaths(paths).nodeModules, "typescript", "bin", "tsc"), "--noEmit", "--pretty", "false", "-p", path.join(paths.checkout, "tsconfig.json")]);
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
/* The gate's revideokc steps                                                 */
/* -------------------------------------------------------------------------- */

describe("the gate, for a revideokc job", () => {
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

  async function layOutJob(lines: string[][], options: { scene?: string; narration?: unknown } = {}) {
    const paths = await jobPaths();
    const own = revideokcPaths(paths);
    const brief = { ...narratedBrief(), tool: "revideokc" as const };
    await mkdir(paths.topicDir, { recursive: true });
    await mkdir(paths.outTopic, { recursive: true });
    await writeFile(paths.sceneFile, options.scene ?? "export default defineTopic(function* () { const a = 'Client'; const b = 'API'; });\n");
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
    await writeFile(paths.chapters, JSON.stringify(classes.map((scene, i) => ({ scene, end: (segments.filter((s) => s.scene === scene).at(-1)?.end ?? 0) + 1 + i * 0 }))));
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
      brief: { ...brief, tool: "revideokc" },
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
      backend: backendFor("revideokc"),
    });
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual(["source", "lint", "script", "topic", "build", "probe", "sync", "length", "poster", "looked"]);
    expect(Object.keys(result.copies ?? {}).filter((name) => name.startsWith("source/")).sort()).toEqual(["source/narration.json", "source/scene.tsx", "source/topic.yml"]);
    expect(result.looked).toMatchObject({ build: { readAt: expect.any(String) } });
  });

  it("holds the build to every source file, and asks for the build's sheet to be read", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const { paths, own, voiced, hash } = await layOutJob(lines);
    const base = { brief: { ...brief, tool: "revideokc" as const }, paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, tools: tools(Math.round(secondsForLines(voiced))), backend: backendFor("revideokc") };
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
    const base = { brief: { ...brief, tool: "revideokc" as const }, paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, tools: tools(Math.round(secondsForLines(voiced))), backend: backendFor("revideokc") };
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
    // One that ran and failed did replace it: revideokc clears the sheet before it renders.
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
      runVideoGate({ brief: { ...brief, tool: "revideokc" }, paths: job.paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, calls: [], reads: [], tools: tools(60), backend: backendFor("revideokc") });

    // Two files each under the per-file cap, together over the catalog's total.
    const big = await layOutJob(lines);
    await writeFile(path.join(big.paths.topicDir, "data.ts"), `export const blob = '${"x".repeat(300 * 1024)}';\n`);
    await writeFile(path.join(big.paths.topicDir, "more.ts"), `export const more = '${"y".repeat(300 * 1024)}';\n`);
    const sized = await gate(big);
    expect(sized.steps).toEqual([{ name: "source", ok: false, detail: expect.stringMatching(/over the 524288 Accept stores/) }]);

    await rm(path.join(big.paths.topicDir, "data.ts"));
    await rm(path.join(big.paths.topicDir, "more.ts"));
    // The label "API" only in a helper nothing imports: not shown.
    const unused = await layOutJob(lines, { scene: "export default defineTopic(function* () { const a = 'Client'; });\n" });
    await writeFile(path.join(unused.paths.topicDir, "parts.ts"), "export const label = 'API';\n");
    expect((await gate(unused)).findings.join(" ")).toContain('never shows the label "API"');
    // The same helper, imported by the scene: shown.
    await writeFile(unused.paths.sceneFile, "import {label} from './parts';\nexport default defineTopic(function* () { const a = 'Client'; });\n");
    expect((await gate(unused)).findings.join(" ")).not.toContain("never shows the label");
  });

  it("reports reworded lines, and refuses chapters out of order, a missing label, a long hold and a scene that does not parse", async () => {
    const brief = narratedBrief();
    const lines = brief.scenes.map((scene) => scene.beats.map((beat) => beat.say));
    const reworded = [[`${lines[0]![0]!} Plainly.`], lines[1]!];
    const gate = async (job: Awaited<ReturnType<typeof layOutJob>>) =>
      runVideoGate({ brief: { ...brief, tool: "revideokc" }, paths: job.paths, classes, startedAtMs: Date.now() - 60_000, sourceHashBefore: null, calls: [], reads: [], tools: tools(60), backend: backendFor("revideokc") });

    const changed = await gate(await layOutJob(reworded));
    expect(changed.script?.changes.filter((change) => change.kind !== "unchanged")).toEqual([
      { scene: classes[0], kind: "reworded", brief: lines[0]![0], voiced: [reworded[0]![0]] },
    ]);

    const swapped = await gate(await layOutJob(lines, { narration: [...classes].reverse().map((scene) => ({ scene, title: "t", lines: ["a line"] })) }));
    expect(swapped.findings.join(" ")).toContain(`must be exactly ${classes.join(", ")}`);

    const unlabelled = await gate(await layOutJob(lines, { scene: "export default defineTopic(function* () { const a = 'Client'; });\n" }));
    expect(unlabelled.findings.join(" ")).toContain('never shows the label "API"');

    const held = await gate(await layOutJob(lines, { narration: classes.map((scene, i) => ({ scene, title: "t", hold: 9, lines: lines[i] })) }));
    expect(held.findings.join(" ")).toContain('"hold" is at most 3');

    const broken = await gate(await layOutJob(lines, { scene: "SYNTAX ERROR export default 1" }));
    expect(broken.steps).toEqual([{ name: "source", ok: false, detail: "scene.tsx: line 1: ';' expected." }]);
  });
});
