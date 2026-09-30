import type { IndexError } from "./errors";
import type { Indexer } from "./source";
import {
  buildToolRows,
  hasToolCli,
  MANIMKC,
  missingToolCli,
  readToolReport,
  toolCliPath,
  VIDEO_TOOL_MIME,
  type TopicsReport,
} from "./video-tool";

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

/** Media types for manimkc's files, by extension: the ones this source and `catalog asset upload` store. */
export const MANIMKC_MIME: Readonly<Record<string, string>> = VIDEO_TOOL_MIME;

/** Relative to the manimkc root. Same path in the submodule and in any checkout. */
export const MANIMKC_CLI = MANIMKC.cli;

export type { TopicsReport };

/** Where the pinned manimkc CLI is on this machine. */
export function manimkcCliPath(repoRoot: string): string {
  return toolCliPath(MANIMKC, repoRoot);
}

/** Is there a manimkc CLI to run? The e2e test skips rather than fails when not. */
export function hasManimkcCli(repoRoot: string): boolean {
  return hasToolCli(MANIMKC, repoRoot);
}

/**
 * The refusal both readers share. It names the resolved path rather than the
 * default one, because "tools/manimkc/tools/cli/manimkc does not exist" is a
 * lie on a machine whose `$MANIMKC_ROOT` points somewhere else, and the whole
 * point of looking is to find out where the tool actually is.
 */
export function missingCli(repoRoot: string): IndexError {
  return missingToolCli(MANIMKC, repoRoot);
}

/**
 * `manimkc topics --json`, parsed. Split out so a test can feed the indexer a
 * captured report instead of spawning Python.
 */
export async function readTopicsReport(repoRoot: string, manimkcRoot: string): Promise<TopicsReport> {
  return readToolReport(MANIMKC, repoRoot, manimkcRoot);
}

export const manimkcIndexer: Indexer = {
  source: "manimkc",
  owns: [],
  assetPrefix: MANIMKC.prefix,
  root: ({ manimkcRoot }) => manimkcRoot,

  read: async ({ repoRoot, toolsRoot, manimkcRoot, vocabulary, blobsRequired, owner }) => {
    const report = await readTopicsReport(toolsRoot ?? repoRoot, manimkcRoot);
    return buildRows(report, manimkcRoot, vocabulary.byManimkcPath, vocabulary.bySlug, {
      store: blobsRequired === true,
      ...(owner === undefined ? {} : { owner }),
    });
  },
};

/**
 * The pure half: a report plus the vocabulary lookups become rows. Separated
 * from the subprocess so the indexer's behaviour is testable against a captured
 * report, which is also how it was built before bundle 2 merged. The work is
 * `buildToolRows` in `./video-tool.ts`, which remotionkc shares; manimkc's
 * part is resolving each folder through `maps.manimkc`.
 *
 * `store`: the database is under phase 2's contract, so every file is also
 * returned as a blob for the runner to store first, and its row names the
 * content-addressed key those bytes land under (a re-render lands under a new
 * one). Before the contract the rows name no blob and `catalog asset upload`
 * stores the bytes later, which is flip day's order.
 *
 * The run's `outRoot` goes to `index_run.metadata`, because a row saying
 * `out/algorithms/…/cs3230_a1.mp4` and nothing else is not enough to open the
 * file. `index_run.source_root` cannot carry it: that column is the source
 * this run *read*, and for manimkc that is the checkout the CLI ran against,
 * while for `concepts`, `diagrams` and `sessions` it is a repo-relative
 * directory. Overloading it would make one column mean two things and would
 * misreport every other source. `mirrors` records the same value for the same
 * reason, and the two are the same `$MANIMKC_HOME` because they are two
 * subcommands of one CLI.
 */
export async function buildRows(
  report: TopicsReport,
  manimkcRoot: string,
  byManimkcPath: ReadonlyMap<string, string>,
  bySlug: ReadonlyMap<string, unknown>,
  options: { store?: boolean; owner?: string } = {},
): ReturnType<typeof buildToolRows> {
  return buildToolRows(MANIMKC, report, manimkcRoot, { by: "vocabulary", byPath: byManimkcPath, bySlug }, options);
}
