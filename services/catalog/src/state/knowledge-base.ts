import {
  concept,
  conceptCurriculumItem,
  conceptPrerequisite,
  indexRun,
  LOCAL_LEARNER_ID,
} from "@self-learn/schema";
import { asc, eq } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { masteryLabel } from "../../../../scripts/learn/lib/bkt.mjs";
import { buildGraph, frontier, masteryOf, summarize } from "../../../../scripts/learn/lib/graph.mjs";
import { readModel } from "./mastery";
import { readReviews } from "./review";

/**
 * The read model `learn/state/index.json` used to be: every concept with its
 * mastery, its schedule and its edges, plus the frontier and the counts.
 *
 * The file was a snapshot the pipeline wrote and the web build baked in, which
 * meant a study session did not change the deployed page until the next deploy.
 * This is a query, so it is current by construction.
 *
 * The graph maths is `graph.mjs`, unchanged, fed rows instead of files. That
 * matters more than it looks: `frontier()` is the entire teaching policy, and
 * the CLI and the web page disagreeing about where the frontier is would be a
 * bug nobody would think to look for.
 */

export type MasteryLabel = "mastered" | "solid" | "shaky" | "weak" | "gap";

export interface KbConcept {
  id: string;
  title: string;
  summary: string;
  requires: string[];
  /** Background: affects ordering only, never gates or carries evidence. */
  assumes: string[];
  /** p(L) from Bayesian Knowledge Tracing. */
  pL: number;
  mastery: MasteryLabel;
  observations: number;
  correct: number;
  lastSeen: string | null;
  due: string | null;
  lapses: number;
  leech: boolean;
  /** Curriculum item ids this concept supports, linking back to the courses. */
  topics: string[];
  /** Folder the note lives in, read off `concept.path`. Presentation only. */
  domain: string | null;
}

export interface KbEdge {
  from: string;
  to: string;
  kind: "requires" | "assumes";
}

export interface KnowledgeBase {
  /** When the `concepts` source was last indexed, or null if it never was. */
  indexedAt: string | null;
  stats: { total: number; mastered: number; learning: number; untouched: number };
  frontier: string[];
  concepts: KbConcept[];
  edges: KbEdge[];
}

export const EMPTY_KNOWLEDGE_BASE: KnowledgeBase = {
  indexedAt: null,
  stats: { total: 0, mastered: 0, learning: 0, untouched: 0 },
  frontier: [],
  concepts: [],
  edges: [],
};

/**
 * `learn/concepts/<domain>/<id>.md` → `<domain>`. Read from the path rather
 * than stored, exactly as `store.mjs` does, so the two can never disagree. A
 * note at the root of `concepts/` has no domain.
 */
export function domainOf(path: string | null): string | null {
  if (path === null) return null;
  const parts = path.split("/");
  // learn / concepts / <domain> / <file>.md
  return parts.length >= 4 ? (parts[2] ?? null) : null;
}

/**
 * The concept graph `graph.mjs` works on, built from the catalog's `concept`
 * and `concept_prerequisite` rows rather than from the notes on disk.
 *
 * The CLI builds its graph from the files (`loadGraph` in `learn/cli.ts`);
 * the web app has no business reading `learn/concepts/`, and the catalog holds
 * the same edges, indexed from those same files. So a correct answer recorded
 * from a page propagates along the edges the frontier on every page is
 * computed from. The two can differ only between editing a note's `requires:`
 * and the next `learn index`, and a rebuild replays either way.
 */
export async function readConceptGraph(db: CatalogDatabase): Promise<{ nodes: Map<string, unknown> }> {
  const [concepts, prerequisites] = await Promise.all([
    db.select({ slug: concept.slug, title: concept.title, summary: concept.summary }).from(concept),
    db.select().from(conceptPrerequisite),
  ]);
  return graphOf(concepts, prerequisites);
}

/** Rows to `buildGraph`'s input, which is the shape `listConcepts()` returns. */
function graphOf(
  concepts: readonly { slug: string; title: string; summary: string | null }[],
  prerequisites: readonly { conceptSlug: string; prerequisiteSlug: string; kind: string }[],
) {
  const { requires, assumes } = edgeLists(prerequisites);
  return buildGraph(
    concepts.map((row) => ({
      id: row.slug,
      title: row.title,
      summary: row.summary ?? "",
      requires: requires.get(row.slug) ?? [],
      assumes: assumes.get(row.slug) ?? [],
    })),
  ) as { nodes: Map<string, unknown> };
}

function edgeLists(prerequisites: readonly { conceptSlug: string; prerequisiteSlug: string; kind: string }[]) {
  const requires = new Map<string, string[]>();
  const assumes = new Map<string, string[]>();
  for (const edge of prerequisites) {
    const into = edge.kind === "assumes" ? assumes : requires;
    const list = into.get(edge.conceptSlug);
    if (list === undefined) into.set(edge.conceptSlug, [edge.prerequisiteSlug]);
    else list.push(edge.prerequisiteSlug);
  }
  for (const list of [...requires.values(), ...assumes.values()]) list.sort();
  return { requires, assumes };
}

export async function readKnowledgeBase(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<KnowledgeBase> {
  const [concepts, prerequisites, curriculumLinks, model, reviews, runs] = await Promise.all([
    db.select().from(concept).orderBy(asc(concept.slug)),
    db.select().from(conceptPrerequisite),
    db.select().from(conceptCurriculumItem).orderBy(asc(conceptCurriculumItem.curriculumItemId)),
    readModel(db, learnerId),
    readReviews(db, learnerId),
    db.select().from(indexRun).where(eq(indexRun.source, "concepts")).limit(1),
  ]);

  const { requires, assumes } = edgeLists(prerequisites);

  const topics = new Map<string, string[]>();
  for (const link of curriculumLinks) {
    const list = topics.get(link.conceptSlug);
    if (list === undefined) topics.set(link.conceptSlug, [link.curriculumItemId]);
    else list.push(link.curriculumItemId);
  }

  // `buildGraph` takes the same shape `listConcepts()` returns, so it can be
  // handed rows instead of parsed notes with no change to graph.mjs.
  const graph = graphOf(concepts, prerequisites);

  const front = frontier(graph, model) as { id: string }[];
  const kbConcepts: KbConcept[] = concepts.map((row) => {
    const entry = model.concepts[row.slug];
    const card = reviews.cards[row.slug];
    const pL = masteryOf(model, row.slug) as number;
    return {
      id: row.slug,
      title: row.title,
      summary: row.summary ?? "",
      requires: requires.get(row.slug) ?? [],
      assumes: assumes.get(row.slug) ?? [],
      pL,
      mastery: masteryLabel(pL) as MasteryLabel,
      observations: entry?.observations ?? 0,
      correct: entry?.correct ?? 0,
      lastSeen: entry?.lastSeen ?? null,
      due: card?.due ?? null,
      lapses: card?.lapses ?? 0,
      leech: card?.leech ?? false,
      topics: topics.get(row.slug) ?? [],
      domain: domainOf(row.path),
    };
  });

  kbConcepts.sort((a, b) => a.title.localeCompare(b.title));

  const present = new Set(kbConcepts.map((c) => c.id));
  const edges: KbEdge[] = [];
  for (const edge of prerequisites) {
    if (!present.has(edge.conceptSlug) || !present.has(edge.prerequisiteSlug)) continue;
    edges.push({
      from: edge.prerequisiteSlug,
      to: edge.conceptSlug,
      kind: edge.kind === "assumes" ? "assumes" : "requires",
    });
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    indexedAt: runs[0]?.finishedAt.toISOString() ?? null,
    stats: summarize(graph, model) as KnowledgeBase["stats"],
    frontier: front.map((f) => f.id),
    concepts: kbConcepts,
    edges,
  };
}

/** Concepts whose next review is due on or before `now`. */
export function dueConcepts(kb: KnowledgeBase, now = new Date()): KbConcept[] {
  return kb.concepts
    .filter((c) => c.due !== null && new Date(c.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.due ?? 0).getTime() - new Date(b.due ?? 0).getTime());
}
