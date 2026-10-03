import {
  emptyLearnerState,
  LOCAL_LEARNER_ID,
  PREFERENCE_KEYS,
  type LastVisited,
  type LearnerState,
  asThemeMode,
  type ThemeMode,
  type UserResource,
} from "@self-learn/schema";

import type { CatalogDatabase } from "../db";
import { readPreferences } from "./preference";
import { readProgress } from "./progress";
import { readRecaps } from "./recap";

/**
 * Everything the web app needs about one learner, in one read.
 *
 * Three queries rather than one join: `progress`, `recap` and `preference` are
 * three different cardinalities keyed by two different things, so a join would
 * return the cross product and the mapping code would spend its time undoing
 * it. They are issued together and the whole snapshot is one round trip's worth
 * of latency.
 *
 * The shape is the old localStorage document minus `version`, so a component
 * reading `state.completed[id]` needs no change and the import route can hand
 * the legacy payload straight in.
 */

function asTheme(value: unknown): ThemeMode {
  return asThemeMode(value) ?? "light";
}

function asEpoch(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/** A stored `lastVisited`, or undefined when it is absent or malformed. */
export function asLastVisited(value: unknown): LastVisited | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.courseSlug !== "string" || raw.courseSlug === "") return undefined;
  return {
    courseSlug: raw.courseSlug,
    moduleSlug: typeof raw.moduleSlug === "string" ? raw.moduleSlug : undefined,
    at: typeof raw.at === "string" ? raw.at : new Date(0).toISOString(),
  };
}

/**
 * A stored `userResources` map, normalised.
 *
 * Written by the browser and stored as opaque jsonb, so it is parsed
 * defensively on the way out: a value the UI would iterate has to be an array
 * of things with the three string fields, or the page throws while rendering
 * rather than showing one bad link.
 */
export function asUserResources(value: unknown): Record<string, UserResource[]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, UserResource[]> = {};
  for (const [moduleId, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const resources = list.flatMap((item): UserResource[] => {
      if (item === null || typeof item !== "object") return [];
      const raw = item as Record<string, unknown>;
      if (typeof raw.url !== "string" || raw.url === "") return [];
      return [
        {
          id: typeof raw.id === "string" && raw.id !== "" ? raw.id : raw.url,
          title: typeof raw.title === "string" ? raw.title : raw.url,
          url: raw.url,
        },
      ];
    });
    if (resources.length > 0) out[moduleId] = resources;
  }
  return out;
}

/** A stored `inactiveCourses`, as distinct non-empty slugs; anything else reads as none. */
export function asCourseSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((slug): slug is string => typeof slug === "string" && slug !== ""))];
}

export async function readLearnerSnapshot(
  db: CatalogDatabase,
  learnerId: string = LOCAL_LEARNER_ID,
): Promise<LearnerState> {
  const [rows, recaps, preferences] = await Promise.all([
    readProgress(db, learnerId),
    readRecaps(db, learnerId),
    readPreferences(db, learnerId),
  ]);

  const state = emptyLearnerState();
  for (const row of rows) {
    if (row.completedAt !== null) state.completed[row.curriculumItemId] = true;
    if (row.note !== null && row.note !== "") state.notes[row.curriculumItemId] = row.note;
  }
  for (const knowledge of recaps) state.knowledge[knowledge.topicId] = knowledge;

  state.theme = asTheme(preferences[PREFERENCE_KEYS.theme]);
  state.epoch = asEpoch(preferences[PREFERENCE_KEYS.epoch]);
  state.userResources = asUserResources(preferences[PREFERENCE_KEYS.userResources]);
  const lastVisited = asLastVisited(preferences[PREFERENCE_KEYS.lastVisited]);
  if (lastVisited !== undefined) state.lastVisited = lastVisited;
  state.inactiveCourses = asCourseSlugs(preferences[PREFERENCE_KEYS.inactiveCourses]);

  return state;
}
