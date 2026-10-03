import type { MasteryLabel } from "@self-learn/catalog/state";

import { assetDisplayTitle, assetKindLabel, type AssetCardRef } from "@/components/asset-meta";
import { safeNextPath } from "@/lib/auth/core";
import { bucketOf, type MasteryBucket } from "@/lib/mastery-bucket";

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
 * own row, with its true count, in the Type menu's "Companion files" section,
 * `?kind=transcript` is a linkable view of them,
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
  // A video's stored still, made by `catalog asset upload`: shown on its
  // video's card, never as a card of its own.
  "poster",
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

/** The two orders the grid offers. `newest` is the default and is left out of a URL. */
export type LibrarySort = "newest" | "title";

/** Anything but `title` is the default, so a hand-typed `?sort=` cannot break the page. */
export function parseSort(value: string | null | undefined): LibrarySort {
  return value === "title" ? "title" : "newest";
}

/** The two layouts: the card grid, the default, and a dense list of rows. */
export type LibraryView = "grid" | "list";

/** Anything but `list` is the grid, so a hand-typed `?view=` cannot break the page. */
export function parseView(value: string | null | undefined): LibraryView {
  return value === "list" ? "list" : "grid";
}

const ADDED_ON = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * When a row entered the catalog, as the list view prints it: `4 Oct 2026`.
 * In UTC, so the server and a test agree on the day; `null` for a value that
 * does not parse, so a bad timestamp is a blank cell rather than "Invalid Date".
 */
export function addedOn(createdAt: string): string | null {
  const time = Date.parse(createdAt);
  return Number.isNaN(time) ? null : ADDED_ON.format(time);
}

/** Every filter the library's URL can carry. */
export interface LibraryFilters {
  kind?: string | null;
  topic?: string | null;
  /** A course slug: the assets filed under any of its modules' topics. */
  course?: string | null;
  /** The search box, as typed. */
  q?: string | null;
  sort?: LibrarySort | null;
  /** The layout. Not a filter, but URL state like one, so a list view is linkable too. */
  view?: LibraryView | null;
}

/**
 * The query string for one filter state, with empty values left out.
 *
 * Every filter lives in the URL so a view is linkable and the back button
 * works: the Library's filter menus push the URL this builds for a pick. A
 * cleared filter drops its key rather than writing
 * `?kind=`, so the default view has a bare `/library` URL, and the default sort
 * and the default layout (the grid) are never written either.
 */
export function libraryHref(filters: LibraryFilters): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.course) params.set("course", filters.course);
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  if (filters.sort === "title") params.set("sort", "title");
  if (filters.view === "list") params.set("view", "list");
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
 * It is a URL and nothing more. Whether a poster was stored for the video is
 * not a question a pure string function can answer; the route says so per
 * request and a card that gets no image shows the placeholder it always had.
 * Only a `video` asset has one — every other kind is a 404 — so a caller that
 * points an `<img>` at this for a note is asking for a broken image.
 */
export function assetPosterHref(id: string): string {
  return `/api/assets/${encodeURIComponent(id)}/poster`;
}

/**
 * `/api/assets/<id>/status`, which says why the file or poster route would
 * refuse an asset without sending it. What a failed `<img>` or `<video>` asks
 * after `onError`, since that event carries no reason of its own.
 */
export function assetStatusHref(id: string, target: "file" | "poster" = "file"): string {
  const base = `/api/assets/${encodeURIComponent(id)}/status`;
  return target === "poster" ? `${base}?for=poster` : base;
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

/* -------------------------------------------------------------------------- */
/* Courses                                                                    */
/* -------------------------------------------------------------------------- */

/** A course as the library needs it: a code for the chip and its modules' topic slugs. */
export interface LibraryCourse {
  slug: string;
  code: string;
  title: string;
  /** `module.topic` for every module, the same slugs `asset_topic` is keyed by. */
  topics: readonly string[];
}

export interface CourseFacet {
  slug: string;
  code: string;
  title: string;
  /** Standalone assets filed under any of the course's topics. */
  count: number;
}

/**
 * The course chips: every course with at least one standalone asset, in the
 * order the courses are given (the authored shortlist order).
 *
 * A course reaches an asset the way `assetsForCollection` does in the catalog:
 * each module is filed under one topic, and an asset filed under that topic
 * belongs to the course. Worked out here from the course files rather than
 * asked of `collection_item`, because the page already holds both halves and
 * the answer is the same one `courses.ts` wrote into the catalog from those
 * files. Counted over standalone rows only, so a chip's number is the number
 * of cards clicking it shows.
 */
export function courseFacets(
  courses: readonly LibraryCourse[],
  rows: readonly { kind: string; topics: string[] }[],
): CourseFacet[] {
  const out: CourseFacet[] = [];
  for (const course of courses) {
    const topics = new Set(course.topics);
    let count = 0;
    for (const row of rows) {
      if (isCompanionKind(row.kind)) continue;
      if (row.topics.some((slug) => topics.has(slug))) count += 1;
    }
    if (count > 0) out.push({ slug: course.slug, code: course.code, title: course.title, count });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/** The longest query the page reads; the rest is ignored rather than refused. */
export const MAX_QUERY_CHARS = 200;

/** The most words a query is split into. */
export const MAX_QUERY_TERMS = 8;

/**
 * A query as the words every match must contain: lowercased, split on
 * whitespace, deduplicated. Empty for a blank or missing query, which means
 * "no search" rather than "match nothing".
 *
 * All the words, in any order and anywhere in the title or the text, which is
 * what a person typing "dot product projection" expects. It is substring
 * matching and nothing cleverer: no stemming, no ranking, no typo tolerance.
 * The corpus is a few hundred rows, so the ordering the grid already applies
 * is a better ranking than a score this function would have to invent.
 */
export function searchTerms(q: string | null | undefined): string[] {
  if (!q) return [];
  const words = q.slice(0, MAX_QUERY_CHARS).toLowerCase().split(/\s+/).filter(Boolean);
  return [...new Set(words)].slice(0, MAX_QUERY_TERMS);
}

/** True when every term appears somewhere in the text. No terms matches everything. */
export function matchesAll(haystack: string, terms: readonly string[]): boolean {
  const text = haystack.toLowerCase();
  return terms.every((term) => text.includes(term));
}

/**
 * What a row is called, for search: its title, its filename and its URL. The
 * filename matters for the rows with no title, which the card names by it.
 */
export function searchableName(row: {
  title: string | null;
  path: string | null;
  url: string | null;
}): string {
  const base = row.path?.split("/").filter(Boolean).pop() ?? "";
  return [row.title ?? "", base, row.url ?? ""].join("\n");
}

/**
 * The ids a search matches: rows whose name or text holds every term, plus the
 * asset each matching companion file was derived from.
 *
 * `texts` is the body of the rows whose words were read (notes and
 * transcripts, when the deployment serves files); a row absent from it is
 * searched by name alone. `sourcesOf` is `asset_derivation` read upward for
 * those rows, and is what turns a line inside a transcript into its video:
 * the transcript is a companion file the default view hides, so without the
 * lift a search for a phrase somebody said would find nothing a reader could
 * see. The companion still matches in its own right, so `?kind=transcript`
 * shows it.
 */
export function searchHits(
  rows: readonly { id: string; title: string | null; path: string | null; url: string | null }[],
  terms: readonly string[],
  texts: ReadonlyMap<string, string>,
  sourcesOf: Readonly<Record<string, readonly string[]>>,
): Set<string> {
  const hits = new Set<string>();
  for (const row of rows) {
    const text = texts.get(row.id);
    const haystack = text === undefined ? searchableName(row) : `${searchableName(row)}\n${text}`;
    if (!matchesAll(haystack, terms)) continue;
    hits.add(row.id);
    for (const source of sourcesOf[row.id] ?? []) hits.add(source);
  }
  return hits;
}

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The rows one filter state shows, before sorting.
 *
 * - No kind is the default view: every standalone row, companions left out.
 * - `courseTopics` is the chosen course's module topics, or null for none.
 * - `hits` is the search's answer, or null when nothing was searched. A hit
 *   still has to pass the other filters, so a video lifted in by its
 *   transcript does not appear under `?kind=note`.
 */
export function filterRows<T extends { id: string; kind: string; topics: string[] }>(
  rows: readonly T[],
  filters: {
    kind: string | null;
    topic: string | null;
    courseTopics: ReadonlySet<string> | null;
    hits: ReadonlySet<string> | null;
  },
): T[] {
  const { kind, topic, courseTopics, hits } = filters;
  return rows.filter(
    (row) =>
      (kind === null ? !isCompanionKind(row.kind) : row.kind === kind) &&
      (topic === null || row.topics.includes(topic)) &&
      (courseTopics === null || row.topics.some((slug) => courseTopics.has(slug))) &&
      (hits === null || hits.has(row.id)),
  );
}

/**
 * The grid's order. Newest is when the row entered the catalog, latest first;
 * title is the name on the card, A to Z. Both fall back to kind-then-id, so two
 * rows indexed in the same run (most of them) keep a stable order and the
 * grid does not reshuffle between renders.
 */
export function sortRows<T extends AssetCardRef & { createdAt: string }>(
  rows: readonly T[],
  sort: LibrarySort,
): T[] {
  const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  const time = (row: T) => {
    const t = Date.parse(row.createdAt);
    return Number.isNaN(t) ? 0 : t;
  };
  return [...rows].sort((a, b) => {
    const primary =
      sort === "title"
        ? collator.compare(assetDisplayTitle(a).text, assetDisplayTitle(b).text)
        : time(b) - time(a);
    return primary !== 0 ? primary : compareByKindThenId(a, b);
  });
}

/* -------------------------------------------------------------------------- */
/* Concepts                                                                   */
/* -------------------------------------------------------------------------- */

/** One concept an asset explains, with what the knowledge base knows about it. */
export interface ExplainedConcept {
  slug: string;
  title: string;
  bucket: MasteryBucket;
  pL: number | null;
  observations: number;
}

/**
 * The concept slugs from `asset_concept`, joined to the knowledge base for a
 * title and a mastery bucket.
 *
 * A slug the knowledge base does not have (it could not be read, or the note
 * was pruned between the two reads) keeps its slug as the title and reads as
 * untouched, which is what a concept with no evidence is. It is not dropped:
 * the link is a fact about the asset whatever the knowledge base can say
 * about the concept.
 */
export function explainedConcepts(
  slugs: readonly string[],
  kb: ReadonlyMap<
    string,
    { title: string; mastery: MasteryLabel; pL: number; observations: number }
  >,
): ExplainedConcept[] {
  return slugs.map((slug) => {
    const known = kb.get(slug);
    if (known === undefined) {
      return { slug, title: slug, bucket: "untouched", pL: null, observations: 0 };
    }
    return {
      slug,
      title: known.title,
      bucket: bucketOf(known),
      pL: known.pL,
      observations: known.observations,
    };
  });
}

/** Where a concept's workspace lives (phase 1c's `/learn/[concept]`). */
export function conceptHref(slug: string): string {
  return `/learn/${encodeURIComponent(slug)}`;
}

/**
 * Where an asset page's back link goes, and what it says.
 *
 * A studio video opens here, and the page had no way back but the browser's:
 * the studio passes the view it was opened from as `from`, and the link
 * returns to it with its filters. Only a path on `/studio` is taken, and only
 * one `safeNextPath` keeps as it is, so the parameter cannot send the link off
 * the site. Anything else, a course page's link included, goes up to the
 * library.
 */
export function assetBackLink(from: string | string[] | undefined): { href: string; label: string } {
  const raw = Array.isArray(from) ? from[0] : from;
  if (typeof raw === "string" && safeNextPath(raw) === raw) {
    // Resolved the way the browser will, so a `..` cannot leave the studio.
    const target = new URL(raw, "http://gnosia.invalid");
    if (target.origin === "http://gnosia.invalid" && (target.pathname === "/studio" || target.pathname.startsWith("/studio/"))) {
      return { href: `${target.pathname}${target.search}`, label: "Studio" };
    }
  }
  return { href: "/library", label: "Library" };
}
