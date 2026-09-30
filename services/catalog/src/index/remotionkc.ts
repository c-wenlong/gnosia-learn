import type { Indexer } from "./source";
import { buildToolRows, declaredToolIndexer, readToolReport, REMOTIONKC, type TopicsReport } from "./video-tool";

/**
 * remotionkc's videos and their sidecars, via `remotionkc topics --json`.
 *
 * remotionkc makes videos with Remotion, and its CLI answers `topics --json`
 * with manimkc's report shape exactly: a top-level `outRoot` (its
 * `$REMOTIONKC_HOME`), one entry per topic folder, each deliverable's
 * `out/<topic path>/<name>.mp4` and its transcript, chapters and captions.
 * So the rows are built by the same code as manimkc's (`./video-tool.ts`),
 * under their own namespace, `remotionkc:`, with `source_repo` `remotionkc`,
 * and the run records its `outRoot` on `index_run.metadata` for the same
 * reason manimkc's does.
 *
 * **One difference, decided with the tool.** There is no `maps.remotionkc`
 * in the vocabulary. Each topic.yml's `topic:` is required and is the
 * answer, and it must be a topic the importing owner can read (their own or
 * the commons'). A missing or unknown one refuses the run by name, the file
 * and the slug; nothing is skipped, since a skipped video is one the catalog
 * silently does not have.
 *
 * The CLI that runs is the pinned one, `tools/remotionkc/tools/cli/remotionkc.mjs`
 * under `$REMOTIONKC_ROOT` or the submodule, run with plain node, and
 * `--root` names the checkout being indexed (`--remotionkc-root`), for the
 * reasons `manimkc.ts` gives for its own pair.
 */

export type { TopicsReport };

/** `remotionkc topics --json`, parsed. */
export async function readRemotionkcReport(repoRoot: string, remotionkcRoot: string): Promise<TopicsReport> {
  return readToolReport(REMOTIONKC, repoRoot, remotionkcRoot);
}

/** The source, reading the checkout the run named (`--remotionkc-root`), else the variable or the submodule. */
export const remotionkcIndexer: Indexer = declaredToolIndexer(REMOTIONKC, (context) => context.remotionkcRoot);

/**
 * The pure half: a report plus the slugs the owner can read become rows. Each
 * topic folder is filed under the topic its topic.yml declares.
 */
export async function buildRemotionkcRows(
  report: TopicsReport,
  remotionkcRoot: string,
  bySlug: ReadonlyMap<string, unknown>,
  options: { store?: boolean; owner?: string } = {},
): ReturnType<typeof buildToolRows> {
  return buildToolRows(REMOTIONKC, report, remotionkcRoot, { by: "declared", bySlug }, options);
}
