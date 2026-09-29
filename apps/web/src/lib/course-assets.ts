import "server-only";

import { assetsForTopic, type AssetRef } from "@self-learn/catalog/state";
import { connection } from "next/server";

import { assetDisplayTitle, assetKindLabel, familyOf, type Family } from "@/components/asset-meta";
import { withCatalog } from "@/lib/asset-library";
import { assetHref, compareByKindThenId, isCompanionKind, libraryHref } from "@/lib/library";
import { currentScope } from "@/lib/owner";

/**
 * The assets a course page shows per module: the count in the module's meta
 * row and the first few as item rows under its topics, each with its kind's
 * icon, then a link to the rest in the library.
 *
 * A module's assets are its `topic:` slug's, through `assetsForTopic`: the
 * required `asset_topic` join every indexer writes. Companion kinds
 * (transcripts, captions, chapter lists, diagram sources) are left out, the
 * same rule the library's default view applies, since a caption file is not
 * something a learner opens from a path.
 *
 * Server only: it reads the catalog. What crosses to the client path is the
 * plain `ModuleAssets` below, with the thumbnail and the link already
 * resolved.
 */

/** One asset as a module page draws it. */
export interface PathAsset {
  id: string;
  href: string;
  title: string;
  /** False when `title` is a filename or a host rather than a real title. */
  titled: boolean;
  kindLabel: string;
  /** Which icon the row carries. */
  family: Family;
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

/** How many a module page lists before pointing at the library. */
export const MODULE_ASSET_LIMIT = 6;

export async function loadCourseAssets(topicSlugs: readonly string[]): Promise<CourseAssets> {
  await connection();
  const slugs = [...new Set(topicSlugs)];
  const scope = await currentScope();
  const rows = await withCatalog((db) => Promise.all(slugs.map((slug) => assetsForTopic(db, slug, scope))));
  if (rows === null) return { reachable: false, byTopic: {} };

  const shown = slugs.map((_, i) =>
    (rows[i] ?? []).filter((row) => !isCompanionKind(row.kind)).sort(compareByKindThenId),
  );
  const byTopic: Record<string, ModuleAssets> = {};
  for (const [i, slug] of slugs.entries()) {
    const list = shown[i] ?? [];
    byTopic[slug] = {
      count: list.length,
      top: list.slice(0, MODULE_ASSET_LIMIT).map(toPathAsset),
      libraryHref: libraryHref({ topic: slug }),
    };
  }
  return { reachable: true, byTopic };
}

function toPathAsset(row: AssetRef): PathAsset {
  const name = assetDisplayTitle(row);
  return {
    id: row.id,
    href: assetHref(row.id),
    title: name.text,
    titled: name.source === "title",
    kindLabel: assetKindLabel(row.kind),
    family: familyOf(row.kind),
  };
}
