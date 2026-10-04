import type { Indexer } from "./source";
import {
  buildToolRows,
  declaredToolIndexer,
  readToolReport,
  REVIDEOKC,
  type TopicsReport,
  type VideoToolRowOptions,
} from "./video-tool";

/**
 * revideokc's videos and their sidecars, via `revideokc topics --json`.
 *
 * The third video tool, and remotionkc's rules exactly (`./remotionkc.ts`):
 * revideokc renders with Revideo, its CLI answers `topics --json` with
 * manimkc's report shape, and there is no `maps.revideokc`, so each
 * topic.yml's required `topic:` is the topic its video is filed under, one
 * the importing owner can read; a missing or unknown one refuses the run by
 * file and slug. The rows live under `revideokc:` with `source_repo`
 * `revideokc`, and the run records the report's `outRoot` (its
 * `$REVIDEOKC_HOME`) on `index_run.metadata`.
 *
 * The CLI that runs is the pinned one, `tools/revideokc/tools/cli/revideokc.mjs`
 * under `$REVIDEOKC_ROOT` or the submodule, with plain node, and `--root`
 * names the checkout being indexed (`--revideokc-root`).
 */

export type { TopicsReport };

/** `revideokc topics --json`, parsed. */
export async function readRevideokcReport(repoRoot: string, revideokcRoot: string): Promise<TopicsReport> {
  return readToolReport(REVIDEOKC, repoRoot, revideokcRoot);
}

/** The source, reading the checkout the run named (`--revideokc-root`), else the variable or the submodule. */
export const revideokcIndexer: Indexer = declaredToolIndexer(REVIDEOKC, (context) => context.revideokcRoot);

/**
 * The pure half: a report plus the slugs the owner can read become rows. Each
 * topic folder is filed under the topic its topic.yml declares, and linked to
 * the concepts it names (`options.knownConcepts` says which exist).
 */
export async function buildRevideokcRows(
  report: TopicsReport,
  revideokcRoot: string,
  bySlug: ReadonlyMap<string, unknown>,
  options: VideoToolRowOptions = {},
): ReturnType<typeof buildToolRows> {
  return buildToolRows(REVIDEOKC, report, revideokcRoot, { by: "declared", bySlug }, options);
}
