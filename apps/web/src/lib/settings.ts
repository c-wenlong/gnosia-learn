import "server-only";

import { connection } from "next/server";
import { PREFERENCE_KEYS } from "@gnosia/schema/shared";
import { readParams, readPreferences, type BktParams } from "@gnosia/catalog/state";

import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";
import { parseMotionMode, parseTutorStyle, type MotionMode, type TutorStyle } from "@/lib/preferences";

/**
 * What the Settings page starts from: the learner's stored choices, each read
 * through the same parser its consumer uses (so a malformed row shows as the
 * default it behaves as), and the BKT parameters the `learn` CLI owns.
 *
 * A read, so it degrades: an unreachable database is the defaults with
 * `reachable: false` and no parameters, and the shell's banner says so. The
 * form stays usable; a write then fails the way every write does, visibly.
 */
export interface SettingsSnapshot {
  reachable: boolean;
  tutorStyle: TutorStyle;
  motion: MotionMode;
  /** Null when they could not be read. */
  bkt: BktParams | null;
}

export async function readSettings(): Promise<SettingsSnapshot> {
  const owner = await currentOwner();
  try {
    const db = await catalogDatabase();
    const [preferences, bkt] = await Promise.all([readPreferences(db, owner), readParams(db, owner)]);
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

export async function loadSettings(): Promise<SettingsSnapshot> {
  await connection();
  return readSettings();
}

/**
 * The learner's `tutorStyle`, for the tutor routes (`POST /api/agent/chat`
 * with a concept, `POST /api/agent/session`) and the workspace page. Never
 * throws: a failed read is the default style, since a style is not worth
 * refusing a tutor turn over. The routes read the concept first, so a database
 * that is down has already answered 503 before this runs in practice.
 */
export async function readTutorStyle(): Promise<TutorStyle> {
  const owner = await currentOwner();
  try {
    const db = await catalogDatabase();
    const preferences = await readPreferences(db, owner);
    return parseTutorStyle(preferences[PREFERENCE_KEYS.tutorStyle]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`settings: tutor style unavailable, ${message}`);
    return parseTutorStyle(undefined);
  }
}
