import "server-only";

import { assetsForTopic, type AssetRef } from "@self-learn/catalog/state";
import { connection } from "next/server";

import { assetDisplayTitle, assetKindLabel } from "@/components/asset-meta";
import { readFileAccess, thumbnailFor, thumbnailStatusFor, withCatalog, type FileAccessMap } from "@/lib/asset-library";
import { assetHref, compareByKindThenId, isCompanionKind, libraryHref } from "@/lib/library";
import { currentScope } from "@/lib/owner";

/**
 * The assets a course path shows per module: the count on each unit's
 * "Assets" chip and the first few in the rail's "Assets for this module".
 *
 * A module's assets are its `topic:` slug's, through `assetsForTopic`: the
 * required `asset_topic` join every indexer writes. Companion kinds
 * (transcripts, captions, chapter lists, diagram sources) are left out, the
 * same rule the library's default view applies, since a caption file is not
 * something a learner opens from a path.
 *
 * Server only: it reads the catalog. What crosses to the client path is the
 * plain `ModuleAssets` below, with the thumbnail and the link already
 * resolved, the way the library's cards receive theirs.
 */

/** One asset as the rail draws it. */
export interface PathAsset {
  id: string;
  href: string;
  title: string;
  /** False when `title` is a filename or a host rather than a real title. */
  titled: boolean;
  kindLabel: string;
  /** A poster or the diagram itself, or null for the placeholder. */
  thumb: string | null;
  /** Where the thumbnail asks why it failed; absent when there is no thumbnail. */
  thumbStatus?: string;
  /** A diagram is fitted whole; a video poster fills the box. */
  diagram: boolean;
}

export interface ModuleAssets {
  /** Every non-companion asset filed under the topic. */
  count: number;
  /** The first few, most worth opening first. */
  top: PathAsset[];
  /** The library, filtered to this topic. */
  libraryHref: string;
}

export interface CourseAssets {
  /** False when the catalog could not be asked; every module then reads empty. */
  reachable: boolean;
  /** Topic slug to its assets. */
  byTopic: Record<string, ModuleAssets>;
}

/** How many a rail lists before pointing at the library. */
export const RAIL_ASSET_LIMIT = 3;

export async function loadCourseAssets(topicSlugs: readonly string[]): Promise<CourseAssets> {
  await connection();
  const slugs = [...new Set(topicSlugs)];
  const scope = await currentScope();
  const rows = await withCatalog((db) => Promise.all(slugs.map((slug) => assetsForTopic(db, slug, scope))));
  if (rows === null) return { reachable: false, byTopic: {} };

  const shown = slugs.map((_, i) =>
    (rows[i] ?? []).filter((row) => !isCompanionKind(row.kind)).sort(compareByKindThenId),
  );
  // Only the rows a rail draws are asked about, per row: a stored video's
  // poster shows with the switch off.
  const access = await readFileAccess(shown.flatMap((list) => list.slice(0, RAIL_ASSET_LIMIT)));
  const byTopic: Record<string, ModuleAssets> = {};
  for (const [i, slug] of slugs.entries()) {
    const list = shown[i] ?? [];
    byTopic[slug] = {
      count: list.length,
      top: list.slice(0, RAIL_ASSET_LIMIT).map((row) => toPathAsset(row, access)),
      libraryHref: libraryHref({ topic: slug }),
    };
  }
  return { reachable: true, byTopic };
}

function toPathAsset(row: AssetRef, access: FileAccessMap): PathAsset {
  const name = assetDisplayTitle(row);
  // `thumbnailFor` reads the kind, the id and the source repo; the topic list
  // it also accepts is not consulted.
  const withTopics = { ...row, topics: [] };
  return {
    id: row.id,
    href: assetHref(row.id),
    title: name.text,
    titled: name.source === "title",
    kindLabel: assetKindLabel(row.kind),
    thumb: thumbnailFor(withTopics, access),
    thumbStatus: thumbnailStatusFor(withTopics, access),
    diagram: row.kind === "diagram_svg",
  };
}
