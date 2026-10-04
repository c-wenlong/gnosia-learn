import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";

import { AssetCard, type CardConcept } from "@/components/AssetCard";
import { PAGE_ENTER } from "@/components/PageLoading";
import { AssetRow } from "@/components/library/AssetRow";
import { LibraryToolbar, type LibraryMenu } from "@/components/library/LibraryToolbar";
import { Notice } from "@/components/library/Notice";
import { Glyph } from "@/components/ui/Glyph";
import { SearchField } from "@/components/ui/SearchField";
import { cx } from "@/components/ui/classes";
import { getCourses } from "@/data/courses";
import {
  loadAssetAccess,
  loadFavorites,
  loadLibrary,
  loadSearchText,
  thumbnailFor,
  thumbnailStatusFor,
  unservedRows,
} from "@/lib/asset-library";
import {
  assetHref,
  courseFacets,
  explainedConcepts,
  filesNoun,
  filterRows,
  firstParam,
  isCompanionKind,
  isOtherKind,
  kindFacets,
  libraryHref,
  libraryTabs,
  OTHERS_KIND,
  parseSort,
  parseView,
  searchHits,
  searchTerms,
  sortRows,
  tabOf,
  type LibraryCourse,
  type LibraryFilters,
  type LibraryView,
} from "@/lib/library";
import { isRenderSource, RENDER_SOURCES, uploadCommand } from "@/lib/asset-problems";
import { dayGroups, editedLabel, timeOfDay, type DayGroup } from "@/lib/day-groups";
import { loadKnowledgeBase } from "@/lib/learner-store";
import { conceptOrder, rowSource } from "@/lib/library-source";
import { bucketOf } from "@/lib/mastery-bucket";
import { ownValue } from "@/lib/own-key";
import { appTimeZone } from "@/lib/time-zone";

export const metadata: Metadata = {
  title: "Library",
  description: "Every video, diagram, note, session log and link the catalog holds.",
};

/**
 * `/library` (hi-fi screen 10): every asset the catalog knows about, as a grid
 * to search and filter, or as a list of rows (`?view=list`) for scanning many.
 *
 * **The filters are the URL.** `?kind=`, `?course=`, `?topic=`, `?favorites=`,
 * `?q=`, `?sort=` and `?view=` are the whole state, so a view is linkable and the back button
 * undoes a filter. The kind is a strip of type tabs under the title (All,
 * Videos, Diagrams, Notes, Sessions, Links, and Others when there are
 * companion files; one chip on a phone), and the course and topic are
 * `FilterMenu`s (Course, and Topic when one is set), beside a Favorites
 * toggle that keeps only what the owner starred on an asset's page; the page
 * reads the filters and the options here, and the small client
 * `LibraryToolbar` pushes the `libraryHref` of a pick, so the page itself
 * stays a server component.
 *
 * **Grouped by day, newest first** (L2 of
 * docs/proposals/library-by-type-and-day.md), in both layouts: a heading per
 * calendar day ("4 Oct (5)", in the zone Home counts days in), 40px between
 * groups, the sort ordering the rows inside each. A list row names where the
 * asset came from (`rowSource`: its course and module, its concept, its
 * studio conversation or its tutor session) and the time it was made. The toolbar puts the filters on
 * the left and how to show them on the right: the search, the sort (a bare
 * menu reading "Newest" or "Title") and an icon-only grid or list switch, all
 * at a chip's height. The search box is a GET form (`next/form`, so
 * submitting it is a client-side navigation) that carries the other filters
 * along as hidden fields.
 *
 * **Search runs on the server**, over every row's title, filename and URL,
 * plus the words of each note and transcript when this deployment serves
 * files (`readSearchText` in `@/lib/asset-library` has the limits). A line
 * said in a video's transcript finds the video. With files off it is a title
 * search and the page says so.
 *
 * **What the default view shows, and why it is not every row.** The companion
 * files (a caption track, a transcript and a chapter list beside each video,
 * the canvas beside each diagram) are kept out of All and sit under the
 * Others tab (`?kind=other`), where a Kind menu narrows them to one kind with
 * its count; `?kind=transcript` is that tab narrowed, so an old link still
 * works. `@/lib/library` holds the rule and the reason.
 *
 * **Courses, not topics, are the second facet**, because eighty topics carry
 * assets and ten courses organise them. A course's assets are the ones filed
 * under its modules' topics. `?topic=` still works, for the links from an
 * asset page, and shows as a third menu only while it is set, whose "All
 * topics" clears it.
 *
 * **Dynamic, like every page here.** It reads the catalog, and every loader
 * marks its read as request work so `npm run build` succeeds with no
 * database.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const kind = firstParam(params.kind);
  const topic = firstParam(params.topic);
  const course = firstParam(params.course);
  const q = firstParam(params.q)?.trim() || null;
  const sort = parseSort(firstParam(params.sort));
  const view = parseView(firstParam(params.view));
  const favorites = firstParam(params.favorites) === "1";
  const filters: LibraryFilters = { kind, topic, course, q, sort, view, favorites };

  const [library, { kb }, courses, starred] = await Promise.all([
    loadLibrary(),
    loadKnowledgeBase(),
    getCourses(),
    // Read only when the filter is on: nothing else on the page draws a star.
    favorites ? loadFavorites() : Promise.resolve(null),
  ]);
  // A store that could not be read filters to nothing rather than to
  // everything, and the page says why below.
  const favoriteIds = favorites ? (starred ?? new Set<string>()) : null;
  const { rows, counts, reachable, truncated, titles, concepts } = library;
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
  // Said once for the view rather than on every card: how many rows here name
  // bytes nothing has stored yet, and the one command that stores them.
  const unserved = unservedRows(matching, access);
  // The upload command fills the store for the video tools' renders only; a
  // diagram or a note with nothing behind it gets there another way, so the
  // notice names the command only for the rows it would fix, once per tool
  // that has any.
  const renderTools = RENDER_SOURCES.filter((source) => unserved.some((row) => row.sourceRepo === source));
  const unservedRenders = unserved.filter((row) => isRenderSource(row.sourceRepo)).length;
  const unservedOther = unserved.length - unservedRenders;
  const renderCommand = renderTools.length === 0 ? undefined : renderTools.map(uploadCommand).join(" && ");
  // "manimkc", "manimkc and remotionkc", "manimkc, remotionkc and revideokc".
  const inWords = (names: readonly string[]) =>
    names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const kbById = new Map(kb.concepts.map((c) => [c.id, c]));
  const order = conceptOrder(kb.concepts);
  const now = new Date();
  const timeZone = appTimeZone();
  const tab = tabOf(kind);
  const tabs = libraryTabs(counts);
  // Narrowed beyond the tab: the header then says "12 of 30 files".
  const narrowed = topic !== null || course !== null || q !== null || favorites;
  const kindLabel = (k: string) =>
    k === OTHERS_KIND
      ? "Companion file"
      : ([...facets.primary, ...facets.companion].find((f) => f.kind === k)?.label ?? k);

  // Out of the rows the chosen tab could ever show: the standalone ones for
  // All, the companions for Others, or the one kind's. Favorites keeps that
  // total even though a starred companion file can show under All
  // (`filterRows` says why); those are counted after it (`companionsShown`).
  const universe =
    kind === null
      ? facets.standalone
      : kind === OTHERS_KIND
        ? counts.filter((c) => isOtherKind(c.kind)).reduce((sum, c) => sum + c.count, 0)
        : (counts.find((c) => c.kind === kind)?.count ?? 0);
  const plural = (n: number) => (n === 1 ? "asset" : "assets");
  const conditions = [
    favorites && "starred",
    kind !== null && `a ${kindLabel(kind).toLowerCase()}`,
    chosenCourse !== null && `in ${chosenCourse.code}`,
    course !== null && chosenCourse === null && `in a course called "${course}"`,
    topic !== null && `filed under ${ownValue(titles, topic) ?? topic}`,
  ].filter((c): c is string => typeof c === "string");
  const noMatchSentence =
    favorites && starred !== null && starred.size === 0
      ? "Nothing is starred yet. Press Favorite on an asset's page to star it."
      : "Nothing in the catalog" +
    (conditions.length > 0 ? ` is ${conditions.join(", ")}` : "") +
    (q === null ? "" : `${conditions.length > 0 ? " and" : ""} matches "${q}"`) +
    ".";
  // The counts left the menu for the header (L1): "42 files", or "12 of 42
  // files" when a course, a topic, a search or Favorites narrows the tab.
  // Starred companion files shown under All are counted on their own, so the
  // first figure stays within the total beside it.
  const companionsShown = favorites && kind === null ? matching.filter((row) => isCompanionKind(row.kind)).length : 0;
  const shown = matching.length - companionsShown;
  const count =
    (narrowed ? `${shown} of ${universe} ${filesNoun(universe)}` : `${universe} ${filesNoun(universe)}`) +
    (companionsShown > 0 ? ` · ${companionsShown} starred companion ${companionsShown === 1 ? "file" : "files"}` : "");

  const listLabel = q === null ? "Assets" : `Assets matching ${q}`;
  // What a card or a row names beside the title: the first concept the asset
  // explains, with how many more, or its topic when it explains none.
  const describe = (row: (typeof matching)[number]): { concept?: CardConcept; topic?: string } => {
    const explained = explainedConcepts(ownValue(concepts, row.id) ?? [], kbById);
    const first = explained[0];
    const topicSlug = row.topics[0];
    return {
      concept: first === undefined ? undefined : { title: first.title, bucket: first.bucket, more: explained.length - 1 },
      topic: topicSlug === undefined ? undefined : (ownValue(titles, topicSlug) ?? topicSlug),
    };
  };

  // Where a list row came from, said on its second line (L3).
  const sourceOf = (row: (typeof matching)[number]) =>
    rowSource(ownValue(library.parents, row.id), {
      course,
      order,
      concept: (slug) => {
        const known = kbById.get(slug);
        return known === undefined ? null : { title: known.title, bucket: bucketOf(known) };
      },
    });
  const groups = dayGroups(matching, (row) => row.createdAt, { now, timeZone });
  const courseOptions: LibraryMenu["options"] = [
    { value: "", label: "All courses", short: "All" },
    ...courseChips.map((f) => ({ value: f.slug, label: f.code, detail: f.title, count: f.count })),
  ];
  // A chosen course with no assets, or a slug no course has, still shows as
  // the checked row, so the menu agrees with its trigger.
  if (course !== null && !courseChips.some((f) => f.slug === course)) {
    courseOptions.push({
      value: course,
      label: chosenCourse?.code ?? course,
      detail: chosenCourse?.title ?? "No course has this name",
      count: 0,
    });
  }
  const menus: LibraryMenu[] = [{ label: "Course", param: "course", value: course ?? "", options: courseOptions }];
  // Inside Others, one menu narrows the companions to a kind, with the counts
  // the Type menu used to carry; `?kind=transcript` is this menu's pick.
  if (tab === OTHERS_KIND) {
    menus.unshift({
      label: "Kind",
      param: "kind",
      value: kind ?? OTHERS_KIND,
      defaultValue: OTHERS_KIND,
      options: [
        { value: OTHERS_KIND, label: "All companion files", short: "All" },
        ...facets.companion.map((f) => ({ value: f.kind, label: f.label, count: f.count })),
      ],
    });
  }
  if (topic !== null) {
    menus.push({
      label: "Topic",
      param: "topic",
      value: topic,
      options: [
        { value: "", label: "All topics", short: "All" },
        { value: topic, label: ownValue(titles, topic) ?? topic },
      ],
    });
  }

  // Bare, so the trigger reads "Newest" rather than "Sort: Newest"; the
  // options name an order on their own. Newest is when the row entered the
  // catalog; title is A to Z by the name on the card.
  const sortMenu: LibraryMenu = {
    label: "Sort",
    param: "sort",
    value: sort,
    defaultValue: "newest",
    bare: true,
    options: [
      { value: "newest", label: "Newest first", short: "Newest" },
      { value: "title", label: "Title, A to Z", short: "Title" },
    ],
  };

  return (
    // The root fades in once, when the page replaces the loading frame; a
    // filter, a sort or a search is a navigation that keeps it (measured), so
    // only the rows that arrive fade then.
    <div data-layout="app" className={cx("group/library flex flex-col gap-6", PAGE_ENTER)}>
      {(!reachable || facets.total === 0) && <h1 className={TITLE}>Library</h1>}

      {!reachable ? (
        <Notice title="The catalog is unreachable" command="npm run catalog -- status">
          This page is a view over the <code>asset</code> table, and the database could not be
          asked. Nothing has been lost by that: the rows, and the stored copies of the videos and
          diagrams, are where they were, and the page comes back when the database answers.
        </Notice>
      ) : facets.total === 0 ? (
        <Notice title="Nothing indexed yet" command="npm run catalog -- import">
          The catalog is reachable and holds no assets. The rows here are written by the catalog
          itself: an import of an export tree or the seed, the note, log and diagram writers, and
          the manimkc, remotionkc and revideokc indexers for the videos. None of those has run against this database yet.
        </Notice>
      ) : (
        <>
          <LibraryToolbar
            heading={
              <>
                <h1 className={TITLE}>Library</h1>
                <p className="text-[13px] whitespace-nowrap text-text2 tabular-nums">{count}</p>
              </>
            }
            filters={filters}
            tabs={tabs}
            tab={tab}
            menus={menus}
            sort={sortMenu}
            layout={<ViewToggle filters={filters} view={view} />}
            search={
              <Form action="/library" role="search" className="min-w-0 flex-1 md:w-[260px] md:min-w-[120px] md:flex-initial">
                {/* The other filters ride along, so a search narrows the view the
                    reader is in rather than resetting it. Only the ones that are set,
                    so an unfiltered search is a clean `?q=`. */}
                {kind !== null && <input type="hidden" name="kind" value={kind} />}
                {topic !== null && <input type="hidden" name="topic" value={topic} />}
                {course !== null && <input type="hidden" name="course" value={course} />}
                {favorites && <input type="hidden" name="favorites" value="1" />}
                {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
                {view !== "grid" && <input type="hidden" name="view" value={view} />}
                <SearchField
                  label="Search the library"
                  placeholder="Search"
                  defaultValue={q ?? ""}
                  maxLength={200}
                  size="chip"
                />
              </Form>
            }
          />

          {unserved.length > 0 && (
            <Notice
              role="status"
              title={`${unserved.length} ${plural(unserved.length)} here ${unserved.length === 1 ? "has" : "have"} no stored copy yet.`}
              command={renderCommand}
            >
              <p>
                Every title, topic and size below is real. What is missing is the bytes: the app serves a file only
                from the blob store or the database, so these will not play or draw until they are stored.
              </p>
              {unservedOther > 0 && (
                <p className="mt-2">
                  {unservedRenders > 0
                    ? `The command below stores the ${unservedRenders} rendered by ${inWords(renderTools)}. `
                    : ""}
                  {unservedOther === 1 ? "One is" : `${unservedOther} are`} not a render: a diagram is stored by{" "}
                  <code className="font-mono text-[12px]">catalog diagram put</code>, and a note or a session log by
                  flipping its type.
                </p>
              )}
            </Notice>
          )}

          {favorites && starred === null && (
            <p role="status" className="text-[12px] text-text2">
              Your stars could not be read just now, so nothing is shown as starred. They are where they were.
            </p>
          )}

          {search !== null && !search.searchedText && (
            <p role="status" className="text-[12px] text-text2">
              Searched titles only: no note or transcript here has a stored copy yet, so they were matched by
              name, not by what they say.
            </p>
          )}
          {search !== null && search.searchedText && search.skipped > 0 && (
            <p role="status" className="text-[12px] text-text2">
              {search.skipped} {search.skipped === 1 ? "note or transcript was" : "notes and transcripts were"}{" "}
              matched by name only: {search.skipped === 1 ? "it has" : "they have"} no stored copy yet.
            </p>
          )}

          {matching.length === 0 ? (
            <Notice title="No assets match">
              <p>{noMatchSentence}</p>
              <p className="mt-3">
                <Link href="/library" className="font-semibold text-accent-text underline-offset-4 hover:underline">
                  Clear every filter
                </Link>
              </p>
            </Notice>
          ) : (
            <section
              aria-label={listLabel}
              // A tab, a filter or a sort keeps the groups whose day is still
              // shown and fades in the ones that arrive.
              className={cx("flex flex-col gap-10", RESULTS_MOTION)}
            >
              {groups.map((group) => (
                <DaySection key={group.key} group={group} inset={view === "list"}>
                  {view === "list" ? (
                    <ul className="flex flex-col">
                      {group.rows.map((row) => (
                        <li key={row.id} className={cx("group/item", ARRIVE)}>
                          <AssetRow
                            asset={row}
                            source={sourceOf(row)}
                            topic={describe(row).topic}
                            time={timeOfDay(row.createdAt, timeZone)}
                            edited={editedLabel(row.createdAt, row.updatedAt, { now, timeZone })}
                            href={assetHref(row.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                      {group.rows.map((row) => {
                        const { concept, topic: topicLabel } = describe(row);
                        return (
                          <li key={row.id} className={cx("flex", ARRIVE)}>
                            <AssetCard
                              asset={row}
                              concept={concept}
                              topic={topicLabel}
                              href={assetHref(row.id)}
                              // A diagram is its own thumbnail; a video gets a frame
                              // cut out of it on demand; everything else gets the
                              // labelled placeholder.
                              thumbnailSrc={thumbnailFor(row, access)}
                              thumbnailStatusHref={thumbnailStatusFor(row, access)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </DaySection>
              ))}
            </section>
          )}

          {truncated && (
            <p className="text-[12px] text-text3">
              Read stopped at {rows.length} rows; there may be more.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The results dim while a filter, sort or view picked in the toolbar is
 * being rendered (`LibraryToolbar` marks itself `data-pending` for the
 * length of its transition), so the page says it heard the pick before the
 * new rows arrive, and a row that arrives fades in.
 */
const RESULTS_MOTION =
  "transition-opacity duration-150 ease-out motion-reduce:transition-none group-has-[[data-pending]]/library:opacity-60";
const ARRIVE = "animate-fade-in motion-reduce:animate-none";

const TITLE = "font-display text-[28px] leading-tight font-bold text-text";

/**
 * One day's rows under its heading, Manus's `date-heading`: the day ("4 Oct",
 * the year when it is not this one) and the count in grey, "(5)". The
 * heading is the shell's row height (`--shell-row`); in the list it is inset
 * by the row's start padding (`--shell-row-pad`) so it lines up with the
 * glyphs under it, and in the grid it sits flush with the cards. A day that
 * arrives with a tab or a filter fades in.
 */
function DaySection({ group, inset, children }: { group: DayGroup<unknown>; inset: boolean; children: ReactNode }) {
  const id = `day-${group.key || "none"}`;
  return (
    <section aria-labelledby={id} className={cx("flex flex-col", inset ? "gap-1" : "gap-3", ARRIVE)}>
      <h2
        id={id}
        className={cx(
          "flex h-[var(--shell-row)] items-center gap-1.5 text-[14px] leading-5 font-medium text-text",
          inset && "px-[var(--shell-row-pad)]",
        )}
      >
        {group.label}
        <span className="text-[12px] font-normal text-text2 tabular-nums">({group.rows.length})</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * The grid and the list, as two icon links in one chip-high pill: each is a
 * URL, like every other choice on this page, and the one in use is marked
 * `aria-current`. Icons only, since the tiles and the lines say which is
 * which; each link is named for a screen reader and titled for a hover.
 */
function ViewToggle({ filters, view }: { filters: LibraryFilters; view: LibraryView }) {
  const options: { value: LibraryView; label: string; glyph: "assets" | "topics" }[] = [
    { value: "grid", label: "Grid", glyph: "assets" },
    { value: "list", label: "List", glyph: "topics" },
  ];
  return (
    <nav aria-label="Layout" className="flex h-[34px] shrink-0 items-center rounded-full border border-border bg-surface p-[3px]">
      {options.map((option) => {
        const current = option.value === view;
        return (
          <Link
            key={option.value}
            href={libraryHref({ ...filters, view: option.value })}
            aria-current={current ? "page" : undefined}
            aria-label={option.label}
            title={option.label}
            scroll={false}
            className={cx(
              "inline-flex h-full w-[34px] items-center justify-center rounded-full transition-colors duration-100",
              current ? "bg-surface2 text-text" : "text-text2 hover:text-text",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <Glyph name={option.glyph} size={16} />
          </Link>
        );
      })}
    </nav>
  );
}
