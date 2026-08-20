import fs from "node:fs";
import path from "node:path";
import {
  EMPTY_KB,
  type KbEdge,
  type KbConcept,
  type KnowledgeBase,
  type MasteryLabel,
} from "./types";

/**
 * Server-only loader for the knowledge base snapshot.
 *
 * Never import this from a "use client" module — it reads the filesystem at
 * build time. The web hub is a *view* of the knowledge base; the pipeline
 * CLI in scripts/learn is what writes it.
 */

const INDEX_PATH = path.join(process.cwd(), "learn", "state", "index.json");

const MASTERY_LABELS: MasteryLabel[] = [
  "mastered",
  "solid",
  "shaky",
  "weak",
  "gap",
];

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeConcept(raw: unknown): KbConcept | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = asString(c.id);
  if (!id) return null;

  const mastery = asString(c.mastery) as MasteryLabel;

  return {
    id,
    title: asString(c.title, id),
    summary: asString(c.summary),
    tags: asStringArray(c.tags),
    requires: asStringArray(c.requires),
    assumes: asStringArray(c.assumes),
    pL: Math.min(1, Math.max(0, asNumber(c.pL))),
    mastery: MASTERY_LABELS.includes(mastery) ? mastery : "gap",
    observations: asNumber(c.observations),
    correct: asNumber(c.correct),
    lastSeen: typeof c.lastSeen === "string" ? c.lastSeen : null,
    due: typeof c.due === "string" ? c.due : null,
    lapses: asNumber(c.lapses),
    leech: Boolean(c.leech),
    sources: asStringArray(c.sources),
    openQuestions: asStringArray(c.openQuestions),
    topics: asStringArray(c.topics),
    domain: typeof c.domain === "string" && c.domain ? c.domain : null,
  };
}

/**
 * Read the snapshot. A missing or malformed file yields an empty knowledge
 * base rather than failing the build — a fresh clone has not run the
 * pipeline yet, and that is a legitimate state, not an error.
 */
export function loadKnowledgeBase(): KnowledgeBase {
  let raw: string;
  try {
    raw = fs.readFileSync(INDEX_PATH, "utf8");
  } catch {
    return EMPTY_KB;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_KB;
  }
  if (!parsed || typeof parsed !== "object") return EMPTY_KB;

  const data = parsed as Record<string, unknown>;
  const concepts = Array.isArray(data.concepts)
    ? data.concepts.map(normalizeConcept).filter((c): c is KbConcept => c !== null)
    : [];

  const ids = new Set(concepts.map((c) => c.id));
  const edges = Array.isArray(data.edges)
    ? data.edges
        .filter((e): e is KbEdge => {
          if (!e || typeof e !== "object") return false;
          const edge = e as Record<string, unknown>;
          return typeof edge.from === "string" && typeof edge.to === "string";
        })
        .map(
          (e): KbEdge => ({
            from: e.from,
            to: e.to,
            kind: e.kind === "assumes" ? "assumes" : "requires",
          }),
        )
        .filter((e) => ids.has(e.from) && ids.has(e.to))
    : [];

  const stats = (data.stats ?? {}) as Record<string, unknown>;

  return {
    version: asNumber(data.version, 1),
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : null,
    stats: {
      total: asNumber(stats.total, concepts.length),
      mastered: asNumber(stats.mastered),
      learning: asNumber(stats.learning),
      untouched: asNumber(stats.untouched),
    },
    frontier: asStringArray(data.frontier).filter((id) => ids.has(id)),
    concepts,
    edges,
    mermaid: asString(data.mermaid),
  };
}

/** Concepts whose next review is due on or before `now`. */
export function dueConcepts(kb: KnowledgeBase, now = new Date()): KbConcept[] {
  return kb.concepts
    .filter((c) => c.due !== null && new Date(c.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.due ?? 0).getTime() - new Date(b.due ?? 0).getTime());
}
