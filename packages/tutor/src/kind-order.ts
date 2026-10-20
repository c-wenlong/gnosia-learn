/**
 * The library's kind taxonomy, moved verbatim out of
 * `apps/web/src/lib/library.ts` so the asset reads this package shares with
 * the sidecar sort and filter the same way the library page does.
 */

/**
 * Kinds that exist only to describe another asset and never get a card of
 * their own: a video's transcript, captions, chapters, poster and PDF, and a
 * diagram's `.tldr` source. The rail chips and the grid filter these out; the
 * detail page still lists them under Files. An unknown kind is NOT a
 * companion — that is the safe default, since a new kind must be opted out of
 * being silently filtered out by a list nobody remembered to update.
 */
export const COMPANION_KINDS: ReadonlySet<string> = new Set([
  "transcript",
  "captions",
  "chapters",
  "diagram_source",
  // A video's stored still, made by `catalog asset upload`: shown on its
  // video's card, never as a card of its own.
  "poster",
  // A video's document, made with the poster: opened from its video's PDF
  // button or its Files row, not browsed for as a card.
  "pdf",
]);

export function isCompanionKind(kind: string): boolean {
  return COMPANION_KINDS.has(kind);
}

/**
 * The order the sections run in, most worth looking at first.
 *
 * Not alphabetical, which is what `asset.kind` ordering gives and which puts
 * `captions` and `chapters` above `video`. The rank is effort and standalone
 * value: a narrated render, then a drawn diagram, then a written note, then
 * a session log, then a bookmark. A kind not named here sorts after all of
 * them, by name, so an unknown kind is last rather than accidentally first.
 */
const KIND_ORDER = ["video", "diagram_svg", "note", "session", "link"];

export function kindRank(kind: string): number {
  const at = KIND_ORDER.indexOf(kind);
  return at === -1 ? KIND_ORDER.length : at;
}

/** Kind then id, the tiebreak matching what the catalog's own queries return. */
export function compareByKindThenId(
  a: { kind: string; id: string },
  b: { kind: string; id: string },
): number {
  const rank = kindRank(a.kind) - kindRank(b.kind);
  if (rank !== 0) return rank;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
