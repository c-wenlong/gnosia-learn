import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/**
 * The environment the sidecar runs with: the one the web app sees.
 *
 * Saved provider keys are sealed under `AUTH_SECRET` (docs/BYOK.md), and the
 * sidecar must open them with the same secret the web sealed them with. The
 * web gets its environment from two files no other process reads on its own:
 * `$GNOSIA_HOME/.env`, which the desktop shell merges under its own
 * environment before it spawns `next dev` (apps/desktop's
 * `Checkout.childEnv()`), and `apps/web/.env.local` and its siblings, which
 * Next loads itself. The macOS app spawns the sidecar with neither, so
 * without this every key saved on the web read as unreadable here, and a
 * save from macOS failed `NO_SECRET` (or, with a different secret exported by
 * the shell, sealed a key the web could not open).
 *
 * The order is the web's in the desktop shell, highest first:
 *
 * 1. the process's own environment (what the shell exported);
 * 2. `$GNOSIA_HOME/.env` (default `~/.gnosia/.env`);
 * 3. the app's `.env` files, read by Next's own loader (`@next/env`) in
 *    development mode, as `scripts/lib/dev-env.mjs` reads them for
 *    `npm run dev:up`, so a quoted value, a comment or a `$VAR` reads as it
 *    does under `next dev`.
 *
 * `services/catalog/.env` needs nothing here: the catalog reads it itself.
 *
 * The web runs in its app's directory (`npm run dev` in the workspace), so a
 * relative catalog path resolves there, as `checkCatalogFile` in
 * `scripts/lib/dev-env.mjs` resolves it for `npm run dev:up`. The sidecar
 * runs from the repository root, so it rewrites such a value to the absolute
 * path the web opens; left alone, `connect()` would create an empty catalog
 * beside the root.
 */

/** The settings that name the catalog's file (`databaseUrl()` in services/catalog/src/env.ts). */
const CATALOG_PATH_KEYS = ["CATALOG_DB", "DATABASE_URL"] as const;

/**
 * A catalog setting as the web reads it from `appDir`: a plain relative path
 * becomes absolute under it. Everything `databasePath()` reads another way
 * (absolute, `~/`, `sqlite:`, `file:`, `:memory:`, a Postgres URL it refuses)
 * is returned as it is.
 */
export function catalogPathFrom(appDir: string, raw: string): string {
  const value = raw.trim();
  if (value === "" || value === ":memory:" || value === "~" || value.startsWith("~/") || isAbsolute(value)) return raw;
  if (/^(sqlite|file|postgres|postgresql):/.test(value)) return raw;
  return resolve(appDir, value);
}

/** The data home's `.env`: `$GNOSIA_HOME/.env`, or `~/.gnosia/.env`. */
export function dataHomeEnvFile(env: Record<string, string | undefined>): string {
  const home = env.GNOSIA_HOME?.trim();
  return join(home ? home : join(homedir(), ".gnosia"), ".env");
}

/** KEY=VALUE pairs of a dotenv file, or none when it cannot be read. */
export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  try {
    return parseEnv(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

interface NextEnv {
  loadEnvConfig?: (dir: string, dev: boolean, log: { info(): void; error(): void }, forceReload: boolean) => unknown;
}

/** The repository root, three levels above this file's directory (`services/sidecar/src`). */
function repoRoot(): string {
  return resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
}

/**
 * Fill `process.env` as the web's own is filled, in the order above. Next's
 * loader writes into `process.env` and keeps what is already there, so the
 * data home's values go in first and the app's files only fill what is left.
 * A loader that cannot run (no `@next/env` in a stripped checkout) costs the
 * app's files, not the start: the data home's values are already in.
 */
export async function loadSidecarEnv({ appDir = join(repoRoot(), "apps", "web") }: { appDir?: string } = {}): Promise<void> {
  for (const [key, value] of Object.entries(readEnvFile(dataHomeEnvFile(process.env)))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  if (!existsSync(appDir)) return;
  try {
    // The CommonJS module's namespace differs between plain node (`default`)
    // and tsx (named exports), so take the function from whichever holds it.
    const mod = (await import("@next/env")) as NextEnv & { default?: NextEnv };
    const load = mod.loadEnvConfig ?? mod.default?.loadEnvConfig;
    if (load === undefined) throw new Error("@next/env has no loadEnvConfig");
    load(appDir, true, { info() {}, error() {} }, true);
  } catch (error) {
    process.stderr.write(
      `sidecar: could not read ${appDir}'s .env files: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  for (const key of CATALOG_PATH_KEYS) {
    const value = process.env[key];
    if (value !== undefined) process.env[key] = catalogPathFrom(appDir, value);
  }
}

/**
 * Pin `CATALOG_DB` at the file the catalog's own resolver names
 * (`databasePath()`: `CATALOG_DB`, then `services/catalog/.env`, then
 * `DATABASE_URL`, then the data home), so every process this environment
 * reaches opens that one file whatever its working directory or its own
 * reading of the dotenv files. A value the resolver refuses (a Postgres URL)
 * is left for the catalog to refuse with its own message.
 *
 * Read after `loadSidecarEnv`, which is what makes a value in the data
 * home's `.env` or the web app's `.env.local` count.
 */
export async function pinCatalogFile(): Promise<string | null> {
  const before = { ...process.env };
  const { databasePath } = await import("@gnosia/catalog/state");
  let file: string | null = null;
  try {
    file = databasePath();
  } catch {
    file = null;
  }
  // The catalog's dotenv read fills process.env; the pin is all that should stay of it.
  for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
  if (file !== null) process.env.CATALOG_DB = file;
  return file;
}

/**
 * The environment a launcher hands every service it spawns (S9-08): the
 * web's (`loadSidecarEnv`) with the catalog's file pinned (`pinCatalogFile`).
 * The desktop shell and the macOS app both take it from `child-env.ts`
 * rather than each re-deriving it, so the web, the studio runner, the
 * sidecar and the snapshot script cannot open two different databases or
 * run under two different spend caps.
 */
export async function childEnvironment(options: { appDir?: string } = {}): Promise<Record<string, string>> {
  await loadSidecarEnv(options);
  await pinCatalogFile();
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
}
