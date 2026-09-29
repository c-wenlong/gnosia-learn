import { preference, STUDIO_AGENT_PREFERENCE_KEYS, type StudioAgentPreferenceKey } from "@self-learn/schema";
import { and, eq } from "drizzle-orm";

import { CLI_OWNER } from "../content/scope";
import { withDatabase } from "../db";

/**
 * `catalog preference get`: one owner's preference, read-only, for the studio
 * runner, which opens no database connection of its own (D53 of
 * docs/STUDIO-VIDEOS.md). Only the keys the studio reads are answered, so this
 * verb is not a general window onto a learner's settings.
 */

export class PreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferenceError";
  }
}

export interface PreferenceGetResult {
  ok: true;
  command: "preference";
  verb: "get";
  owner: string;
  key: StudioAgentPreferenceKey;
  /** The stored value exactly as the row holds it, or null when there is none. `studioAgentPreference` reads it. */
  value: unknown;
  updatedAt: string | null;
}

export function preferenceKey(raw: string | undefined): StudioAgentPreferenceKey {
  if (raw === undefined || !(STUDIO_AGENT_PREFERENCE_KEYS as readonly string[]).includes(raw)) {
    throw new PreferenceError(
      `preference get answers ${STUDIO_AGENT_PREFERENCE_KEYS.join(" and ")} only${raw === undefined ? "" : `, not "${raw}"`}.`,
    );
  }
  return raw as StudioAgentPreferenceKey;
}

export async function runPreferenceGet(options: { key: string | undefined; owner?: string }): Promise<PreferenceGetResult> {
  const key = preferenceKey(options.key);
  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) => {
    const [row] = await db
      .select({ value: preference.value, updatedAt: preference.updatedAt })
      .from(preference)
      .where(and(eq(preference.learnerId, owner), eq(preference.key, key)))
      .limit(1);
    return {
      ok: true as const,
      command: "preference" as const,
      verb: "get" as const,
      owner,
      key,
      value: row?.value ?? null,
      updatedAt: row === undefined ? null : row.updatedAt.toISOString(),
    };
  });
}

export function formatPreference(result: PreferenceGetResult): string {
  return `${result.key} for ${result.owner}: ${result.value === null ? "(not set)" : JSON.stringify(result.value)}`;
}
