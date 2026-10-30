import "server-only";

import type { ReactNode } from "react";

import { AssetCard, type CardConcept } from "@/components/AssetCard";
import { AssetRow } from "@/components/library/AssetRow";
import { cx } from "@/components/ui/classes";
import { getCourses } from "@/data/courses";
import { getTopics } from "@/data/topics";
import { loadAssetAccess, loadFavorites, loadLibrary, loadSearchText } from "@/lib/asset-library";
import { thumbnailFor, thumbnailStatusFor } from "@/lib/library-thumbnails";
import { dayGroups, editedLabel, timeOfDay } from "@/lib/day-groups";
import { loadKnowledgeBase } from "@/lib/learner-store";
import {
  assetHref,
  courseFacets,
  explainedConcepts,
  filterRows,
  firstParam,
  kindFacets,
  parseGroup,
  parseSort,
  parseView,
  searchHits,
  searchTerms,
  sortKeyOf,
  sortRows,
  type LibraryCourse,
} from "@/lib/library";
import {
  conversationGroups,
  courseGroups,
  topicBucket,
  topicGroups,
  topicRanks,
  type RowGroup,
} from "@/lib/library-groups";
import { pageOf, type LibraryPage, type PageCursor, type StalePage } from "@/lib/library-pages";
import { conceptOrder, latestConversation, orderedConcepts, rowSource } from "@/lib/library-source";
import { bucketOf, type MasteryBucket } from "@/lib/mastery-bucket";
import { currentOwner } from "@/lib/owner";
import { ownValue } from "@/lib/own-key";
import { rowMenuItems } from "@/lib/row-menu";
import { appTimeZone } from "@/lib/time-zone";

/** The Library's URL parameters, as a page or `URLSearchParams` hands them over. */
export type LibraryParams = { [key: string]: string | string[] | undefined };

/**
 * How long the server function behind scrolling may reuse the view the page
 * (or an earlier page of it) worked out, and how many views it keeps.
 */
const VIEW_REUSE_MS = 60_000;
const VIEWS_KEPT = 8;

/** Views worked out lately, by owner and filters, oldest first. */
const recentViews = new Map<string, { at: number; read: number; view: LibraryView }>();

/** Reads started, so a slower read begun earlier never replaces a newer one's view. */
let readsStarted = 0;

/**
 * What the Library shows for one URL, read and worked out once: the rows that
 * match the filters, sorted and grouped, and how to draw each one. The page
 * (`/library`) draws its header and first page from it, and the server
 * function behind scrolling (`libraryPage` in `page-action.tsx`) the next
 * page, so the two cannot draw a row differently (L9 of
 * docs/proposals/library-by-type-and-day.md).
 *
 * **The page reads; scrolling reuses.** Working a view out reads every row
 * the owner holds, their parents, the knowledge base, the courses and, for a
 * search, the words of every note and transcript, and a page of it draws
 * about fifty rows. So each view is kept for `VIEW_REUSE_MS`, by owner and
 * filters, and `{ reuse: true }` (the scroll's next page, and each of the
 * pages a back navigation asks for again) takes it rather than reading the
 * catalog once a page. The page itself never reuses: every render, a
 * `router.refresh()` after a star or a rename included, reads afresh and
 * replaces the kept view, so the pages after it agree with it.
 *
 * Every read is the owner's: the loaders scope themselves to
 * `currentOwner()`, as they do for the page.
 */
export async function loadLibraryView(params: LibraryParams, { reuse = false }: { reuse?: boolean } = {}) {
  const filters = libraryFilters(params);
  const key = `${await currentOwner()}\n${JSON.stringify(filters)}`;
  const kept = recentViews.get(key);
  if (reuse && kept !== undefined && Date.now() - kept.at < VIEW_REUSE_MS) return kept.view;

  const at = Date.now();
  const read = ++readsStarted;
  const view = await workOutView(filters);
  // A read begun after this one (a refresh after a rename, say) finished
  // first: its view is the newer, and the pages after it go on from it.
  if ((recentViews.get(key)?.read ?? 0) > read) return view;
  recentViews.delete(key);
  // An unreachable catalog is asked again next time rather than remembered.
  if (view.library.reachable) {
    recentViews.set(key, { at, read, view });
    for (const old of recentViews.keys()) {
      if (recentViews.size <= VIEWS_KEPT) break;
      recentViews.delete(old);
    }
  }
  return view;
}

/** The view's filters from its URL, in one fixed shape, so one view has one key. */
function libraryFilters(params: LibraryParams) {
  return {
    kind: firstParam(params.kind),
    topic: firstParam(params.topic),
    course: firstParam(params.course),
    q: firstParam(params.q)?.trim() || null,
    sort: parseSort(firstParam(params.sort)),
    view: parseView(firstParam(params.view)),
    favorites: firstParam(params.favorites) === "1",
    group: parseGroup(firstParam(params.group)),
  };
}

async function workOutView(filters: ReturnType<typeof libraryFilters>) {
  const { kind, topic, course, q, sort, view, favorites, group } = filters;

  const [library, { kb }, courses, starred, vocabulary] = await Promise.all([
    loadLibrary(),
    loadKnowledgeBase(),
    getCourses(),
    // The filter reads them, and so does every row's menu (Favorite or Unfavorite).
    loadFavorites(),
    // The topic headings' titles and order, read only for that grouping. A
    // heading is a label, so a vocabulary that cannot be read falls back to
    // the asset rows' own topic titles, then the slug, in slug order, rather
    // than failing the page.
    group === "topic" ? getTopics().catch(() => []) : Promise.resolve([]),
  ]);
  // A store that could not be read filters to nothing rather than to
  // everything, and the page says why.
  const favoriteIds = favorites ? (starred ?? new Set<string>()) : null;
  const { rows, counts, titles, concepts } = library;
  // Per row: a video in the blob store or a note the database owns draws, and
  // anything else shows its placeholder.
  const access = await loadAssetAccess(rows);

  const facets = kindFacets(counts);
  const libraryCourses: LibraryCourse[] = courses.map((c) => ({
    slug: c.slug,
    code: c.code,
    title: c.title,
    topics: c.modules.map((m) => m.topic),
  }));
  const courseChips = courseFacets(libraryCourses, rows);
  // An unknown course slug matches nothing rather than being ignored: a URL
  // that names a course and shows the whole library would be claiming a
  // filter it did not apply.
  const chosenCourse = course === null ? null : (libraryCourses.find((c) => c.slug === course) ?? null);
  const courseTopics = course === null ? null : new Set(chosenCourse?.topics ?? []);

  const terms = searchTerms(q);
  const search = terms.length > 0 ? await loadSearchText(rows, terms) : null;
  const hits = search === null ? null : searchHits(rows, terms, search.texts, search.sources);

  const matching = sortRows(filterRows(rows, { kind, topic, courseTopics, hits, favorites: favoriteIds }), sort);
  type Row = (typeof matching)[number];

  const kbById = new Map(kb.concepts.map((c) => [c.id, c]));
  const order = conceptOrder(kb.concepts);
  const now = new Date();
  const timeZone = appTimeZone();

  // What a card or a row names beside the title: the first concept the asset
  // explains, in the prerequisite graph's order (`orderedConcepts`), so the
  // card, the row's line, its menu and the topic heading name the same one,
  // with how many more; or its topic when it explains none. Grouped by topic,
  // that topic is the heading the row sits under (`topicGroups` files a row
  // with no concept by its first topic), so it is not said again.
  const describe = (row: Row): { concept?: CardConcept; topic?: string } => {
    const explained = explainedConcepts(orderedConcepts(ownValue(concepts, row.id) ?? [], order), kbById);
    const first = explained[0];
    const topicSlug = group === "topic" ? undefined : row.topics[0];
    return {
      concept: first === undefined ? undefined : { title: first.title, bucket: first.bucket, more: explained.length - 1 },
      topic: topicSlug === undefined ? undefined : (ownValue(titles, topicSlug) ?? topicSlug),
    };
  };

  // Where a list row came from, said on its second line (L3).
  const sourceOf = (row: Row) =>
    rowSource(ownValue(library.parents, row.id), {
      course,
      order,
      // Grouped by course, the heading and the section already say the place.
      placeInHeading: group === "course",
      concept: (slug) => {
        const known = kbById.get(slug);
        return known === undefined ? null : { title: known.title, bucket: bucketOf(known) };
      },
    });
  const parentsOf = (row: Row) => ownValue(library.parents, row.id);
  // Every concept's bucket by its topic, for a topic heading's dot: all the
  // topic's concepts, not only the ones with an asset here.
  const topicConceptBuckets = new Map<string, MasteryBucket[]>();
  const conceptTopic = new Map<string, string>();
  if (group === "topic") {
    for (const c of kb.concepts) {
      if (!c.topic) continue;
      conceptTopic.set(c.id, c.topic);
      const list = topicConceptBuckets.get(c.topic);
      if (list === undefined) topicConceptBuckets.set(c.topic, [bucketOf(c)]);
      else list.push(bucketOf(c));
    }
  }
  const topicTitles = new Map(vocabulary.map((t) => [t.slug, t.title]));
  // Day, the default, or course, topic or conversation from the view options (L4).
  const groups: RowGroup<Row>[] =
    group === "course"
      ? courseGroups(matching, (row) => parentsOf(row)?.places ?? [], { course })
      : group === "conversation"
        ? conversationGroups(matching, (row) => latestConversation(parentsOf(row)), { now, timeZone })
        : group === "topic"
          ? topicGroups(
              matching,
              (row) => ({ concepts: parentsOf(row)?.concepts ?? [], topics: row.topics }),
              {
                order,
                topicOf: (slug) => conceptTopic.get(slug) ?? null,
                rank: topicRanks(vocabulary, conceptTopic, kb.edges ?? []),
                topic: (slug) => ({
                  title: topicTitles.get(slug) ?? ownValue(titles, slug) ?? slug,
                  bucket: topicBucket(topicConceptBuckets.get(slug) ?? []),
                }),
              },
            )
          : dayGroups(matching, (row) => row.createdAt, { now, timeZone });
  // The more menu's items, per row (L5).
  const menuOf = (row: Row) =>
    rowMenuItems({
      id: row.id,
      kind: row.kind,
      parents: parentsOf(row),
      order,
      course,
      served: access.served.has(row.id),
      starred: starred === null ? null : starred.has(row.id),
    });

  /** One row as its list item: a line in the list, a card in the grid. */
  const renderRow = (row: Row): ReactNode => {
    if (view === "list") {
      return (
        <li key={row.id} className={cx("group/item", ARRIVE)}>
          <AssetRow
            asset={row}
            source={sourceOf(row)}
            grouping={group}
            topic={describe(row).topic}
            time={timeOfDay(row.createdAt, timeZone)}
            edited={editedLabel(row.createdAt, row.editedAt, { now, timeZone })}
            href={assetHref(row.id)}
            menu={menuOf(row)}
          />
        </li>
      );
    }
    const { concept, topic: topicLabel } = describe(row);
    return (
      <li key={row.id} className={cx("flex", ARRIVE)}>
        <AssetCard
          asset={row}
          concept={concept}
          topic={topicLabel}
          href={assetHref(row.id)}
          menu={menuOf(row)}
          // A diagram is its own thumbnail; a video gets a frame
          // cut out of it on demand; everything else gets the
          // labelled placeholder.
          thumbnailSrc={thumbnailFor(row, access)}
          thumbnailStatusHref={thumbnailStatusFor(row, access)}
        />
      </li>
    );
  };

  return {
    kind,
    topic,
    course,
    q,
    sort,
    view,
    favorites,
    group,
    filters,
    library,
    starred,
    access,
    facets,
    courseChips,
    chosenCourse,
    search,
    matching,
    groups,
    renderRow,
  };
}

export type LibraryView = Awaited<ReturnType<typeof workOutView>>;

/** A page of the Library drawn: its pieces' rows as list items, ready for the client to fold. */
export type RenderedPage = LibraryPage<ReactNode>;

/**
 * The page after `after` (the first when null), each row drawn by the view's
 * `renderRow`, its groups in the first page's `order` when the reader sent
 * it. Stale when the cursor's group is gone (`pageOf`).
 */
export function renderLibraryPage(
  view: LibraryView,
  after: PageCursor | null,
  order?: readonly string[],
): RenderedPage | StalePage {
  const page = pageOf(view.groups, sortKeyOf, view.sort, after, { order });
  if (page.state === "stale") return page;
  return {
    ...page,
    pieces: page.pieces.map((piece) => ({ ...piece, rows: piece.rows.map(view.renderRow) })),
  };
}

/** A row that arrives (a tab, a filter, a page of older rows) fades in. */
export const ARRIVE = "animate-fade-in motion-reduce:animate-none";
