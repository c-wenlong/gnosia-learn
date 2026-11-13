import type { Indexer } from "./source";
import {
  BLENDERKC,
  buildToolRows,
  declaredToolIndexer,
  readToolReport,
  type TopicsReport,
  type VideoToolRowOptions,
} from "./video-tool";

/**
 * blenderkc's videos and their sidecars, via `blenderkc topics --json`.
 *
 * The fourth video tool, and revideokc's rules exactly (`./revideokc.ts`):
 * blenderkc renders photoreal 3D with Blender's Cycles through `bpy` and
 * narrates through gnosia-audio, its CLI answers `topics --json` with
 * manimkc's report shape, and there is no `maps.blenderkc`, so each
 * topic.yml's required `topic:` is the topic its video is filed under, one
 * the importing owner can read; a missing or unknown one refuses the run by
 * file and slug. The rows live under `blenderkc:` with `source_repo`
 * `blenderkc`, and the run records the report's `outRoot` (its
 * `$BLENDERKC_HOME`) on `index_run.metadata`.
 *
 * The CLI that runs is the pinned one, `tools/blenderkc/tools/cli/blenderkc`
 * under `$BLENDERKC_ROOT` or the submodule, with `python3` as manimkc's is:
 * it is the standard library only and never imports bpy, so a checkout with
 * no `.venv` still answers. `--root` names the checkout being indexed
 * (`--blenderkc-root`).
 */

export type { TopicsReport };

/** `blenderkc topics --json`, parsed. */
export async function readBlenderkcReport(repoRoot: string, blenderkcRoot: string): Promise<TopicsReport> {
  return readToolReport(BLENDERKC, repoRoot, blenderkcRoot);
}

/** The source, reading the checkout the run named (`--blenderkc-root`), else the variable or the submodule. */
export const blenderkcIndexer: Indexer = declaredToolIndexer(BLENDERKC, (context) => context.blenderkcRoot);

/**
 * The pure half: a report plus the slugs the owner can read become rows. Each
 * topic folder is filed under the topic its topic.yml declares, and linked to
 * the concepts it names (`options.knownConcepts` says which exist).
 */
export async function buildBlenderkcRows(
  report: TopicsReport,
  blenderkcRoot: string,
  bySlug: ReadonlyMap<string, unknown>,
  options: VideoToolRowOptions = {},
): ReturnType<typeof buildToolRows> {
  return buildToolRows(BLENDERKC, report, blenderkcRoot, { by: "declared", bySlug }, options);
}
