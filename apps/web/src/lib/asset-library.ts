import "server-only";

import { connection } from "next/server";
import {
  assetCounts,
  assetDerivations,
  conceptsForAssets,
  derivationSources,
  listAssets,
  readEvents,
  topicTitles,
  type AssetDerivations,
  type AssetKindCount,
  type AssetRef,
  type TopicTitles,
  type AssetWithTopics,
  type CatalogDatabase,
} from "@self-learn/catalog/state";

import { openBlob, resolveAsset, servedAssets, storedPosters } from "@/lib/asset-files";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { catalogDatabase } from "@/lib/learner-store";
import {
  assetFileHref,
  assetPosterHref,
  assetStatusHref,
  compareByKindThenId,
  isCompanionKind,
} from "@/lib/library";
import { currentOwner, currentScope } from "@/lib/owner";
import { parseTranscript } from "@/lib/transcript";

/**
 * The library's door to the catalog, shaped exactly like
 * `@/lib/learner-store`.
 *
 * **Server only**, and `import "server-only"` enforces it: everything here ends
 * at a Postgres pool or the blob store, and a `"use client"` import would
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
 * The most rows one library read will fetch.
 *
 * The catalog holds 206 today and this page renders all of them, which is the
 * right design at that size: filtering and grouping happen over a list the
 * server already has, there is no pagination state to keep in the URL, and the
 * counts on the chips are the counts of what clicking them yields. The cap
 * exists so that a catalog which grows an order of magnitude says so — the page
 * reports a truncated read rather than quietly showing a prefix of itself and
 * looking complete.
 */
export const LIBRARY_ROW_CAP = 1000;

/** How much of a text sidecar is read for display. */
export const TEXT_PREVIEW_BYTES = 256 * 1024;

/** Everything `/library` renders from, or an honest empty. */
export interface LibrarySnapshot {
  /** Every asset the catalog holds, sorted for display. Empty when unreachable. */
  rows: AssetWithTopics[];
  /** One row per kind that has any, from a single grouped scan. */
  counts: AssetKindCount[];
  /** False when the database could not be reached; `rows` and `counts` are then empty. */
  reachable: boolean;
  /** True when the read came back at `LIBRARY_ROW_CAP` and there may be more. */
  truncated: boolean;
  /**
   * Titles for every topic slug the rows carry, keyed by slug.
   *
   * Chips render `titles[slug] ?? slug`, so this failing to resolve one costs
   * a readable label and nothing else. That is why it is not folded into
   * `listAssets`: a title is presentation, the slug is the identity, and the
   * page is correct with only the slug.
   */
  titles: TopicTitles;
  /**
   * The concepts each row explains, from `asset_concept`, keyed by asset id.
   * A row with none is absent. Optional in the same way as `titles`: a card
   * with no concept chip is a correct card, so this failing costs the chips
   * and never the rows.
   */
  concepts: Record<string, string[]>;
}

const EMPTY_LIBRARY: LibrarySnapshot = {
  rows: [],
  counts: [],
  reachable: false,
  truncated: false,
  titles: {},
  concepts: {},
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
 * snapshot under READ COMMITTED.
 *
 * The ordering is re-done here rather than taken from SQL. `listAssets` returns
 * kind-then-id, where kind is alphabetical, which puts `captions` and
 * `chapters` above `video`; `compareByKindThenId` sorts by what a reader came
 * for instead, and keeps id as the tiebreak so the result is still stable.
 */
export async function readLibrary(): Promise<LibrarySnapshot> {
  // The requesting owner's assets and the commons' (phase 4), resolved before
  // the degradation below so a request with no owner fails, not reads empty.
  const scope = await currentScope();
  try {
    const db = await catalogDatabase();
    const [rows, counts] = await Promise.all([
      listAssets(db, { limit: LIBRARY_ROW_CAP }, scope),
      assetCounts(db, scope),
    ]);
    // A third statement, and it has to be third: the slugs it asks about are
    // the ones the first read returned. It is a lookup rather than a fact the
    // page depends on, so it gets a failure boundary of its own: inside the
    // outer `catch` a failing title query would have discarded rows that were
    // already in hand and rendered the library unreachable, which is the exact
    // opposite of the fallback the chips are written for.
    const [titles, concepts] = await Promise.all([
      optionalTitles(db, rows),
      optionalConcepts(
        db,
        rows.map((row) => row.id),
      ),
    ]);
    return {
      rows: [...rows].sort(compareByKindThenId),
      counts,
      reachable: true,
      truncated: rows.length >= LIBRARY_ROW_CAP,
      titles,
      concepts,
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

/**
 * Every topic slug across a page of rows, once each.
 *
 * A set rather than a flat map: one topic carries many assets, so a grid of
 * 135 cards asks about a handful of distinct slugs, and sending the repeats
 * would make the `IN` list an order of magnitude longer to learn the same
 * thing.
 */
function distinctTopics(rows: AssetWithTopics[]): string[] {
  return [...new Set(rows.flatMap((row) => row.topics))];
}

/** Everything `/library/[id]` renders from. */
export interface AssetDetail {
  /** The asset, or null when no row has that id — a 404, not a failure. */
  asset: AssetWithTopics | null;
  /** What it came from and what came out of it. Empty when there is no row. */
  derivations: AssetDerivations;
  /** Other assets filed under a topic this one is filed under, this one excluded. */
  related: AssetWithTopics[];
  reachable: boolean;
  /** Titles for every slug on this page, this asset's and its neighbours'. */
  titles: TopicTitles;
  /**
   * Concept-note slugs to their asset ids, for resolving `[[wikilinks]]`.
   *
   * A note's id is `note:learn/concepts/<domain>/<slug>.md` and a wikilink
   * carries only the slug, so the domain folder has to come from somewhere.
   * It comes from here: every note in one read, keyed by the basename a link
   * would name. There are 32 of them, so the whole index costs less than
   * asking per link would.
   */
  notes: Record<string, string>;
  /** Concept slugs this asset explains, from `asset_concept`, sorted. Empty when it explains none. */
  concepts: string[];
}

const EMPTY_DETAIL: AssetDetail = {
  asset: null,
  derivations: { sources: [], derived: [] },
  related: [],
  reachable: false,
  titles: {},
  notes: {},
  concepts: [],
};

/** How many siblings the detail page offers before it stops listing them. */
const RELATED_CAP = 12;

/**
 * There is deliberately no SQL limit on the per-topic queries below, and the
 * reason is that a limit there would cut the wrong rows.
 *
 * `listAssets` orders by `kind, id` with kind alphabetical, so a `LIMIT 60`
 * returns the first sixty of `captions, chapters, diagram_source, diagram_svg,
 * link, note, session, transcript, video` — in that order. The ranking a reader
 * cares about is applied afterwards, in `compareByKindThenId`, which puts video
 * first. On a topic large enough for the limit to bite, the sixty rows would
 * already be caption files and the videos would be gone before the sort ever
 * saw them: a related list showing the least interesting rows and silently
 * omitting the most.
 *
 * The fix is to rank first and cut second, which means the cut cannot be in
 * SQL unless the ranking is, and putting one page's kind preference into a
 * query three other callers share is worse than reading a topic's rows. The
 * read is bounded by `asset_topic` membership for a single topic — the same
 * bound `assetsForTopic` in the catalog accepts without a limit, for the same
 * reason — and the biggest topic carries eleven assets today.
 */

/**
 * One asset, its derivations, and what else is filed beside it.
 *
 * **The row is looked up directly, by id.** An earlier version took it out of
 * the same capped `listAssets` the grid uses and searched the result for a
 * matching id, which is correct only while the whole catalog fits inside one
 * page: the 1001st asset by kind-and-id would have had a real row, a working
 * file, and a detail URL that answered 404. `listAssets`' `ids` option is what
 * this needs — the row *with* its topic chips, which `assetsByIds` cannot give
 * — and it resolves the asset whatever the size of the catalog.
 *
 * **Related is asked per topic, not filtered out of everything.** An asset's
 * topics come back on the row, so "what else is about this" is one query per
 * topic against `asset_topic`, which is usually one. Ranked here and cut to
 * `RELATED_CAP` afterwards, never by a SQL `LIMIT` — the note above that
 * constant is why.
 *
 * `assetDerivations` is the query that makes a video more than a file. It is
 * where the transcript, the captions and the chapter list beside a `.mp4` are
 * found, and where an exported SVG finds the `.tldr` it was drawn on.
 */
export async function readAssetDetail(id: string): Promise<AssetDetail> {
  const scope = await currentScope();
  try {
    const db = await catalogDatabase();
    const [asset] = await listAssets(db, { ids: [id] }, scope);
    if (asset === undefined) {
      return {
        asset: null,
        derivations: { sources: [], derived: [] },
        related: [],
        reachable: true,
        titles: {},
        notes: {},
        concepts: [],
      };
    }

    // Only a markdown file can contain a wikilink, so only a markdown file
    // pays for the index. `endsWith` rather than the kind, because a session
    // log and a concept note are different kinds and both are markdown.
    const wantsNotes = asset.path?.endsWith(".md") ?? false;

    const [derivations, perTopic] = await Promise.all([
      assetDerivations(db, id, scope),
      // Unlimited on purpose; see the note above `RELATED_CAP`.
      Promise.all(asset.topics.map((slug) => listAssets(db, { topicSlug: slug }, scope))),
    ]);

    // Its own boundary too, and for the same reason as the titles above: a
    // wikilink that does not resolve stays readable text, so losing the index
    // costs a note its links and must not cost the page its asset.
    const notes = wantsNotes ? await optionalNotes(db) : {};

    // This asset, and its own companion files, which have their own section
    // immediately above and would otherwise appear twice on one page.
    const family = new Set([
      id,
      ...derivations.sources.map((a) => a.id),
      ...derivations.derived.map((a) => a.id),
    ]);
    // Deduped by id: an asset filed under two of this one's topics comes back
    // from two of the queries above and is still one card.
    const merged = new Map<string, AssetWithTopics>();
    for (const row of perTopic.flat()) {
      if (!family.has(row.id)) merged.set(row.id, row);
    }
    const related = [...merged.values()].sort(compareByKindThenId).slice(0, RELATED_CAP);

    // Every slug this page will draw a chip for: the asset's own, plus those
    // of the related cards beside it. Asked once for all of them rather than
    // once per section, so the two cannot disagree about one topic's name.
    const [titles, concepts] = await Promise.all([
      optionalTitles(db, [asset, ...related]),
      optionalConcepts(db, [id]),
    ]);

    return {
      asset,
      derivations,
      related,
      reachable: true,
      titles,
      notes,
      concepts: concepts[id] ?? [],
    };
  } catch (error) {
    warn(`asset ${id}`, error);
    return EMPTY_DETAIL;
  }
}

/** As `readAssetDetail`, with the marker that keeps it out of the build. */
export async function loadAssetDetail(id: string): Promise<AssetDetail> {
  await connection();
  return readAssetDetail(id);
}

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
 * Titles for a page's rows, or none, never a thrown error.
 *
 * The chips render `titles[slug] ?? slug`, so an empty result is a page of
 * slugs: the same page this code shipped before titles existed, and a fine
 * one. Letting this share the caller's `catch` instead would turn a label
 * failure into an empty library, hiding rows that had already been read.
 */
async function optionalTitles(
  db: CatalogDatabase,
  rows: AssetWithTopics[],
): Promise<TopicTitles> {
  try {
    return await topicTitles(db, distinctTopics(rows), await currentScope());
  } catch (error) {
    warn("topic titles", error);
    return {};
  }
}

/** Concept links for these assets, or none. See `optionalTitles` for why this cannot throw. */
async function optionalConcepts(
  db: CatalogDatabase,
  ids: readonly string[],
): Promise<Record<string, string[]>> {
  try {
    return await conceptsForAssets(db, ids, await currentScope());
  } catch (error) {
    warn("concept links", error);
    return {};
  }
}

/** The note index, or none. See `optionalTitles` for why this cannot throw. */
async function optionalNotes(db: CatalogDatabase): Promise<Record<string, string>> {
  try {
    return noteIndex(await listAssets(db, { kind: "note" }, await currentScope()));
  } catch (error) {
    warn("note index", error);
    return {};
  }
}

/**
 * Note rows keyed by the slug a `[[wikilink]]` would write.
 *
 * The slug is the filename without `.md`, which is what the knowledge base
 * links by. Two notes in different domains sharing a filename would collide;
 * the first wins and the second is simply unlinkable, which is the same thing
 * that happens in Obsidian and is better than a link pointing at the wrong
 * note. Nothing in the corpus collides today.
 */
function noteIndex(rows: AssetWithTopics[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const slug = row.path?.split("/").pop()?.replace(/\.md$/, "");
    if (slug !== undefined && slug !== "" && out[slug] === undefined) out[slug] = row.id;
  }
  return out;
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
    warn("file problems", error);
    for (const id of ids) if (!out.has(id)) out.set(id, "catalog-unreachable");
  }
  return out;
}

/**
 * The text of one indexed asset, read on the server.
 *
 * A transcript is a separate `asset` row whose file the route serves, and the
 * components that render it take `cues` as a prop. Fetching it from the browser
 * would mean a loading state, a failure state and a second round trip for text
 * the server can read while it is already rendering; so it is read here and
 * passed down, and the panel arrives populated.
 *
 * `resolveAsset` in `@/lib/asset-files` does the resolving, which is not an
 * implementation detail being reused for convenience: it holds every rule the
 * asset route keeps (the id is a primary key and never a path, the extension
 * has to be on a closed list), so a page cannot read what the route would
 * refuse. A blob is read from the store, a note, a log or a `.tldr` from its
 * row.
 *
 * Null means "no text to show", for every reason there is: the row has no
 * file, nothing was uploaded, it is larger than the cap. The callers all
 * render the same thing for all of them (the file's metadata and a link), so
 * distinguishing them here would produce a difference nothing acts on.
 */
export async function readAssetText(
  db: CatalogDatabase,
  id: string,
  limit = TEXT_PREVIEW_BYTES,
): Promise<string | null> {
  return (await readAssetTextFor(db, id, limit)).text;
}

/**
 * The codes that mean "this text exists and this server cannot read it yet":
 * a sidecar never uploaded, a note whose type is not flipped. Search counts
 * those as matched by name only, and says so; a file over the cap, or a row
 * with nothing behind it, is passed over as search always has.
 */
const NOT_READABLE_YET: ReadonlySet<RouteProblemCode> = new Set(["not-uploaded", "not-flipped"]);

/** `readAssetText`, saying whether a null was one of `NOT_READABLE_YET`. */
async function readAssetTextFor(
  db: CatalogDatabase,
  id: string,
  limit: number,
): Promise<{ text: string | null; unreadable: boolean }> {
  try {
    const resolved = await resolveAsset(db, id);
    if (resolved.ok === false) return { text: null, unreadable: NOT_READABLE_YET.has(resolved.code) };
    if (resolved.bytes > limit) return { text: null, unreadable: false };
    if (resolved.source === "row") return { text: resolved.body.toString("utf8"), unreadable: false };
    const read = await openBlob(resolved.key);
    const chunks: Buffer[] = [];
    for await (const chunk of read.body) chunks.push(chunk as Buffer);
    return { text: Buffer.concat(chunks).toString("utf8"), unreadable: false };
  } catch (error) {
    warn(`asset text ${id}`, error);
    return { text: null, unreadable: false };
  }
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
 * About fifty-five small files today, each one primary-key lookup and one read,
 * queued on the shared pool. There is no index and no cache, which is right
 * at this size and is the first thing to change if the catalog grows by an
 * order of magnitude: reading every file on every search is fine for a few
 * hundred rows and not for tens of thousands.
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
      Promise.all(
        candidates.map(async (row) => {
          const { text: raw, unreadable } = await readAssetTextFor(db, row.id, TEXT_PREVIEW_BYTES);
          return [row.id, raw === null ? null : searchableText(row.kind, raw), unreadable] as const;
        }),
      ),
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
 * When the learner last marked this asset watched, or null for never (or for a
 * log that could not be read, which a caption is no worse for omitting).
 *
 * Reads the log in full, as `@/lib/habit` does on every request; the event log
 * is one learner's and small. The payload's `asset` is the join, since a
 * `watched` event names no concept.
 */
export async function readLastWatched(id: string): Promise<string | null> {
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
    return null;
  }
}

/** As `readLastWatched`, with the marker that keeps it out of the build. */
export async function loadLastWatched(id: string): Promise<string | null> {
  await connection();
  return readLastWatched(id);
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
