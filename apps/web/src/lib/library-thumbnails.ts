import type { AssetWithTopics } from "@gnosia/catalog/state";

import { assetFileHref, assetPosterHref, assetStatusHref } from "@/lib/library";

/*
 * What the grid draws for each row's picture, decided from what the server
 * found stored (`readAssetAccess` in `@/lib/asset-library`). Pure, apart from
 * the server-only reader (S6-16 of the library audit), so a page and a test
 * both call it without the database.
 */

/**
 * Which rows' bytes the asset routes can hand over, decided per row.
 *
 * Since phase 2 there is nothing deployment-wide to say: the server reads no
 * files off its disk (the `ASSET_FILES_ENABLED` switch and the manimkc data
 * root it used to check are gone), so an asset is served exactly when its
 * bytes are a `present` blob or a row the database owns, which is what
 * `resolveAsset` decides for the route.
 */
export interface AssetAccess {
  served: ReadonlySet<string>;
  /**
   * The videos with a stored poster. Kept apart from `served`: a video whose
   * bytes are in the store plays, and its card still has no picture unless a
   * poster was stored too.
   */
  posters: ReadonlySet<string>;
}

/**
 * The rows among these that name bytes nobody can serve yet: a file-shaped
 * path (a link has none) and no stored copy. For the grid's one notice, which
 * says how many and what to run, instead of a card per row explaining the
 * same thing.
 */
export function unservedRows<T extends Pick<AssetWithTopics, "id" | "path">>(
  rows: readonly T[],
  access: AssetAccess,
): T[] {
  return rows.filter((row) => row.path !== null && !access.served.has(row.id));
}

/**
 * What an `<img>` should point at for one row, or null for the placeholder.
 *
 * Shared by the grid and the related strip on the detail page, because two
 * copies of this rule would drift and the symptom is a card that shows a
 * picture in one place and a grey box in the other.
 *
 * A diagram is already an image, so it is served as itself, and so is a
 * stored poster in the companion rail. A video is not, and an `<img>` pointed
 * at an `.mp4` decodes nothing; `/poster` serves the still the upload stored
 * for it. Everything else has no picture to show and says so.
 *
 * Each depends on the route being able to answer for that row, which `access`
 * says per row. When it cannot, the placeholder is the correct output, not a
 * broken image.
 */
export function thumbnailFor(row: Pick<AssetWithTopics, "id" | "kind">, access: AssetAccess): string | null {
  // A video's picture is its stored poster: the video's own bytes being
  // stored says nothing about whether a poster was.
  if (row.kind === "video") return access.posters.has(row.id) ? assetPosterHref(row.id) : null;
  if (!access.served.has(row.id)) return null;
  if (row.kind === "diagram_svg" || row.kind === "poster") return assetFileHref(row.id);
  return null;
}

/**
 * Where a card asks why its thumbnail failed, beside `thumbnailFor` so the two
 * cannot disagree about which route the picture came from: the file route for
 * a diagram, the poster route for a video.
 */
export function thumbnailStatusFor(row: Pick<AssetWithTopics, "id" | "kind">, access: AssetAccess): string | undefined {
  if (thumbnailFor(row, access) === null) return undefined;
  return assetStatusHref(row.id, row.kind === "video" ? "poster" : "file");
}
