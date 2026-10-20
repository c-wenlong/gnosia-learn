import path from "node:path";

import type { BlobStore } from "@self-learn/blob";
import { asset, assetDerivation, blobObject, collection, diagram, video } from "@self-learn/schema";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { sqlstate } from "../state/errors";
import { PDF_PREFIX, POSTER_PREFIX } from "./asset-upload";
import { markBlobPending, ownerCapLock, ownerUsage, type OwnerUsage } from "./blob";
import {
  BlobOwnerError,
  type BlobRootOwner,
  claimRoot,
  ownerIdentity,
  describeOwner,
  OWNER_FILE,
  readOwner,
  removePartial,
  sameOwner,
  stalePartials,
} from "./blob-owner";

import { inTransaction } from "../db";
/**
 * `catalog blob audit`: the store and the `blob_object` table, compared both
 * ways (docs/CONTENT-MIGRATION.md, edge cases 5 and 9).
 *
 * | Finding | What it means | `--fix` |
 * | --- | --- | --- |
 * | `orphan` | An object with no row: an upload whose row write failed after the store took the bytes | deleted once it is a day old, so an upload in flight is never swept |
 * | `missing`, `corrupt` | A `present` row whose object is gone, or whose bytes no longer hash to its key | the row goes back to `pending`, so its asset answers `not-uploaded` until the upload reruns |
 * | `stale-pending` | A `pending` row a day old with no object behind it and no asset, diagram or course cover pointing at it | the row is deleted |
 * | `pending` | Any other `pending` row: an upload that has not finished, or one the audit sent back | none; rerun the upload |
 * | `unreferenced` | A `present` row no asset, diagram, studio video or course cover points at: the old bytes of something re-rendered, or the blobs of a `video put` whose transaction was refused | none; listed so it can be seen, and still counted toward the owner's byte cap |
 * | `orphan-poster` | A poster or PDF asset derived from no video: its video was pruned, or the upload unhooked it from a re-render it could not make a new one for | none; the next upload with ffmpeg makes and hooks up a new one |
 * | `partial` | A staged write under `<root>/.tmp` a day old: an upload a crash stopped before its rename | deleted |
 *
 * **`--fix` acts only on a root that names this database** (`<root>/.owner`,
 * `blob-owner.ts`). "No row here" means "orphan" only when this database is
 * the one writing the store; a root another database claimed is audited and
 * reported, and `--fix` refuses before changing anything. A root nobody has
 * claimed is claimed by the audit.
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
  | "orphan-poster"
  | "partial";

export interface AuditFinding {
  kind: AuditKind;
  key: string;
  detail: string;
  /** What `--fix` did about it, when it did anything. */
  fixed?: "deleted" | "marked-pending" | "row-deleted";
}

export interface BlobAuditResult {
  provider: string;
  /** The database the root names in its `.owner`, when the audit was given the root; null when it could not be read. */
  owner: BlobRootOwner | null;
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
  /**
   * What each owner (a learner id, the key's prefix; not the store's `.owner`
   * above, which names a database) holds after this run: objects, bytes, and
   * uploads in the last 24 hours, the two numbers the per-owner caps measure
   * (phase 4 of docs/CONTENT-MIGRATION.md).
   */
  byOwner: OwnerUsage[];
}

/** The kinds that are something wrong, rather than something worth seeing. */
const PROBLEMS: ReadonlySet<AuditKind> = new Set(["orphan", "missing", "corrupt", "stale-pending", "partial"]);

export async function auditBlobs(
  db: CatalogDatabase,
  store: BlobStore,
  options: {
    fix?: boolean;
    now?: Date;
    /** The `fs` store's directory: its `.owner` is checked and its `.tmp` swept. */
    root?: string;
  } = {},
): Promise<BlobAuditResult> {
  const fix = options.fix ?? false;
  const now = (options.now ?? new Date()).getTime();
  const cutoff = new Date(now - AUDIT_GRACE_MS);
  const findings: AuditFinding[] = [];

  // Whose store this is, settled before anything is read or changed.
  let owner: BlobRootOwner | null = null;
  if (options.root !== undefined) {
    const self = await ownerIdentity(db);
    const claimed = fix ? await claimRoot(options.root, self) : null;
    owner = claimed ?? (await readOwner(options.root));
    if (claimed !== null && !sameOwner(claimed, self)) {
      throw new BlobOwnerError(
        `${options.root} belongs to ${describeOwner(claimed)} (its ${OWNER_FILE}), and this is ` +
          `${describeOwner(self)}. Every object that database wrote has no row here, so --fix would delete ` +
          `them as orphans; nothing was changed. Audit it from that database, or give this one its own store ` +
          `with SELF_LEARN_HOME. If the marker is wrong, delete ${OWNER_FILE} and run --fix again.`,
      );
    }
  }

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
  // A studio video's cut is named by its row as well as its asset (0015), so
  // a row that holds a key is enough for the key to be in use. Asked only
  // where the table exists: the audit runs on a database behind the journal.
  const { rows: hasVideo } = await db.execute<{ present: boolean }>(sql`select exists(select 1 from sqlite_master where type = 'table' and name = 'video') as present`);
  if (hasVideo[0]?.present === true) {
    for (const { key } of await db.select({ key: video.mp4BlobKey }).from(video).where(isNotNull(video.mp4BlobKey))) {
      if (key !== null) referenced.add(key);
    }
  }
  // A course's cover photo (0016). Left out, every cover would read as
  // unreferenced, and a pending one as safe to sweep. A database from before
  // 0016 has no column, and so no cover to count.
  for (const key of await coverKeys(db)) referenced.add(key);

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
        findings.push({ kind: "unreferenced", key: row.key, detail: "no asset, diagram or course points at it" });
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
        // Guarded three times: the row must still be pending and still as old
        // at the moment of the delete, and the foreign key from
        // `asset.blob_key` is RESTRICT, so a row something points at cannot
        // go whatever this says. The age is checked again because an upload
        // of the same key starting now writes the row back to pending with a
        // fresh `updated_at` before it moves a byte; deleting that row would
        // leave the upload confirming a row that is gone.
        //
        // And under the owner's cap lock (`ownerCapLock`), the one an upload
        // measures under: an upload of this key that has already asked whether
        // the row exists finishes first, so the row it counted on is not
        // deleted before its own pending write, which would let a new object
        // past both caps unmeasured. Its write refreshes `updated_at`, and the
        // age guard then keeps the row.
        const deleted = await inTransaction(db, async (tx) => {
          // `begin immediate` serialises this delete with every other writer;
          // the advisory lock it replaced serialised only the ones that asked.
          void ownerCapLock(row.ownerId);
          return tx
            .delete(blobObject)
            .where(and(eq(blobObject.key, row.key), eq(blobObject.state, "pending"), lt(blobObject.updatedAt, cutoff)))
            .returning({ key: blobObject.key });
        });
        if (deleted.length > 0) finding.fixed = "row-deleted";
        else finding.detail += "; an upload took it up again while the audit ran, so it was kept";
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

  // 3. Derived assets (posters, PDFs) whose video was pruned: the
  // derivation cascaded away with it.
  const derived = await db
    .select({ id: asset.id, key: asset.blobKey })
    .from(asset)
    .where(
      and(
        inArray(asset.kind, ["poster", "pdf"]),
        sql`instr(${asset.id}, ${POSTER_PREFIX}) = 1 or instr(${asset.id}, ${PDF_PREFIX}) = 1`,
      ),
    );
  const withSource = new Set(
    derived.length === 0
      ? []
      : (
          await db
            .select({ id: assetDerivation.assetId })
            .from(assetDerivation)
            .where(inArray(assetDerivation.assetId, derived.map((p) => p.id)))
        ).map((row) => row.id),
  );
  for (const entry of derived) {
    if (withSource.has(entry.id)) continue;
    findings.push({
      kind: "orphan-poster",
      key: entry.key ?? entry.id,
      detail: `${entry.id}: derived from no video (its video was pruned, or it was unhooked from a re-render)`,
    });
  }

  // 4. Staged writes a crash left behind.
  if (options.root !== undefined) {
    for (const staged of await stalePartials(options.root, cutoff)) {
      const finding: AuditFinding = {
        kind: "partial",
        key: path.relative(options.root, staged.file),
        detail: `${staged.bytes} bytes of an upload that never finished, last written ${staged.modified.toISOString()}`,
      };
      if (fix) {
        if (await removePartial(staged.file, cutoff)) finding.fixed = "deleted";
        else finding.detail += "; written to again since it was listed, so it was kept";
      }
      findings.push(finding);
    }
  }

  const outstanding = findings.filter(
    (f) =>
      (PROBLEMS.has(f.kind) && f.fixed === undefined) ||
      (referenced.has(f.key) && (f.kind === "pending" || f.fixed === "marked-pending")),
  ).length;
  const byOwner = await ownerUsage(db, { now: new Date(now) });
  return { provider: store.provider, owner, rows: rows.length, objects, fix, findings, outstanding, byOwner };
}

/** Every course cover's key, or none on a database from before 0016 (undefined_column). */
async function coverKeys(db: CatalogDatabase): Promise<string[]> {
  try {
    const rows = await db
      .select({ key: collection.coverBlobKey })
      .from(collection)
      .where(isNotNull(collection.coverBlobKey));
    return rows.map((row) => row.key).filter((key): key is string => key !== null);
  } catch (error) {
    if (sqlstate(error) === "42703") return [];
    throw error;
  }
}
