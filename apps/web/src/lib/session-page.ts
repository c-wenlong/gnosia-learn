import "server-only";

import { conceptSummaries, type AssetRef, type ConceptSummary } from "@gnosia/catalog/state";

import { tutorCredentials } from "@/lib/agent/credentials";
import { isCallable } from "@gnosia/tutor/providers";
import { readWrittenOptions, type WrittenOptions } from "@gnosia/tutor/server/check-options";
import { readAssetAccess, readFileProblems } from "@/lib/asset-library";
import type { RouteProblemCode } from "@gnosia/tutor/asset-problems";
import type { ConceptWorkspace } from "@gnosia/tutor/concept-workspace-core";
import { catalogDatabase, readKb } from "@/lib/learner-store";
import { assetFileHref, assetPosterHref, assetStatusHref } from "@/lib/library";
import { currentOwner, currentScope } from "@/lib/owner";
import {
  asksNothing,
  buildSessionPlan,
  distractorPool,
  nextConcept,
  sessionCanAsk,
  withoutEmptySteps,
  type ConceptSessionMode,
  type SessionStep,
} from "@gnosia/tutor/session-core";

/**
 * Everything a session page needs beyond the workspace object, read on the
 * server: the step plan (the note's checks turned into questions, with the
 * wrong options the tutor wrote for each check when it has, else drawn from
 * the note's other answers and other concepts' summaries), the asset the
 * teach step shows, whether a tutor model is configured at all, and the
 * concept Keep going leads to.
 *
 * Reads degrade (layering rule 14): no summaries means fewer questions, no
 * stored options means options from the notes (each such question asks the
 * tutor first when a model is configured), no asset access means the
 * placeholder, no knowledge base means no Keep going. Nothing here calls a
 * model: the tutor writes a check's options when the session page asks for
 * them (`POST /api/agent/check-options`), never while a page renders.
 */

/** What the teach step's widget slot shows. */
export type TeachAsset =
  | { kind: "diagram"; id: string; title: string; src: string; statusHref: string }
  /** `poster` only when the upload stored one: nothing cuts a frame at request time. */
  | { kind: "video"; id: string; title: string; src: string; statusHref: string; poster: string | null; sourceRepo: string }
  /** There is an asset, and the server already knows its file will not load. */
  | { kind: "failed"; title: string; code: RouteProblemCode; sourceRepo: string }
  | { kind: "none" };

export interface SessionPageData {
  /** The steps to walk, without any question step nothing can fill (`withoutEmptySteps`). */
  plan: SessionStep[];
  asset: TeachAsset;
  /** True when some provider key is set, so a step without a note question may ask the tutor. */
  modelAvailable: boolean;
  /**
   * True when the plan has no question left: the note has no check the session
   * can ask and no model is configured. Teach me then teaches and closes, Quiz
   * me closes at once, and both say why.
   */
  nothingToAsk: boolean;
  /** The frontier concept after this one, for Keep going; null when there is none. */
  next: { slug: string; title: string } | null;
}


/**
 * The teach step's picture: the concept's first exported diagram, else its
 * first video, from `assetsForConcept` (the workspace already holds them).
 * Decided on the server the way the library decides it, so a video nobody
 * uploaded is a sentence, never a broken image.
 */
async function teachAsset(assets: readonly AssetRef[]): Promise<TeachAsset> {
  const pick =
    assets.find((a) => a.kind === "diagram_svg") ?? assets.find((a) => a.kind === "video") ?? null;
  if (pick === null) return { kind: "none" };

  const title = pick.title ?? pick.path?.split("/").pop() ?? pick.id;
  // Per row, through the route's own resolver: a blob in the store plays, and
  // a row with no stored copy is `not-uploaded`.
  const problem = (await readFileProblems([pick.id])).get(pick.id) ?? null;
  if (problem !== null) return { kind: "failed", title, code: problem, sourceRepo: pick.sourceRepo };

  if (pick.kind === "video") {
    const { posters } = await readAssetAccess([pick]);
    return {
      kind: "video",
      id: pick.id,
      title,
      src: assetFileHref(pick.id),
      statusHref: assetStatusHref(pick.id),
      poster: posters.has(pick.id) ? assetPosterHref(pick.id) : null,
      sourceRepo: pick.sourceRepo,
    };
  }
  return { kind: "diagram", id: pick.id, title, src: assetFileHref(pick.id), statusHref: assetStatusHref(pick.id) };
}

/**
 * Whether a tutor model can be asked at all: some entry the tutor would try
 * has a key, the owner's saved one that still decrypts or the server's
 * (docs/BYOK.md, docs/TUTOR-MODELS.md). A chain whose every entry lacks a key
 * cannot. Server-only,
 * like the keys; a client component is handed the answer, never a key.
 */
export async function tutorModelConfigured(): Promise<boolean> {
  return (await tutorCredentials(await currentOwner())).some(isCallable);
}

/** Every concept's summary, for wrong options; none when the catalog cannot be read. */
export async function readSummaries(): Promise<ConceptSummary[]> {
  const scope = await currentScope();
  try {
    return await conceptSummaries(await catalogDatabase(), scope);
  } catch (error) {
    console.warn(`session: concept summaries unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * The tutor's stored wrong options for one concept's checks, by check id;
 * none when the catalog cannot answer (`readWrittenOptions` degrades).
 */
export async function readConceptOptions(workspace: Pick<ConceptWorkspace, "slug" | "checks">): Promise<WrittenOptions> {
  if (workspace.checks.length === 0) return {};
  const written = await readWrittenOptions(catalogDatabase(), await currentOwner(), [workspace]);
  return written.get(workspace.slug) ?? {};
}

/**
 * Whether a session on this concept will ask anything, for the workspace
 * before one starts, decided from the plan the session page would build.
 * With a model configured, or a note with no check, the answer needs no
 * summaries and no stored options, so neither is read.
 */
export async function sessionWillAsk(workspace: ConceptWorkspace): Promise<boolean> {
  const modelAvailable = await tutorModelConfigured();
  const skip = modelAvailable || workspace.checks.length === 0;
  const [summaries, written] = skip ? [[], {}] : await Promise.all([readSummaries(), readConceptOptions(workspace)]);
  return sessionCanAsk(
    {
      slug: workspace.slug,
      checks: workspace.checks,
      pool: distractorPool(workspace, summaries),
      written,
      summary: workspace.summary,
    },
    modelAvailable,
  );
}

export async function loadSessionPage(workspace: ConceptWorkspace, mode: ConceptSessionMode): Promise<SessionPageData> {
  const [summaries, written] = await Promise.all([readSummaries(), readConceptOptions(workspace)]);

  const [asset, { kb }] = await Promise.all([teachAsset(workspace.assets), readKb(await currentOwner())]);
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const frontier = kb.frontier.flatMap((id) => {
    const c = byId.get(id);
    return c === undefined ? [] : [{ id: c.id, title: c.title, domain: c.domain }];
  });

  const modelAvailable = await tutorModelConfigured();
  const plan = withoutEmptySteps(
    buildSessionPlan({
      slug: workspace.slug,
      mode,
      checks: workspace.checks,
      pool: distractorPool(workspace, summaries),
      written,
      canWrite: modelAvailable,
      summary: workspace.summary,
    }),
    modelAvailable,
  );

  return {
    plan,
    asset,
    modelAvailable,
    nothingToAsk: asksNothing(plan),
    next: nextConcept(frontier, workspace),
  };
}
