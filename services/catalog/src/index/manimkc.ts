import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { NewAsset, NewAssetDerivation, NewAssetTopic } from "@self-learn/schema";

import { IndexError, IndexErrors } from "./errors";
import { fileFacts } from "./files";
import { ASSET_PREFIX, type Indexer, type SourceRows } from "./source";
import { VOCABULARY_FILE } from "./vocabulary";

/**
 * manimkc's videos and their transcript sidecars, via `manimkc topics --json`.
 *
 * Nothing here walks the checkout's `topics/` or `out/` itself. The conventions
 * that map a topic folder to its output directory, decide which directories
 * under `out/` are deliverables rather than intermediates, and name the three
 * sidecars are all manimkc's, they have changed before, and re-deriving them
 * here would be a second copy free to drift from the first. The `topics`
 * command exists precisely so a catalogue outside that repo does not have to.
 *
 * **Which CLI runs.** The one in the submodule this repo pins,
 * `tools/manimkc/tools/cli/manimkc`, always — with `--root` pointing at
 * whichever checkout is being indexed. When `--manimkc-root` is left at its default the
 * two are the same directory and the distinction does not arise. When it is
 * not, the pinned reader is the right one: it is the version whose JSON this
 * indexer was written and tested against, while the checkout being pointed at
 * may be any commit, including one predating the command's existence.
 *
 * **Drift, and which direction is fatal.** A topic folder with no entry in
 * `content/topics.yaml` is refused: an unmapped video is one the catalog cannot
 * see, which is the failure this whole bundle exists to prevent. A vocabulary
 * mapping with no folder in the checkout is only reported, because the root is
 * deliberately configurable and pointing at an older checkout is a legitimate
 * thing to do. A typo is caught either way, because a misspelt mapping leaves
 * the correctly-named folder unmapped, and that is the fatal direction.
 */

const run = promisify(execFile);

/** The submodule, relative to the repo root. */
export const MANIMKC_DIR = path.join("tools", "manimkc");

/** Relative to the manimkc root. Same path in the submodule and in any checkout. */
export const MANIMKC_CLI = path.join("tools", "cli", "manimkc");

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
  topics: TopicEntry[];
  drift: { orphans?: Orphan[]; unrendered?: unknown[] };
}

/** Is there a manimkc CLI to run? The e2e test skips rather than fails when not. */
export function hasManimkcCli(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, MANIMKC_DIR, MANIMKC_CLI));
}

/**
 * `manimkc topics --json`, parsed. Split out so a test can feed the indexer a
 * captured report instead of spawning Python.
 */
export async function readTopicsReport(
  repoRoot: string,
  manimkcRoot: string,
): Promise<TopicsReport> {
  const cli = path.join(repoRoot, MANIMKC_DIR, MANIMKC_CLI);
  if (!existsSync(cli)) {
    throw new IndexError(
      `${path.join(MANIMKC_DIR, MANIMKC_CLI)} does not exist. The manimkc submodule is not ` +
        `initialised; run \`git submodule update --init ${MANIMKC_DIR}\`.`,
    );
  }
  if (!existsSync(manimkcRoot)) {
    throw new IndexError(`--manimkc-root ${manimkcRoot} does not exist`);
  }

  let stdout: string;
  try {
    // `--root` is a global flag and must precede the subcommand. maxBuffer is
    // raised because the report is one JSON document covering every topic and
    // the 1 MB default is not a lot of margin.
    ({ stdout } = await run("python3", [cli, "--root", manimkcRoot, "topics", "--json"], {
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new IndexError(
      `\`manimkc topics --json\` failed against ${manimkcRoot}\n  ${
        stderr || (error as Error).message
      }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new IndexError(`\`manimkc topics --json\` did not return JSON`);
  }
  const report = parsed as TopicsReport;
  if (!Array.isArray(report.topics)) {
    throw new IndexError(`\`manimkc topics --json\` returned no "topics" list`);
  }
  return report;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export const manimkcIndexer: Indexer = {
  source: "manimkc",
  owns: [],
  assetPrefix: ASSET_PREFIX.manimkc,
  root: ({ manimkcRoot }) => manimkcRoot,

  read: async ({ repoRoot, manimkcRoot, vocabulary }) => {
    const report = await readTopicsReport(repoRoot, manimkcRoot);
    return buildRows(report, manimkcRoot, vocabulary.byManimkcPath, vocabulary.bySlug);
  },
};

/**
 * The pure half: a report plus the vocabulary lookups become rows. Separated
 * from the subprocess so the indexer's behaviour is testable against a captured
 * report, which is also how it was built before bundle 2 merged.
 */
export async function buildRows(
  report: TopicsReport,
  manimkcRoot: string,
  byManimkcPath: ReadonlyMap<string, string>,
  bySlug: ReadonlyMap<string, unknown>,
): Promise<{ rows: SourceRows; notes: string[] }> {
  const assets: NewAsset[] = [];
  const assetTopics: NewAssetTopic[] = [];
  const derivations: NewAssetDerivation[] = [];
  const problems = new IndexErrors();
  const seenPaths = new Set<string>();

  let videos = 0;
  let sidecars = 0;

  for (const entry of report.topics) {
    const topicPath = str(entry.path);
    if (topicPath === null) {
      problems.add(`a topic entry has no "path"`);
      continue;
    }
    seenPaths.add(topicPath);

    const slug = byManimkcPath.get(topicPath);
    if (slug === undefined) {
      problems.add(
        `manimkc topic "${topicPath}" is in no topic's maps.manimkc in ${VOCABULARY_FILE}. ` +
          `An unmapped video is one nothing in the catalog can find.`,
      );
      continue;
    }

    // manimkc's own optional `topic:` field. It is authoritative about nothing
    // — the vocabulary is — but when both say something they must agree, or one
    // of the two files is wrong and it is not knowable which.
    const declared = str(entry.topic);
    if (declared !== null && declared !== slug) {
      problems.add(
        `manimkc topic "${topicPath}" declares topic "${declared}" in its topic.yml, but ` +
          `${VOCABULARY_FILE} maps it to "${slug}". Fix one.`,
      );
      continue;
    }
    if (declared !== null && !bySlug.has(declared)) {
      problems.add(`manimkc topic "${topicPath}" declares topic "${declared}", which does not exist`);
      continue;
    }

    const title = str(entry.title);
    for (const rawSection of Array.isArray(entry.sections) ? entry.sections : []) {
      const section = rawSection as Section;
      const deliverable = section.deliverable;
      if (!deliverable || deliverable.exists !== true) continue;
      const videoPath = str(deliverable.path);
      if (videoPath === null) continue;

      const videoId = `${ASSET_PREFIX.manimkc}${videoPath}`;
      const facts = await fileFacts(path.join(manimkcRoot, videoPath));
      const sectionName = str(section.section);
      assets.push({
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
        sourceRepo: "manimkc",
      });
      assetTopics.push({ assetId: videoId, topicSlug: slug });
      videos += 1;

      for (const [name, kind] of Object.entries(SIDECAR_KINDS)) {
        const sidecar = deliverable.sidecars?.[name];
        if (!sidecar || sidecar.exists !== true) continue;
        const sidecarPath = str(sidecar.path);
        if (sidecarPath === null) continue;
        const sidecarId = `${ASSET_PREFIX.manimkc}${sidecarPath}`;
        const sidecarFacts = await fileFacts(path.join(manimkcRoot, sidecarPath));
        assets.push({
          id: sidecarId,
          kind,
          path: sidecarPath,
          url: null,
          contentHash: sidecarFacts.contentHash,
          bytes: sidecarFacts.bytes,
          title: title === null ? sidecarPath : `${title} (${name})`,
          sourceRepo: "manimkc",
        });
        assetTopics.push({ assetId: sidecarId, topicSlug: slug });
        // The sidecar came out of the video's narration. This edge is what
        // bundle 6's drift check reads to spot a transcript left behind by a
        // re-render.
        derivations.push({ assetId: sidecarId, sourceAssetId: videoId });
        sidecars += 1;
      }
    }
  }

  problems.throwIfAny(`manimkc topics (${manimkcRoot})`);

  const notes = [`${report.topics.length} topic folders, ${videos} videos, ${sidecars} sidecars`];

  // The non-fatal direction: mappings this checkout has nothing for.
  const unmatched = [...byManimkcPath.keys()].filter((p) => !seenPaths.has(p));
  if (unmatched.length > 0) {
    notes.push(
      `${unmatched.length} vocabulary mapping(s) name no folder in this checkout: ` +
        `${unmatched.join(", ")}`,
    );
  }
  // manimkc's own drift block, passed through rather than recomputed.
  const orphans = report.drift?.orphans ?? [];
  for (const orphan of orphans) {
    notes.push(`ORPHAN ${String(orphan.path)}: rendered video with no topics/ source, not indexed`);
  }
  const unrendered = report.drift?.unrendered ?? [];
  if (unrendered.length > 0) notes.push(`${unrendered.length} topic(s) not rendered in this checkout`);

  return { rows: { asset: assets, assetTopic: assetTopics, assetDerivation: derivations }, notes };
}
