import { createHash } from "node:crypto";

import type { RevisionEntityType } from "@self-learn/schema";
import { canonical, canonicalJson, type JsonValue } from "@self-learn/schema/shared";
import { inArray } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { column, contentColumns, ENTITIES } from "./entities";

/**
 * The snapshot a revision stores: the whole entity after the write, with its
 * owned links listed under it, in one canonical form.
 *
 * Canonical means the same content always serialises to the same bytes: keys
 * sorted at every depth, instants as ISO strings, link rows sorted by their own
 * serialisation. That is what lets `snapshot_hash` decide whether an import
 * changed anything, and what makes a diff between two revisions a comparison
 * of two values rather than of two orderings.
 *
 * Built from the database after the write rather than from what the writer
 * handed in, so a default, a trigger or a cascade is in the snapshot exactly
 * as it is in the row.
 */

export { canonical, canonicalJson, type JsonValue };

export interface Snapshot {
  entity: Record<string, JsonValue>;
  links: Record<string, Record<string, JsonValue>[]>;
}

export interface SnapshotRead {
  snapshot: Snapshot;
  hash: string;
  ownerId: string;
  archived: boolean;
}


export function snapshotHash(snapshot: Snapshot): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

/**
 * Postgres caps a statement at 65535 bind parameters; an `in` list of entity
 * ids is one parameter each.
 */
function chunks<T>(items: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Read the current snapshot of each entity named. An id with no row is absent
 * from the result, which is how a caller tells "gone" from "unchanged".
 */
export async function readSnapshots(
  db: CatalogDatabase,
  type: RevisionEntityType,
  ids: readonly string[],
): Promise<Map<string, SnapshotRead>> {
  const spec = ENTITIES[type];
  const out = new Map<string, SnapshotRead>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;

  const entityColumns = contentColumns(spec.table);
  const keyColumn = column(spec.table, spec.key);
  const entities = new Map<string, Record<string, unknown>>();
  for (const part of chunks(unique)) {
    const rows = (await db.select().from(spec.table).where(inArray(keyColumn, part))) as Record<
      string,
      unknown
    >[];
    for (const row of rows) entities.set(String(row[spec.key]), row);
  }

  const links = new Map<string, Record<string, Record<string, JsonValue>[]>>();
  for (const id of entities.keys()) {
    links.set(id, Object.fromEntries(spec.links.map((l) => [l.name, []])));
  }
  for (const linkSpec of spec.links) {
    const linkColumns = contentColumns(linkSpec.table, linkSpec.parent);
    const parentColumn = column(linkSpec.table, linkSpec.parent);
    for (const part of chunks([...entities.keys()])) {
      const rows = (await db
        .select()
        .from(linkSpec.table)
        .where(inArray(parentColumn, part))) as Record<string, unknown>[];
      for (const row of rows) {
        const into = links.get(String(row[linkSpec.parent]))?.[linkSpec.name];
        if (into === undefined) continue;
        into.push(project(row, linkColumns));
      }
    }
  }

  for (const [id, row] of entities) {
    const entity = project(row, entityColumns);
    const owned = links.get(id) ?? {};
    for (const name of Object.keys(owned)) {
      owned[name] = sortRows(owned[name] ?? []);
    }
    const snapshot: Snapshot = { entity, links: owned };
    out.set(id, {
      snapshot,
      hash: snapshotHash(snapshot),
      ownerId: String(row["ownerId"] ?? "local"),
      archived: row["archivedAt"] !== null && row["archivedAt"] !== undefined,
    });
  }
  return out;
}

/** A row keyed by SQL column name, holding only content columns, in canonical form. */
function project(row: Record<string, unknown>, columns: [string, string][]): Record<string, JsonValue> {
  const out: Record<string, unknown> = {};
  for (const [key, name] of columns) out[name] = row[key] ?? null;
  return canonical(out) as Record<string, JsonValue>;
}

function sortRows(rows: Record<string, JsonValue>[]): Record<string, JsonValue>[] {
  return rows
    .map((row) => [JSON.stringify(row), row] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => row);
}
