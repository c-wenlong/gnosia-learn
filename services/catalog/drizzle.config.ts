import { defineConfig } from "drizzle-kit";

import { databaseUrl } from "./src/env";

/**
 * drizzle-kit only ever generates SQL here; nothing in the repo runs
 * `drizzle-kit push` or `migrate`. Migrations are applied by
 * `npm run catalog -- migrate`, which goes through the same drizzle-orm
 * migrator the tests use, so there is one code path from a laptop to CI to the
 * homeserver.
 *
 * Regenerate after changing packages/schema:
 *   npm run generate -w @gnosia/catalog
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "../../packages/schema/src/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: { url: databaseUrl() },
});
