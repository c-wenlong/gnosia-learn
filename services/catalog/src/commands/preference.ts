import { isDeepStrictEqual } from "node:util";

import {
  AGENT_EFFORTS,
  learner,
  preference,
  STUDIO_AGENT_PREFERENCE_KEYS,
  studioAgentPreference,
  type StudioAgentPreference,
  type StudioAgentPreferenceKey,
} from "@self-learn/schema";
import { and, eq, sql } from "drizzle-orm";

import { CLI_OWNER } from "../content/scope";
import { withDatabase } from "../db";

/**
 * `catalog preference get` and `set`: one owner's studio agent preference, for
 * the studio runner and web app, which open no database connection of their own
 * (D53 of docs/STUDIO-VIDEOS.md). Only the two keys the studio reads are
 * answered, so these verbs are not a general window onto a learner's settings.
 * `get` is read-only; `set` validates the value the way `studioAgentPreference`
 * reads it, so a stored row is always one that reads back unchanged.
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

export interface PreferenceSetResult {
  ok: true;
  command: "preference";
  verb: "set";
  owner: string;
  key: StudioAgentPreferenceKey;
  /** The value now stored: `{ model, effort }`. */
  value: StudioAgentPreference;
  updatedAt: string;
  /** False when the row already held this value, in which case nothing was written. */
  changed: boolean;
}

export function preferenceKey(raw: string | undefined, verb: "get" | "set" = "get"): StudioAgentPreferenceKey {
  if (raw === undefined || !(STUDIO_AGENT_PREFERENCE_KEYS as readonly string[]).includes(raw)) {
    throw new PreferenceError(
      `preference ${verb} answers ${STUDIO_AGENT_PREFERENCE_KEYS.join(" and ")} only${raw === undefined ? "" : `, not "${raw}"`}.`,
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

/**
 * The value a `set` may store: a JSON object of exactly `{ model, effort }`,
 * each field one `studioAgentPreference` would keep as it is. Anything it would
 * quietly turn into "default" is refused instead, so the caller learns of the
 * typo rather than saving a preference it did not ask for.
 */
export function parsePreferenceValue(raw: string | undefined): StudioAgentPreference {
  if (raw === undefined) throw new PreferenceError('preference set needs --value \'{"model":...,"effort":...}\'.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PreferenceError("preference set: --value is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PreferenceError('preference set: --value must be a JSON object such as {"model":"default","effort":"default"}.');
  }
  const record = parsed as Record<string, unknown>;
  const extra = Object.keys(record).filter((field) => field !== "model" && field !== "effort");
  if (extra.length > 0) throw new PreferenceError(`preference set: --value has fields other than model and effort: ${extra.join(", ")}.`);
  const clean = studioAgentPreference(record);
  if (record.model !== clean.model) {
    throw new PreferenceError(
      `preference set: model must be "default" or a model name the claude CLI takes (letters, digits, . _ - [ ]), not ${JSON.stringify(record.model)}.`,
    );
  }
  if (record.effort !== clean.effort) {
    throw new PreferenceError(`preference set: effort must be "default" or one of ${AGENT_EFFORTS.join(", ")}, not ${JSON.stringify(record.effort)}.`);
  }
  return clean;
}

export async function runPreferenceSet(options: {
  key: string | undefined;
  value: string | undefined;
  owner?: string;
}): Promise<PreferenceSetResult> {
  const key = preferenceKey(options.key, "set");
  const value = parsePreferenceValue(options.value);
  const owner = options.owner ?? CLI_OWNER;
  return withDatabase(async ({ db }) =>
    db.transaction(async (tx) => {
      const [who] = await tx.select({ id: learner.id }).from(learner).where(eq(learner.id, owner)).limit(1);
      if (who === undefined) throw new PreferenceError(`preference set: no learner "${owner}", so there is no one to hold the preference.`);
      const [row] = await tx
        .select({ value: preference.value, updatedAt: preference.updatedAt })
        .from(preference)
        .where(and(eq(preference.learnerId, owner), eq(preference.key, key)))
        .for("update")
        .limit(1);
      if (row !== undefined && isDeepStrictEqual(row.value, value)) {
        return { ok: true as const, command: "preference" as const, verb: "set" as const, owner, key, value, updatedAt: row.updatedAt.toISOString(), changed: false };
      }
      const [written] = await tx
        .insert(preference)
        .values({ learnerId: owner, key, value })
        .onConflictDoUpdate({ target: [preference.learnerId, preference.key], set: { value, updatedAt: sql`now()` } })
        .returning({ updatedAt: preference.updatedAt });
      return {
        ok: true as const,
        command: "preference" as const,
        verb: "set" as const,
        owner,
        key,
        value,
        updatedAt: (written?.updatedAt ?? new Date()).toISOString(),
        changed: true,
      };
    }),
  );
}

export function formatPreference(result: PreferenceGetResult | PreferenceSetResult): string {
  if (result.verb === "set") {
    return `${result.key} for ${result.owner}: ${result.changed ? "set to" : "already"} ${JSON.stringify(result.value)}`;
  }
  return `${result.key} for ${result.owner}: ${result.value === null ? "(not set)" : JSON.stringify(result.value)}`;
}
