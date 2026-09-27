import type { BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, diagram } from "@self-learn/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { POSTER_PREFIX } from "./asset-upload";
import { markBlobPending } from "./blob";

/**
 * `catalog blob audit`: the store and the `blob_object` table, compared both
 * ways (docs/CONTENT-MIGRATION.md, edge cases 5 and 9).
 *
 * | Finding | What it means | `--fix` |
 * | --- | --- | --- |
 * | `orphan` | An object with no row: an upload whose row write failed after the store took the bytes | deleted once it is a day old, so an upload in flight is never swept |
 * | `missing`, `corrupt` | A `present` row whose object is gone, or whose bytes no longer hash to its key | the row goes back to `pending`, so its asset answers `not-uploaded` until the upload reruns |
 * | `stale-pending` | A `pending` row a day old with no object behind it and no asset or diagram pointing at it | the row is deleted |
 * | `pending` | Any other `pending` row: an upload that has not finished, or one the audit sent back | none; rerun the upload |
 * | `unreferenced` | A `present` row no asset or diagram points at: the old bytes of something re-rendered | none; listed so it can be seen |
 * | `orphan-poster` | A poster asset derived from no video: its video was pruned, or the upload unhooked it from a re-render it could not cut a new poster for | none; the next upload with ffmpeg makes and hooks up a new one |
 *
 * Keys are content addressed, so none of these can point a row at the wrong
 * bytes; they are all a row and an object disagreeing about whether the bytes
 * exist. `head` reads every byte on the `fs` adapter, which is the point: the
 * question is whether the bytes are intact, and the size alone cannot say.
 *
 * Nothing is changed without `--fix`. What `--fix` deletes is only ever an
 * object nothing in the database knows about, or a `pending` row with no bytes
 * and nothing depending on it.
 *
 * **The exit code follows what a reader would see.** A disagreement `--fix`
 * has not settled counts, and so does any `pending` row an asset or a diagram
 * points at, whether it was pending before or `--fix` just sent it back: that
 * asset answers `not-uploaded` until the upload reruns, and an audit that
 * exited 0 over it would be saying everything serves when it does not.
 */

export const AUDIT_GRACE_MS = 24 * 60 * 60 * 1000;

export type AuditKind =
  | "orphan"
  | "missing"
  | "corrupt"
  | "stale-pending"
  | "pending"
  | "unreferenced"
  | "orphan-poster";

export interface AuditFinding {
  kind: AuditKind;
  key: string;
  detail: string;
  /** What `--fix` did about it, when it did anything. */
  fixed?: "deleted" | "marked-pending" | "row-deleted";
}

export interface BlobAuditResult {
  provider: string;
  rows: number;
  objects: number;
  fix: boolean;
  findings: AuditFinding[];
  /**
   * Findings still standing after this run: a disagreement `--fix` did not
   * settle, or a referenced blob that is `pending`, whose asset cannot be
   * served. The exit code is 1 while any remain.
   */
  outstanding: number;
}

/** The kinds that are something wrong, rather than something worth seeing. */
const PROBLEMS: ReadonlySet<AuditKind> = new Set(["orphan", "missing", "corrupt", "stale-pending"]);

export async function auditBlobs(
  db: CatalogDatabase,
  store: BlobStore,
  options: { fix?: boolean; now?: Date } = {},
): Promise<BlobAuditResult> {
  const fix = options.fix ?? false;
  const now = (options.now ?? new Date()).getTime();
  const findings: AuditFinding[] = [];

  const rows = await db.select().from(blobObject);
  const byKey = new Map(rows.map((row) => [row.key, row] as const));

  const referenced = new Set<string>();
  for (const { key } of await db.select({ key: asset.blobKey }).from(asset).where(isNotNull(asset.blobKey))) {
    if (key !== null) referenced.add(key);
  }
  for (const { key } of await db
    .select({ key: diagram.svgBlobKey })
    .from(diagram)
    .where(isNotNull(diagram.svgBlobKey))) {
    if (key !== null) referenced.add(key);
  }

  // 1. Objects the table does not know.
  let objects = 0;
  const listed = new Set<string>();
  for await (const object of store.list("")) {
    objects += 1;
    listed.add(object.key);
    if (byKey.has(object.key)) continue;
    const age = now - object.uploadedAt.getTime();
    const finding: AuditFinding = {
      kind: "orphan",
      key: object.key,
      detail: `${object.bytes} bytes in the store with no blob_object row, uploaded ${object.uploadedAt.toISOString()}`,
    };
    if (fix && age >= AUDIT_GRACE_MS) {
      await store.delete(object.key);
      finding.fixed = "deleted";
    }
    findings.push(finding);
  }

  // 2. Rows, against the store.
  for (const row of rows) {
    if (row.state === "present") {
      const head = listed.has(row.key) ? await store.head(row.key) : null;
      let problem: { kind: AuditKind; detail: string } | null = null;
      if (head === null) problem = { kind: "missing", detail: "present in the table, absent from the store" };
      else if (head.bytes !== row.bytes || (head.sha256 !== undefined && head.sha256 !== row.sha256)) {
        problem = {
          kind: "corrupt",
          detail: `the store holds ${head.bytes} bytes${head.sha256 === undefined ? "" : ` hashing to ${head.sha256.slice(0, 12)}`}, the row says ${row.bytes} and ${row.sha256.slice(0, 12)}`,
        };
      }
      if (problem !== null) {
        const finding: AuditFinding = { kind: problem.kind, key: row.key, detail: problem.detail };
        if (fix) {
          await markBlobPending(db, row.key);
          finding.fixed = "marked-pending";
        }
        findings.push(finding);
      } else if (!referenced.has(row.key)) {
        findings.push({ kind: "unreferenced", key: row.key, detail: "no asset or diagram points at it" });
      }
      continue;
    }

    const age = now - row.updatedAt.getTime();
    const hasObject = listed.has(row.key);
    if (!hasObject && !referenced.has(row.key) && age >= AUDIT_GRACE_MS) {
      const finding: AuditFinding = {
        kind: "stale-pending",
        key: row.key,
        detail: `pending since ${row.updatedAt.toISOString()}, with no object and nothing pointing at it`,
      };
      if (fix) {
        // Guarded twice: the row must still be pending and unreferenced at the
        // moment of the delete, and the foreign key from `asset.blob_key` is
        // RESTRICT, so a row something points at cannot go whatever this says.
        await db
          .delete(blobObject)
          .where(and(eq(blobObject.key, row.key), eq(blobObject.state, "pending")));
        finding.fixed = "row-deleted";
      }
      findings.push(finding);
      continue;
    }
    findings.push({
      kind: "pending",
      key: row.key,
      detail: hasObject
        ? "pending with the object in the store: an upload that did not confirm. Rerun it"
        : referenced.has(row.key)
          ? "pending and pointed at: its asset answers not-uploaded until the upload reruns"
          : "pending with no object yet: an upload in flight, or one to rerun",
    });
  }

  // 3. Posters whose video was pruned: the derivation cascaded away with it.
  const posters = await db
    .select({ id: asset.id, key: asset.blobKey })
    .from(asset)
    .where(and(eq(asset.kind, "poster"), sql`starts_with(${asset.id}, ${POSTER_PREFIX})`));
  const withSource = new Set(
    posters.length === 0
      ? []
      : (
          await db
            .select({ id: assetDerivation.assetId })
            .from(assetDerivation)
            .where(inArray(assetDerivation.assetId, posters.map((p) => p.id)))
        ).map((row) => row.id),
  );
  for (const poster of posters) {
    if (withSource.has(poster.id)) continue;
    findings.push({
      kind: "orphan-poster",
      key: poster.key ?? poster.id,
      detail: `${poster.id}: derived from no video (its video was pruned, or it was unhooked from a re-render)`,
    });
  }

  const outstanding = findings.filter(
    (f) =>
      (PROBLEMS.has(f.kind) && f.fixed === undefined) ||
      (referenced.has(f.key) && (f.kind === "pending" || f.fixed === "marked-pending")),
  ).length;
  return { provider: store.provider, rows: rows.length, objects, fix, findings, outstanding };
}
