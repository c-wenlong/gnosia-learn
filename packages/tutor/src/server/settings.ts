import type { CatalogDatabase } from "@gnosia/catalog/state";
import { readParams, readPreferences, type BktParams } from "@gnosia/catalog/state";
import { PREFERENCE_KEYS } from "@gnosia/schema/shared";

import { parseMotionMode, parseTutorStyle, type MotionMode, type TutorStyle } from "../preferences";

/**
 * The owner's settings rows, the request-independent half of
 * `apps/web/src/lib/settings.ts`: the database handle is a promise and the
 * owner a parameter, so the same reads serve the Next app and the sidecar.
 */

export interface SettingsSnapshot {
  reachable: boolean;
  tutorStyle: TutorStyle;
  motion: MotionMode;
  /** Null when they could not be read. */
  bkt: BktParams | null;
}

export async function readSettings(
  db: Promise<CatalogDatabase>,
  owner: string,
): Promise<SettingsSnapshot> {
  try {
    const handle = await db;
    const [preferences, bkt] = await Promise.all([readPreferences(handle, owner), readParams(handle, owner)]);
    return {
      reachable: true,
      tutorStyle: parseTutorStyle(preferences[PREFERENCE_KEYS.tutorStyle]),
      motion: parseMotionMode(preferences[PREFERENCE_KEYS.reducedMotion]),
      bkt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`settings: preferences unavailable, ${message}`);
    return {
      reachable: false,
      tutorStyle: parseTutorStyle(undefined),
      motion: parseMotionMode(undefined),
      bkt: null,
    };
  }
}

export async function readTutorStyle(
  db: Promise<CatalogDatabase>,
  owner: string,
): Promise<TutorStyle> {
  try {
    const preferences = await readPreferences(await db, owner);
    return parseTutorStyle(preferences[PREFERENCE_KEYS.tutorStyle]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`settings: tutor style unavailable, ${message}`);
    return parseTutorStyle(undefined);
  }
}
