import {
  assetDerivations,
  assetParents,
  conceptsForAssets,
  listAssets,
  readAssetNaming,
  topicTitles,
  type AssetDerivations,
  type AssetNaming,
  type AssetParents,
  type AssetWithTopics,
  type CatalogDatabase,
  type TopicTitles,
} from "@gnosia/catalog/state";
import type { OwnerScope } from "@gnosia/schema/shared";

import { compareByKindThenId } from "../kind-order";
import { openBlob, resolveAsset } from "./asset-files";
import type { AssetSeams } from "./deps";
import type { RouteProblemCode } from "../asset-problems";

/**
 * The asset detail and text reads `apps/web/src/lib/asset-library.ts` holds
 * for the detail page and the asset Ask route, parameterized on the same
 * seams `resolveAsset` takes so the sidecar's Ask answers from the same rows.
 */

/** The longest asset id accepted anywhere: a body field can claim more than a row can hold. */
export const MAX_ASSET_ID_CHARS = 512;

export const TEXT_PREVIEW_BYTES = 256 * 1024;

export function distinctTopics(rows: AssetWithTopics[]): string[] {
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
  /**
   * The learner's own name for it and the source's title, for the rename
   * field. Null when there is no row, or the read failed: the page then shows
   * the title without the field.
   */
  naming: AssetNaming | null;
}

const EMPTY_DETAIL: AssetDetail = {
  asset: null,
  derivations: { sources: [], derived: [] },
  related: [],
  reachable: false,
  titles: {},
  notes: {},
  concepts: [],
  naming: null,
};

/** How many siblings the detail page offers before it stops listing them. */
const RELATED_CAP = 12;

/** The seams the detail read needs beyond the pool: the owner's identity and rows-visible scope. */
export interface DetailDeps {
  db: Promise<CatalogDatabase>;
  owner: string;
  scope: OwnerScope;
}

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
 * `RELATED_CAP` afterwards, never by a SQL `LIMIT` — the note on that
 * constant in the original file is why.
 *
 * `assetDerivations` is the query that makes a video more than a file. It is
 * where the transcript, the captions and the chapter list beside a `.mp4` are
 * found, and where an exported SVG finds the `.tldr` it was drawn on.
 */
export async function readAssetDetail(deps: DetailDeps, id: string): Promise<AssetDetail> {
  const scope = deps.scope;
  try {
    const db = await deps.db;
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
        naming: null,
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
    const notes = wantsNotes ? await optionalNotes(deps) : {};

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
    const [titles, concepts, naming] = await Promise.all([
      optionalTitles(deps, [asset, ...related]),
      optionalConcepts(deps, [id]),
      optionalNaming(deps, id),
    ]);

    return {
      asset,
      derivations,
      related,
      reachable: true,
      titles,
      notes,
      concepts: concepts[id] ?? [],
      naming,
    };
  } catch (error) {
    warn(`asset ${id}`, error);
    return EMPTY_DETAIL;
  }
}

/**
 * Titles for a page's rows, or none, never a thrown error.
 *
 * The chips render `ownValue(titles, slug) ?? slug`, so an empty result is a page of
 * slugs: the same page this code shipped before titles existed, and a fine
 * one. Letting this share the caller's `catch` instead would turn a label
 * failure into an empty library, hiding rows that had already been read.
 */
export async function optionalTitles(
  deps: DetailDeps,
  rows: AssetWithTopics[],
): Promise<TopicTitles> {
  try {
    return await topicTitles(await deps.db, distinctTopics(rows), deps.scope);
  } catch (error) {
    warn("topic titles", error);
    return {};
  }
}

/**
 * Where each of these assets came from, or nothing. See `optionalTitles` for
 * why this cannot throw: a row without its source line is still a row.
 */
export async function optionalParents(
  deps: DetailDeps,
  ids: readonly string[],
): Promise<Record<string, AssetParents>> {
  try {
    return await assetParents(await deps.db, ids, deps.scope);
  } catch (error) {
    warn("asset parents", error);
    return {};
  }
}

/** Concept links for these assets, or none. See `optionalTitles` for why this cannot throw. */
export async function optionalConcepts(
  deps: DetailDeps,
  ids: readonly string[],
): Promise<Record<string, string[]>> {
  try {
    return await conceptsForAssets(await deps.db, ids, deps.scope);
  } catch (error) {
    warn("concept links", error);
    return {};
  }
}

/** The rename field's data, or none. A failure costs the field, never the page. */
export async function optionalNaming(deps: DetailDeps, id: string): Promise<AssetNaming | null> {
  try {
    return await readAssetNaming(await deps.db, id, deps.owner);
  } catch (error) {
    warn("asset name", error);
    return null;
  }
}

/** The note index, or none. See `optionalTitles` for why this cannot throw. */
export async function optionalNotes(deps: DetailDeps): Promise<Record<string, string>> {
  try {
    return noteIndex(await listAssets(await deps.db, { kind: "note" }, deps.scope));
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
export function noteIndex(rows: AssetWithTopics[]): Record<string, string> {
  // A Map, then `fromEntries`: assigning `out["__proto__"]` on a plain object
  // sets its prototype instead of a key, so a note by that name would be
  // unlinkable, and `fromEntries` defines every key as the object's own.
  const out = new Map<string, string>();
  for (const row of rows) {
    const slug = row.path?.split("/").pop()?.replace(/\.md$/, "");
    if (slug !== undefined && slug !== "" && !out.has(slug)) out.set(slug, row.id);
  }
  return Object.fromEntries(out);
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
 * `resolveAsset` in `./asset-files` does the resolving, which is not an
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
  seams: AssetSeams,
  db: CatalogDatabase,
  id: string,
  limit = TEXT_PREVIEW_BYTES,
): Promise<string | null> {
  return (await readAssetTextFor(seams, db, id, limit)).text;
}

/**
 * The codes that mean "this text exists and this server cannot read it yet":
 * a sidecar never uploaded, a note whose type is not flipped. Search counts
 * those as matched by name only, and says so; a file over the cap, or a row
 * with nothing behind it, is passed over as search always has.
 */
const NOT_READABLE_YET: ReadonlySet<RouteProblemCode> = new Set(["not-uploaded", "not-flipped"]);

/** `readAssetText`, saying whether a null was one of `NOT_READABLE_YET`. */
export async function readAssetTextFor(
  seams: AssetSeams,
  db: CatalogDatabase,
  id: string,
  limit: number,
): Promise<{ text: string | null; unreadable: boolean }> {
  try {
    const resolved = await resolveAsset(seams, db, id);
    if (resolved.ok === false) return { text: null, unreadable: NOT_READABLE_YET.has(resolved.code) };
    if (resolved.bytes > limit) return { text: null, unreadable: false };
    if (resolved.source === "row") return { text: resolved.body.toString("utf8"), unreadable: false };
    const read = await openBlob(seams, resolved.key);
    const chunks: Buffer[] = [];
    for await (const chunk of read.body) chunks.push(chunk as Buffer);
    return { text: Buffer.concat(chunks).toString("utf8"), unreadable: false };
  } catch (error) {
    warn(`asset text ${id}`, error);
    return { text: null, unreadable: false };
  }
}

export function warn(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`asset library: ${what} unavailable — ${message}`);
}
