// What scripts/dev.sh needs to know about the web app's configuration, asked
// of Node so it is read the way the app reads it:
//
//   node scripts/lib/dev-env.mjs get <app dir> KEY...   KEY=value lines
//   node scripts/lib/dev-env.mjs db <app dir>           the catalog file, checked
//
// `get` loads the app's .env files with Next's own loader (@next/env), so a
// quoted value, a trailing comment and the .env.development files behave as
// they do under `next dev`; a value already in the environment wins, as there.
// `db` loads the same files, then resolves the catalog's SQLite file with the
// catalog's own `databasePath()` (services/catalog/src/env.ts: CATALOG_DB,
// then DATABASE_URL, then $GNOSIA_HOME/catalog.db, with services/catalog/.env
// read under them), so it names the file the app will open, and opens it
// read-only. It prints `FILE=<path>` and exits 0, or one line saying what is
// wrong and exits 3. A value with a newline in it is not supported: the lines
// are the format.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The app's environment as `next dev` would see it. Next's loader reads and
 * writes process.env, so this is for a process of its own, as the command
 * line below runs it.
 * @param {string} appDir
 * @returns {Promise<Record<string, string | undefined>>}
 */
export async function loadDevEnv(appDir) {
  const { default: nextEnv } = await import("@next/env");
  const quiet = { info() {}, error() {} };
  return nextEnv.loadEnvConfig(appDir, true, quiet, true).combinedEnv;
}

/**
 * The catalog file the app would open, checked: it must resolve (a
 * postgres:// value is refused by the resolver itself), exist, open as a
 * SQLite database, and hold the catalog's tables. Read-only and `fileMustExist`, so the
 * check never creates or changes a file. Throws an Error whose message is the
 * one line to show, the README step to run included.
 * @param {string} appDir
 * @returns {Promise<string>} the file's path
 */
export async function checkCatalogFile(appDir) {
  await loadDevEnv(appDir);
  // env.ts is TypeScript; tsx's loader lets plain node import it, resolved
  // from this file, so dev.sh needs no flags and no particular cwd.
  const { register } = await import("tsx/esm/api");
  register();
  const { databasePath } = await import("../../services/catalog/src/env.ts");
  const file = databasePath();
  const setUp = "npm run catalog -- migrate, then import the seed (README, Install)";
  if (!existsSync(file)) throw new Error(`there is no catalog at ${file}: ${setUp}`);
  const { default: Database } = await import("better-sqlite3");
  // One named table, not the table list: `learner` is made by the first
  // migration, so a file without it was never migrated. (A read of every
  // table is what services/catalog/test/provider-keys.test.ts guards.)
  let migrated;
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      migrated = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'learner'").get() !== undefined;
    } finally {
      db.close();
    }
  } catch (error) {
    throw new Error(`cannot open the catalog at ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!migrated) throw new Error(`the catalog at ${file} has no tables yet: ${setUp}`);
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  try {
    if (mode === "get" && args.length >= 2) {
      const [appDir, ...keys] = args;
      const env = await loadDevEnv(appDir);
      for (const key of keys) {
        if (env[key] !== undefined) process.stdout.write(`${key}=${env[key]}\n`);
      }
    } else if (mode === "db" && args.length === 1) {
      process.stdout.write(`FILE=${await checkCatalogFile(args[0])}\n`);
    } else {
      process.stderr.write("usage: dev-env.mjs get <app dir> KEY... | db <app dir>\n");
      process.exit(2);
    }
  } catch (error) {
    process.stderr.write(`dev-env.mjs: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(3);
  }
}
