import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { CONTENT_TABLES, tables } from "@self-learn/schema";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "../src/env";

/**
 * Nothing writes a content table outside the seam (docs/CONTENT-MIGRATION.md
 * 0.3): `services/catalog/src/content/` for authored writes and
 * `services/catalog/src/index/` for imports, both of which append revisions.
 *
 * The guard triggers enforce the same rule in the database once a type flips;
 * this catches a new writer at review time, long before then, and names the
 * file and the line.
 *
 * It reads source text, so it looks for the two shapes a write takes here: a
 * drizzle call on a table object (`.insert(topic)`), and raw SQL
 * (`insert into topic`, `update topic set`, `delete from topic`).
 */

/** Where content writes are allowed. */
const SEAM = ["services/catalog/src/content/", "services/catalog/src/index/"];

/**
 * Writers outside the seam that exist today, each with the reason it is
 * allowed and the change that removes it. An entry here is a debt, not a
 * permission.
 */
const ALLOWED: Record<string, string> = {};

/**
 * `blob_object` and `session_log_entry` are content but carry no revisions
 * (D5, D20): the upload command writes a pending row before any revision
 * exists, and a log entry is its own history. They are left to their tracks.
 */
const NOT_REVISIONED = new Set(["blobObject", "sessionLogEntry"]);

const guarded = CONTENT_TABLES.filter((name) => !NOT_REVISIONED.has(name));
const identifiers = guarded.join("|");
const sqlNames = guarded.map((name) => getTableName(tables[name])).join("|");

const PATTERNS = [
  // The table may be reached through a namespace (`schema.topic`,
  // `tables.curriculumItem`), which is as much a write as the bare name.
  new RegExp(`\\.(insert|update|delete)\\(\\s*(?:\\w+\\.)?(${identifiers})\\s*\\)`, "g"),
  new RegExp(`\\b(insert\\s+into|delete\\s+from)\\s+"?(${sqlNames})"?\\b`, "gi"),
  new RegExp(`\\bupdate\\s+(only\\s+)?"?(${sqlNames})"?\\s+set\\b`, "gi"),
];

const ROOTS = ["apps", "packages", "scripts", "services"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage", "test", "drizzle"]);
const EXTENSIONS = /\.(ts|tsx|mts|mjs|js)$/;

async function* sources(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* sources(path.join(dir, entry.name));
    } else if (EXTENSIONS.test(entry.name) && !/\.test\.[a-z]+$/.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

describe("content writes stay inside the seam", () => {
  it("finds no insert, update or delete on a content table anywhere else", async () => {
    const found: string[] = [];
    const allowedSeen = new Set<string>();
    for (const root of ROOTS) {
      for await (const file of sources(path.join(REPO_ROOT, root))) {
        const relative = path.relative(REPO_ROOT, file).split(path.sep).join("/");
        if (SEAM.some((prefix) => relative.startsWith(prefix))) continue;
        const text = await readFile(file, "utf8");
        const lines = text.split("\n");
        for (const pattern of PATTERNS) {
          for (const match of text.matchAll(pattern)) {
            if (Object.hasOwn(ALLOWED, relative)) {
              allowedSeen.add(relative);
              continue;
            }
            const line = text.slice(0, match.index).split("\n").length;
            found.push(`${relative}:${line}: ${lines[line - 1]?.trim()}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
    // An allowance that no longer matches anything is stale and should go.
    expect([...allowedSeen].sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it("would catch the shapes it looks for", () => {
    const hits = (text: string) => PATTERNS.some((p) => new RegExp(p.source, p.flags).test(text));
    expect(hits("await tx.insert(topic).values(row)")).toBe(true);
    expect(hits("db.update( curriculumItem ).set({})")).toBe(true);
    expect(hits('sql`insert into "concept_curriculum_item" (a) values (1)`')).toBe(true);
    expect(hits("sql`update asset set title = 'x'`")).toBe(true);
    expect(hits("sql`DELETE FROM topic_relation`")).toBe(true);
    expect(hits("await tx.insert(schema.topic).values(row)")).toBe(true);
    expect(hits("db.delete(tables.conceptPrerequisite)")).toBe(true);
    expect(hits("await tx.insert(progress).values(row)")).toBe(false);
    expect(hits("await tx.insert(schema.progress).values(row)")).toBe(false);
    expect(hits("we update topic rows when the file changes")).toBe(false);
  });
});
