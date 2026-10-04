import "server-only";

import { PREFERENCE_KEYS } from "@self-learn/schema/shared";
import { asLastVisited, asRecentModules, readPreferences } from "@self-learn/catalog/state";

import { catalogDatabase } from "@/lib/learner-store";

/**
 * The courses the owner has been working through: the courses of the
 * `recentModules` visits, newest first, each once, or of the one visit
 * `lastVisited` holds for an owner with no list yet. The map's ready highlight
 * reads them (G5 of docs/proposals/knowledge-map.md).
 */
export function recentCourseSlugs(preferences: Record<string, unknown>): string[] {
  const list = asRecentModules(preferences[PREFERENCE_KEYS.recentModules]);
  const last = asLastVisited(preferences[PREFERENCE_KEYS.lastVisited]);
  const visits = list ?? (last === undefined ? [] : [last]);
  return [...new Set(visits.map((v) => v.courseSlug))];
}

/** The owner's recent courses, or none when the preferences cannot be read: the map then highlights nothing. */
export async function readRecentCourses(owner: string): Promise<string[]> {
  try {
    return recentCourseSlugs(await readPreferences(await catalogDatabase(), owner));
  } catch (error) {
    console.warn(`recent courses unavailable, ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
