import "server-only";

import { connection } from "next/server";
import {
  readSettings as readSettingsCore,
  readTutorStyle as readTutorStyleCore,
  type SettingsSnapshot,
} from "@gnosia/tutor/server/settings";
import type { TutorStyle } from "@gnosia/tutor/preferences";

import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";

/**
 * The owner's settings rows. The reads live in
 * `@gnosia/tutor/server/settings`; this file hands them this app's pool and
 * owner.
 */

export type { SettingsSnapshot };

export async function loadSettings(): Promise<SettingsSnapshot> {
  await connection();
  return readSettingsCore(catalogDatabase(), await currentOwner());
}

export async function readTutorStyle(): Promise<TutorStyle> {
  return readTutorStyleCore(catalogDatabase(), await currentOwner());
}
