import "server-only";

import { PREFERENCE_KEYS } from "@self-learn/schema/shared";
import { readPreferences } from "@self-learn/catalog/state";

import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";
import { parseMotionMode, type MotionMode } from "@/lib/preferences";

/**
 * The stored motion mode, for a browser with no `self-learn-motion` cookie
 * yet (`@/lib/motion`). The `(app)` layout asks only then, so it costs one
 * read in a new browser and nothing after the cookie is written.
 *
 * Null when the row could not be read: a cookie written from a guess would
 * hide an "Always reduce motion" the database still holds, so nothing is
 * written until the database answers.
 */
export async function readStoredMotion(): Promise<MotionMode | null> {
  try {
    const owner = await currentOwner();
    const db = await catalogDatabase();
    const preferences = await readPreferences(db, owner);
    return parseMotionMode(preferences[PREFERENCE_KEYS.reducedMotion]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`motion: preference unavailable, ${message}`);
    return null;
  }
}
