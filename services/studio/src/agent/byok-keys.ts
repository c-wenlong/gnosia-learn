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
/** The catalog file the web app opens, when the runner had to ask the web's environment for it (`fromWebEnv`). */
let catalogFile: string | null = null;
/** The last read's failure, so health reports a catalog that exists but cannot be read; cleared by the next good read. */
let lastReadProblem: string | null = null;

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
 * The web's `AUTH_SECRET`, and the catalog file it opens, when the runner was
 * started without a secret, as `npm run dev:up` starts it: its pane gets the
 * catalog's variables, not the app's `.env.local`, which `next dev` reads
 * itself. Asked of `scripts/lib/dev-env.mjs`, the helper `scripts/dev.sh`
 * already uses, which reads the app's files with Next's own loader in dev
 * mode and resolves the catalog the way the app does: so the runner gets the
 * secret and the file the web started beside it got, in the same order
 * (`$GNOSIA_HOME/.env` is not part of it, as it is not for `next dev`). Each
 * answer is read for its one value and dropped. Nulls when the helper cannot
 * run or names none; the catalog is null too when its check fails, and the
 * runner's own resolution then answers (and says why in health).
 */
export async function fromWebEnv(env: NodeJS.ProcessEnv = process.env, timeoutMs = 20_000): Promise<{ secret: string | null; catalog: string | null }> {
  const script = path.join(REPO_ROOT, "scripts", "lib", "dev-env.mjs");
  const app = path.join(REPO_ROOT, "apps", "web");
  if (!existsSync(script) || !existsSync(app)) return { secret: null, catalog: null };
  const ask = (args: string[], key: string): Promise<string | null> =>
    new Promise((resolve) => {
      execFile(process.execPath, [script, ...args], { cwd: REPO_ROOT, env, timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
        if (error !== null) return resolve(null);
        const line = stdout.split("\n").find((entry) => entry.startsWith(`${key}=`));
        resolve(line === undefined ? null : line.slice(key.length + 1));
      });
    });
  const [raw, catalog] = await Promise.all([ask(["get", app, AUTH_SECRET_VAR], AUTH_SECRET_VAR), ask(["db", app], "FILE")]);
  return { secret: raw === null ? null : keySecret({ [AUTH_SECRET_VAR]: raw }), catalog: catalog !== null && catalog !== "" ? catalog : null };
}

/** Open keys from this catalog file rather than the runner's own resolution (the web's, from `fromWebEnv`); null goes back to that. */
export function setCatalogFile(file: string | null): void {
  catalogFile = file;
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
    file = databasePath(catalogFile ?? undefined);
  } catch (error) {
    return { ok: false, reason: "no-catalog", problem: `the catalog cannot be opened: ${(error as Error).message}` };
  }
  if (file !== ":memory:" && !existsSync(file)) {
    return { ok: false, reason: "no-catalog", problem: `the catalog file ${file} does not exist, so the runner has no saved provider keys to open` };
  }
  if (lastReadProblem !== null) return { ok: false, reason: "catalog-unreadable", problem: lastReadProblem };
  return { ok: true, problem: null };
}

/**
 * The catalog handle, opened on first use and kept. Never creates a file
 * (`connect` would make an empty catalog where the path points): a missing
 * one is `KeysUnavailable`. A path that changed since (a test moving
 * `CATALOG_DB`) gets a fresh handle.
 */
function catalog(): { db: CatalogDatabase; owner: string; env: Record<string, string> } {
  // Whatever was wrong last time is asked again: a read is the only way to
  // find out it is fixed.
  lastReadProblem = null;
  const access = keyAccessNow();
  if (!access.ok) throw new KeysUnavailable(access.reason, access.problem);
  const file = databasePath(catalogFile ?? undefined);
  if (connection === null || connection.file !== file) {
    connection?.handle.close().catch(() => undefined);
    connection = null;
    connection = { file, handle: connect(catalogFile === null ? {} : { url: catalogFile }) };
  }
  // Only the secret: `keySecret` reads this map, and nothing else of the
  // runner's environment has any business in it.
  return { db: connection.handle.db, owner: studioOwner(), env: { [AUTH_SECRET_VAR]: secret! } };
}

/**
 * One read of the saved keys: opening the catalog and the read both inside
 * the guard, so a corrupt, locked or unmigrated file is `KeysUnavailable`
 * with a reason, never a raw driver error, and health remembers it.
 */
async function guarded<T>(read: (handle: ReturnType<typeof catalog>) => Promise<T>): Promise<T> {
  try {
    return await read(catalog());
  } catch (error) {
    if (error instanceof KeysUnavailable) throw error;
    // A code, never the message: a driver error on this table quotes its
    // bind parameters (docs/BYOK.md, "Logs").
    lastReadProblem = `the catalog could not be read for the saved provider keys (${failureCode(error)})`;
    throw new KeysUnavailable("catalog-unreadable", lastReadProblem);
  }
}

/** Each saved key's tail and whether it opens, by tutor provider. Never a key. Throws `KeysUnavailable`. */
export async function savedKeys(): Promise<Map<ProviderName, { last4: string; readable: boolean }>> {
  return guarded(async ({ db, owner, env }) => {
    const rows = await savedKeyStatuses(db, owner, env);
    return new Map(rows.map((row) => [row.provider, { last4: row.last4, readable: row.readable }]));
  });
}

/** One saved key, opened, or null when there is none or it no longer opens. Throws `KeysUnavailable`. */
export async function openSavedKey(provider: ProviderName): Promise<string | null> {
  return guarded(async ({ db, owner, env }) => (await openSavedKeys(db, owner, env))[provider] ?? null);
}

/** Close the catalog handle, for shutdown and the tests. */
export async function closeKeys(): Promise<void> {
  const held = connection;
  connection = null;
  await held?.handle.close().catch(() => undefined);
}
