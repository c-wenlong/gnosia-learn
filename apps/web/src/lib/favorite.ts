/**
 * A favourite asset: the star on a library page.
 *
 * Stored as one `preference` row per asset, `favorite:<asset id>`, holding
 * when it was starred, the way `playbackKey` stores a video's resume point.
 * Unstarring clears the row rather than writing `false`, so "never starred"
 * and "unstarred" read the same and the table holds only the stars.
 */

export interface Favorite {
  /** When it was starred, ISO 8601. */
  at: string;
}

export function favoriteKey(assetId: string): string {
  return `favorite:${assetId}`;
}

/** What the store held, or null for no star (or a row this code did not write). */
export function parseFavorite(value: unknown): Favorite | null {
  if (value === null || typeof value !== "object") return null;
  const at = (value as { at?: unknown }).at;
  return typeof at === "string" && !Number.isNaN(Date.parse(at)) ? { at } : null;
}
