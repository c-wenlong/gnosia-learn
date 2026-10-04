import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { key as blobKey } from "@self-learn/blob";
import {
  LOCAL_LEARNER_ID,
  type NewAsset,
  type NewAssetConcept,
  type NewAssetDerivation,
  type NewAssetTopic,
} from "@self-learn/schema";

import {
  MANIMKC_DIR,
  MANIMKC_ROOT_ENV,
  REMOTIONKC_DIR,
  REMOTIONKC_ROOT_ENV,
  resolveManimkcRoot,
  resolveRemotionkcRoot,
  resolveRevideokcRoot,
  REVIDEOKC_DIR,
  REVIDEOKC_ROOT_ENV,
} from "../env";
import { IndexError, IndexErrors } from "./errors";
import { fileFacts } from "./files";
import { ASSET_PREFIX, type IndexContext, type Indexer, type SourceBlob, type SourceRows } from "./source";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * The video tools: submodules whose CLI answers `topics --json` with one
 * report shape, and whose renders the catalog indexes as `video` assets with
 * transcript, chapters and captions sidecars.
 *
 * Three of them: manimkc (ManimGL, narrated), remotionkc (Remotion) and
 * revideokc (Revideo). The report is the same document from all three, so
 * everything that turns a report into rows is here once, and what differs is
 * a descriptor:
 *
 * - the name, which is the index source, the `asset.source_repo` and the
 *   asset id prefix (`manimkc:`, `remotionkc:`, `revideokc:`);
 * - where the checkout is (`$MANIMKC_ROOT`, `$REMOTIONKC_ROOT`,
 *   `$REVIDEOKC_ROOT`, else the submodule `.gitmodules` puts under `tools/`),
 *   and how its CLI runs (`python3 tools/cli/manimkc`,
 *   `node tools/cli/remotionkc.mjs`, `node tools/cli/revideokc.mjs`);
 * - how a topic folder finds its catalog topic. manimkc's folders are mapped
 *   by the vocabulary's `maps.manimkc`, and a `topic:` in its topic.yml must
 *   agree with that map. remotionkc and revideokc have no map: a topic.yml's
 *   `topic:` is required and is the answer, and must name a topic the
 *   importing owner can read.
 *
 * Both strategies refuse rather than skip: a video with no topic is one
 * nothing in the catalog can find (AGENTS.md, "A catalog indexer must never
 * `continue` past an unresolved slug").
 *
 * A topic.yml may also name the concepts its video teaches, `concepts:`,
 * which every tool's report carries on the topic entry. Each slug becomes an
 * `asset_concept` row on the video and on each sidecar beside it, the way a
 * diagram's concepts go on its SVG and its source, and must be a concept the
 * importing owner can read (their own or the commons'), which the run says
 * through `knownConcepts`. An unknown slug, or a value that is not a list of
 * slugs, refuses the run by folder and slug, collected with every other
 * refusal so one run names them all. A missing or empty list links nothing.
 *
 * The long reasoning behind the two roots (the checkout, and the report's
 * `outRoot` the rendered files are under) is on `manimkc.ts`, where it was
 * first written; it holds for remotionkc and revideokc word for word, with
 * `$REMOTIONKC_HOME` and `$REVIDEOKC_HOME` as their data roots.
 */

const run = promisify(execFile);

export type VideoToolName = "manimkc" | "remotionkc" | "revideokc";

export interface VideoTool {
  /** The index source, the `asset.source_repo`, and the name in every message. */
  name: VideoToolName;
  /** The asset id namespace this tool's rows live in. */
  prefix: (typeof ASSET_PREFIX)[VideoToolName];
  /** The submodule, repo-relative: also the path in `git submodule update --init <here>`. */
  dir: string;
  /** The variable naming the checkout, shared with the tool's own CLI. */
  rootEnv: string;
  /** The flag naming the checkout on `catalog import` and `catalog asset upload`. */
  rootFlag: string;
  /** The tool's own data-root variable, named in a note and never read here. */
  homeEnv: string;
  /** The CLI, relative to the checkout. Same path in the submodule and in any checkout. */
  cli: string;
  /** The checkout, from the variable or the submodule. */
  resolveRoot: (repoRoot: string) => string;
  /** The program and arguments that print `topics --json` for `root`. */
  topicsArgv: (cli: string, root: string) => [string, string[]];
  /** How a topic folder finds its catalog topic (see above). */
  topics: "vocabulary" | "declared";
}

export const MANIMKC: VideoTool = {
  name: "manimkc",
  prefix: ASSET_PREFIX.manimkc,
  dir: MANIMKC_DIR,
  rootEnv: MANIMKC_ROOT_ENV,
  rootFlag: "--manimkc-root",
  homeEnv: "MANIMKC_HOME",
  cli: path.join("tools", "cli", "manimkc"),
  resolveRoot: resolveManimkcRoot,
  // `--root` is a global flag and must precede the subcommand.
  topicsArgv: (cli, root) => ["python3", [cli, "--root", root, "topics", "--json"]],
  topics: "vocabulary",
};

export const REMOTIONKC: VideoTool = {
  name: "remotionkc",
  prefix: ASSET_PREFIX.remotionkc,
  dir: REMOTIONKC_DIR,
  rootEnv: REMOTIONKC_ROOT_ENV,
  rootFlag: "--remotionkc-root",
  homeEnv: "REMOTIONKC_HOME",
  cli: path.join("tools", "cli", "remotionkc.mjs"),
  resolveRoot: resolveRemotionkcRoot,
  // Plain node and its standard library: the node already running this
  // process, so a PATH without one (a launchd job) still runs it.
  topicsArgv: (cli, root) => [process.execPath, [cli, "--root", root, "topics", "--json"]],
  topics: "declared",
};

export const REVIDEOKC: VideoTool = {
  name: "revideokc",
  prefix: ASSET_PREFIX.revideokc,
  dir: REVIDEOKC_DIR,
  rootEnv: REVIDEOKC_ROOT_ENV,
  rootFlag: "--revideokc-root",
  homeEnv: "REVIDEOKC_HOME",
  cli: path.join("tools", "cli", "revideokc.mjs"),
  resolveRoot: resolveRevideokcRoot,
  // Node's standard library only, as remotionkc's: `topics` runs in a
  // checkout that has never seen `npm install`.
  topicsArgv: (cli, root) => [process.execPath, [cli, "--root", root, "topics", "--json"]],
  topics: "declared",
};

export const VIDEO_TOOLS: readonly VideoTool[] = [MANIMKC, REMOTIONKC, REVIDEOKC];

/** The names, in the order the tools run: each one an index source and an upload source. */
export const VIDEO_TOOL_NAMES: readonly VideoToolName[] = VIDEO_TOOLS.map((tool) => tool.name);

export function isVideoToolName(name: string): name is VideoToolName {
  return (VIDEO_TOOL_NAMES as readonly string[]).includes(name);
}

export function videoTool(name: VideoToolName): VideoTool {
  const tool = VIDEO_TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no video tool named ${name}`);
  return tool;
}

/** Media types for the tools' files, by extension: the ones an import and `catalog asset upload` store. */
export const VIDEO_TOOL_MIME: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  json: "application/json",
  vtt: "text/vtt",
};

/** Sidecar name in the JSON, and the asset kind it becomes. */
const SIDECAR_KINDS = {
  transcript: "transcript",
  chapters: "chapters",
  vtt: "captions",
} as const;

interface Sidecar {
  path?: unknown;
  exists?: unknown;
}

interface Deliverable {
  path?: unknown;
  exists?: unknown;
  duration?: unknown;
  sidecars?: Record<string, Sidecar>;
}

interface Section {
  section?: unknown;
  output?: unknown;
  deliverable?: Deliverable | null;
}

interface TopicEntry {
  path?: unknown;
  title?: unknown;
  topic?: unknown;
  concepts?: unknown;
  out_dir?: unknown;
  sections?: unknown;
}

interface Orphan {
  path?: unknown;
  videos?: unknown;
}

export interface TopicsReport {
  /**
   * Absolute path the `out/…` strings below are relative to: the tool's data
   * root (`$MANIMKC_HOME`, `$REMOTIONKC_HOME`, `$REVIDEOKC_HOME`), which
   * defaults to the checkout root. Optional only for defensive parsing; every
   * version of each CLI this repo pins reports it.
   */
  outRoot?: unknown;
  topics: TopicEntry[];
  drift: { orphans?: Orphan[]; unrendered?: unknown[] };
}

/** Where the pinned CLI of `tool` is on this machine. */
export function toolCliPath(tool: VideoTool, repoRoot: string): string {
  return path.join(tool.resolveRoot(repoRoot), tool.cli);
}

/** Is there a CLI of `tool` to run? An import skips a tool that has none and was never indexed. */
export function hasToolCli(tool: VideoTool, repoRoot: string): boolean {
  return existsSync(toolCliPath(tool, repoRoot));
}

/**
 * The refusal when the CLI is not there. It names the resolved path rather
 * than the default one, because the default is a lie on a machine whose root
 * variable points somewhere else.
 */
export function missingToolCli(tool: VideoTool, repoRoot: string): IndexError {
  return new IndexError(
    `${toolCliPath(tool, repoRoot)} does not exist. The ${tool.name} submodule is not ` +
      `initialised; run \`git submodule update --init ${tool.dir}\`, or set ` +
      `${tool.rootEnv} to a checkout.`,
  );
}

/** `<tool> topics --json` against the checkout at `root`, parsed. */
export async function readToolReport(tool: VideoTool, repoRoot: string, root: string): Promise<TopicsReport> {
  const cli = toolCliPath(tool, repoRoot);
  if (!existsSync(cli)) throw missingToolCli(tool, repoRoot);
  if (!existsSync(root)) {
    throw new IndexError(`${tool.rootFlag} ${root} does not exist`);
  }

  let stdout: string;
  try {
    // maxBuffer is raised because the report is one JSON document covering
    // every topic and the 1 MB default is not a lot of margin.
    const [program, args] = tool.topicsArgv(cli, root);
    ({ stdout } = await run(program, args, { maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new IndexError(
      `\`${tool.name} topics --json\` failed against ${root}\n  ${stderr || (error as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new IndexError(`\`${tool.name} topics --json\` did not return JSON`);
  }
  const report = parsed as TopicsReport;
  if (!Array.isArray(report.topics)) {
    throw new IndexError(`\`${tool.name} topics --json\` returned no "topics" list`);
  }
  return report;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * How topic folders become topic slugs. `manimkc` reads the vocabulary's map
 * and checks a declared topic against it; `remotionkc` and `revideokc` read
 * the declared topic alone.
 */
/** What `buildToolRows` is told beyond the report and the topic lookups. */
export interface VideoToolRowOptions {
  /** Store each file as a blob first (the database is under phase 2's contract). */
  store?: boolean;
  /** Whose rows these are; absent means the CLIs' owner, `local`. */
  owner?: string;
  /** Concept slugs the owner can read: their own and the commons'. Absent means none. */
  knownConcepts?: ReadonlySet<string>;
}

export type TopicResolution =
  | { by: "vocabulary"; byPath: ReadonlyMap<string, string>; bySlug: ReadonlyMap<string, unknown> }
  | { by: "declared"; bySlug: ReadonlyMap<string, unknown> };

/** The slug a topic entry is filed under, or the refusal that names why there is none. */
function resolveTopic(
  tool: VideoTool,
  resolution: TopicResolution,
  topicPath: string,
  declared: string | null,
): { slug: string } | { problem: string } {
  if (resolution.by === "declared") {
    // No map to consult: the topic.yml's own `topic:` is the only answer, so
    // one without it is a video nothing in the catalog can find.
    if (declared === null) {
      return {
        problem:
          `${tool.name} topic "${topicPath}" declares no topic: topics/${topicPath}/topic.yml needs a ` +
          `\`topic:\` naming a catalog topic (${tool.name} has no maps.${tool.name}; the topic.yml is the map).`,
      };
    }
    if (!resolution.bySlug.has(declared)) {
      return {
        problem:
          `${tool.name} topic "${topicPath}" declares topic "${declared}" in topics/${topicPath}/topic.yml, ` +
          `which is not a topic this owner can read. Add the topic (\`catalog topic add\`) or fix the slug.`,
      };
    }
    return { slug: declared };
  }

  const slug = resolution.byPath.get(topicPath);
  if (slug === undefined) {
    return {
      problem:
        `${tool.name} topic "${topicPath}" is in no topic's maps.${tool.name} in ${VOCABULARY_FILE}. ` +
        `An unmapped video is one nothing in the catalog can find.`,
    };
  }
  // The tool's own optional `topic:` field. It is authoritative about nothing
  // (the vocabulary is), but when both say something they must agree, or one
  // of the two files is wrong and it is not knowable which.
  if (declared !== null && declared !== slug) {
    return {
      problem:
        `${tool.name} topic "${topicPath}" declares topic "${declared}" in its topic.yml, but ` +
        `${VOCABULARY_FILE} maps it to "${slug}". Fix one.`,
    };
  }
  if (declared !== null && !resolution.bySlug.has(declared)) {
    return { problem: `${tool.name} topic "${topicPath}" declares topic "${declared}", which does not exist` };
  }
  return { slug };
}

/** Where a topic folder's `concepts:` is written, for a refusal to point at. */
const topicYml = (topicPath: string) => `topics/${topicPath}/topic.yml`;

/**
 * The concepts a topic entry names, checked: each a slug the owner can read,
 * in the order written, each once. Returns null, with every reason recorded,
 * when any does not hold up; the caller files nothing from that folder.
 *
 * A missing field and YAML's empty `concepts:` (null) both mean none, which
 * is what every topic.yml written before this field was read says.
 */
function resolveConcepts(
  tool: VideoTool,
  topicPath: string,
  raw: unknown,
  known: ReadonlySet<string>,
  problems: IndexErrors,
): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string" || item.trim() === "")) {
    problems.add(
      `${tool.name} topic "${topicPath}" has \`concepts:\` ${JSON.stringify(raw)} in ${topicYml(topicPath)}, ` +
        `which is not a list of concept slugs. Write it as a list, \`concepts: [slug, ...]\`.`,
    );
    return null;
  }
  const concepts: string[] = [];
  let ok = true;
  for (const item of raw as string[]) {
    const slug = item.trim();
    if (!known.has(slug)) {
      // The foreign key would refuse this too, later, by constraint name and
      // with no file, halfway through the run.
      problems.add(
        `${tool.name} topic "${topicPath}" names concept "${slug}" in ${topicYml(topicPath)}, which is not ` +
          `a concept this owner can read. Write the note (\`learn concept add\`) or fix the slug.`,
      );
      ok = false;
      continue;
    }
    if (!concepts.includes(slug)) concepts.push(slug);
  }
  return ok ? concepts : null;
}

/**
 * The pure half: a report plus the topic lookups become rows. Separated from
 * the subprocess so either tool's indexer is testable against a captured
 * report.
 *
 * `store`: the database is under phase 2's contract, so every file is also
 * returned as a blob for the runner to store first, and its row names the
 * content-addressed key those bytes land under (a re-render lands under a new
 * one). Before the contract the rows name no blob and `catalog asset upload`
 * stores the bytes later, which is flip day's order.
 *
 * `knownConcepts`: the concept slugs the importing owner can read, which a
 * topic's `concepts:` is checked against. Absent means none, so a report
 * naming any concept is refused rather than linked unchecked.
 */
export async function buildToolRows(
  tool: VideoTool,
  report: TopicsReport,
  root: string,
  resolution: TopicResolution,
  options: VideoToolRowOptions = {},
): Promise<{ rows: SourceRows; notes: string[]; metadata: { outRoot: string }; blobs: SourceBlob[] }> {
  const owner = options.owner ?? LOCAL_LEARNER_ID;
  const knownConcepts = options.knownConcepts ?? new Set<string>();
  const assets: NewAsset[] = [];
  const assetTopics: NewAssetTopic[] = [];
  const assetConcepts: NewAssetConcept[] = [];
  const derivations: NewAssetDerivation[] = [];
  const problems = new IndexErrors();
  const seenPaths = new Set<string>();

  // Where the rendered files are, which is not necessarily where the source is.
  // The fallback is for a report from a CLI predating the field; it is also
  // what the value would be anyway on a checkout with no data root configured.
  const outRoot = str(report.outRoot) ?? root;

  let videos = 0;
  let sidecars = 0;
  const blobs: SourceBlob[] = [];
  /** The row as given, or with its blob named and the file queued to store, under the contract. */
  const stored = (row: NewAsset, file: string): NewAsset => {
    if (options.store !== true || typeof row.contentHash !== "string" || typeof row.bytes !== "number") return row;
    const ext = path.extname(file).slice(1).toLowerCase();
    blobs.push({
      file,
      ownerId: owner,
      mime: VIDEO_TOOL_MIME[ext] ?? "application/octet-stream",
      ext,
      sha256: row.contentHash,
      bytes: row.bytes,
    });
    return { ...row, blobKey: blobKey(owner, row.contentHash, ext) };
  };

  for (const entry of report.topics) {
    const topicPath = str(entry.path);
    if (topicPath === null) {
      problems.add(`a topic entry has no "path"`);
      continue;
    }
    seenPaths.add(topicPath);

    const resolved = resolveTopic(tool, resolution, topicPath, str(entry.topic));
    if ("problem" in resolved) problems.add(resolved.problem);
    // Checked even when the topic was refused, so one run names both.
    const concepts = resolveConcepts(tool, topicPath, entry.concepts, knownConcepts, problems);
    if ("problem" in resolved || concepts === null) continue;
    const slug = resolved.slug;
    /** The folder's topic and concepts, on one of its files. */
    const file = (assetId: string) => {
      assetTopics.push({ assetId, topicSlug: slug });
      for (const conceptSlug of concepts) assetConcepts.push({ assetId, conceptSlug });
    };

    const title = str(entry.title);
    for (const rawSection of Array.isArray(entry.sections) ? entry.sections : []) {
      const section = rawSection as Section;
      const deliverable = section.deliverable;
      if (!deliverable || deliverable.exists !== true) continue;
      const videoPath = str(deliverable.path);
      if (videoPath === null) continue;

      const videoId = `${tool.prefix}${videoPath}`;
      const videoFile = path.join(outRoot, videoPath);
      const facts = await fileFacts(videoFile);
      const sectionName = str(section.section);
      assets.push(stored({
        id: videoId,
        kind: "video",
        path: videoPath,
        url: null,
        contentHash: facts.contentHash,
        bytes: facts.bytes,
        // A topic with two cuts (tomasulo ships a silent one and a narrated
        // one) needs both distinguishable in a listing, so the section name
        // rides along in the title rather than only in the path.
        title: title === null ? videoPath : sectionName === null ? title : `${title} (${sectionName})`,
        sourceRepo: tool.name,
      }, videoFile));
      file(videoId);
      videos += 1;

      for (const [name, kind] of Object.entries(SIDECAR_KINDS)) {
        const sidecar = deliverable.sidecars?.[name];
        if (!sidecar || sidecar.exists !== true) continue;
        const sidecarPath = str(sidecar.path);
        if (sidecarPath === null) continue;
        const sidecarId = `${tool.prefix}${sidecarPath}`;
        const sidecarFile = path.join(outRoot, sidecarPath);
        const sidecarFacts = await fileFacts(sidecarFile);
        assets.push(stored({
          id: sidecarId,
          kind,
          path: sidecarPath,
          url: null,
          contentHash: sidecarFacts.contentHash,
          bytes: sidecarFacts.bytes,
          title: title === null ? sidecarPath : `${title} (${name})`,
          sourceRepo: tool.name,
        }, sidecarFile));
        // The sidecar teaches what its video does, so a search by concept
        // finds the transcript as it finds the video.
        file(sidecarId);
        // The sidecar came out of the video's narration. This edge is what
        // bundle 6's drift check reads to spot a transcript left behind by a
        // re-render.
        derivations.push({ assetId: sidecarId, sourceAssetId: videoId });
        sidecars += 1;
      }
    }
  }

  problems.throwIfAny(`${tool.name} topics (${root})`);

  const notes = [`${report.topics.length} topic folders, ${videos} videos, ${sidecars} sidecars`];
  if (outRoot !== root) {
    // Worth a line: the videos this run hashed are not under the checkout it
    // was pointed at, and a reader comparing counts between machines needs to
    // know which data root produced them.
    notes.push(`rendered output read from ${outRoot} (${tool.name}'s ${tool.homeEnv}), not the checkout`);
  }

  // The non-fatal direction: mappings this checkout has nothing for. Only a
  // vocabulary-mapped tool has mappings to leave unmatched.
  if (resolution.by === "vocabulary") {
    const unmatched = [...resolution.byPath.keys()].filter((p) => !seenPaths.has(p));
    if (unmatched.length > 0) {
      notes.push(
        `${unmatched.length} vocabulary mapping(s) name no folder in this checkout: ` +
          `${unmatched.join(", ")}`,
      );
    }
  }
  // The tool's own drift block, passed through rather than recomputed.
  const orphans = report.drift?.orphans ?? [];
  for (const orphan of orphans) {
    notes.push(`ORPHAN ${String(orphan.path)}: rendered video with no topics/ source, not indexed`);
  }
  const unrendered = report.drift?.unrendered ?? [];
  if (unrendered.length > 0) notes.push(`${unrendered.length} topic(s) not rendered in this checkout`);

  return {
    rows: { asset: assets, assetTopic: assetTopics, assetConcept: assetConcepts, assetDerivation: derivations },
    notes,
    // The one fact about this run that a later reader cannot recompute: every
    // `asset.path` here is `out/…`, relative to a base that is not in the row
    // and is not the checkout. See `manimkc.ts` for why it is metadata and
    // not `index_run.source_root`.
    metadata: { outRoot },
    blobs,
  };
}

/**
 * The indexer of a tool whose folders declare their own topic (remotionkc,
 * revideokc): the pinned CLI's report against the checkout, each folder filed
 * under its topic.yml's `topic:`, which must be one the owner can read.
 * `named` picks the checkout the run named out of the context; absent, it is
 * the tool's variable, else its submodule under the tools root.
 */
export function declaredToolIndexer(
  tool: VideoTool,
  named: (context: IndexContext) => string | undefined,
): Indexer {
  const checkoutOf = (context: IndexContext): string =>
    named(context) ?? tool.resolveRoot(context.toolsRoot ?? context.repoRoot);
  return {
    source: tool.name,
    owns: [],
    assetPrefix: tool.prefix,
    root: checkoutOf,
    read: async (context) => {
      const root = checkoutOf(context);
      const report = await readToolReport(tool, context.toolsRoot ?? context.repoRoot, root);
      return buildToolRows(tool, report, root, { by: "declared", bySlug: context.vocabulary.bySlug }, {
        store: context.blobsRequired === true,
        knownConcepts: await context.knownConcepts(),
        ...(context.owner === undefined ? {} : { owner: context.owner }),
      });
    },
  };
}
