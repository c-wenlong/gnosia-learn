#!/usr/bin/env node
/**
 * One-shot Postgres-to-SQLite port for the catalog (docs/SQLITE-MIGRATION.md).
 *
 *   node services/catalog/scripts/pg-to-sqlite.mjs --from postgres://… --to ~/.gnosia/catalog.db
 *
 * `--from` defaults to DATABASE_URL, `--to` to CATALOG_DB and then
 * $GNOSIA_HOME/catalog.db (`~/.gnosia/catalog.db`). The target file is
 * migrated to head first, so the port reads today's tables and columns
 * straight out of sqlite_master rather than a copy of the schema list.
 *
 * Data moves table by table with `PRAGMA foreign_keys` off and a
 * `foreign_key_check` before the file is left readable: a row whose foreign
 * key lands nowhere fails the port, loudly, rather than quietly corrupting.
 * Column types are read from information_schema on the Postgres side so jsonb
 * becomes JSON text, timestamptz becomes the epoch-millisecond integer the
 * schema declares, and a text[] becomes a JSON array.
 *
 * `asset.generated_by` is new with the port and backfilled from the `id`'s
 * `tool:` prefix — `manimkc:…` names manimkc, `video` names a studio video,
 * and everything else is `manual` — matching GENERATED_BY in
 * packages/schema.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import pg from "pg";

const GENERATED_BY = ["manimkc", "remotionkc", "revideokc", "blenderkc", "tldrawkc", "video", "manual"];
const SKIP_TABLES = new Set(["__drizzle_migrations", "catalog_armed_rule"]);

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function fail(message) {
  console.error(`pg-to-sqlite: ${message}`);
  process.exit(1);
}

const source = arg("from") ?? process.env.DATABASE_URL;
if (!source?.startsWith("postgres")) fail("no Postgres URL: pass --from postgres://… or set DATABASE_URL");
const home = process.env.GNOSIA_HOME?.trim() || path.join(homedir(), ".gnosia");
const target = path.resolve(arg("to") ?? process.env.CATALOG_DB ?? path.join(home, "catalog.db"));
if (existsSync(target)) fail(`${target} already exists; the port writes a fresh file, it does not merge`);

mkdirSync(path.dirname(target), { recursive: true });
const sqlite = new Database(target);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = OFF");
// The write-guard triggers and CHECK rewrites call functions `connect`
// registers per connection; this raw handle has to register its own or
// every insert raises "no such function". The port writes a fresh
// primary, so copy is allowed and there is no write-seam revision to
// match. The bodies mirror `connect`'s in src/db.ts.
sqlite.function("catalog_copy_ok", () => 1);
sqlite.function("catalog_revision_id", () => "pg-to-sqlite");
sqlite.function("regexp", (pattern, value) => {
  if (pattern === null || value === null) return null;
  if (typeof pattern !== "string" || typeof value !== "string") return 0;
  return new RegExp(pattern).test(value) ? 1 : 0;
});
sqlite.function("regexp_replace", { varargs: true }, (value, pattern, replacement) => {
  if (value === null || pattern === null || replacement === null) return null;
  return String(value).replace(new RegExp(String(pattern), "g"), String(replacement));
});
sqlite.function("starts_with", (a, b) => {
  if (a === null || b === null) return null;
  return String(a).startsWith(String(b)) ? 1 : 0;
});

// Migrate to head with the service's own migration runner so the target is
// exactly the schema the code expects, journal rows included.
const migrate = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const { execFileSync } = await import("node:child_process");
execFileSync(process.execPath, ["--import", "tsx", migrate, "migrate"], {
  env: { ...process.env, CATALOG_DB: target },
  stdio: ["ignore", "ignore", "inherit"],
});

const client = new pg.Client({ connectionString: source });
try {
  await client.connect();
} catch (error) {
  fail(`cannot reach ${source.replace(/\/\/.*@/, "//***@")}: ${error.message}`);
}

const tables = sqlite
  .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
  .all()
  .map((row) => row.name)
  .filter((name) => !SKIP_TABLES.has(name));

// Postgres column types once, for the row transform below.
const { rows: typeRows } = await client.query(
  "select table_name, column_name, udt_name from information_schema.columns where table_schema = 'public'",
);
const types = new Map(typeRows.map((r) => [`${r.table_name}.${r.column_name}`, r.udt_name]));
const { rows: pgTables } = await client.query(
  "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
);
const present = new Set(pgTables.map((r) => r.table_name));

function convert(table, column, value) {
  if (value === null || value === undefined) return null;
  const udt = types.get(`${table}.${column}`);
  if (udt === "timestamptz" || udt === "timestamp" || udt === "date") return new Date(value).getTime();
  if (udt === "jsonb" || udt === "json") return JSON.stringify(value);
  if (udt === "bool") return value ? 1 : 0;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value instanceof Date) return value.getTime();
  if (value instanceof Buffer) return value;
  return value;
}

/** The port's generated_by: the id's `tool:` prefix when it names a tool, `manual` otherwise. */
function generatedBy(id) {
  const prefix = String(id).split(":", 1)[0];
  return GENERATED_BY.includes(prefix) ? prefix : "manual";
}

for (const table of tables) {
  if (!present.has(table)) {
    console.log(`${table}: absent in postgres, left as migrated`);
    continue;
  }
  const columns = sqlite.prepare(`select name from pragma_table_info(?)`).all(table).map((r) => r.name);
  const { rows: pgCols } = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
    [table],
  );
  const shared = columns.filter((c) => pgCols.some((p) => p.column_name === c));
  const { rows } = await client.query(`select ${shared.map((c) => `"${c}"`).join(",")} from "${table}"`);
  // `or replace` because the target's seeds (learner, catalog_instance) are
  // real rows: the source's row wins when it has one, the seed stands when
  // the source table is empty.
  const insert = sqlite.prepare(
    `insert or replace into "${table}" (${shared.map((c) => `"${c}"`).join(",")}) values (${shared.map(() => "?").join(",")})`,
  );
  const addGeneratedBy = table === "asset" && columns.includes("generated_by") && !shared.includes("generated_by");
  const insertAsset = addGeneratedBy
    ? sqlite.prepare(
        `insert or replace into "asset" (${shared.map((c) => `"${c}"`).join(",")}, generated_by) values (${shared.map(() => "?").join(",")}, ?)`,
      )
    : null;
  let n = 0;
  const run = sqlite.transaction((batch) => {
    for (const row of batch) {
      const values = shared.map((c) => convert(table, c, row[c]));
      if (insertAsset) insertAsset.run(...values, generatedBy(row.id));
      else insert.run(...values);
      n += 1;
    }
  });
  for (let i = 0; i < rows.length; i += 500) run(rows.slice(i, i + 500));
  console.log(`${table}: ${n} row(s)`);
}

const violations = sqlite.pragma("foreign_key_check");
sqlite.pragma("foreign_keys = ON");
if (violations.length > 0) {
  fail(`${violations.length} foreign key violation(s) after the port; first: ${JSON.stringify(violations[0])}`);
}
await client.end();
sqlite.close();
console.log(`wrote ${target}`);
