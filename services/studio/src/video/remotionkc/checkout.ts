import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNarrated, type ValidVideoBrief } from "../brief";
import { classNames, prefixFor, prefixOf, type Scaffold } from "../checkout";
import type { VideoPaths } from "../paths";
import { SOURCE_PATTERN } from "../source-set";
import { remotionkcPaths } from "./paths";
import type { RemotionkcToolchain } from "./toolchain";

/**
 * A remotionkc job's checkout (D46 of docs/STUDIO-VIDEOS.md, as phase 3 of
 * docs/STUDIO-VIDEO-TOOLS.md applies it): a synthetic remotionkc checkout
 * holding one topic, so there is no other topic to read, and `src/Root.tsx`,
 * which registers every `topics/**\/composition.tsx` by itself, registers
 * this job's alone.
 *
 * - `lib/`, `src/`, `tools/`, `package.json`, `tsconfig.json`,
 *   `remotion.config.ts` and `requirements-narration.txt` are **copies**: the
 *   render reads the job's, and the agent may Read `lib/` and never edit it.
 *   `package.json` carries the `#lib` import map, and `tsconfig.json` the
 *   lint's settings.
 * - `docs/remotion/` holds copies of Remotion's own markup guides (the
 *   `remotion-markup` part of the skill remotionkc vendors under the Remotion
 *   License: timing, sequencing, transitions, 3D, fonts and the rest), which
 *   the agent may Read; the manual names them.
 * - `node_modules` and `.venv` are **links** to the real checkout's, which the
 *   profiles allow reading by their real paths and nothing writes: webpack's
 *   cache is off in the job (`REMOTIONKC_BUNDLE_CACHE=off`), and Chrome
 *   Headless Shell was downloaded into `node_modules/.remotion` once, outside
 *   any job.
 *
 * remotionkc's own config searches end inside the checkout (browserslist's,
 * bounded by the render; Remotion's `package.json` lookup finds the job's
 * copy first), so nothing like revideokc's empty `.puppeteerrc.json` is
 * needed here: the real-sandbox suite renders under a refused `package.json`
 * to hold that.
 */

const COPIED_DIRS = ["lib", "src", "tools"] as const;
const COPIED_FILES = ["package.json", "tsconfig.json", "remotion.config.ts", "requirements-narration.txt"] as const;
/** Where remotionkc vendors Remotion's markup guides. */
const MARKUP_GUIDES = path.join(".claude", "skills", "remotion-best-practices", "remotion-markup");

/** Copy a directory of regular files and directories, dropping links, caches and tests. */
async function copyTree(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".DS_Store" || entry.name === "__pycache__") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(source, target);
    else if (entry.isFile()) await copyFile(source, target);
  }
}

/**
 * One hash over everything a job copies from the checkout, each file by its
 * path and contents: what the doctor keys a kept fixture build on, so a
 * change to the code a render runs makes the next doctor render again.
 */
export async function checkoutFingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  const add = async (relative: string): Promise<void> => {
    const full = path.join(root, relative);
    const facts = await lstat(full).catch(() => null);
    if (facts === null) {
      hash.update(`${relative}\u0000missing\n`);
    } else if (facts.isDirectory()) {
      const names = (await readdir(full)).filter((name) => name !== "node_modules" && name !== ".DS_Store" && name !== "__pycache__").sort();
      for (const name of names) await add(path.join(relative, name));
    } else if (facts.isFile()) {
      hash.update(`${relative}\u0000${createHash("sha256").update(await readFile(full)).digest("hex")}\n`);
    }
  };
  for (const name of [...COPIED_DIRS, ...COPIED_FILES]) await add(name);
  return hash.digest("hex");
}

/** The skeleton every remotionkc job has before its topic is put in. */
export async function buildRemotionkcCheckout(tools: RemotionkcToolchain, paths: VideoPaths): Promise<void> {
  const own = tools.remotionkc;
  const job = remotionkcPaths(paths);
  for (const dir of COPIED_DIRS) await copyTree(path.join(own.root, dir), path.join(paths.checkout, dir));
  for (const name of COPIED_FILES) {
    await copyFile(path.join(own.root, name), path.join(paths.checkout, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await mkdir(job.docs, { recursive: true });
  const guides = path.join(own.root, MARKUP_GUIDES);
  for (const name of await readdir(guides).catch(() => [] as string[])) {
    if (/^[A-Za-z0-9_-]+\.md$/.test(name)) await copyFile(path.join(guides, name), path.join(job.docs, name));
  }
  for (const [name, target] of [
    ["node_modules", own.nodeModules],
    [".venv", own.venv],
  ] as const) {
    if (target === null) continue;
    const link = path.join(paths.checkout, name);
    if ((await lstat(link).catch(() => null)) !== null) continue;
    await symlink(target, link);
  }
  for (const dir of [paths.renderTmp, paths.audio, paths.out, job.publicDir, job.stillsRoot, job.buildWork, job.state, paths.bin, paths.tmp]) {
    await mkdir(dir, { recursive: true });
  }
}

/** A title YAML and a TypeScript comment can carry: no quote, backslash or line break. */
function safeTitle(title: string): string {
  return title.replace(/["\\\r\n]/g, "").slice(0, 120);
}

/** `why_it_matters` → `Why it matters`: a chapter title until the agent writes a better one. */
export function chapterTitle(name: string): string {
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The topic's own file: the slug, the catalog topic, the prefix and the one build block, as `remotionkc new` writes it. */
export function topicYmlFor(brief: ValidVideoBrief, prefix: string): string {
  return [
    `title: ${JSON.stringify(safeTitle(brief.title))}`,
    `topic: ${brief.topic}`,
    `concepts: [${brief.concepts.join(", ")}]`,
    "tags: []",
    "prerequisites: []",
    "materials: []",
    `prefix: ${prefix}`,
    "narrated:",
    "  composition: composition.tsx",
    `  output: ${brief.slug.replaceAll("-", "_")}.mp4`,
    "",
  ].join("\n");
}

/** `narration.json` from the brief: one chapter per scene, its beats' lines in order. */
export function narrationFor(brief: ValidVideoBrief, classes: readonly string[]): string {
  const chapters = brief.scenes.map((scene, i) => ({
    scene: classes[i]!,
    title: chapterTitle(scene.name),
    lines: scene.beats.map((beat) => beat.say),
  }));
  return `${JSON.stringify(chapters, null, 1)}\n`;
}

/**
 * The stub composition: `remotionkc new`'s, which renders on the first try,
 * with its one word cue taken out (it waits for the word "scene", which a
 * brief's line need not say, and a cue on a word the line does not say
 * throws). Each scene's title and current line appear in time with the
 * voice, so a still of the stub is already a video, and the agent replaces
 * it scene by scene.
 */
export function stubComposition(title: string, classes: readonly string[]): string {
  return `// ${safeTitle(title)}
//
// One Sequence per scene, sized by its narration; cue every visual on the
// spoken word that names it with sceneCues. Your manual has the library.
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { NarrationTrack, OUT, defineTopic, lineAt, ramp, sceneCues, type TimedScene, type TopicProps } from "#lib";

const C = { bg: "#10141c", text: "#e9edf5", dim: "#8b94a8", accent: "#f5c542" };
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const SceneView: React.FC<{ scene: TimedScene }> = ({ scene }) => {
  const f = useCurrentFrame();
  const cue = sceneCues(scene);
  const title = ramp(f, 0, 18, OUT);
  const { line } = lineAt(scene, f);
  const bar = ramp(f, 0, Math.max(12, cue.end(0)), OUT);
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: SANS, padding: 96 }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: C.text, opacity: title }}>{scene.title}</div>
      <div style={{ marginTop: 48, fontSize: 36, lineHeight: 1.4, color: C.dim, maxWidth: 1400 }}>{line.text}</div>
      <div style={{ marginTop: 48, width: 320 * bar, height: 8, borderRadius: 4, background: C.accent }} />
    </AbsoluteFill>
  );
};

const Video: React.FC<TopicProps> = ({ timeline }) => {
  if (!timeline) return null;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <NarrationTrack timeline={timeline} />
      {timeline.scenes.map((s) => (
        <Sequence key={s.scene} from={s.from} durationInFrames={s.durationInFrames}>
          <SceneView scene={s} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export default defineTopic({ component: Video, extraFrames: { ${JSON.stringify(classes[classes.length - 1] ?? "")}: 30 } });
`;
}

/**
 * Put the topic in: a new one written from the brief (topic.yml, the
 * narration and the stub composition), or a change's source copied in.
 * Either way the runner then writes the topic line, which the gate checks
 * and the agent may not edit. remotionkc videos are always narrated (its
 * build refuses a video with no audio, and its timeline is the narration's),
 * which the brief's validator holds.
 */
export async function scaffoldRemotionkc(paths: VideoPaths, brief: ValidVideoBrief, startFrom: Map<string, Buffer> | null): Promise<Scaffold> {
  if (!isNarrated(brief)) throw new Error("a remotionkc video is narrated, and this brief is silent");
  await mkdir(paths.topicDir, { recursive: true });
  const own = remotionkcPaths(paths);
  if (startFrom !== null) {
    for (const [name, body] of startFrom) {
      // One level, and only the kinds of file a remotionkc topic holds.
      if (!SOURCE_PATTERN.test(name)) continue;
      await writeFile(path.join(paths.topicDir, name), body);
    }
  } else {
    const prefix = prefixFor(brief.slug);
    const classes = classNames(prefix, brief.scenes.map((scene) => scene.name));
    await writeFile(paths.topicYml, topicYmlFor(brief, prefix), "utf8");
    await writeFile(own.narration, narrationFor(brief, classes), "utf8");
    await writeFile(paths.sceneFile, stubComposition(brief.title, classes), "utf8");
  }
  const yml = await readFile(paths.topicYml, "utf8");
  const prefix = prefixOf(yml);
  if (prefix === null) throw new Error("the topic.yml has no prefix line");
  const topicLine = `topic: ${brief.topic}`;
  const next = /^topic:.*$/m.test(yml) ? yml.replace(/^topic:.*$/m, topicLine) : `${topicLine}\n${yml}`;
  await writeFile(paths.topicYml, next, "utf8");
  return { prefix, classes: classNames(prefix, brief.scenes.map((scene) => scene.name)) };
}
