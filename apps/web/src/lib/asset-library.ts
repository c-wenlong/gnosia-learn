import "server-only";

import { readFile } from "node:fs/promises";
import { connection } from "next/server";
import {
  assetCounts,
  assetDerivations,
  indexedRoot,
  listAssets,
  topicTitles,
  type AssetDerivations,
  type AssetKindCount,
  type TopicTitles,
  type AssetWithTopics,
  type CatalogDatabase,
} from "@self-learn/catalog/state";

import { assetFilesEnabled, resolveAssetFile } from "@/lib/asset-files";
import { catalogDatabase } from "@/lib/learner-store";
import { assetFileHref, assetPosterHref, compareByKindThenId } from "@/lib/library";

/**
 * The library's door to the catalog, shaped exactly like
 * `@/lib/learner-store`.
 *
 * **Server only**, and `import "server-only"` enforces it: everything here ends
 * at a Postgres pool or at `node:fs`, and a `"use client"` import would compile
 * and ship both to the browser. The pages are server components; the cards and
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
 * **The files are a third state, on top of those two.** A row can be perfectly
 * readable while its bytes are unreachable, and on a fresh clone that is the
 * normal case rather than an error: `ASSET_FILES_ENABLED` is unset, and even
 * with it set a manimkc index that predates the asset route records no data
 * root to resolve `out/…` against. `fileAccess()` answers that separately from
 * `reachable`, so the pages can show real titles, real topics and real sizes
 * while saying plainly that they cannot play the video yet.
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
}

const EMPTY_LIBRARY: LibrarySnapshot = {
  rows: [],
  counts: [],
  reachable: false,
  truncated: false,
  titles: {},
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
  try {
    const db = await catalogDatabase();
    const [rows, counts] = await Promise.all([
      listAssets(db, { limit: LIBRARY_ROW_CAP }),
      assetCounts(db),
    ]);
    // A third statement, and it has to be third: the slugs it asks about are
    // the ones the first read returned. It is a lookup rather than a fact the
    // page depends on, so the snapshot gap the comment above worries about
    // costs a chip its title here, never a wrong row.
    const titles = await topicTitles(db, distinctTopics(rows));
    return {
      rows: [...rows].sort(compareByKindThenId),
      counts,
      reachable: true,
      truncated: rows.length >= LIBRARY_ROW_CAP,
      titles,
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
}

const EMPTY_DETAIL: AssetDetail = {
  asset: null,
  derivations: { sources: [], derived: [] },
  related: [],
  reachable: false,
  titles: {},
  notes: {},
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
  try {
    const db = await catalogDatabase();
    const [asset] = await listAssets(db, { ids: [id] });
    if (asset === undefined) {
      return {
        asset: null,
        derivations: { sources: [], derived: [] },
        related: [],
        reachable: true,
        titles: {},
        notes: {},
      };
    }

    // Only a markdown file can contain a wikilink, so only a markdown file
    // pays for the index. `endsWith` rather than the kind, because a session
    // log and a concept note are different kinds and both are markdown.
    const wantsNotes = asset.path?.endsWith(".md") ?? false;

    const [derivations, perTopic] = await Promise.all([
      assetDerivations(db, id),
      // Unlimited on purpose; see the note above `RELATED_CAP`.
      Promise.all(asset.topics.map((slug) => listAssets(db, { topicSlug: slug }))),
    ]);

    const notes = wantsNotes ? noteIndex(await listAssets(db, { kind: "note" })) : {};

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
    const titles = await topicTitles(db, distinctTopics([asset, ...related]));

    return { asset, derivations, related, reachable: true, titles, notes };
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
 * Whether this deployment can hand over an asset's bytes, and if not, why.
 *
 * Three answers, and the difference between the last two is the difference
 * between a switch and a re-index. The library shows all three as a state
 * rather than as an error, because "off" is what a fresh clone looks like: the
 * route is documented off by default in `.env.example`, production has none of
 * these files, and a page that responded with dead players and broken images
 * would be describing a problem the reader does not have.
 */
export type FileAccess =
  | { ok: true }
  | {
      ok: false;
      /**
       * `off` is the switch; `unindexed` and `stale` are the manimkc data root;
       * `unknown` is the check itself having failed.
       */
      reason: "off" | "unindexed" | "stale" | "unknown";
      headline: string;
      detail: string;
      /** The exact thing to run or set. Rendered as a command, so it is one line. */
      fix: string;
    };

const FILES_OFF: FileAccess = {
  ok: false,
  reason: "off",
  headline: "This deployment does not serve asset files.",
  detail:
    "The library can still say what the catalog holds — every title, topic, size and path below is real — " +
    "but the videos and diagrams themselves are not being served, so nothing here will play or draw. " +
    "Off is the default: production carries the course files and nothing else, and a render lives on a laptop.",
  fix: "ASSET_FILES_ENABLED=1",
};

/**
 * Answered for the whole page rather than per card, because both failures are
 * properties of the deployment and of the index, never of one row: if one
 * manimkc video cannot be resolved then none of the thirty can, and thirty
 * copies of the same explanation is not a better page than one.
 *
 * `self-learn` assets — the diagrams, the notes, the session logs — resolve
 * against the repository, which is always there, so the switch is the only
 * thing that can stop them. manimkc's resolve against a data root recorded on
 * `index_run.metadata.outRoot` at index time, which is why the second and third
 * answers exist. `@/lib/asset-files` has the full reasoning for why that value
 * cannot be read out of `$MANIMKC_HOME` here.
 */
export async function readFileAccess(): Promise<{ selfLearn: FileAccess; manimkc: FileAccess }> {
  if (!assetFilesEnabled()) return { selfLearn: FILES_OFF, manimkc: FILES_OFF };

  let run: Awaited<ReturnType<typeof indexedRoot>>;
  try {
    run = await indexedRoot(await catalogDatabase(), "manimkc");
  } catch (error) {
    warn("manimkc index root", error);
    // Not `{ ok: true }`. This read is separate from the one that fetches the
    // rows, so a failure here can land while the rows come back fine — and
    // then a page that treated "could not check" as "available" would render a
    // player pointing at a URL the file route is about to refuse. Unknown
    // fails closed, and says which question went unanswered rather than
    // claiming the index is missing, which it has no evidence of.
    return {
      selfLearn: { ok: true },
      manimkc: {
        ok: false,
        reason: "unknown",
        headline: "Could not check where manimkc's files are.",
        detail:
          "The rows below are real; what could not be read is the index run that records the directory " +
          "their out/… paths resolve against. Nothing is known to be wrong with the files themselves.",
        fix: "npm run catalog -- status",
      },
    };
  }

  if (run === null) {
    return {
      selfLearn: { ok: true },
      manimkc: {
        ok: false,
        reason: "unindexed",
        headline: "No manimkc index on this machine.",
        detail:
          "Nothing records where the rendered videos are, so their rows are here and their files cannot be found. " +
          "Every video below is real; one index run is what connects it to its bytes.",
        fix: "npm run catalog -- index --only manimkc",
      },
    };
  }
  if (run.dataRoot === null) {
    return {
      selfLearn: { ok: true },
      manimkc: {
        ok: false,
        reason: "stale",
        headline: "The manimkc index predates the asset route.",
        detail:
          "These rows were indexed before a run recorded manimkc's data root, so their out/… paths have no base " +
          "to resolve against. The files are not missing; nothing knows which directory to look in.",
        fix: "npm run catalog -- index --only manimkc",
      },
    };
  }
  return { selfLearn: { ok: true }, manimkc: { ok: true } };
}

/** As `readFileAccess`, with the marker that keeps it out of the build. */
export async function loadFileAccess(): Promise<{ selfLearn: FileAccess; manimkc: FileAccess }> {
  await connection();
  return readFileAccess();
}

/** Which of the two verdicts above applies to a row, by the source it came from. */
export function accessFor(
  access: { selfLearn: FileAccess; manimkc: FileAccess },
  sourceRepo: string,
): FileAccess {
  return sourceRepo === "manimkc" ? access.manimkc : access.selfLearn;
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
 * A diagram is already an image, so it is served as itself. A video is not,
 * and an `<img>` pointed at an `.mp4` decodes nothing; `/poster` cuts a frame
 * out of it instead. Everything else has no picture to show and says so.
 *
 * Both depend on the file route being reachable for that asset's repo, which
 * is a per-request answer rather than a property of the row: the route is off
 * in production, and a manimkc index older than it answers 503. When it is
 * not reachable the placeholder is the correct output, not a broken image.
 */
export function thumbnailFor(
  row: AssetWithTopics,
  access: { selfLearn: FileAccess; manimkc: FileAccess },
): string | null {
  if (!accessFor(access, row.sourceRepo).ok) return null;
  if (row.kind === "diagram_svg") return assetFileHref(row.id);
  return row.kind === "video" ? assetPosterHref(row.id) : null;
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
 * `resolveAssetFile` does the resolving, which is not an implementation detail
 * being reused for convenience: it is the module that holds every containment
 * check the asset route makes — the id is a primary key and never a path, the
 * stored path is proved to be inside its source root before and after symlinks
 * resolve, and the extension has to be on a closed list. A page that read
 * `path.join(root, row.path)` itself would be a second, weaker copy of that.
 *
 * Gated by the same switch as the route, because a deployment that says it does
 * not serve these files should not read them either.
 *
 * Null means "no text to show", for every reason there is: the switch is off,
 * the row has no file, the file is gone, it is larger than the cap. The callers
 * all render the same thing for all of them — the file's metadata and a link —
 * so distinguishing them here would produce a difference nothing acts on.
 */
export async function readAssetText(
  db: CatalogDatabase,
  id: string,
  limit = TEXT_PREVIEW_BYTES,
): Promise<string | null> {
  if (!assetFilesEnabled()) return null;
  try {
    const resolved = await resolveAssetFile(db, id);
    if (resolved.ok === false || resolved.bytes > limit) return null;
    return await readFile(resolved.file, "utf8");
  } catch (error) {
    warn(`asset text ${id}`, error);
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
