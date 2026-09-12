import {
  clampKnowledgeList,
  clampSummary,
  curriculumItem,
  LOCAL_LEARNER_ID,
  PREFERENCE_KEYS,
  RECAP_SOURCES,
  type KnowledgeSource,
} from "@self-learn/schema";
import { inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { ensureLearner } from "./learner";
import { readPreference, writePreference } from "./preference";
import { setNote, setProgress } from "./progress";
import { upsertRecap } from "./recap";
import { asLastVisited, asUserResources, readLearnerSnapshot } from "./snapshot";

/**
 * The one-time import of a browser's `self-learn:v1` document.
 *
 * Learner state used to live only in localStorage, so every browser that ever
 * opened the app is holding a copy of somebody's ticks, notes and recaps that
 * no database has. The web app posts it here once, on first mount, and removes
 * the key on success.
 *
 * Two rules make that safe to run against a database that is already in use.
 *
 * **The database wins.** The import fills gaps and never overwrites. A tick
 * the learner has already made stays; a note already in Postgres is not
 * replaced by an older one from a browser that has been sitting in a tab since
 * before the move. The alternative — last writer wins — makes the outcome
 * depend on which browser was opened last, which is not a rule anyone could
 * predict.
 *
 * **An id the catalog does not have is skipped, not fatal.** Course data is
 * authored and gets edited; a payload naming `cs2111-m9-t3` from a module that
 * has since been renamed must not cost the learner the other two hundred rows
 * in the same document. Skipped ids are counted and returned so the caller can
 * say what did not come across.
 *
 * Everything is parsed defensively. This is JSON written by an older build of
 * the app, possibly years ago, possibly edited by hand in devtools.
 */

/** What arrived. Every field optional; nothing is trusted. */
export interface LegacyPayload {
  theme?: unknown;
  completed?: unknown;
  notes?: unknown;
  userResources?: unknown;
  knowledge?: unknown;
  epoch?: unknown;
  lastVisited?: unknown;
}

export interface ImportResult {
  progress: number;
  notes: number;
  recaps: number;
  preferences: string[];
  /** Curriculum item ids in the payload that the catalog has no row for. */
  unknownItems: string[];
  /** Rows the database already had, left as they were. */
  skippedExisting: number;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asSource(value: unknown): KnowledgeSource {
  return value === "manual" ? "manual" : (RECAP_SOURCES[0] as KnowledgeSource);
}

/** Which of these ids the catalog actually has. */
async function knownItems(db: CatalogDatabase, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: curriculumItem.id })
    .from(curriculumItem)
    .where(inArray(curriculumItem.id, ids));
  return new Set(rows.map((row) => row.id));
}

export async function importLegacyState(
  db: CatalogDatabase,
  payload: LegacyPayload,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<ImportResult> {
  await ensureLearner(db, learnerId);
  const current = await readLearnerSnapshot(db, learnerId);

  const completed = record(payload.completed);
  const notes = record(payload.notes);
  const knowledge = record(payload.knowledge);

  const referenced = [
    ...new Set([...Object.keys(completed), ...Object.keys(notes), ...Object.keys(knowledge)]),
  ];
  const known = await knownItems(db, referenced);
  const unknownItems = referenced.filter((id) => !known.has(id)).sort();

  const result: ImportResult = {
    progress: 0,
    notes: 0,
    recaps: 0,
    preferences: [],
    unknownItems,
    skippedExisting: 0,
  };

  for (const [id, value] of Object.entries(completed)) {
    if (!known.has(id) || value !== true) continue;
    if (current.completed[id] === true) {
      result.skippedExisting += 1;
      continue;
    }
    await setProgress(db, id, true, { learnerId });
    result.progress += 1;
  }

  for (const [id, value] of Object.entries(notes)) {
    if (!known.has(id) || typeof value !== "string" || value.trim() === "") continue;
    if (current.notes[id] !== undefined) {
      result.skippedExisting += 1;
      continue;
    }
    await setNote(db, id, value, learnerId);
    result.notes += 1;
  }

  for (const [id, value] of Object.entries(knowledge)) {
    if (!known.has(id)) continue;
    if (current.knowledge[id] !== undefined) {
      result.skippedExisting += 1;
      continue;
    }
    const entry = record(value);
    const input = {
      summary: clampSummary(entry.summary),
      keyPoints: clampKnowledgeList(entry.keyPoints),
      misconceptions: clampKnowledgeList(entry.misconceptions),
      openQuestions: clampKnowledgeList(entry.openQuestions),
      source: asSource(entry.source),
    };
    const sessions =
      typeof entry.sessions === "number" && entry.sessions > 0
        ? Math.floor(entry.sessions)
        : 1;
    // `countSession: false` with a floor: the import is not a session, and the
    // count the browser recorded is the one worth keeping.
    const saved = await upsertRecap(db, id, input, { learnerId, countSession: false, sessions });
    if (saved !== null) result.recaps += 1;
  }

  await maybeSet(db, learnerId, PREFERENCE_KEYS.theme, themeOf(payload.theme), result);
  await maybeSet(
    db,
    learnerId,
    PREFERENCE_KEYS.lastVisited,
    asLastVisited(payload.lastVisited) ?? null,
    result,
  );

  const resources = asUserResources(payload.userResources);
  await maybeSet(
    db,
    learnerId,
    PREFERENCE_KEYS.userResources,
    Object.keys(resources).length > 0 ? resources : null,
    result,
  );

  // The epoch only ever goes up: it exists so client components remount after
  // a reset, and going backwards would make a stale tree look current.
  const importedEpoch =
    typeof payload.epoch === "number" && Number.isFinite(payload.epoch) && payload.epoch > 0
      ? Math.floor(payload.epoch)
      : 0;
  if (importedEpoch > current.epoch) {
    await writePreference(db, PREFERENCE_KEYS.epoch, importedEpoch, learnerId);
    result.preferences.push(PREFERENCE_KEYS.epoch);
  }

  return result;
}

function themeOf(value: unknown): "light" | "dark" | null {
  return value === "dark" || value === "light" ? value : null;
}

/** Write a preference only when the payload has one and the database does not. */
async function maybeSet(
  db: CatalogDatabase,
  learnerId: string,
  key: string,
  value: unknown,
  result: ImportResult,
): Promise<void> {
  if (value === null) return;
  if ((await readPreference(db, key, learnerId)) !== undefined) {
    result.skippedExisting += 1;
    return;
  }
  await writePreference(db, key, value, learnerId);
  result.preferences.push(key);
}
