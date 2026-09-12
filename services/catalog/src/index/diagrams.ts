import path from "node:path";

import type { NewAsset, NewAssetConcept, NewAssetDerivation, NewAssetTopic } from "@self-learn/schema";

import { fileFacts, filesIn, relativeTo } from "./files";
import { ASSET_PREFIX, type Indexer, type SourceRows } from "./source";

/**
 * `learn/assets/*.svg` and `*.tldr` as diagram assets.
 *
 * The two files are related by their stem: `dot-product.tldr` is the editable
 * source and `dot-product.svg` is what was exported from it, so when both are
 * present the SVG gets an `asset_derivation` to the `.tldr`. That edge is the
 * whole reason to index the source at all — it is what will let bundle 6 say
 * "this SVG was exported from a `.tldr` that has changed since".
 *
 * The stem is also how a diagram finds its concept: `tldrawkc` writes
 * `learn/assets/<concept-id>.{tldr,svg}`, flat, with no metadata of its own
 * (bundle 6 gives it some). A stem that matches no concept is not an error —
 * today's single SVG is exactly that case — because a diagram may legitimately
 * illustrate a topic nobody has written a note about yet. It still gets an
 * `asset_topic` row when its concept exists, and none when it does not; an
 * orphan diagram is visible in `ls --kind diagram_svg` rather than hidden.
 */

export const ASSETS_DIR = "learn/assets";

const KINDS = {
  ".svg": "diagram_svg",
  ".tldr": "diagram_source",
} as const;

export const diagramsIndexer: Indexer = {
  source: "diagrams",
  owns: [],
  assetPrefix: ASSET_PREFIX.diagrams,
  root: () => ASSETS_DIR,

  read: async ({ repoRoot, knownConcepts, vocabulary }) => {
    const directory = path.join(repoRoot, ASSETS_DIR);
    const files = await filesIn(directory, Object.keys(KINDS));
    const concepts = await knownConcepts();

    const assets: NewAsset[] = [];
    const assetConcepts: NewAssetConcept[] = [];
    const assetTopics: NewAssetTopic[] = [];
    const derivations: NewAssetDerivation[] = [];

    /** Stems that have a `.tldr`, so an SVG can find the source it came from. */
    const sources = new Map<string, string>();
    let linked = 0;

    for (const file of files) {
      const extension = path.extname(file) as keyof typeof KINDS;
      const stem = path.basename(file, extension);
      const where = relativeTo(repoRoot, file);
      const id = `${ASSET_PREFIX.diagrams}${where}`;
      const { contentHash, bytes } = await fileFacts(file);

      assets.push({
        id,
        kind: KINDS[extension],
        path: where,
        url: null,
        contentHash,
        bytes,
        title: stem,
        sourceRepo: "self-learn",
      });
      if (extension === ".tldr") sources.set(stem, id);
      if (concepts.has(stem)) {
        assetConcepts.push({ assetId: id, conceptSlug: stem });
        // Reach the topic through the concept, so a diagram turns up under
        // `show <topic>` beside the video and the note about the same subject.
        const topicSlug = vocabulary.byConcept.get(stem);
        if (topicSlug !== undefined) assetTopics.push({ assetId: id, topicSlug });
        linked += 1;
      }
    }

    // A second pass, because the `.svg` sorts before the `.tldr` and the
    // derivation needs both ids.
    for (const file of files) {
      const extension = path.extname(file);
      if (extension !== ".svg") continue;
      const stem = path.basename(file, extension);
      const source = sources.get(stem);
      if (source === undefined) continue;
      derivations.push({
        assetId: `${ASSET_PREFIX.diagrams}${relativeTo(repoRoot, file)}`,
        sourceAssetId: source,
      });
    }

    const rows: SourceRows = {
      asset: assets,
      assetTopic: assetTopics,
      assetConcept: assetConcepts,
      assetDerivation: derivations,
    };
    return {
      rows,
      notes: [
        `${assets.length} diagram files, ${linked} linked to a concept, ` +
          `${derivations.length} exported from a .tldr`,
      ],
    };
  },
};
