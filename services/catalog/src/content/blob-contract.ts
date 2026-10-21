import { BLOB_KEY_PATTERN, BLOB_STORED_KINDS } from "@gnosia/schema";
import { sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";

/**
 * Phase 2's contract (docs/CONTENT-MIGRATION.md, "Contract migration";
 * migration 0013): every asset of a stored kind names its blob, and every
 * blob key is one `@gnosia/blob` makes. One pair of queries, read by three
 * places so they cannot disagree about the distance: the migration's own
 * guard (the same predicates, in SQL), `catalog doctor`, and `catalog
 * migrate`, which holds the migration back while either list is not empty.
 */

/** The migration that adds the contract's constraints. */
export const BLOB_CONTRACT_MIGRATION = "0013_asset_blob_contract";

export interface BlobContractDistance {
  /** Assets of a stored kind with no `blob_key`, by id. */
  unstored: { id: string; kind: string }[];
  /** `blob_object` keys the blob package would not make. */
  unkeyed: string[];
}

/** What stands between this database and the contract. Needs 0010's tables. */
export async function blobContractDistance(db: CatalogDatabase): Promise<BlobContractDistance> {
  const kinds = sql.join(
    BLOB_STORED_KINDS.map((kind) => sql`${kind}`),
    sql`, `,
  );
  const unstored = await db.execute<{ id: string; kind: string }>(
    sql`select id, kind from asset where kind in (${kinds}) and blob_key is null order by id collate binary`,
  );
  const unkeyed = await db.execute<{ key: string }>(
    sql`select key from blob_object where not (key regexp ${BLOB_KEY_PATTERN}) order by key collate binary`,
  );
  return { unstored: unstored.rows, unkeyed: unkeyed.rows.map((row) => row.key) };
}

/**
 * Whether the contract is in force here: the constraint 0013 adds exists.
 * From then on a stored-kind row cannot be written without its blob, so the
 * manimkc import stores each file before the row that names it.
 */
export async function blobContractInForce(db: CatalogDatabase): Promise<boolean> {
  // `pg_constraint` was the catalog to ask; on SQLite a named CHECK is text
  // in the table's DDL in `sqlite_master`, so the check is "its name is in
  // the CREATE TABLE".
  const { rows } = await db.execute<{ present: number }>(sql`
    select exists (
      select 1 from sqlite_master
      where type = 'table' and name = 'asset' and sql like '%asset_stored_blob_check%'
    ) as present
  `);
  return rows[0]?.present === 1;
}

/** One sentence for a held migration, or null when nothing stands in its way. */
export function describeDistance(distance: BlobContractDistance): string | null {
  const parts: string[] = [];
  if (distance.unstored.length > 0) {
    parts.push(
      `${distance.unstored.length} asset(s) of a stored kind have no blob ` +
        `(run \`catalog import\`, then \`catalog asset upload --source manimkc\`)`,
    );
  }
  if (distance.unkeyed.length > 0) {
    parts.push(`${distance.unkeyed.length} blob key(s) are not keys @gnosia/blob makes`);
  }
  return parts.length === 0 ? null : `${parts.join("; ")}. \`catalog doctor\` lists them.`;
}
