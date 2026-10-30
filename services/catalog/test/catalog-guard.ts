import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

import { CATALOG_DB_ENV, databasePath, GNOSIA_HOME_ENV } from "../src/env";
import { ENV_FILE_ENV } from "./catalog-isolation";

/**
 * The second half of the isolation in `catalog-isolation.ts`: every catalog
 * file this machine could mean, and the check vitest.setup.ts runs each time
 * a test process opens a SQLite file. It sits at the open itself, not in a
 * hook around each test, so a test that points the catalog at the owner's
 * file (an explicit url, or variables deleted so the default applies) is
 * stopped before anything is written, whatever it restores afterwards.
 */

/**
 * A path with the symlinks in its nearest existing ancestor resolved, so
 * `/tmp/x` and `/private/tmp/x` compare equal, and a file named while its
 * directory did not exist yet compares equal to the same file opened after
 * `connect()` made the directory.
 */
export function canonical(file: string): string {
  const resolved = path.resolve(file);
  let existing = resolved;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync(existing), ...rest);
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return resolved;
      rest.unshift(path.basename(existing));
      existing = parent;
    }
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
 * Throws when `file`, the path a SQLite handle is about to open, is one of
 * `forbidden`. A blank name (SQLite's private temp database), `:memory:` and
 * a non-string (a serialized buffer) open no file and pass.
 */
export function refuseForbiddenOpen(file: unknown, forbidden: ReadonlySet<string>): void {
  if (typeof file !== "string" || file.trim() === "" || file === ":memory:") return;
  const target = canonical(file);
  if (forbidden.has(target)) {
    throw new Error(
      `A test opened ${target}, a catalog it did not make (the default, or one the shell or a .env ` +
        `names). Point CATALOG_DB or DATABASE_URL at a scratch file ` +
        `(services/catalog/test/scratch-database.ts) before opening it.`,
    );
  }
}
