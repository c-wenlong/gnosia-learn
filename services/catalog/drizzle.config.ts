import { defineConfig } from "drizzle-kit";

import { databasePath } from "./src/env";

/**
 * drizzle-kit only ever generates SQL here; nothing in the repo runs
 * `drizzle-kit push` or `migrate`. Migrations are applied by
 * `npm run catalog -- migrate`, which goes through the same drizzle-orm
 * migrator the tests use, so there is one code path from a laptop to CI to
 * wherever the file is copied.
 *
 * The database is SQLite now (docs/SQLITE-MIGRATION.md): one file under the
 * data root, `drizzle-sqlite/` holding the sqlite-dialect journal beside the
 * Postgres history in `drizzle/`, which the port script still reads.
 *
 * Regenerate after changing packages/schema:
 *   npm run generate -w @gnosia/catalog
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "../../packages/schema/src/index.ts",
  out: "./drizzle-sqlite",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: { url: databasePath() },
});
