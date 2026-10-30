import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

import { CATALOG_DB_ENV, databasePath, databaseUrl, GNOSIA_HOME_ENV } from "../src/env";

/**
 * No test may open a catalog file it did not make.
 *
 * The catalog's resolver (`databaseUrl()` in src/env.ts) takes `CATALOG_DB`
 * first, then `DATABASE_URL`, then `$GNOSIA_HOME/catalog.db`, and fills any
 * of them that is unset from services/catalog/.env, which docs/DEPLOYMENT.md
 * and docs/HOMESERVER.md tell a machine to put `CATALOG_DB` in. A suite that
 * points the catalog at its scratch file through `DATABASE_URL` alone lost to
 * any of those, and its route writes (recaps, observations, provider keys)
 * went into the owner's real `catalog.db`, an append-only log nothing can
 * delete from. vitest.setup.ts calls `isolateCatalog` before any test file
 * runs, and checks `catalogInUse` against `forbiddenCatalogs` around every
 * test.
 */

/**
 * The `DATABASE_URL` every test file starts with. The catalog refuses a
 * `postgres://` value before it opens anything (`databasePath()`), so a test
 * that opens the default catalog instead of a scratch file fails by name,
 * locally as on CI. A suite that wants a database sets `DATABASE_URL` or
 * `CATALOG_DB` itself, which replaces this.
 */
export const NO_DEFAULT_CATALOG = "postgres://tests-open-scratch-catalogs-only/";

/** The variable that replaces services/catalog/.env (`ENV_FILE` in src/env.ts). */
export const ENV_FILE_ENV = "CATALOG_ENV_FILE";

/**
 * Takes every setting that can name a catalog out of `env`'s hands.
 *
 * - `CATALOG_DB` becomes `""`, not deleted: `loadEnv` keeps any value that is
 *   not `undefined`, so a dotenv cannot fill it back in, and `databaseUrl()`
 *   reads a blank as unset and goes on to `DATABASE_URL`.
 * - `CATALOG_ENV_FILE` names a file that does not exist, so neither this
 *   process nor any child it spawns reads services/catalog/.env.
 * - `DATABASE_URL` is the tripwire above, whatever the shell exported.
 * - `GNOSIA_HOME` is the caller's temp directory, whatever the shell
 *   exported, so the default catalog and the blob store sit there.
 *
 * Children inherit all four, which is what keeps a spawned CLI off the real
 * file as well.
 */
export function isolateCatalog(env: NodeJS.ProcessEnv, home: string): void {
  env[CATALOG_DB_ENV] = "";
  env[ENV_FILE_ENV] = path.join(home, "no-catalog.env");
  env.DATABASE_URL = NO_DEFAULT_CATALOG;
  env[GNOSIA_HOME_ENV] = home;
}

/** A path, with its directory's symlinks resolved when it exists, so `/tmp/x` and `/private/tmp/x` compare equal. */
function canonical(file: string): string {
  const resolved = path.resolve(file);
  const directory = path.dirname(resolved);
  try {
    return path.join(realpathSync(directory), path.basename(resolved));
  } catch {
    return resolved;
  }
}

/** The file a catalog setting names, or null when it names none (blank, `:memory:`, a value the catalog refuses). */
function namedFile(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  try {
    const file = databasePath(value);
    return file === ":memory:" ? null : canonical(file);
  } catch {
    return null;
  }
}

/** `$GNOSIA_HOME/catalog.db` for a `GNOSIA_HOME` value, expanded as `gnosiaHome()` in src/env.ts expands it. */
function homeCatalog(value: string | undefined, home: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const expanded = raw === "~" || raw.startsWith("~/") ? path.join(home, raw.slice(1)) : raw;
  return canonical(path.join(expanded, "catalog.db"));
}

/** KEY=VALUE pairs of a dotenv file, or none when it cannot be read. */
function readEnvFile(file: string): Record<string, string | undefined> {
  try {
    return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  } catch {
    return {};
  }
}

/** The web app's dotenv files (`.env`, `.env.local`, `.env.development.local` and the rest), never the example. */
function webEnvFiles(repoRoot: string): string[] {
  const appDir = path.join(repoRoot, "apps", "web");
  try {
    return readdirSync(appDir)
      .filter((name) => name.startsWith(".env") && name !== ".env.example")
      .map((name) => path.join(appDir, name));
  } catch {
    return [];
  }
}

/** The account's home from the password database, or null where it has no entry (some containers). */
function accountHome(): string | null {
  try {
    return userInfo().homedir;
  } catch {
    return null;
  }
}

/**
 * Every catalog file this machine could mean, read from `before` (the
 * environment as the shell handed it over, taken before `isolateCatalog`):
 * the default under each home directory, and whatever `CATALOG_DB`,
 * `DATABASE_URL` and `GNOSIA_HOME` name in that environment, in
 * services/catalog/.env (or the file `CATALOG_ENV_FILE` named), in the data
 * home's `.env`, and in the web app's dotenv files. None of them is a file a
 * test made, so a test whose catalog resolves to one of them is stopped.
 */
export function forbiddenCatalogs(before: NodeJS.ProcessEnv, repoRoot: string): Set<string> {
  // os.homedir() reads $HOME, which a suite may point elsewhere; the account's
  // own home comes from the password database.
  const homes = [...new Set([homedir(), accountHome(), before.HOME].filter((h): h is string => !!h))];
  const dataHomes = homes.map((home) => path.join(home, ".gnosia"));
  const fromShell = before[GNOSIA_HOME_ENV]?.trim();
  if (fromShell) dataHomes.push(fromShell === "~" || fromShell.startsWith("~/") ? path.join(homedir(), fromShell.slice(1)) : fromShell);

  const sources: Array<Record<string, string | undefined>> = [before];
  const envFiles = [
    path.join(repoRoot, "services", "catalog", ".env"),
    ...webEnvFiles(repoRoot),
    ...dataHomes.map((home) => path.join(home, ".env")),
  ];
  const named = before[ENV_FILE_ENV]?.trim();
  if (named) envFiles.push(named);
  for (const file of envFiles) sources.push(readEnvFile(file));

  const forbidden = new Set<string>();
  const add = (file: string | null) => {
    if (file !== null) forbidden.add(file);
  };
  for (const home of dataHomes) add(canonical(path.join(home, "catalog.db")));
  for (const source of sources) {
    add(namedFile(source[CATALOG_DB_ENV]));
    add(namedFile(source.DATABASE_URL));
    for (const home of homes) add(homeCatalog(source[GNOSIA_HOME_ENV], home));
  }
  return forbidden;
}

/**
 * The file a connection opened now with no explicit url would use, or null
 * when the catalog would refuse to open one (the tripwire, or another value
 * `databasePath` rejects) or it is `:memory:`.
 */
export function catalogInUse(): string | null {
  return namedFile(databaseUrl());
}
