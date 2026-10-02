import { copyFile, lstat, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNarrated, type ValidVideoBrief } from "../brief";
import { classNames, prefixFor, prefixOf, type Scaffold } from "../checkout";
import type { VideoPaths } from "../paths";
import { revideokcPaths } from "./paths";
import { REVIDEOKC_SOURCE_PATTERN } from "./source";
import type { RevideokcToolchain } from "./toolchain";

/**
 * A revideokc job's checkout (D46 of docs/STUDIO-VIDEOS.md, as phase 2c of
 * docs/STUDIO-VIDEO-TOOLS.md applies it): a synthetic revideokc checkout
 * holding one topic, so there is no other topic to read and two jobs never
 * share a `topics/`.
 *
 * - `lib/`, `src/`, `tools/`, `package.json`, `tsconfig.json` and
 *   `requirements-narration.txt` are **copies**: the render reads the job's,
 *   the agent may Read `lib/` and never edit it, and `src/project.ts` finds
 *   the topic by a glob over this checkout's `topics/`, which holds one.
 * - `docs/` holds copies of `CAPABILITIES.md` and `REVIDEO-API.md`, which the
 *   agent may Read; the manual names them.
 * - `node_modules` and `.venv` are **links** to the real checkout's, which the
 *   profiles allow reading by their real paths and nothing writes: Vite's
 *   cache is under `render/cache/vite` (phase 2b), and an install per job
 *   would take minutes and the network the profile denies (open question 2,
 *   answered by the spike).
 */

const COPIED_DIRS = ["lib", "src", "tools"] as const;
const COPIED_FILES = ["package.json", "tsconfig.json", "requirements-narration.txt"] as const;
const COPIED_DOCS = ["CAPABILITIES.md", "REVIDEO-API.md"] as const;

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

/** The skeleton every revideokc job has before its topic is put in. */
export async function buildRevideokcCheckout(tools: RevideokcToolchain, paths: VideoPaths): Promise<void> {
  const own = tools.revideokc;
  const job = revideokcPaths(paths);
  for (const dir of COPIED_DIRS) await copyTree(path.join(own.root, dir), path.join(paths.checkout, dir));
  for (const name of COPIED_FILES) {
    await copyFile(path.join(own.root, name), path.join(paths.checkout, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await mkdir(job.docs, { recursive: true });
  for (const name of COPIED_DOCS) {
    await copyFile(path.join(own.root, "docs", name), path.join(job.docs, name)).catch(() => undefined);
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
  for (const dir of [paths.renderTmp, paths.audio, paths.out, job.publicDir, job.stillsRoot, job.vite, job.buildWork, job.state, paths.bin, paths.tmp]) {
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

/** The topic's own file: the slug, the catalog topic, the prefix and the one build block, as `revideokc new` writes it. */
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
    "  scene: scene.tsx",
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
 * The stub scene: `revideokc new`'s, which renders on the first try. Each
 * chapter's title and first line appear on its first line's voice and fade
 * at its last line's end, so a still of the stub is already a video in time
 * with its narration, and the agent replaces it scene by scene.
 */
export function stubScene(title: string, classes: readonly string[]): string {
  return `/** @jsxImportSource @revideo/2d/lib */
// ${safeTitle(title)}
//
// One Revideo scene holds every chapter of narration.json; each visual waits
// for the word that names it with t.at(scene, line, "word"). Your manual has
// the library and docs/CAPABILITIES.md what Revideo can draw.
import {Rect, Txt} from '@revideo/2d';
import {all, createRef} from '@revideo/core';
import {defineTopic} from '#lib';

const C = {text: '#e9edf5', dim: '#8b94a8', accent: '#f5c542'};
const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const SCENES = ${JSON.stringify(classes)};

export default defineTopic(function* (view, t) {
  const title = createRef<Txt>();
  const line = createRef<Txt>();
  const bar = createRef<Rect>();
  view.add(<Txt ref={title} fontFamily={SANS} fontSize={64} fontWeight={700} fill={C.text} y={-300} opacity={0} />);
  view.add(<Txt ref={line} fontFamily={SANS} fontSize={36} fill={C.dim} width={1400} textWrap y={0} opacity={0} />);
  view.add(<Rect ref={bar} width={0} height={8} radius={4} fill={C.accent} y={200} />);
  for (const name of SCENES) {
    const chapter = t.timeline.scenes.find(s => s.scene === name)!;
    yield* t.at(name, 0);
    title().text(chapter.title);
    line().text(chapter.lines[0].text);
    bar().width(0);
    const voice = t.line(name, 0);
    yield* all(title().opacity(1, 0.4), line().opacity(1, 0.4), bar().width(320, Math.max(0.4, voice.end - voice.start)));
    yield* t.until(t.line(name, chapter.lines.length - 1).end);
    yield* all(title().opacity(0, 0.3), line().opacity(0, 0.3));
  }
});
`;
}

/**
 * Put the topic in: a new one written from the brief (topic.yml, the
 * narration and the stub scene), or a change's source copied in. Either
 * way the runner then writes the topic line, which the gate checks and the
 * agent may not edit. revideokc videos are always narrated (its build
 * refuses a video with no audio), which the brief's validator holds.
 */
export async function scaffoldRevideokc(paths: VideoPaths, brief: ValidVideoBrief, startFrom: Map<string, Buffer> | null): Promise<Scaffold> {
  if (!isNarrated(brief)) throw new Error("a revideokc video is narrated, and this brief is silent");
  await mkdir(paths.topicDir, { recursive: true });
  const own = revideokcPaths(paths);
  if (startFrom !== null) {
    for (const [name, body] of startFrom) {
      // One level, and only the kinds of file a revideokc topic holds.
      if (!REVIDEOKC_SOURCE_PATTERN.test(name)) continue;
      await writeFile(path.join(paths.topicDir, name), body);
    }
  } else {
    const prefix = prefixFor(brief.slug);
    const classes = classNames(prefix, brief.scenes.map((scene) => scene.name));
    await writeFile(paths.topicYml, topicYmlFor(brief, prefix), "utf8");
    await writeFile(own.narration, narrationFor(brief, classes), "utf8");
    await writeFile(paths.sceneFile, stubScene(brief.title, classes), "utf8");
  }
  const yml = await readFile(paths.topicYml, "utf8");
  const prefix = prefixOf(yml);
  if (prefix === null) throw new Error("the topic.yml has no prefix line");
  const topicLine = `topic: ${brief.topic}`;
  const next = /^topic:.*$/m.test(yml) ? yml.replace(/^topic:.*$/m, topicLine) : `${topicLine}\n${yml}`;
  await writeFile(paths.topicYml, next, "utf8");
  return { prefix, classes: classNames(prefix, brief.scenes.map((scene) => scene.name)) };
}
