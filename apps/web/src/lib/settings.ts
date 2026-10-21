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
 * `@gnosia/tutor/server/settings`, which the native sidecar calls with
 * its own pool and owner; this file hands them this app's.
 */

export type { SettingsSnapshot };

export async function readSettings(): Promise<SettingsSnapshot> {
  return readSettingsCore(catalogDatabase(), await currentOwner());
}

export async function loadSettings(): Promise<SettingsSnapshot> {
  await connection();
  return readSettings();
}

export async function readTutorStyle(): Promise<TutorStyle> {
  return readTutorStyleCore(catalogDatabase(), await currentOwner());
}
