import path from "node:path";

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
 * runs, and `catalog-guard.ts` refuses to open a forbidden file.
 *
 * This module imports nothing from src/env.ts, and must not: env.ts fixes
 * which dotenv it reads (`ENV_FILE`) when it is first imported, so the setup
 * file has to set `CATALOG_ENV_FILE` before anything reaches it.
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
  env.CATALOG_DB = "";
  env[ENV_FILE_ENV] = path.join(home, "no-catalog.env");
  env.DATABASE_URL = NO_DEFAULT_CATALOG;
  env.GNOSIA_HOME = home;
}
