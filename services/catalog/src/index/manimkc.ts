import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { key as blobKey } from "@self-learn/blob";
import { LOCAL_LEARNER_ID, type NewAsset, type NewAssetDerivation, type NewAssetTopic } from "@self-learn/schema";

import { MANIMKC_DIR, MANIMKC_ROOT_ENV, resolveManimkcRoot } from "../env";
import { IndexError, IndexErrors } from "./errors";
import { fileFacts } from "./files";
import { ASSET_PREFIX, type Indexer, type SourceBlob, type SourceRows } from "./source";
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
 * Where "the submodule this repo pins" *is* comes from `resolveManimkcRoot`,
 * so `$MANIMKC_ROOT` moves the reader and the default checkout together. That
 * matters because the pair moved once already: relocating them from the repo
 * root into `tools/` on 2026-09-13 cost a day, and a hard-coded
 * `tools/manimkc` here is a second copy of a fact `.gitmodules` owns.
 *
 * **Two roots, and the report says which is which.** `--manimkc-root` is the
 * *checkout*: source, and the `--root` the CLI is handed. Where the rendered
 * files actually sit is the report's own top-level `outRoot`, an absolute path,
 * because manimkc's `$MANIMKC_HOME` lets generated data live outside the
 * checkout entirely — which is the point of it, after a submodule move deleted
 * 25 rendered videos. So a deliverable resolves as `outRoot + deliverable.path`,
 * never as `manimkcRoot + deliverable.path`. With no data root configured the
 * two are the same directory and nothing observable changes.
 *
 * The stored `asset.path` stays the reported string, `out/<domain>/…`, exactly
 * as before. It is the join key `mirrors.ts` matches ledger entries on and the
 * unique key on the asset row; only the *base* it is resolved against moved.
 *
 * That base is written to `index_run.metadata.outRoot`, because a row saying
 * `out/algorithms/…/cs3230_a1.mp4` and nothing else is not enough to open the
 * file. Nothing downstream may re-derive it from `$MANIMKC_HOME`: this repo
 * does not read that variable, by the rule in `AGENTS.md`, and the data root
 * belongs to whichever manimkc checkout this run actually asked. So the run
 * records what it was told, and a reader that finds no `outRoot` there knows
 * its index predates this and says so rather than guessing.
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

/** Media types for manimkc's files, by extension: the ones this source and `catalog asset upload` store. */
export const MANIMKC_MIME: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  json: "application/json",
  vtt: "text/vtt",
};

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
  /**
   * Absolute path the `out/…` strings below are relative to: manimkc's
   * `$MANIMKC_HOME`, which defaults to the checkout root. Optional only for
   * defensive parsing; every version of the CLI this repo pins reports it.
   */
  outRoot?: unknown;
  topics: TopicEntry[];
  drift: { orphans?: Orphan[]; unrendered?: unknown[] };
}

/** Where the pinned manimkc CLI is on this machine. */
export function manimkcCliPath(repoRoot: string): string {
  return path.join(resolveManimkcRoot(repoRoot), MANIMKC_CLI);
}

/** Is there a manimkc CLI to run? The e2e test skips rather than fails when not. */
export function hasManimkcCli(repoRoot: string): boolean {
  return existsSync(manimkcCliPath(repoRoot));
}

/**
 * The refusal both readers share. It names the resolved path rather than the
 * default one, because "tools/manimkc/tools/cli/manimkc does not exist" is a
 * lie on a machine whose `$MANIMKC_ROOT` points somewhere else, and the whole
 * point of looking is to find out where the tool actually is.
 */
export function missingCli(repoRoot: string): IndexError {
  return new IndexError(
    `${manimkcCliPath(repoRoot)} does not exist. The manimkc submodule is not ` +
      `initialised; run \`git submodule update --init ${MANIMKC_DIR}\`, or set ` +
      `${MANIMKC_ROOT_ENV} to a checkout.`,
  );
}

/**
 * `manimkc topics --json`, parsed. Split out so a test can feed the indexer a
 * captured report instead of spawning Python.
 */
export async function readTopicsReport(
  repoRoot: string,
  manimkcRoot: string,
): Promise<TopicsReport> {
  const cli = manimkcCliPath(repoRoot);
  if (!existsSync(cli)) throw missingCli(repoRoot);
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

  read: async ({ repoRoot, toolsRoot, manimkcRoot, vocabulary, blobsRequired }) => {
    const report = await readTopicsReport(toolsRoot ?? repoRoot, manimkcRoot);
    return buildRows(report, manimkcRoot, vocabulary.byManimkcPath, vocabulary.bySlug, { store: blobsRequired === true });
  },
};

/**
 * The pure half: a report plus the vocabulary lookups become rows. Separated
 * from the subprocess so the indexer's behaviour is testable against a captured
 * report, which is also how it was built before bundle 2 merged.
 *
 * `store`: the database is under phase 2's contract, so every file is also
 * returned as a blob for the runner to store first, and its row names the
 * content-addressed key those bytes land under (a re-render lands under a new
 * one). Before the contract the rows name no blob and `catalog asset upload`
 * stores the bytes later, which is flip day's order.
 */
export async function buildRows(
  report: TopicsReport,
  manimkcRoot: string,
  byManimkcPath: ReadonlyMap<string, string>,
  bySlug: ReadonlyMap<string, unknown>,
  options: { store?: boolean } = {},
): Promise<{ rows: SourceRows; notes: string[]; metadata: { outRoot: string }; blobs: SourceBlob[] }> {
  const assets: NewAsset[] = [];
  const assetTopics: NewAssetTopic[] = [];
  const derivations: NewAssetDerivation[] = [];
  const problems = new IndexErrors();
  const seenPaths = new Set<string>();

  // Where the rendered files are, which is not necessarily where the source is.
  // The fallback is for a report from a CLI predating the field; it is also
  // what the value would be anyway on a checkout with no data root configured.
  const outRoot = str(report.outRoot) ?? manimkcRoot;

  let videos = 0;
  let sidecars = 0;
  const blobs: SourceBlob[] = [];
  /** The row as given, or with its blob named and the file queued to store, under the contract. */
  const stored = (row: NewAsset, file: string): NewAsset => {
    if (options.store !== true || typeof row.contentHash !== "string" || typeof row.bytes !== "number") return row;
    const ext = path.extname(file).slice(1).toLowerCase();
    blobs.push({
      file,
      ownerId: LOCAL_LEARNER_ID,
      mime: MANIMKC_MIME[ext] ?? "application/octet-stream",
      ext,
      sha256: row.contentHash,
      bytes: row.bytes,
    });
    return { ...row, blobKey: blobKey(LOCAL_LEARNER_ID, row.contentHash, ext) };
  };

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
        sourceRepo: "manimkc",
      }, videoFile));
      assetTopics.push({ assetId: videoId, topicSlug: slug });
      videos += 1;

      for (const [name, kind] of Object.entries(SIDECAR_KINDS)) {
        const sidecar = deliverable.sidecars?.[name];
        if (!sidecar || sidecar.exists !== true) continue;
        const sidecarPath = str(sidecar.path);
        if (sidecarPath === null) continue;
        const sidecarId = `${ASSET_PREFIX.manimkc}${sidecarPath}`;
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
          sourceRepo: "manimkc",
        }, sidecarFile));
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
  if (outRoot !== manimkcRoot) {
    // Worth a line: the videos this run hashed are not under the checkout it
    // was pointed at, and a reader comparing counts between machines needs to
    // know which data root produced them.
    notes.push(`rendered output read from ${outRoot} (manimkc's MANIMKC_HOME), not the checkout`);
  }

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

  return {
    rows: { asset: assets, assetTopic: assetTopics, assetDerivation: derivations },
    notes,
    // The one fact about this run that a later reader cannot recompute. Every
    // `asset.path` here is `out/<domain>/…`, relative to a base that is not in
    // the row and is not the checkout, so anything opening one of these files
    // has to be told where the base was. `index_run.source_root` cannot carry
    // it: that column is the source this run *read*, and for manimkc that is
    // the checkout the CLI ran against, while for `concepts`, `diagrams` and
    // `sessions` it is a repo-relative directory. Overloading it would make
    // one column mean two things and would misreport every other source.
    //
    // `mirrors` already records the same value for the same reason, and the
    // two are the same `$MANIMKC_HOME` because they are two subcommands of one
    // CLI. Serving a video is what reads it back:
    // `apps/web/src/app/api/assets/[id]/file/route.ts`, which joins it onto
    // `asset.path`, exactly as the indexer does above when it hashes the file.
    metadata: { outRoot },
    blobs,
  };
}
