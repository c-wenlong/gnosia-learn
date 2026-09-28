import { concept, LOCAL_LEARNER_ID, mastery, PREFERENCE_KEYS, readableOwners } from "@self-learn/schema";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { ownedBy, scopedRead } from "../content/scope";
import type { CatalogDatabase } from "../db";
import {
  DEFAULT_PARAMS,
  propagate,
  update as bktUpdate,
} from "../../../../scripts/learn/lib/bkt.mjs";
import { prerequisiteDistances } from "../../../../scripts/learn/lib/graph.mjs";
import { StateError } from "./errors";
import { readPreference, writePreference } from "./preference";
import { voidedSessions, type EventRecord } from "./events";
import { ensureLearner } from "./learner";

/**
 * `learn/state/model.json` as the `mastery` table.
 *
 * The file held one object per concept plus a shared `params` block. The table
 * holds the per-concept rows; `params` moved to `preference` under
 * `bktParams`, because it is one global setting and a column on every row
 * would have said otherwise.
 *
 * Nothing here does BKT arithmetic of its own. `bkt.mjs` is the definition of
 * the maths and has its own conformance tests, so this module imports it rather
 * than restating it in TypeScript — a second implementation of a Bayesian
 * update is a second thing to keep correct.
 */

/** BKT parameters. Four numbers, shared by every concept. */
export interface BktParams {
  pL0: number;
  pT: number;
  pG: number;
  pS: number;
}

export interface MasteryEntry {
  pL: number;
  observations: number;
  correct: number;
  lastSeen: string | null;
}

/**
 * The in-memory model, in exactly the shape `graph.mjs` and `render.mjs`
 * expect: `masteryOf` reads `model.concepts[id].pL` and falls back to
 * `model.params.pL0`.
 *
 * `version` and `updatedAt` are gone. They were file bookkeeping — a schema tag
 * for a document that no longer exists, and a mtime the row now carries in
 * `updated_at` — and neither ever appeared in any `--json` output.
 */
export interface Model {
  params: BktParams;
  concepts: Record<string, MasteryEntry>;
}

export const emptyModel = (params: BktParams = { ...DEFAULT_PARAMS }): Model => ({
  params,
  concepts: {},
});

/** Ensure the model has an entry for a concept, at the prior. */
export function ensureEntry(model: Model, id: string): MasteryEntry {
  const existing = model.concepts[id];
  if (existing !== undefined) return existing;
  const entry: MasteryEntry = {
    pL: model.params.pL0 ?? DEFAULT_PARAMS.pL0,
    observations: 0,
    correct: 0,
    lastSeen: null,
  };
  model.concepts[id] = entry;
  return entry;
}

function asParams(value: unknown): BktParams {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PARAMS };
  }
  const raw = value as Record<string, unknown>;
  const merged = { ...DEFAULT_PARAMS } as Record<string, number>;
  for (const key of ["pL0", "pT", "pG", "pS"] as const) {
    const candidate = raw[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) merged[key] = candidate;
  }
  return merged as unknown as BktParams;
}

export async function readParams(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<BktParams> {
  return asParams(await readPreference(db, PREFERENCE_KEYS.bktParams, learnerId));
}

export async function writeParams(
  db: CatalogDatabase,
  params: BktParams,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
  await writePreference(db, PREFERENCE_KEYS.bktParams, params, learnerId);
}

export async function readModel(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<Model> {
  const [params, rows] = await Promise.all([
    readParams(db, learnerId),
    db.select().from(mastery).where(eq(mastery.learnerId, learnerId)),
  ]);
  const model = emptyModel(params);
  for (const row of rows) {
    model.concepts[row.conceptSlug] = {
      pL: row.pL,
      observations: row.observations,
      correct: row.correct,
      lastSeen: row.lastSeen === null ? null : row.lastSeen.toISOString(),
    };
  }
  return model;
}

/**
 * Every concept slug in the model that the catalog does not know about.
 *
 * `mastery.concept_slug` is a foreign key, so writing one of these is a 23503
 * naming a constraint. Checked first so the message can name the slugs and say
 * what to do about them, which "insert or update on table mastery violates
 * foreign key constraint" cannot.
 */
async function unknownSlugs(db: CatalogDatabase, slugs: string[], owners?: readonly string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const known = await scopedRead(db, owners, (readable) =>
    db
      .select({ slug: concept.slug })
      .from(concept)
      .where(and(inArray(concept.slug, slugs), ownedBy(concept.ownerId, readable))),
  );
  const present = new Set(known.map((row) => row.slug));
  return slugs.filter((slug) => !present.has(slug));
}

/**
 * Refuse, with the slugs named, if any of them is not a concept in the
 * catalog. `event.concept_slug`, `mastery.concept_slug` and
 * `review.concept_slug` are all foreign keys, so this is the difference
 * between a sentence the learner can act on and a 23503 naming a constraint.
 *
 * This is where the old `observe --force` went. It let an observation name a
 * concept that did not exist, on the grounds that the model was a JSON object
 * with no opinion about its keys. A relational store does have one: evidence
 * about a concept nothing knows exists cannot be recorded, so the flag now
 * cannot mean what it meant.
 */
export async function assertKnownConcepts(
  db: CatalogDatabase,
  slugs: string[],
): Promise<void> {
  const unknown = await unknownSlugs(db, [...new Set(slugs)]);
  if (unknown.length > 0) {
    throw new StateError(
      `no concept in the catalog for ${unknown.map((s) => `"${s}"`).join(", ")}. ` +
        `A note is in the catalog once it is filed under a topic: ` +
        `\`npm run learn -- concept add --title "..." --topic <slug>\` writes and files it.`,
    );
  }
}

/**
 * `assertKnownConcepts`, for evidence a learner records: only a concept the
 * learner may read counts (phase 4), their own or the commons'. Another
 * owner's concept is refused with the same sentence as one that does not
 * exist, so the refusal does not say it does. `recordObservation` and
 * `gradeReview` check this, since a request names the concept.
 */
export async function assertReadableConcepts(
  db: CatalogDatabase,
  slugs: string[],
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<void> {
  const unknown = await unknownSlugs(db, [...new Set(slugs)], readableOwners(learnerId));
  if (unknown.length > 0) {
    throw new StateError(
      `no concept in the catalog for ${unknown.map((s) => `"${s}"`).join(", ")}. ` +
        `A note is in the catalog once it is filed under a topic: ` +
        `\`npm run learn -- concept add --title "..." --topic <slug>\` writes and files it.`,
    );
  }
}

/**
 * Replace the whole model for this learner: upsert every entry, delete every
 * row the model no longer has.
 *
 * The delete is what makes `model --rebuild` work. A rebuild that skips a
 * voided session produces a model with no entry for the concepts only that
 * session touched, and a pure upsert would leave the old rows in place — the
 * exact thing voiding exists to undo.
 */
export async function writeModel(
  db: CatalogDatabase,
  model: Model,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<Model> {
  const slugs = Object.keys(model.concepts);
  await assertKnownConcepts(db, slugs);

  await ensureLearner(db, learnerId);
  await db.transaction(async (tx) => {
    if (slugs.length > 0) {
      await tx
        .insert(mastery)
        .values(
          slugs.map((slug) => {
            const entry = model.concepts[slug] as MasteryEntry;
            return {
              learnerId,
              conceptSlug: slug,
              pL: entry.pL,
              observations: entry.observations,
              correct: entry.correct,
              lastSeen: entry.lastSeen === null ? null : new Date(entry.lastSeen),
            };
          }),
        )
        .onConflictDoUpdate({
          target: [mastery.learnerId, mastery.conceptSlug],
          set: {
            pL: sql`excluded.p_l`,
            observations: sql`excluded.observations`,
            correct: sql`excluded.correct`,
            lastSeen: sql`excluded.last_seen`,
            updatedAt: sql`now()`,
          },
        });
    }
    const scope = eq(mastery.learnerId, learnerId);
    await tx
      .delete(mastery)
      .where(
        slugs.length === 0
          ? scope
          : sql`${scope} and ${notInArray(mastery.conceptSlug, slugs)}`,
      );
  });
  await writeParams(db, model.params, learnerId);
  return model;
}

/**
 * Spread a correct answer to a concept's prerequisites.
 *
 * Lifted unchanged from `cli.mjs`. Only correct answers propagate, and
 * `observations` is deliberately not incremented: it counts questions the
 * learner was actually asked, and propagation asks nothing.
 */
export function propagateCorrect(
  model: Model,
  graph: { nodes: Map<string, unknown> },
  id: string,
): { concept: string; hops: number; pLBefore: number; pLAfter: number }[] {
  const touched: { concept: string; hops: number; pLBefore: number; pLAfter: number }[] = [];
  if (!graph.nodes.has(id)) return touched;

  for (const [prereq, hops] of prerequisiteDistances(graph, id)) {
    const entry = ensureEntry(model, prereq);
    const before = entry.pL;
    const after = propagate(before, true, hops, { params: model.params });
    if (after - before < 1e-9) continue;
    entry.pL = after;
    touched.push({ concept: prereq, hops, pLBefore: before, pLAfter: after });
  }
  return touched;
}

/**
 * Rebuild the model from the event log. Pure: takes events and a graph,
 * returns a model, touches nothing.
 *
 * Propagation is recomputed from the *current* graph rather than replayed from
 * each event's `propagated` list, so correcting a prerequisite and rebuilding
 * re-derives history under the fixed structure. That is the whole reason the
 * log is the source of truth rather than a paper trail.
 */
export function replayMastery(
  events: readonly EventRecord[],
  graph: { nodes: Map<string, unknown> },
  params: BktParams,
): { model: Model; skipped: number } {
  const model = emptyModel({ ...params });
  const voided = voidedSessions(events);
  let skipped = 0;

  for (const record of events) {
    if (record.type !== "observation" && record.type !== "review") continue;
    if (typeof record.session === "string" && voided.has(record.session)) {
      skipped += 1;
      continue;
    }
    const id = record.concept;
    if (typeof id !== "string" || id === "") continue;

    const entry = ensureEntry(model, id);
    const correct =
      record.type === "review" ? Number(record.grade) >= 3 : Boolean(record.correct);
    entry.pL = bktUpdate(entry.pL, correct, {
      params: model.params,
      opportunity: record.opportunity ?? true,
    });
    entry.observations += 1;
    if (correct) entry.correct += 1;
    entry.lastSeen = typeof record.at === "string" ? record.at : null;

    if (correct) propagateCorrect(model, graph, id);
  }

  return { model, skipped };
}
