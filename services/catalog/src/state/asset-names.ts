import { asset, assetName, ownerScope } from "@gnosia/schema";
import { ASSET_NAME_MAX, cleanAssetName } from "@gnosia/schema/shared";
import { and, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { assetNamesExist, assetsByIds } from "./assets";
import { StateError } from "./errors";
import { ensureLearner } from "./learner";

/**
 * A learner's own names for assets (`asset_name`).
 *
 * The one writer of that table. Every reader of `AssetRef.title` already sees
 * the name, through `assetColumns` in `./assets.ts`; this module is for the
 * screen that changes it, which also needs the title the source gave, to show
 * what "reset" goes back to.
 */

/** One asset's name as a rename field needs it. */
export interface AssetNaming {
  /** What the learner sees: their name, or the source's title. */
  title: string | null;
  /** The learner's name. Null when they gave none. */
  name: string | null;
  /** The title the asset's source gave it (`topic.yml`, the course file, the `.tldr`). */
  original: string | null;
}

/**
 * This learner's naming of one asset, or null when the asset is not one they
 * can read: the same answer for "no such asset" and "another owner's", as
 * every scoped read gives.
 */
export async function readAssetNaming(db: CatalogDatabase, assetId: string, learnerId: string): Promise<AssetNaming | null> {
  // Before 0024 there is nothing to name with, so no rename field is offered.
  if (!(await assetNamesExist(db))) return null;
  if ((await assetsByIds(db, [assetId], ownerScope(learnerId))).length === 0) return null;
  const rows = await db
    .select({ original: asset.title, name: assetName.title })
    .from(asset)
    .leftJoin(assetName, and(eq(assetName.assetId, asset.id), eq(assetName.learnerId, learnerId)))
    .where(eq(asset.id, assetId));
  const row = rows[0];
  if (row === undefined) return null;
  return { title: row.name ?? row.original, name: row.name, original: row.original };
}

/**
 * Name an asset, or clear the name with null or an empty string so the
 * source's title shows again. Stored cleaned (`cleanAssetName`). Refuses a
 * name past `ASSET_NAME_MAX` characters (a `RangeError`) rather than cutting
 * it, and an asset the learner cannot read (a `StateError`), whoever the
 * caller is.
 *
 * A name equal to the source's title is stored as no name: it would read the
 * same today, and would then hide the source's next title for no reason.
 */
export async function writeAssetName(
  db: CatalogDatabase,
  assetId: string,
  name: string | null,
  learnerId: string,
): Promise<AssetNaming> {
  const cleaned = cleanAssetName(name);
  if (cleaned !== null && cleaned.length > ASSET_NAME_MAX) {
    throw new RangeError(`A name is at most ${ASSET_NAME_MAX} characters; this one has ${cleaned.length}.`);
  }
  if (!(await assetNamesExist(db))) {
    throw new StateError("This database predates asset names: run `npm run catalog -- migrate`.");
  }
  const before = await readAssetNaming(db, assetId, learnerId);
  if (before === null) throw new StateError(`No asset "${assetId}" to name.`);

  const where = and(eq(assetName.learnerId, learnerId), eq(assetName.assetId, assetId));
  if (cleaned === null || cleaned === before.original) {
    await db.delete(assetName).where(where);
    return { title: before.original, name: null, original: before.original };
  }
  await ensureLearner(db, learnerId);
  await db
    .insert(assetName)
    .values({ learnerId, assetId, title: cleaned })
    .onConflictDoUpdate({
      target: [assetName.learnerId, assetName.assetId],
      // The database's clock, as the insert's default and every revision's
      // `created_at` use: `listAssets` orders a rename against revisions by
      // time to find the last change, so the two must share one clock.
      set: { title: cleaned, updatedAt: sql`now()` },
    });
  return { title: cleaned, name: cleaned, original: before.original };
}
