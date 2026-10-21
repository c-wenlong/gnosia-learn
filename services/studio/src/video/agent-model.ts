import { readFile } from "node:fs/promises";
import path from "node:path";

import { isAgentModel } from "@self-learn/schema/shared";

import { preferenceGet } from "../data/catalog";
import { readThrough } from "../data/content-cache";
import type { AgentSetting } from "./types";

/**
 * The video agent's model and effort (D53 of docs/STUDIO-VIDEOS.md).
 *
 * The owner picks them in the studio's settings panel, stored as the
 * `studioVideoAgent` preference row, `{ model, effort }`, each `default` or a
 * value. "Default" means **the owner's own Claude Code default**, and that
 * cannot mean "pass no flag": every studio spawn passes `--setting-sources
 * ""`, which keeps the owner's settings files out of the session, and a
 * session started that way reported `claude-opus-5[1m]` where the owner's
 * setting names `claude-fable-5-1` (measured). So the runner reads the
 * setting from the owner's user settings file and passes it.
 *
 * Resolved once, at job start, never at enqueue, so a change in the panel
 * reaches a queued job (V22). A revise or a resume keeps its parent's values,
 * as it keeps its parent's manual, because it continues the same session.
 */

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export interface AgentPreference {
  model: string;
  effort: string;
}

export const DEFAULT_PREFERENCE: AgentPreference = { model: "default", effort: "default" };

/** A model name the CLI takes: an alias or a full id, optionally with a `[1m]` context suffix. */
// The model rule is `isAgentModel` in @self-learn/schema/shared, the one the
// settings route and `catalog preference set` refuse by, so a stored value is
// never read as something other than what was saved.

/** The stored value, as `{ model, effort }` with `default` for anything missing or not a value the CLI takes. */
export function normalisePreference(value: unknown): AgentPreference {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const model = typeof raw.model === "string" && (raw.model === "default" || isAgentModel(raw.model)) ? raw.model : "default";
  const effort = typeof raw.effort === "string" && (raw.effort === "default" || (EFFORTS as readonly string[]).includes(raw.effort)) ? raw.effort : "default";
  return { model, effort };
}

export type AgentPreferenceKey = "studioVideoAgent" | "studioDiagramAgent";

/**
 * What the cache holds for one key: the row, or null for no row. Wrapped so
 * "there is no row" is a value the cache can remember, and so a copy written
 * by the build before this one (a bare `{ model, effort }`, which could have
 * been a real row or the defaults standing in for none) is no copy at all
 * rather than a row nobody saved.
 */
interface StoredCopy {
  row: AgentPreference | null;
}

function isStoredCopy(value: unknown): value is StoredCopy {
  if (typeof value !== "object" || value === null || !("row" in value)) return false;
  const row = (value as StoredCopy).row;
  return row === null || (typeof row === "object" && typeof row.model === "string" && typeof row.effort === "string");
}

/**
 * The stored row, or null when the owner has none, through the catalog and
 * cached in `$STUDIO_HOME/cache/preferences.<key>.json` as the topics are:
 * with Postgres down a job uses the last good read. With no read ever, it is
 * null, the same answer as no row, because nothing can say a row exists; that
 * is "with none, the defaults" of D53, and for the diagram agent the defaults
 * are what no row means.
 */
export async function readStoredPreference(key: AgentPreferenceKey): Promise<AgentPreference | null> {
  try {
    const read = await readThrough<StoredCopy>(
      `preferences.${key}`,
      async () => {
        const result = await preferenceGet(key);
        if (!result.ok) throw new Error(result.error ?? "catalog preference get failed");
        const value = (result.json as { value?: unknown } | null)?.value ?? null;
        return { row: value === null ? null : normalisePreference(value) };
      },
      { isValue: isStoredCopy },
    );
    return read.value.row === null ? null : normalisePreference(read.value.row);
  } catch {
    return null;
  }
}

/**
 * The panel's value with the defaults standing in for no row, which is what
 * the video agent needs: its default is the owner's Claude Code default
 * either way.
 */
export async function readPreference(key: AgentPreferenceKey): Promise<AgentPreference> {
  return (await readStoredPreference(key)) ?? DEFAULT_PREFERENCE;
}

/** The owner's user settings file: `$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`. */
export function claudeSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CLAUDE_CONFIG_DIR?.trim();
  return dir ? path.join(dir, "settings.json") : path.join(env.HOME ?? "", ".claude", "settings.json");
}

/** `model` and `effortLevel` from the owner's user settings, each null when absent or unusable. */
export async function readClaudeDefaults(file: string = claudeSettingsPath()): Promise<{ model: string | null; effort: string | null }> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { model?: unknown; effortLevel?: unknown };
    const model = isAgentModel(parsed.model) ? parsed.model : null;
    const effort = typeof parsed.effortLevel === "string" && (EFFORTS as readonly string[]).includes(parsed.effortLevel) ? parsed.effortLevel : null;
    return { model, effort };
  } catch {
    return { model: null, effort: null };
  }
}

/**
 * The three-step rule, for one setting: a panel value is passed as it is;
 * `default` passes the owner's user setting; with neither, no flag, and the
 * session gets the CLI's own default under the seal.
 */
export function resolveSetting(requested: string, fromClaude: string | null): AgentSetting {
  if (requested !== "default") return { requested, passed: requested, source: "panel" };
  if (fromClaude !== null) return { requested, passed: fromClaude, source: "claude-settings" };
  return { requested, passed: null, source: "cli" };
}

export async function resolveAgentSettings(
  preference: AgentPreference,
  claude: { model: string | null; effort: string | null },
): Promise<{ model: AgentSetting; effort: AgentSetting }> {
  return { model: resolveSetting(preference.model, claude.model), effort: resolveSetting(preference.effort, claude.effort) };
}
