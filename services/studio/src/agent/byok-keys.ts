import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { connect, databasePath, type CatalogDatabase, type Connection } from "@gnosia/catalog/state";
import { AUTH_SECRET_VAR, MIN_SECRET_LENGTH, type ProviderName } from "@gnosia/schema/shared";
import { failureCode, keySecret, openSavedKeys, savedKeyStatuses } from "@gnosia/tutor/server/provider-keys";

import { studioOwner } from "../config";
import { REPO_ROOT } from "../paths";

/**
 * The owner's provider keys as the BYOK harness reads them (docs/BYOK.md,
 * D6 and D12): the sealed rows the web app saved, opened here with the same
 * `AUTH_SECRET` the web seals them with, at the moment a turn needs one.
 *
 * The runner keeps no copy. It used to hold every mirrored key in the clear
 * in `$STUDIO_HOME/byok.json`, inside the checkout by default (finding S7-01
 * of the 2026-10 audit); that file is deleted at start (`migrateLegacyByok`
 * in `byok.ts`) and nothing writes it again.
 *
 * Reads go through `@gnosia/tutor/server/provider-keys`, the module the web
 * app and the sidecar read the same rows through, which reaches the table
 * only through the catalog's one door to it. Nothing here names the table.
 *
 * The secret is held in this module and taken out of `process.env` at start
 * (`takeKeySecret`), so no agent, render or catalog CLI the runner spawns
 * inherits it, whichever env builder that spawn uses.
 */

/** What no child of the runner gets: the key-sealing secret and the session's inputs (docs/DEPLOYMENT.md, "Signing in"). */
export const RUNNER_SECRET_VARS = [AUTH_SECRET_VAR, "OWNER_PASSWORD", "SESSION_EPOCH", "GNOSIA_LOCAL_TOKEN"] as const;

/** Why the saved keys cannot be read right now; `problem` is the sentence health and a refusal print. */
export type KeyAccess = { ok: true; problem: null } | { ok: false; reason: "no-secret" | "no-catalog" | "catalog-unreadable"; problem: string };

/** The saved keys could not be read: no secret, no catalog file, or a read that failed. */
export class KeysUnavailable extends Error {
  constructor(
    readonly reason: "no-secret" | "no-catalog" | "catalog-unreadable",
    message: string,
  ) {
    super(message);
    this.name = "KeysUnavailable";
  }
}

let secret: string | null = null;
/** Set when an `AUTH_SECRET` was found but is too short to seal with, so health says which. */
let shortSecret = false;
let connection: { file: string; handle: Connection } | null = null;

/**
 * Take the secret from `env` and remove every `RUNNER_SECRET_VARS` name from
 * it, found or not. Called once at start, before anything is spawned; the
 * same floor as the web (`keySecret`), so a secret too short to seal with is
 * no secret here either.
 */
export function takeKeySecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[AUTH_SECRET_VAR]?.trim() ?? "";
  const found = keySecret(env);
  for (const name of RUNNER_SECRET_VARS) delete env[name];
  if (found !== null) setKeySecret(found);
  else if (raw !== "") shortSecret = true;
  return found;
}

/** Hold `value` as the secret (null forgets it). For `takeKeySecret`, the web-env fallback and the tests. */
export function setKeySecret(value: string | null): void {
  secret = value !== null && value.trim().length >= MIN_SECRET_LENGTH ? value.trim() : null;
  if (secret !== null) shortSecret = false;
}

/** Whether a secret is held. */
export function hasKeySecret(): boolean {
  return secret !== null;
}

/**
 * The web's `AUTH_SECRET` when the runner was started without one, as
 * `npm run dev:up` starts it (its pane gets the catalog's variables, not the
 * app's `.env.local`): the environment every launcher hands the services it
 * spawns, from `services/sidecar/src/child-env.ts`, which reads the data
 * home's `.env` and the web app's own files in the web's order
 * (docs/BYOK.md, "Rotation"). One child process at start, its output read
 * for that one value and dropped. Null when it cannot run or names none.
 */
export function secretFromWebEnv(env: NodeJS.ProcessEnv = process.env, timeoutMs = 20_000): Promise<string | null> {
  const script = path.join(REPO_ROOT, "services", "sidecar", "src", "child-env.ts");
  if (!existsSync(script)) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", "tsx", script],
      { cwd: REPO_ROOT, env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error !== null) return resolve(null);
        const line = stdout.trim().split("\n").at(-1) ?? "";
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const value = parsed[AUTH_SECRET_VAR];
          resolve(typeof value === "string" ? keySecret({ [AUTH_SECRET_VAR]: value }) : null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

/** Whether the keys could be read now, without reading them: health's answer, synchronous. */
export function keyAccessNow(): KeyAccess {
  if (secret === null) {
    return {
      ok: false,
      reason: "no-secret",
      problem: shortSecret
        ? `AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters, so the runner cannot open the provider keys saved in Settings; BYOK chats are off, Claude chats are not affected`
        : "AUTH_SECRET is not set for the runner, so it cannot open the provider keys saved in Settings; BYOK chats are off, Claude chats are not affected",
    };
  }
  let file: string;
  try {
    file = databasePath();
  } catch (error) {
    return { ok: false, reason: "no-catalog", problem: `the catalog cannot be opened: ${(error as Error).message}` };
  }
  if (file !== ":memory:" && !existsSync(file)) {
    return { ok: false, reason: "no-catalog", problem: `the catalog file ${file} does not exist, so the runner has no saved provider keys to open` };
  }
  return { ok: true, problem: null };
}

/**
 * The catalog handle, opened on first use and kept. Never creates a file
 * (`connect` would make an empty catalog where the path points): a missing
 * one is `KeysUnavailable`. A path that changed since (a test moving
 * `CATALOG_DB`) gets a fresh handle.
 */
function catalog(): { db: CatalogDatabase; owner: string; env: Record<string, string> } {
  const access = keyAccessNow();
  if (!access.ok) throw new KeysUnavailable(access.reason, access.problem);
  const file = databasePath();
  if (connection === null || connection.file !== file) {
    connection?.handle.close().catch(() => undefined);
    connection = { file, handle: connect() };
  }
  // Only the secret: `keySecret` reads this map, and nothing else of the
  // runner's environment has any business in it.
  return { db: connection.handle.db, owner: studioOwner(), env: { [AUTH_SECRET_VAR]: secret! } };
}

function unreadable(error: unknown): KeysUnavailable {
  // A code, never the message: a driver error on this table quotes its bind
  // parameters (docs/BYOK.md, "Logs").
  return new KeysUnavailable("catalog-unreadable", `the catalog could not be read for the saved provider keys (${failureCode(error)})`);
}

/** Each saved key's tail and whether it opens, by tutor provider. Never a key. Throws `KeysUnavailable`. */
export async function savedKeys(): Promise<Map<ProviderName, { last4: string; readable: boolean }>> {
  const { db, owner, env } = catalog();
  try {
    const rows = await savedKeyStatuses(db, owner, env);
    return new Map(rows.map((row) => [row.provider, { last4: row.last4, readable: row.readable }]));
  } catch (error) {
    throw unreadable(error);
  }
}

/** One saved key, opened, or null when there is none or it no longer opens. Throws `KeysUnavailable`. */
export async function openSavedKey(provider: ProviderName): Promise<string | null> {
  const { db, owner, env } = catalog();
  try {
    return (await openSavedKeys(db, owner, env))[provider] ?? null;
  } catch (error) {
    throw unreadable(error);
  }
}

/** Close the catalog handle, for shutdown and the tests. */
export async function closeKeys(): Promise<void> {
  const held = connection;
  connection = null;
  await held?.handle.close().catch(() => undefined);
}
