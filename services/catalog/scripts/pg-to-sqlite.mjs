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
 * Data moves table by table with `PRAGMA foreign_keys` off and the CHECK
 * constraints held off too, then every CHECK and a `foreign_key_check` run
 * over what landed before the file is left readable. A value no CHECK
 * accepts fails the port with every offending check, column and distinct
 * value named at once, rather than on the first row that carries one; a
 * row whose foreign key lands nowhere fails it too. Either way the file
 * the port made is removed, so the next run starts clean.
 * Column types are read from information_schema on the Postgres side so jsonb
 * becomes JSON text, timestamptz becomes the epoch-millisecond integer the
 * schema declares, and a text[] becomes a JSON array.
 *
 * Values a later Postgres migration renamed are renamed on the way (RENAMES),
 * so a database that never ran that migration still ports: an `asset` from
 * before 0032 says `source_repo = 'self-learn'`, which is `gnosia` now.
 *
 * `asset.generated_by` is new with the port and backfilled from the `id`'s
 * `tool:` prefix (`manimkc:…` names manimkc, `video` names a studio video,
 * and everything else is `manual`), matching GENERATED_BY in
 * packages/schema.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Database from "better-sqlite3";

const GENERATED_BY = ["manimkc", "remotionkc", "revideokc", "blenderkc", "tldrawkc", "video", "manual"];
const SKIP_TABLES = new Set(["__drizzle_migrations", "catalog_armed_rule"]);

/**
 * Values a Postgres migration renamed in place, which a database that never
 * ran it still holds. Each rename is one-way, so mapping the old value is
 * what that migration would have done.
 */
export const RENAMES = [
  // drizzle/0032_gnosia.sql: the self-learn -> gnosia rename.
  { table: "asset", column: "source_repo", from: "self-learn", to: "gnosia" },
];

/** A value as the target should hold it: a renamed value's new name, anything else unchanged. */
export function renamed(table, column, value) {
  for (const rename of RENAMES) {
    if (rename.table === table && rename.column === column && rename.from === value) return rename.to;
  }
  return value;
}

/** The port's generated_by: the id's `tool:` prefix when it names a tool, `manual` otherwise. */
export function generatedBy(id) {
  const prefix = String(id).split(":", 1)[0];
  return GENERATED_BY.includes(prefix) ? prefix : "manual";
}

/** A Postgres value as the SQLite column holds it, by the column's Postgres type. */
export function convert(udt, value) {
  if (value === null || value === undefined) return null;
  if (udt === "timestamptz" || udt === "timestamp" || udt === "date") return new Date(value).getTime();
  if (udt === "jsonb" || udt === "json") return JSON.stringify(value);
  if (udt === "bool") return value ? 1 : 0;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value instanceof Date) return value.getTime();
  if (value instanceof Buffer) return value;
  return value;
}

/**
 * The functions `connect` registers per connection (src/db.ts), which the
 * write-guard triggers and CHECK rewrites call; a raw handle has to register
 * its own or every insert raises "no such function". The port writes a
 * fresh primary, so copy is allowed and there is no write-seam revision to
 * match.
 */
export function registerFunctions(sqlite) {
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
}

/** Where a quoted run starting at `at` ends (the index after its closing quote), `''` and `""` escapes included. */
function quotedEnd(text, at) {
  const quote = text[at];
  const close = quote === "[" ? "]" : quote;
  let i = at + 1;
  while (i < text.length) {
    if (text[i] === close) {
      if (close !== "]" && text[i + 1] === close) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return text.length;
}

/** `text` with every string literal and quoted identifier blanked to spaces, so a scan for keywords and parentheses skips them. */
function blankQuoted(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "'" || text[i] === '"' || text[i] === "`" || text[i] === "[") {
      const end = quotedEnd(text, i);
      out += " ".repeat(end - i);
      i = end;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

/**
 * The CHECK constraints in a `CREATE TABLE` statement, in order: each one's
 * name (`CONSTRAINT "name"`, or `<table> check <n>` for an unnamed one) and
 * its expression as written. Quotes are skipped while scanning, so a
 * parenthesis inside a regexp pattern or a value list does not end the
 * expression early.
 */
export function checkConstraints(table, createSql) {
  const blank = blankQuoted(createSql);
  const checks = [];
  const keyword = /\bcheck\s*\(/gi;
  let match;
  while ((match = keyword.exec(blank)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < blank.length; close += 1) {
      if (blank[close] === "(") depth += 1;
      else if (blank[close] === ")" && --depth === 0) break;
    }
    const before = createSql.slice(0, match.index);
    const named = /constraint\s+("(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|\w+)\s*$/i.exec(before);
    const name = named ? named[1].replace(/^["`[]|["`\]]$/g, "").replace(/""/g, '"') : `${table} check ${checks.length + 1}`;
    checks.push({ name, expression: createSql.slice(open + 1, close).trim() });
    keyword.lastIndex = close + 1;
  }
  return checks;
}

/** The columns of `columns` an expression names, in the table's order, so a report can show the values it judged. */
export function referencedColumns(expression, columns) {
  const blank = blankQuoted(expression);
  // A quoted identifier is blanked above, so look for those in the original.
  return columns.filter((column) => {
    const bare = new RegExp(`(^|[^\\w.])${column.replace(/[^\w]/g, "\\$&")}(?![\\w])`, "i");
    return bare.test(blank) || expression.includes(`"${column}"`) || expression.includes(`\`${column}\``);
  });
}

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** A value as a report prints it: SQL-ish literals, long text cut short. */
function shown(value) {
  if (value === null) return "null";
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  if (typeof value === "string") {
    const cut = value.length > 80 ? `${value.slice(0, 77)}...` : value;
    return `'${cut.replace(/'/g, "''")}'`;
  }
  return String(value);
}

const SHOWN_VALUES = 10;

/**
 * Every CHECK constraint of every table named, run over the rows that table
 * holds now: the port's check, made after the rows went in with
 * `ignore_check_constraints` on. A row fails a CHECK when its expression is
 * false, and passes when it is true or null, as SQLite judges an insert, so
 * `where not (expression)` finds exactly the rows an insert would have
 * refused. Returns one finding per failing check, with the distinct values
 * of the columns it names and how many rows carry each.
 */
export function checkViolations(sqlite, tables) {
  const findings = [];
  for (const table of tables) {
    const row = sqlite.prepare("select sql from sqlite_master where type = 'table' and name = ?").get(table);
    if (!row?.sql) continue;
    const columns = sqlite.prepare("select name from pragma_table_info(?)").all(table).map((r) => r.name);
    for (const { name, expression } of checkConstraints(table, row.sql)) {
      const failing = `from ${quoteIdent(table)} where not (${expression})`;
      const { rows } = sqlite.prepare(`select count(*) as rows ${failing}`).get();
      if (rows === 0) continue;
      const named = referencedColumns(expression, columns);
      const shownColumns = named.length > 0 ? named : columns;
      const list = shownColumns.map(quoteIdent).join(", ");
      const values = sqlite
        .prepare(`select ${list}, count(*) as "rows (port)" ${failing} group by ${list} order by "rows (port)" desc, ${list} limit ${SHOWN_VALUES + 1}`)
        .all();
      findings.push({
        table,
        check: name,
        expression,
        columns: shownColumns,
        rows,
        values: values.slice(0, SHOWN_VALUES).map((v) => ({
          value: Object.fromEntries(shownColumns.map((c) => [c, v[c]])),
          rows: v["rows (port)"],
        })),
        more: values.length > SHOWN_VALUES,
      });
    }
  }
  return findings;
}

/** The findings as the lines the port prints before it gives up. */
export function describeViolations(findings) {
  const lines = [];
  for (const finding of findings) {
    lines.push(`${finding.table}: ${finding.rows} row(s) fail ${finding.check}, CHECK (${finding.expression})`);
    for (const { value, rows } of finding.values) {
      const parts = Object.entries(value).map(([column, v]) => `${column} = ${shown(v)}`);
      lines.push(`  ${parts.join(", ")}  (${rows} row(s))`);
    }
    if (finding.more) lines.push(`  ... and more distinct values`);
  }
  return lines;
}

/** Why a port stopped: the message, and the lines that name what to fix. */
export class PortRefused extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "PortRefused";
    this.details = details;
  }
}

/** Remove a database file the port made, with its -wal and -shm. */
function removeTarget(target) {
  for (const file of [target, `${target}-wal`, `${target}-shm`]) rmSync(file, { force: true });
}

/** The service's own migration runner, so the target is exactly the schema the code expects, journal rows included. */
export function migrateTarget(target) {
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  execFileSync(process.execPath, ["--import", "tsx", cli, "migrate"], {
    env: { ...process.env, CATALOG_DB: target },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/**
 * Copy every table `client` (a connected `pg.Client`, or anything with its
 * `query`) holds into a new SQLite file at `target`. `migrate` makes the
 * file and brings it to head. Throws `PortRefused` with the file removed
 * when the rows would break a CHECK or a foreign key.
 */
export async function port({ client, target, migrate = migrateTarget, log = console.log }) {
  if (existsSync(target)) throw new PortRefused(`${target} already exists; the port writes a fresh file, it does not merge`);
  mkdirSync(path.dirname(target), { recursive: true });
  let sqlite = null;
  try {
    await migrate(target);
    sqlite = new Database(target);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = OFF");
    // The CHECKs are run as one pass after the copy (checkViolations), so a
    // value no check accepts is reported with every other one, not as the
    // first insert's error.
    sqlite.pragma("ignore_check_constraints = ON");
    registerFunctions(sqlite);

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

    for (const table of tables) {
      if (!present.has(table)) {
        log(`${table}: absent in postgres, left as migrated`);
        continue;
      }
      const columns = sqlite.prepare(`select name from pragma_table_info(?)`).all(table).map((r) => r.name);
      const { rows: pgCols } = await client.query(
        "select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
        [table],
      );
      const shared = columns.filter((c) => pgCols.some((p) => p.column_name === c));
      const { rows } = await client.query(`select ${shared.map((c) => `"${c}"`).join(",")} from "${table}"`);
      const addGeneratedBy = table === "asset" && columns.includes("generated_by") && !shared.includes("generated_by");
      const targetColumns = addGeneratedBy ? [...shared, "generated_by"] : shared;
      // `or replace` because the target's seeds (learner, catalog_instance) are
      // real rows: the source's row wins when it has one, the seed stands when
      // the source table is empty.
      const insert = sqlite.prepare(
        `insert or replace into "${table}" (${targetColumns.map((c) => `"${c}"`).join(",")}) values (${targetColumns.map(() => "?").join(",")})`,
      );
      let n = 0;
      let renames = 0;
      const run = sqlite.transaction((batch) => {
        for (const row of batch) {
          const values = shared.map((c) => {
            const value = convert(types.get(`${table}.${c}`), row[c]);
            const next = renamed(table, c, value);
            if (next !== value) renames += 1;
            return next;
          });
          if (addGeneratedBy) values.push(generatedBy(row.id));
          insert.run(...values);
          n += 1;
        }
      });
      for (let i = 0; i < rows.length; i += 500) run(rows.slice(i, i + 500));
      log(`${table}: ${n} row(s)${renames > 0 ? `, ${renames} renamed value(s)` : ""}`);
    }

    const findings = checkViolations(sqlite, tables);
    if (findings.length > 0) {
      throw new PortRefused(
        `${findings.length} CHECK constraint(s) refuse rows from postgres; nothing was kept. Fix these values at the source (or add a rename to RENAMES in this script) and run it again:`,
        describeViolations(findings),
      );
    }
    sqlite.pragma("ignore_check_constraints = OFF");

    const violations = sqlite.pragma("foreign_key_check");
    if (violations.length > 0) {
      throw new PortRefused(
        `${violations.length} foreign key violation(s) after the port; nothing was kept. First: ${JSON.stringify(violations[0])}`,
      );
    }
    sqlite.pragma("foreign_keys = ON");
    sqlite.close();
    sqlite = null;
    log(`wrote ${target}`);
  } catch (error) {
    sqlite?.close();
    removeTarget(target);
    throw error;
  }
}

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function fail(message, details = []) {
  console.error(`pg-to-sqlite: ${message}`);
  for (const line of details) console.error(line);
  process.exit(1);
}

async function main() {
  const source = arg("from") ?? process.env.DATABASE_URL;
  if (!source?.startsWith("postgres")) fail("no Postgres URL: pass --from postgres://… or set DATABASE_URL");
  const home = process.env.GNOSIA_HOME?.trim() || path.join(homedir(), ".gnosia");
  const target = path.resolve(arg("to") ?? process.env.CATALOG_DB ?? path.join(home, "catalog.db"));
  if (existsSync(target)) fail(`${target} already exists; the port writes a fresh file, it does not merge`);

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: source });
  try {
    await client.connect();
  } catch (error) {
    fail(`cannot reach ${source.replace(/\/\/.*@/, "//***@")}: ${error.message}`);
  }
  try {
    await port({ client, target });
  } catch (error) {
    if (error instanceof PortRefused) fail(error.message, error.details);
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
