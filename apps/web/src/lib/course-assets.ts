import "server-only";

import {
  assetsByIds,
  assetsForConcepts,
  assetsForTopic,
  conceptCheckCounts,
  type AssetRef,
} from "@gnosia/catalog/state";
import { connection } from "next/server";

import { assetDisplayTitle, assetKindLabel, familyOf } from "@/components/asset-meta";
import { parseChecks } from "@/lib/concept-note-core";
import { withCatalog } from "@/lib/asset-library";
import { assetHref, isCompanionKind, libraryHref } from "@/lib/library";
import type { ModulePathAssets, PathAsset } from "@/lib/module-path";
import { currentScope } from "@/lib/owner";
import type { Course } from "@/lib/types";

/**
 * What a course page reads from the catalog per module, for its meta row and
 * its path (`@/lib/module-path`):
 *
 * - the count of assets filed under the module's topic (`assetsForTopic`, the
 *   `asset_topic` join every indexer writes), companions left out as the
 *   library's default view leaves them, and the library link for them;
 * - the topic's videos, the path's fallback;
 * - the diagrams and videos linked to each of the module's concepts
 *   (`asset_concept`);
 * - the videos the course lists (`videos:` on a module or a lesson), resolved
 *   by id to a `video` the owner can read; any other id is left out, and
 *   `catalog doctor` names it;
 * - whether another live module names the same topic;
 * - how many checks each concept's note holds.
 *
 * Every read is owner-scoped (`currentScope()`), and the whole course costs
 * one query per distinct topic plus three. Server only: what crosses to the
 * client is plain data, links and labels already resolved.
 */

export interface ModuleAssets {
  /** Every non-companion asset filed under the topic. */
  count: number;
  /** The library, filtered to this topic. */
  libraryHref: string;
}

export interface CourseAssets {
  /** False when the catalog could not be asked; every module then reads empty. */
  reachable: boolean;
  /** Topic slug to its assets. */
  byTopic: Record<string, ModuleAssets>;
  /** Module id to what its path places. */
  paths: Record<string, ModulePathAssets>;
  /** Concept slug to the checks its note holds; null when the catalog could not be asked. */
  checks: Record<string, number> | null;
}

/** The kinds a concept step shows: what a learner opens, not its sidecars or its source. */
const STEP_KINDS = new Set(["video", "diagram_svg"]);

/**
 * @param course The course on screen.
 * @param modules Every live module the owner can read, of every course: a
 *   topic named by two of them is shared.
 */
export async function loadCourseAssets(
  course: Course,
  modules: readonly { id: string; topic: string }[],
): Promise<CourseAssets> {
  await connection();
  const slugs = [...new Set(course.modules.map((m) => m.topic))];
  const concepts = [...new Set(course.modules.flatMap((m) => m.topics.flatMap((t) => t.concepts)))];
  const listed = [
    ...new Set(course.modules.flatMap((m) => [...(m.videos ?? []), ...m.topics.flatMap((t) => t.videos ?? [])])),
  ];
  const scope = await currentScope();
  const read = await withCatalog((db) =>
    Promise.all([
      Promise.all(slugs.map((slug) => assetsForTopic(db, slug, scope))),
      assetsForConcepts(db, concepts, scope),
      assetsByIds(db, listed, scope),
      conceptCheckCounts(db, concepts, scope, parseChecks),
    ]),
  );
  if (read === null) return { reachable: false, byTopic: {}, paths: {}, checks: null };
  const [topicRows, conceptRows, listedRows, checks] = read;

  const byTopic: Record<string, ModuleAssets> = {};
  const topicVideos: Record<string, PathAsset[]> = {};
  for (const [i, slug] of slugs.entries()) {
    const rows = topicRows[i] ?? [];
    byTopic[slug] = {
      count: rows.filter((row) => !isCompanionKind(row.kind)).length,
      libraryHref: libraryHref({ topic: slug }),
    };
    topicVideos[slug] = rows.filter((row) => row.kind === "video").map(toPathAsset);
  }

  const byConcept: Record<string, PathAsset[]> = {};
  for (const [slug, rows] of Object.entries(conceptRows)) {
    const shown = rows.filter((row) => STEP_KINDS.has(row.kind)).map(toPathAsset);
    if (shown.length > 0) byConcept[slug] = shown;
  }
  const videos = new Map(listedRows.filter((row) => row.kind === "video").map((row) => [row.id, toPathAsset(row)]));

  const naming = new Map<string, Set<string>>();
  for (const m of modules) {
    const ids = naming.get(m.topic) ?? new Set<string>();
    ids.add(m.id);
    naming.set(m.topic, ids);
  }

  const paths: Record<string, ModulePathAssets> = {};
  for (const m of course.modules) {
    const own = new Set([...(m.videos ?? []), ...m.topics.flatMap((t) => t.videos ?? [])]);
    const mine = new Set(m.topics.flatMap((t) => t.concepts));
    paths[m.id] = {
      byConcept: Object.fromEntries(Object.entries(byConcept).filter(([slug]) => mine.has(slug))),
      listed: Object.fromEntries([...videos].filter(([id]) => own.has(id))),
      topicVideos: topicVideos[m.topic] ?? [],
      topicShared: [...(naming.get(m.topic) ?? [])].some((id) => id !== m.id),
    };
  }
  return { reachable: true, byTopic, paths, checks };
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
