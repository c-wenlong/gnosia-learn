import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { copyDatabase } from "../../../scripts/lib/sqlite.mjs";
import {
  checkConstraints,
  port,
  PortRefused,
  referencedColumns,
  renamed,
} from "../scripts/pg-to-sqlite.mjs";
import { migratedScratchDatabase, type Scratch } from "./scratch-database";

/**
 * The port against a stand-in for `pg.Client`: it answers the four queries
 * the port makes (column types, tables, a table's columns, a table's rows)
 * from a fixture, so no Postgres has to run. The target is a copy of the
 * migrated template rather than a `catalog migrate` subprocess per test.
 */
type Fixture = Record<string, { columns: Record<string, string>; rows: Record<string, unknown>[] }>;

function fakeClient(fixture: Fixture) {
  return {
    async query(text: string, params: unknown[] = []) {
      if (text.includes("udt_name")) {
        return {
          rows: Object.entries(fixture).flatMap(([table, { columns }]) =>
            Object.entries(columns).map(([column, udt]) => ({ table_name: table, column_name: column, udt_name: udt })),
          ),
        };
      }
      if (text.includes("information_schema.tables")) {
        return { rows: Object.keys(fixture).map((table) => ({ table_name: table })) };
      }
      if (text.includes("ordinal_position")) {
        const table = fixture[String(params[0])];
        return { rows: Object.keys(table?.columns ?? {}).map((column) => ({ column_name: column })) };
      }
      const select = /^select (.*) from "([^"]+)"$/.exec(text);
      if (select === null) throw new Error(`the fake client was asked something it does not know: ${text}`);
      const columns = select[1]!.split(",").map((c) => c.replace(/"/g, ""));
      const rows = fixture[select[2]!]?.rows ?? [];
      return { rows: rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))) };
    },
  };
}

const ASSET_COLUMNS = { id: "text", kind: "text", path: "text", source_repo: "text", created_at: "timestamptz" };

function asset(id: string, sourceRepo: string, kind = "note") {
  return { id, kind, path: `learn/concepts/${id}.md`, source_repo: sourceRepo, created_at: new Date("2026-09-01T00:00:00Z") };
}

let template: Scratch;
let dir: string;

beforeAll(async () => {
  template = await migratedScratchDatabase();
  dir = mkdtempSync(path.join(tmpdir(), "gnosia_pg_port_"));
});

afterAll(async () => {
  await template.drop();
  rmSync(dir, { recursive: true, force: true });
});

function targetFile(name: string): string {
  return path.join(dir, `${name}.db`);
}

async function runPort(fixture: Fixture, target: string) {
  const lines: string[] = [];
  await port({
    client: fakeClient(fixture),
    target,
    migrate: (file: string) => copyDatabase(template.url, file),
    log: (line: string) => lines.push(line),
  });
  return lines;
}

describe("pg-to-sqlite", () => {
  it("ports a catalog from before the gnosia rename, with self-learn read as gnosia", async () => {
    const target = targetFile("renamed");
    const lines = await runPort(
      { asset: { columns: ASSET_COLUMNS, rows: [asset("a-note", "self-learn"), asset("manimkc:video", "manimkc", "note")] } },
      target,
    );

    const db = new Database(target, { readonly: true });
    try {
      const rows = db.prepare("select id, source_repo, generated_by from asset order by id").all();
      expect(rows).toEqual([
        { id: "a-note", source_repo: "gnosia", generated_by: "manual" },
        { id: "manimkc:video", source_repo: "manimkc", generated_by: "manimkc" },
      ]);
    } finally {
      db.close();
    }
    expect(lines).toContain("asset: 2 row(s), 1 renamed value(s)");
  });

  it("refuses values no CHECK accepts, naming every check and distinct value at once, and keeps no file", async () => {
    const target = targetFile("refused");
    const fixture: Fixture = {
      asset: {
        columns: ASSET_COLUMNS,
        rows: [
          asset("one", "elsewhere"),
          asset("two", "elsewhere"),
          asset("three", "somewhere"),
          asset("four", "gnosia", "gif"),
        ],
      },
    };

    const refused = await runPort(fixture, target).then(
      () => null,
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(PortRefused);
    const { message, details } = refused as PortRefused;
    expect(message).toContain("2 CHECK constraint(s)");
    expect(details).toContain(
      "asset: 3 row(s) fail asset_source_repo_check, CHECK (source_repo in ('gnosia', 'manimkc', 'tldrawkc', 'remotionkc', 'revideokc', 'blenderkc'))",
    );
    expect(details).toContain("  source_repo = 'elsewhere'  (2 row(s))");
    expect(details).toContain("  source_repo = 'somewhere'  (1 row(s))");
    expect(details.some((line: string) => line.startsWith("asset: 1 row(s) fail asset_kind_check"))).toBe(true);
    expect(details).toContain("  kind = 'gif'  (1 row(s))");
    expect(existsSync(target)).toBe(false);
    expect(existsSync(`${target}-wal`)).toBe(false);
  });

  it("refuses a target that already exists, and leaves it alone", async () => {
    const target = targetFile("existing");
    await copyDatabase(template.url, target);
    await expect(runPort({}, target)).rejects.toThrow(/already exists/);
    expect(existsSync(target)).toBe(true);
  });
});

describe("the CHECK parser", () => {
  it("reads each constraint's name and whole expression, past parentheses inside quotes", () => {
    const sql = `CREATE TABLE \`blob_object\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`sha256\` text NOT NULL,
	CONSTRAINT "blob_object_sha256_check" CHECK(sha256 regexp '^[0-9a-f]{64}$'),
	CONSTRAINT "blob_object_key_check" CHECK(key regexp '^[a-z0-9]+(-[a-z)0-9]+)*$' and (length(key) > 0)),
	\`n\` integer CHECK (n >= 0)
);`;
    expect(checkConstraints("blob_object", sql)).toEqual([
      { name: "blob_object_sha256_check", expression: "sha256 regexp '^[0-9a-f]{64}$'" },
      { name: "blob_object_key_check", expression: "key regexp '^[a-z0-9]+(-[a-z)0-9]+)*$' and (length(key) > 0)" },
      { name: "blob_object check 3", expression: "n >= 0" },
    ]);
  });

  it("names the columns an expression reads, not words inside its strings", () => {
    expect(
      referencedColumns("(cover_blob_key is null) = (json_type(metadata, '$.coverCredit') is null)", [
        "slug",
        "metadata",
        "cover_blob_key",
        "coverCredit",
      ]),
    ).toEqual(["metadata", "cover_blob_key"]);
  });

  it("renames only the value a migration renamed, in its own column", () => {
    expect(renamed("asset", "source_repo", "self-learn")).toBe("gnosia");
    expect(renamed("asset", "source_repo", "manimkc")).toBe("manimkc");
    expect(renamed("asset", "title", "self-learn")).toBe("self-learn");
  });
});
