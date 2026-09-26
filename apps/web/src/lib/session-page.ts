import "server-only";

import { conceptSummaries, type AssetRef, type ConceptSummary } from "@self-learn/catalog/state";

import { resolveProviders } from "@/lib/agent/providers";
import { accessFor, loadFileAccess, readFileProblems } from "@/lib/asset-library";
import { problemForAccess, type RouteProblemCode } from "@/lib/asset-problems";
import type { ConceptWorkspace } from "@/lib/concept-workspace-core";
import { catalogDatabase, readKb } from "@/lib/learner-store";
import { assetFileHref, assetPosterHref, assetStatusHref } from "@/lib/library";
import { buildSessionPlan, distractorPool, nextConcept, type SessionMode, type SessionStep } from "@/lib/session-core";

/**
 * Everything a session page needs beyond the workspace object, read on the
 * server: the step plan (the note's checks turned into questions, with wrong
 * options drawn from other concepts' summaries), the asset the teach step
 * shows, whether a tutor model is configured at all, and the concept Keep
 * going leads to.
 *
 * Reads degrade (layering rule 14): no summaries means fewer questions, no
 * asset access means the placeholder, no knowledge base means no Keep going.
 */

/** What the teach step's widget slot shows. */
export type TeachAsset =
  | { kind: "diagram"; id: string; title: string; src: string; statusHref: string }
  | { kind: "video"; id: string; title: string; src: string; statusHref: string; poster: string }
  /** There is an asset, and the server already knows its file will not load. */
  | { kind: "failed"; title: string; code: RouteProblemCode }
  | { kind: "none" };

export interface SessionPageData {
  plan: SessionStep[];
  asset: TeachAsset;
  /** True when some provider key is set, so a step without a note question may ask the tutor. */
  modelAvailable: boolean;
  /** The frontier concept after this one, for Keep going; null when there is none. */
  next: { slug: string; title: string } | null;
}


/**
 * The teach step's picture: the concept's first exported diagram, else its
 * first video, from `assetsForConcept` (the workspace already holds them).
 * Decided on the server the way the library decides it, so a switched-off file
 * route or a missing file is a sentence, never a broken image.
 */
async function teachAsset(assets: readonly AssetRef[]): Promise<TeachAsset> {
  const pick =
    assets.find((a) => a.kind === "diagram_svg") ?? assets.find((a) => a.kind === "video") ?? null;
  if (pick === null) return { kind: "none" };

  const title = pick.title ?? pick.path?.split("/").pop() ?? pick.id;
  const access = accessFor(await loadFileAccess(), pick.sourceRepo);
  if (!access.ok) return { kind: "failed", title, code: problemForAccess(access.reason) };
  const problem = (await readFileProblems([pick.id])).get(pick.id) ?? null;
  if (problem !== null) return { kind: "failed", title, code: problem };

  return pick.kind === "video"
    ? {
        kind: "video",
        id: pick.id,
        title,
        src: assetFileHref(pick.id),
        statusHref: assetStatusHref(pick.id),
        poster: assetPosterHref(pick.id),
      }
    : { kind: "diagram", id: pick.id, title, src: assetFileHref(pick.id), statusHref: assetStatusHref(pick.id) };
}

export async function loadSessionPage(workspace: ConceptWorkspace, mode: SessionMode): Promise<SessionPageData> {
  let summaries: ConceptSummary[] = [];
  try {
    summaries = await conceptSummaries(await catalogDatabase());
  } catch (error) {
    console.warn(`session: concept summaries unavailable, ${error instanceof Error ? error.message : String(error)}`);
  }

  const [asset, { kb }] = await Promise.all([teachAsset(workspace.assets), readKb()]);
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const frontier = kb.frontier.flatMap((id) => {
    const c = byId.get(id);
    return c === undefined ? [] : [{ id: c.id, title: c.title, domain: c.domain }];
  });

  return {
    plan: buildSessionPlan({
      slug: workspace.slug,
      mode,
      checks: workspace.checks,
      pool: distractorPool(workspace, summaries),
      summary: workspace.summary,
    }),
    asset,
    // `resolveProviders` keeps only the providers whose key is set.
    modelAvailable: resolveProviders().length > 0,
    next: nextConcept(frontier, workspace),
  };
}
