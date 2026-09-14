import { assetKindLabel } from "@/components/asset-meta";

/**
 * What the library shows first, and why it is not everything.
 *
 * The catalog holds 206 asset rows. Counted by kind they are: link 68, note 32,
 * video 30, captions 23, transcript 23, chapters 23, session 3, diagram_svg 2,
 * diagram_source 2.
 *
 * Rendering 206 equal cards would be the wrong page. Sixty-nine of those rows
 * are a `.vtt`, a `.transcript.json` and a `.chapters.json` written beside each
 * of the thirty videos, and two more are the `.tldr` canvas each diagram was
 * exported from. They are real rows and the catalog is right to hold them —
 * `asset_derivation` is exactly the table that says which video or which canvas
 * each one belongs to — but none of them is a thing anybody came here to open.
 * Shown flat and sorted by kind, they would also sort *before* the videos, so
 * the first two screens of the library would be caption files.
 *
 * So the default view is everything that stands on its own, and the companion
 * files are one click away rather than gone:
 *
 * ```
 *   Everything (135)   video 30 · note 32 · session 3 · diagram_svg 2 · link 68
 *   Companions  (71)   transcript 23 · captions 23 · chapters 23 · diagram_source 2
 * ```
 *
 * **Reachable three ways, so nothing is hidden.** Every companion kind has its
 * own chip with its true count, `?kind=transcript` is a linkable view of them,
 * and each one is listed on the detail page of the video or drawing it belongs
 * to. The library also says out loud how many rows it is not showing, because a
 * page that quietly displays 135 of 206 is a page that is wrong about the size
 * of the catalog.
 *
 * **Membership is by kind, not by `asset_derivation`, and that is deliberate.**
 * The obvious rule — "hide anything that is derived from something else" — is
 * wrong for exactly the rows the library exists to show. A video is the
 * *source* of its sidecars, so it survives that rule; a diagram SVG is
 * *derived* from its `.tldr`, so it does not, and the two drawings would vanish
 * from a gallery whose whole point is pictures. The derivation table answers
 * "which video is this transcript for", which is a different question and the
 * one it is used for on the detail page.
 *
 * Pure: no database, no React, no filesystem. `@/components/asset-meta`
 * supplies the label vocabulary so a chip and a card cannot call the same kind
 * two different things — and it is that module rather than `AssetCard.tsx`
 * because a `"use client"` module's exports are client references, so a server
 * component calling one throws at request time having built without a word.
 */

/**
 * Kinds that exist to accompany another asset rather than to be opened.
 *
 * A kind absent from this set is shown by default, which is the safe direction:
 * a new indexer's rows turn up in the library on their first index run instead
 * of being silently filtered out by a list nobody remembered to update.
 */
export const COMPANION_KINDS: ReadonlySet<string> = new Set([
  "transcript",
  "captions",
  "chapters",
  "diagram_source",
]);

export function isCompanionKind(kind: string): boolean {
  return COMPANION_KINDS.has(kind);
}

/**
 * The order the sections run in, most worth looking at first.
 *
 * Not alphabetical, which is what `asset.kind` ordering gives and which puts
 * `captions` and `chapters` above `video`. The rank is effort and standalone
 * value: a narrated render, then a drawn diagram, then a written note, then a
 * session log, then a bookmark. A kind not named here sorts after all of them,
 * by name, so an unknown kind is last rather than accidentally first.
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

/** One chip in the kind rail. */
export interface KindFacet {
  kind: string;
  label: string;
  count: number;
}

export interface KindFacets {
  /** Chips in the main rail, in `KIND_ORDER`. */
  primary: KindFacet[];
  /** Chips in the companion rail, same ordering rule. */
  companion: KindFacet[];
  /** How many rows the default view shows. */
  standalone: number;
  /** How many rows the catalog holds, the number the page is honest about. */
  total: number;
}

/**
 * Turn `assetCounts()` into the two rails.
 *
 * A kind with no rows is simply absent from the input, which is the contract
 * `assetCounts` keeps, so a chip never offers a filter that would return
 * nothing. Counts are summed here rather than asked for separately: the same
 * grouped scan already answers both totals, and two queries could disagree.
 */
export function kindFacets(counts: readonly { kind: string; count: number }[]): KindFacets {
  const primary: KindFacet[] = [];
  const companion: KindFacet[] = [];
  let standalone = 0;
  let total = 0;

  for (const { kind, count } of counts) {
    total += count;
    const facet = { kind, label: assetKindLabel(kind), count };
    if (isCompanionKind(kind)) {
      companion.push(facet);
    } else {
      standalone += count;
      primary.push(facet);
    }
  }

  const byRank = (a: KindFacet, b: KindFacet) =>
    kindRank(a.kind) - kindRank(b.kind) || a.label.localeCompare(b.label);
  primary.sort(byRank);
  companion.sort(byRank);
  return { primary, companion, standalone, total };
}

/**
 * What to call a count of one kind: `30 videos`, `1 session log`, `23 captions`.
 *
 * The rule is deliberately small — lowercase the label a chip already shows,
 * and add an `s` unless the count is one or the label already ends in one. That
 * last clause is what keeps `Captions` and `Chapters` from becoming
 * `captionss`, and it is why this is a function rather than a template string
 * at the call site.
 *
 * It exists because the results line read "0 assets filed under
 * inverse-kinematics" while eight assets were filed under it and only the kind
 * filter had excluded them. Naming the kind is the difference between a count
 * that explains itself and one that contradicts the chip above it.
 */
export function kindNoun(label: string, count: number): string {
  const word = label.toLowerCase();
  if (count === 1 || word.endsWith("s")) return word;
  return `${word}s`;
}

/** One chip in the topic rail. */
export interface TopicFacet {
  slug: string;
  count: number;
}

/**
 * Topics ranked by how much is filed under them, then by slug.
 *
 * Counted over the rows the view is showing rather than over the whole catalog,
 * so the number on a chip is the number of cards clicking it yields. Eighty
 * topics carry assets today, which is why the page discloses them behind a
 * `<details>` instead of printing eighty chips above the grid.
 */
export function topicFacets(rows: readonly { topics: string[] }[]): TopicFacet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const slug of row.topics) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * The query string for one filter state, with empty values left out.
 *
 * Every filter lives in the URL so a view is linkable and the back button
 * works, which means every chip is a plain `<a>` and the whole rail needs no
 * client JavaScript. A cleared filter drops its key rather than writing
 * `?kind=`, so the default view has a bare `/library` URL.
 */
export function libraryHref(filters: { kind?: string | null; topic?: string | null }): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.topic) params.set("topic", filters.topic);
  const query = params.toString();
  return query === "" ? "/library" : `/library?${query}`;
}

/** `/library/<id>`, with the id percent-encoded so its colons and slashes survive. */
export function assetHref(id: string): string {
  return `/library/${encodeURIComponent(id)}`;
}

/**
 * The inverse, and it has to be applied by hand.
 *
 * **A page's `params` are not decoded.** Next 16 hands the dynamic segment to a
 * page exactly as it appears in the URL, so `/library/link%3Acs3216-m3-r1`
 * arrives as the string `"link%3Acs3216-m3-r1"` rather than as
 * `"link:cs3216-m3-r1"`. Nothing says so at build time — the type is `string`
 * either way — so the page compiles, renders, looks up an id no row has, and
 * answers 404 for every asset in the catalog. That is what it did, and it is
 * why this exists rather than a bare `params.id`. Route handlers behave
 * differently: `/api/assets/[id]/file` is handed a decoded id, which is exactly
 * the kind of difference that makes copying one into the other a bug.
 *
 * **A bad escape is a 404, never a crash.** `decodeURIComponent` throws
 * `URIError` on a lone `%` or a truncated sequence, and a hand-typed URL is the
 * ordinary way to produce one. Handing the segment back as written makes it an
 * id nothing matches, which is the answer that URL deserves.
 */
export function decodeAssetId(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `/api/assets/<id>/file`, the one route that serves an indexed asset's bytes. */
export function assetFileHref(id: string): string {
  return `/api/assets/${encodeURIComponent(id)}/file`;
}

/**
 * `/api/assets/<id>/poster`, a still frame from a video asset.
 *
 * One spelling, here, for the same reason `assetFileHref` is one spelling: the
 * id holds colons and slashes, so a call site that writes the URL by hand is a
 * call site that forgets to encode it, and the route answers 404 for every
 * video in the catalog while looking like it works for none of them.
 *
 * It is a URL and nothing more. Whether a frame can actually be extracted
 * depends on `ASSET_FILES_ENABLED` and on ffmpeg being installed, and neither
 * is a question a pure string function can answer; the route says so per
 * request and a card that gets no image shows the placeholder it always had.
 * Only a `video` asset has one — every other kind is a 404 — so a caller that
 * points an `<img>` at this for a note is asking for a broken image.
 */
export function assetPosterHref(id: string): string {
  return `/api/assets/${encodeURIComponent(id)}/poster`;
}

/**
 * The first value of a search param, or null.
 *
 * Next hands a repeated key (`?kind=a&kind=b`) over as an array. Taking the
 * first is the same thing a server would do with a duplicated form field, and
 * is the only answer that keeps the filter a single value.
 */
export function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value.length > 0 ? (value[0] ?? null) : null;
  return value === undefined || value === "" ? null : value;
}
