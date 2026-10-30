import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import {
  assetCounts,
  assetParents,
  derivationSources,
  listAssets,
  readEvents,
  readPreference,
  readPreferencesWithPrefix,
  type AssetKindCount,
  type AssetParents,
  type AssetRef,
  type TopicTitles,
  type AssetWithTopics,
  type CatalogDatabase,
} from "@gnosia/catalog/state";

import { resolveAsset, servedAssets, storedPosters } from "@/lib/asset-files";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { catalogDatabase } from "@/lib/learner-store";
import {
  assetFileHref,
  assetPosterHref,
  assetStatusHref,
  compareByKindThenId,
  isCompanionKind,
} from "@/lib/library";
import { currentOwner, currentScope, NoOwnerError, type OwnerScope } from "@/lib/owner";
import { contentSource } from "@/data/source";
import { assetBlobStore } from "@/lib/blob-store";
import { FAVORITE_PREFIX, favoriteKey, parseFavorite, type Favorite } from "@/lib/favorite";
import { parsePlayback, playbackKey, type Playback } from "@/lib/playback";
import { parseTranscript } from "@/lib/transcript";
import type { AssetSeams } from "@gnosia/tutor/server/deps";
import {
  MAX_ASSET_ID_CHARS,
  noteIndex,
  optionalParents,
  optionalTitles,
  readAssetDetail as readAssetDetailCore,
  readAssetText as readAssetTextCore,
  readAssetTextFor as readAssetTextForCore,
  TEXT_PREVIEW_BYTES,
  type AssetDetail,
} from "@gnosia/tutor/server/asset-detail";

export { MAX_ASSET_ID_CHARS, noteIndex, optionalParents, TEXT_PREVIEW_BYTES };
export type { AssetDetail };

/**
 * The library's door to the catalog, shaped exactly like
 * `@/lib/learner-store`.
 *
 * **Server only**, and `import "server-only"` enforces it: everything here ends
 * at the catalog's database or the blob store, and a `"use client"` import would
 * compile and ship both to the browser. The pages are server components; the cards and
 * players they render take resolved props.
 *
 * **Nothing runs at build time.** Both entry points call `connection()` first,
 * so `npm run build` succeeds against no database at all — which is what Vercel
 * has, and is a property this app is careful about everywhere else.
 *
 * **An unreachable database is a state, not a crash.** Every read degrades to
 * empty and carries a `reachable` flag beside it, because "the catalog holds
 * nothing" and "the catalog could not be asked" look identical on a page and
 * are not the same thing. Nothing here writes, so there is no counterpart rule
 * about writes failing loudly; the library is a view.
 *
 * **The bytes are a third state, on top of those two.** A row can be perfectly
 * readable while its bytes are not served: a video `catalog asset upload` has
 * not stored yet has a row and no blob. `readAssetAccess()` answers that per
 * row, separately from `reachable`, so the pages can show real titles, real
 * topics and real sizes while saying plainly that they cannot play the video
 * yet.
 */

/**
 * The most rows one library read will fetch: a safety limit, not a page size.
 *
 * The Library draws in pages (L9 of docs/proposals/library-by-type-and-day.md),
 * but every page is cut from the whole matching list: the search, the course
 * and favourite filters, the sort and the day, course, topic and conversation
 * headings, each with its whole count, are worked out over every row the
 * owner holds (`loadLibraryView`). So the read takes them all. This was 1,000
 * when every row was drawn at once, and the owner's catalog passed it on
 * 2026-10-05 with 1,023 rows: the header counted 626 files and the list held
 * 603.
 *
 * 20,000 is about twenty times that catalog. It stays as a limit so a runaway
 * catalog says so ("Read stopped at ...") rather than quietly showing a prefix
 * of itself, and it keeps the reads that name every row by id
 * (`assetParents`, the stored-blob checks) under SQLite's limit on bind
 * parameters per statement: 32,766 in the `better-sqlite3` build the catalog
 * runs on, one per id plus a few for the owners.
 */
export const LIBRARY_ROW_CAP = 20_000;


export interface LibrarySnapshot {
  /** Every asset the catalog holds, sorted for display. Empty when unreachable. */
  rows: AssetWithTopics[];
  /** One row per kind that has any, from a single grouped scan. */
  counts: AssetKindCount[];
  /** False when the database could not be reached; `rows` and `counts` are then empty. */
  reachable: boolean;
  /** True when the catalog holds more than `LIBRARY_ROW_CAP` rows and `rows` is the first of them. */
  truncated: boolean;
  /**
   * Titles for every topic slug the rows carry, keyed by slug. Optional: a
   * title is presentation, the slug is the identity.
   */
  titles: TopicTitles;
  /**
   * The concepts each row explains, from `asset_concept`, keyed by asset id.
   * A row with none is absent. Optional in the same way as `titles`.
   */
  concepts: Record<string, string[]>;
  /**
   * Where each row came from (`assetParents`), keyed by asset id. A row with
   * none is absent. Optional like `concepts`.
   */
  parents: Record<string, AssetParents>;
}

const EMPTY_LIBRARY: LibrarySnapshot = {
  rows: [],
  counts: [],
  reachable: false,
  truncated: false,
  titles: {},
  concepts: {},
  parents: {},
};

/**
 * Every asset, plus the per-kind counts, in two statements.
 *
 * **Unfiltered on purpose.** `listAssets` can filter by kind and by topic in
 * SQL, and this asks it for everything anyway, because the library's default
 * view is not a single-kind query: it is "everything except the companion
 * kinds", which is four exclusions rather than one equality, and the topic rail
 * needs a count per topic over the rows being shown. One read answers the grid,
 * both rails and the totals; four reads would answer the same question in more
 * round trips and could disagree with each other, since each would get its own
 * snapshot outside one transaction.
 *
 * The ordering is re-done here rather than taken from SQL. `listAssets` returns
 * kind-then-id, where kind is alphabetical, which puts `captions` and
 * `chapters` above `video`; `compareByKindThenId` sorts by what a reader came
 * for instead, and keeps id as the tiebreak so the result is still stable.
 */
export async function readLibrary(): Promise<LibrarySnapshot> {
  // The requesting owner's assets and the commons' (phase 4), resolved before
  // the degradation below so a request with no owner fails, not reads empty.
  const owner = await currentOwner();
  const scope = await currentScope();
  try {
    const db = await catalogDatabase();
    // One row past the limit, so a catalog of exactly `LIBRARY_ROW_CAP` rows
    // is whole and one of a row more is said to be cut.
    const [read, counts] = await Promise.all([
      listAssets(db, { limit: LIBRARY_ROW_CAP + 1 }, scope),
      assetCounts(db, scope),
    ]);
    const truncated = read.length > LIBRARY_ROW_CAP;
    const rows = truncated ? read.slice(0, LIBRARY_ROW_CAP) : read;
    // A third statement, and it has to be third: the slugs it asks about are
    // the ones the first read returned. It is a lookup rather than a fact the
    // page depends on, so it gets a failure boundary of its own: inside the
    // outer `catch` a failing title query would have discarded rows that were
    // already in hand and rendered the library unreachable, which is the exact
    // opposite of the fallback the chips are written for.
    //
    // The parents are one statement for the whole page (`assetParents`), and
    // the concepts a card names come out of the same answer, so this costs
    // what the concept read alone did.
    const detailDeps = { db: Promise.resolve(db), owner, scope };
    const [titles, parents] = await Promise.all([
      optionalTitles(detailDeps, rows),
      optionalParents(
        detailDeps,
        rows.map((row) => row.id),
      ),
    ]);
    const concepts: Record<string, string[]> = {};
    for (const [id, of] of Object.entries(parents)) if (of.concepts.length > 0) concepts[id] = of.concepts;
    return {
      rows: [...rows].sort(compareByKindThenId),
      counts,
      reachable: true,
      truncated,
      titles,
      concepts,
      parents,
    };
  } catch (error) {
    warn("asset library", error);
    return EMPTY_LIBRARY;
  }
}

/** As `readLibrary`, with the marker that keeps it out of the build. */
export async function loadLibrary(): Promise<LibrarySnapshot> {
  await connection();
  return readLibrary();
}







/** This app's seams for the detail read, the same ones the sidecar builds around its own pool. */
async function assetSeams(): Promise<{ db: Promise<CatalogDatabase>; owner: string; scope: OwnerScope }> {
  const owner = await currentOwner();
  return { db: catalogDatabase(), owner, scope: await currentScope() };
}

/** One asset's detail page, through the shared read in `@gnosia/tutor/server/asset-detail`. */
export async function readAssetDetail(id: string): Promise<AssetDetail> {
  return readAssetDetailCore(await assetSeams(), id);
}

/** As `readAssetText`, with this app's seams. */
export async function readAssetText(db: CatalogDatabase, id: string, limit: number = TEXT_PREVIEW_BYTES): Promise<string | null> {
  return readAssetTextCore(await seamsFor(), db, id, limit);
}

/**
 * A store that refuses on use: the text reads that need one answer
 * `blob-store-unavailable`, which is what a real `assetBlobStore()` failure
 * already means. Constructing it lazily also keeps a test double that has no
 * blob seam at all from failing reads it was never asked to serve.
 */
const unavailableStore: AssetSeams["blobStore"] = new Proxy({} as AssetSeams["blobStore"], {
  get: () => () => {
    throw new Error("blob store unavailable");
  },
});

async function seamsFor(): Promise<AssetSeams> {
  let blobStore: AssetSeams["blobStore"];
  try {
    blobStore = assetBlobStore();
  } catch {
    blobStore = unavailableStore;
  }
  return { scope: await currentScope(), source: contentSource(), blobStore };
}

async function readAssetTextForLocal(db: CatalogDatabase, id: string, limit: number = TEXT_PREVIEW_BYTES) {
  return readAssetTextForCore(await seamsFor(), db, id, limit);
}

/**
 * As `readAssetDetail`, with the marker that keeps it out of the build. Once
 * per request and id: the asset page's `generateMetadata` and the page itself
 * both ask, and React's `cache` hands the second the first one's read.
 */
export const loadAssetDetail = cache(async (id: string): Promise<AssetDetail> => {
  await connection();
  return readAssetDetail(id);
});

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

const NO_ACCESS: AssetAccess = { served: new Set(), posters: new Set() };

/**
 * The rows among these whose bytes come from the store or the database. A
 * failure here is an empty set: placeholders, never a picture that cannot
 * load.
 */
export async function readAssetAccess(rows: readonly Pick<AssetRef, "id" | "kind">[] = []): Promise<AssetAccess> {
  if (rows.length === 0) return NO_ACCESS;
  try {
    const db = await catalogDatabase();
    const [served, posters] = await Promise.all([servedAssets(db, rows), storedPosters(db, rows)]);
    return { served, posters };
  } catch (error) {
    warn("stored assets", error);
    return NO_ACCESS;
  }
}

/** As `readAssetAccess`, with the marker that keeps it out of the build. */
export async function loadAssetAccess(rows: readonly Pick<AssetRef, "id" | "kind">[] = []): Promise<AssetAccess> {
  await connection();
  return readAssetAccess(rows);
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

/**
 * Why each of these assets' files would be refused, decided on the server
 * before anything renders. `null` means the file resolves.
 *
 * The detail page calls this for the asset it shows and for every picture its
 * note embeds, so a video that was never uploaded, a name the catalog has no
 * row for, or a note whose type is not flipped renders the failure panel
 * straight away rather than a player or an `<img>` that fails and then has to
 * ask why. It is the same `resolveAsset` the route runs, so the page and the
 * route cannot give one asset two different answers. Only what nobody could
 * know before the browser tried is left to the client's probe.
 *
 * A handful of ids per page (one asset, a few embeds), each a primary-key
 * lookup and a store `stat`. The grid does not call this: thirty-odd
 * resolutions on every render to save a probe on the rare card whose picture
 * fails is the wrong trade, and the grid already counts what is not uploaded.
 */
export async function readFileProblems(
  ids: readonly string[],
): Promise<Map<string, RouteProblemCode | null>> {
  const out = new Map<string, RouteProblemCode | null>();
  if (ids.length === 0) return out;
  try {
    const db = await catalogDatabase();
    for (const id of new Set(ids)) {
      const resolved = await resolveAsset(db, id);
      out.set(id, resolved.ok ? null : resolved.code);
    }
  } catch (error) {
    // A request with no owner is not a catalog that cannot be reached.
    if (error instanceof NoOwnerError) throw error;
    warn("file problems", error);
    for (const id of ids) if (!out.has(id)) out.set(id, "catalog-unreachable");
  }
  return out;
}



/**
 * The kinds whose words the library search reads, beside every row's name.
 * Notes and transcripts: the two kinds whose text is what somebody would
 * search for and is small enough to read per request. A session log is
 * markdown too and is left out, because its text is mostly the tutor's own
 * turns, which would match nearly any query.
 */
export const SEARCH_TEXT_KINDS: ReadonlySet<string> = new Set(["note", "transcript"]);

/** What `readSearchText` read, for `searchHits` in `@/lib/library`. */
export interface SearchText {
  /** Lowercased body per asset id, for the rows whose words could be read. */
  texts: Map<string, string>;
  /**
   * How many notes and transcripts were searched by name only because their
   * text is not readable yet (never uploaded, or a type not flipped). The
   * page says so when it is more than none.
   */
  skipped: number;
  /** `asset_derivation` upward for the companion rows among them. */
  sources: Record<string, string[]>;
  /**
   * False when no text could be read at all: every candidate is unreadable
   * yet, or the catalog could not be asked. The page says the search covered
   * titles only.
   */
  searchedText: boolean;
}

const NO_TEXT: SearchText = { texts: new Map(), sources: {}, skipped: 0, searchedText: false };

/**
 * The words of every note and transcript, for one search.
 *
 * Read per request, through `readAssetText`, so it inherits every rule that
 * function has: the same per-row answer as the file route, and the same
 * `TEXT_PREVIEW_BYTES` cap, over which a file is searched by name alone. A transcript is parsed and searched by what
 * was said and its chapter titles, not by its JSON keys; one that does not
 * parse is searched as raw text rather than skipped.
 *
 * About six hundred small files today, each one primary-key lookup and one
 * read, `SEARCH_READS_AT_ONCE` at a time. There is no index; the view that
 * holds the result is kept for a minute (`loadLibraryView`), so a search is
 * read once for its first page and reused for the pages after. Reading every
 * file per search is fine for hundreds of rows and not for tens of thousands.
 */
export async function readSearchText(
  rows: readonly AssetWithTopics[],
  terms: readonly string[],
): Promise<SearchText> {
  if (terms.length === 0) return NO_TEXT;
  const candidates = rows.filter((row) => SEARCH_TEXT_KINDS.has(row.kind) && row.path !== null);
  if (candidates.length === 0) return { ...NO_TEXT, searchedText: true };
  try {
    const db = await catalogDatabase();
    const [bodies, sources] = await Promise.all([
      mapLimited(candidates, SEARCH_READS_AT_ONCE, async (row) => {
        const { text: raw, unreadable } = await readAssetTextForLocal(db, row.id, TEXT_PREVIEW_BYTES);
        return [row.id, raw === null ? null : searchableText(row.kind, raw), unreadable] as const;
      }),
      derivationSources(
        db,
        candidates.filter((row) => isCompanionKind(row.kind)).map((row) => row.id),
        await currentScope(),
      ),
    ]);
    const texts = new Map<string, string>();
    for (const [id, text] of bodies) if (text !== null) texts.set(id, text);
    // Every candidate unreadable is "titles only"; some is a partial search
    // the page names. A null for any other reason (over the cap, nothing
    // behind the row) is passed over, as search always has.
    const skipped = bodies.filter(([, , unreadable]) => unreadable).length;
    return { texts, sources, skipped, searchedText: skipped < candidates.length };
  } catch (error) {
    warn("search text", error);
    return NO_TEXT;
  }
}

/**
 * How many notes and transcripts one search reads at a time. Each is a row
 * lookup and a store read; hundreds started at once only queue on the one
 * database connection and the disk, and hold every body in memory together.
 */
const SEARCH_READS_AT_ONCE = 8;

/** `items.map(fn)`, with at most `limit` calls in flight, in the input's order. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** As `readSearchText`, with the marker that keeps it out of the build. */
export async function loadSearchText(
  rows: readonly AssetWithTopics[],
  terms: readonly string[],
): Promise<SearchText> {
  await connection();
  return readSearchText(rows, terms);
}

/** A file's words as search sees them: a transcript's lines, anything else as written. */
export function searchableText(kind: string, raw: string): string {
  if (kind === "transcript") {
    const parsed = parseTranscript(raw);
    if (parsed !== null) {
      return [...parsed.chapters.map((c) => c.title), ...parsed.cues.map((c) => c.text)]
        .join("\n")
        .toLowerCase();
    }
  }
  return raw.toLowerCase();
}

/**
 * When the learner last marked this asset watched, null for never, or
 * `undefined` when the log could not be read. The two are kept apart because
 * the Details tab says "Not yet" for one and "unknown" for the other: a
 * learner told they never read something they did would be told a falsehood.
 *
 * Reads the log in full, as Home (`@/lib/home`) does on every request; the event log
 * is one learner's and small. The payload's `asset` is the join, since a
 * `watched` event names no concept.
 */
export async function readLastWatched(id: string): Promise<string | null | undefined> {
  const owner = await currentOwner();
  try {
    const events = await readEvents(await catalogDatabase(), owner);
    let last: string | null = null;
    for (const event of events) {
      if (event.type === "watched" && event.asset === id) last = event.at;
    }
    return last;
  } catch (error) {
    warn("watched events", error);
    return undefined;
  }
}

/** As `readLastWatched`, with the marker that keeps it out of the build. */
export async function loadLastWatched(id: string): Promise<string | null | undefined> {
  await connection();
  return readLastWatched(id);
}

/**
 * Where the learner is in this video and what of it they have watched, or
 * null for a first visit (or a store that could not be read, which costs the
 * resume point and nothing else).
 */
export async function loadPlayback(id: string): Promise<Playback | null> {
  await connection();
  const owner = await currentOwner();
  try {
    return parsePlayback(await readPreference(await catalogDatabase(), playbackKey(id), owner));
  } catch (error) {
    warn("playback", error);
    return null;
  }
}

/**
 * Whether the owner starred this asset, and when, or null for no star (or a
 * store that could not be read, which draws the star empty and costs nothing
 * else: pressing it writes through the route, which says if it failed).
 */
export async function loadFavorite(id: string): Promise<Favorite | null> {
  await connection();
  const owner = await currentOwner();
  try {
    return parseFavorite(await readPreference(await catalogDatabase(), favoriteKey(id), owner));
  } catch (error) {
    warn("favorite", error);
    return null;
  }
}

/**
 * Where one asset came from (`assetParents`, scoped to the owner), for the
 * Library previewer's Conversation tool. Undefined when it has no parent or
 * the read failed: that costs the tool, never the panel.
 */
export async function loadAssetParents(id: string): Promise<AssetParents | undefined> {
  await connection();
  try {
    const parents = await assetParents(await catalogDatabase(), [id], await currentScope());
    return Object.hasOwn(parents, id) ? parents[id] : undefined;
  } catch (error) {
    warn("asset parents", error);
    return undefined;
  }
}

/**
 * Every asset the owner starred, by id, for the Library's Favorites filter:
 * the `favorite:` preferences and nothing else. Null when the store could not be read, which the page
 * says rather than showing an empty list as though nothing were starred.
 */
export async function loadFavorites(): Promise<Set<string> | null> {
  await connection();
  const owner = await currentOwner();
  try {
    const all = await readPreferencesWithPrefix(await catalogDatabase(), FAVORITE_PREFIX, owner);
    const ids = new Set<string>();
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(FAVORITE_PREFIX) && parseFavorite(value) !== null) ids.add(key.slice(FAVORITE_PREFIX.length));
    }
    return ids;
  } catch (error) {
    warn("favorites", error);
    return null;
  }
}

/** The pool, for a caller that already has a request scope and needs one more read. */
export async function withCatalog<T>(fn: (db: CatalogDatabase) => Promise<T>): Promise<T | null> {
  try {
    return await fn(await catalogDatabase());
  } catch (error) {
    warn("catalog read", error);
    return null;
  }
}

function warn(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`asset library: ${what} unavailable — ${message}`);
}
