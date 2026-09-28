import path from "node:path";

import { parse } from "yaml";

import type { CatalogDatabase } from "../db";
import { parseFrontmatter } from "../index/frontmatter";
import { ExportError, renderType } from "./export";
import { type ExportFile, type ExportType, readTypeFiles, sha256 } from "./layout";
import { noteParityForm } from "./notes";
import { canonicalJson } from "./snapshot";

/**
 * `catalog parity`: is what the database holds the same as what a directory
 * holds, entity by entity (docs/CONTENT-MIGRATION.md 0.5)?
 *
 * The database side is the export, rendered in memory by the same code
 * `catalog export` writes with, so parity against an export directory and
 * parity against the working tree ask one question. Both sides are cut into
 * entities and each entity is hashed over a canonical form:
 *
 * - YAML is parsed and serialised as sorted-key JSON, so a comment, a quote
 *   style or a blank line is not a difference, and a reordered list is. The
 *   topics and tags files are cut one entry per entity, which would lose the
 *   order between entries, so each also yields `<file> (order)`, the list
 *   of keys as written;
 * - a session log has its frontmatter parsed (the knowledge base's own
 *   dialect, the one `catalog index` reads) and its body compared byte for
 *   byte; a concept note is compared as the fields its row holds and its body
 *   byte for byte (`noteParityForm`), since a row keeps a note's frontmatter
 *   values but not their layout;
 * - a `.tldr` is parsed as JSON;
 * - anything else is its bytes.
 *
 * The result lists every entity that is missing from one side or differs,
 * with the first field where it differs, and counts per type so a whole
 * course going quiet cannot hide inside a clean-looking run.
 */

export interface ParityMismatch {
  type: ExportType;
  /** `topic <slug>`, `course <file>`, a file path: what to look at. */
  id: string;
  kind: "missing" | "extra" | "changed" | "unreadable";
  /** Where they first differ, or why a side could not be read. */
  detail: string;
}

export interface TypeParity {
  type: ExportType;
  /** Entities the database renders, and entities the directory holds. */
  expected: number;
  actual: number;
  /** Sub-counts per side, such as modules or aliases, where they are worth seeing. */
  counts: { expected: Record<string, number>; actual: Record<string, number> };
  /** Files byte-for-byte identical, out of the files the database renders. */
  identicalFiles: number;
  files: number;
  mismatches: ParityMismatch[];
  /** The database could not render the type at all, and why. */
  error: string | null;
}

export interface ParityResult {
  dir: string;
  types: TypeParity[];
  mismatches: number;
  clean: boolean;
}

interface Entity {
  hash: string;
  value: unknown;
}

interface Cut {
  entities: Map<string, Entity>;
  /** The key order of each file cut one entry per entity, compared apart from the entities so counts stay counts of entries. */
  orders: Map<string, unknown[]>;
  counts: Record<string, number>;
  problems: ParityMismatch[];
}

function entity(value: unknown): Entity {
  return { hash: sha256(canonicalJson(value)), value };
}

/**
 * `read`: files already read from `dir`, by type, to compare instead of
 * reading them again. `catalog flip` passes the bytes it then hashes, so the
 * hash it records is of exactly what passed.
 */
export async function parity(
  db: CatalogDatabase,
  dir: string,
  types: readonly ExportType[],
  read: Partial<Record<ExportType, ExportFile[]>> = {},
): Promise<ParityResult> {
  const results: TypeParity[] = [];
  for (const type of types) {
    const actualFiles = read[type] ?? (await readTypeFiles(dir, type));
    let expectedFiles: ExportFile[];
    try {
      expectedFiles = await renderType(db, type);
    } catch (error) {
      if (!(error instanceof ExportError)) throw error;
      const actual = cut(type, actualFiles);
      results.push({
        type,
        expected: 0,
        actual: actual.entities.size,
        counts: { expected: {}, actual: actual.counts },
        identicalFiles: 0,
        files: 0,
        mismatches: [],
        error: error.message,
      });
      continue;
    }
    results.push(compare(type, expectedFiles, actualFiles));
  }
  const mismatches = results.reduce((a, r) => a + r.mismatches.length + (r.error === null ? 0 : 1), 0);
  return { dir: path.resolve(dir), types: results, mismatches, clean: mismatches === 0 };
}

/** One type, both sides already in memory. Exported for the tests. */
export function compare(type: ExportType, expectedFiles: readonly ExportFile[], actualFiles: readonly ExportFile[]): TypeParity {
  const expected = cut(type, expectedFiles);
  const actual = cut(type, actualFiles);
  const mismatches: ParityMismatch[] = [...expected.problems.map((p) => ({ ...p, detail: `database: ${p.detail}` })), ...actual.problems];

  for (const [id, want] of expected.entities) {
    const got = actual.entities.get(id);
    if (got === undefined) {
      mismatches.push({ type, id, kind: "missing", detail: "in the database, not in the directory" });
    } else if (got.hash !== want.hash) {
      mismatches.push({ type, id, kind: "changed", detail: firstDifference(want.value, got.value) });
    }
  }
  for (const id of actual.entities.keys()) {
    if (!expected.entities.has(id)) {
      mismatches.push({ type, id, kind: "extra", detail: "in the directory, not in the database" });
    }
  }
  // Only where both sides hold the file: a missing file is already a missing
  // entity per entry, and its order adds nothing to that.
  for (const [id, want] of expected.orders) {
    const got = actual.orders.get(id);
    if (got === undefined || canonicalJson(got) === canonicalJson(want)) continue;
    mismatches.push({ type, id, kind: "changed", detail: firstOrderDifference(want, got) });
  }

  const byPath = new Map(actualFiles.map((file) => [file.path, file.bytes]));
  const identicalFiles = expectedFiles.filter((file) => byPath.get(file.path)?.equals(file.bytes) ?? false).length;
  return {
    type,
    expected: expected.entities.size,
    actual: actual.entities.size,
    counts: { expected: expected.counts, actual: actual.counts },
    identicalFiles,
    files: expectedFiles.length,
    mismatches: mismatches.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    error: null,
  };
}

/** Cut one side's files into entities, each with its canonical hash. */
function cut(type: ExportType, files: readonly ExportFile[]): Cut {
  const out: Cut = { entities: new Map(), orders: new Map(), counts: {}, problems: [] };
  const add = (id: string, value: unknown) => {
    if (out.entities.has(id)) {
      out.problems.push({ type, id, kind: "unreadable", detail: "appears twice" });
      return;
    }
    out.entities.set(id, entity(value));
  };
  const count = (key: string, n = 1) => {
    out.counts[key] = (out.counts[key] ?? 0) + n;
  };
  const domains = new Set<string>();

  for (const file of files) {
    const body = file.bytes.toString("utf8");
    try {
      switch (type) {
        case "topics":
        case "tags": {
          const list = type === "topics" ? "topics" : "tags";
          const key = type === "topics" ? "slug" : "id";
          const parsed: unknown = parse(body);
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            add(file.path, parsed);
            break;
          }
          const doc = parsed as Record<string, unknown>;
          const entries = Array.isArray(doc[list]) ? (doc[list] as Record<string, unknown>[]) : [];
          // Anything beside the list is part of the file too, and would be
          // lost by a round trip that only knew about the list.
          const rest: Record<string, unknown> = { ...doc };
          delete rest[list];
          if (Object.keys(rest).length > 0) add(`${file.path} (top level)`, rest);
          // The order is authored too (the vocabulary's domain groups, the
          // home page's chips), and no entry holds it: each topic hashes the
          // same wherever it sits. So the list of keys is compared on its
          // own, and a reorder is a mismatch that names it.
          out.orders.set(`${file.path} (order)`, entries.map((item) => item?.[key] ?? null));
          for (const item of entries) {
            add(`${type === "topics" ? "topic" : "tag"} ${String(item?.[key])}`, item);
            if (type === "topics") {
              countTopic(item, count);
              domains.add(String(item?.["domain"]));
            }
          }
          count(type, entries.length);
          break;
        }
        case "courses": {
          const doc = parse(body) as Record<string, unknown> | null;
          add(`course ${file.path}`, doc);
          countCourse(doc, count);
          break;
        }
        case "concepts": {
          // The fields a row holds and the body byte for byte, not the
          // frontmatter's layout, which a row does not keep (see notes.ts).
          const form = noteParityForm(body, file.path) as { requires: unknown[]; assumes: unknown[] };
          add(file.path, form);
          count("notes");
          count("prerequisites", form.requires.length + form.assumes.length);
          break;
        }
        case "sessions": {
          const { data, body: markdown } = parseFrontmatter(body);
          add(file.path, { frontmatter: data, body: markdown });
          count("logs");
          break;
        }
        case "diagrams": {
          if (file.path.endsWith(".tldr")) {
            add(file.path, JSON.parse(body));
            count("tldr");
          } else {
            add(file.path, { sha256: sha256(file.bytes) });
            count("svg");
          }
          break;
        }
      }
    } catch (error) {
      out.problems.push({ type, id: file.path, kind: "unreadable", detail: (error as Error).message });
    }
  }
  if (type === "topics") out.counts["domains"] = domains.size;
  return out;
}

/** Where two key orders part, e.g. `position 3: database "b", directory "c"`. */
function firstOrderDifference(want: readonly unknown[], got: readonly unknown[]): string {
  for (let i = 0; i < Math.max(want.length, got.length); i += 1) {
    if (canonicalJson(want[i] ?? null) !== canonicalJson(got[i] ?? null)) {
      return `position ${i + 1}: database ${JSON.stringify(want[i] ?? null)}, directory ${JSON.stringify(got[i] ?? null)}`;
    }
  }
  return "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function countTopic(item: Record<string, unknown>, count: (key: string, n?: number) => void): void {
  const maps = (item?.["maps"] ?? {}) as Record<string, unknown>;
  count("aliases", list(item?.["aliases"]).length);
  count("relations", list(item?.["relations"]).length);
  count("manimkc paths", list(maps["manimkc"]).length);
  count("module mappings", list(maps["courses"]).length);
  count("concept mappings", list(maps["concepts"]).length);
}

function countCourse(doc: Record<string, unknown> | null, count: (key: string, n?: number) => void): void {
  count("courses");
  for (const mod of list(doc?.["modules"]) as Record<string, unknown>[]) {
    count("modules");
    for (const item of list(mod?.["topics"]) as Record<string, unknown>[]) {
      count("items");
      count("concept links", list(item?.["concepts"]).length);
    }
    count("links", list(mod?.["resources"]).length);
  }
}

/**
 * The first place two values differ, as a path such as `modules[2].topics[0].title`,
 * with both sides. Enough to find the line; the whole diff is `git diff`'s job.
 */
export function firstDifference(want: unknown, got: unknown, at = ""): string {
  if (canonicalJson(want) === canonicalJson(got)) return "";
  const describe = (value: unknown) => {
    const json = JSON.stringify(value);
    return json === undefined ? "absent" : json.length > 80 ? `${json.slice(0, 77)}...` : json;
  };
  if (Array.isArray(want) && Array.isArray(got)) {
    for (let i = 0; i < Math.max(want.length, got.length); i += 1) {
      const inner = firstDifference(want[i], got[i], `${at}[${i}]`);
      if (inner !== "") return inner;
    }
  } else if (isObject(want) && isObject(got)) {
    for (const key of [...new Set([...Object.keys(want), ...Object.keys(got)])].sort()) {
      const inner = firstDifference(want[key], got[key], at === "" ? key : `${at}.${key}`);
      if (inner !== "") return inner;
    }
  }
  return `${at === "" ? "(whole value)" : at}: database ${describe(want)}, directory ${describe(got)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
