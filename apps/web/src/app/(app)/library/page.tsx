import type { Metadata } from "next";
import Form from "next/form";

import { PAGE_ENTER } from "@/components/PageLoading";
import { LibraryResults } from "@/components/library/LibraryResults";
import { LibraryToolbar, type LibraryMenu } from "@/components/library/LibraryToolbar";
import { loadLibraryView, renderLibraryPage } from "@/components/library/library-view";
import { Previewer } from "@/components/library/Previewer";
import { loadPreview } from "@/components/library/preview-content";
import { Notice } from "@/components/ui/Notice";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cx, NOTE, PAGE_TITLE, STATUS_TEXT } from "@/components/ui/classes";
import { TextLink } from "@/components/ui/TextLink";
import { unservedRows } from "@/lib/asset-library";
import {
  filesNoun,
  isCompanionKind,
  isOtherKind,
  libraryHref,
  libraryTabs,
  OTHERS_KIND,
  tabOf,
  type LibraryFilters,
  type LibraryView,
} from "@/lib/library";
import { isRenderSource, RENDER_SOURCES, uploadCommand } from "@/lib/asset-problems";
import { parseOpen } from "@/lib/library-preview";
import { ownValue } from "@/lib/own-key";

export const metadata: Metadata = {
  title: "Library",
  description: "Every video, diagram, note, session log and link the catalog holds.",
};

/**
 * `/library` (hi-fi screen 10): every asset the catalog knows about, as a grid
 * to search and filter, or as a list of rows (`?view=list`) for scanning many.
 *
 * **The filters are the URL.** `?kind=`, `?course=`, `?topic=`, `?favorites=`,
 * `?q=`, `?sort=`, `?view=` and `?group=` are the whole state, so a view is linkable and the back button
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
 * **Or by course or by topic** (L4), from the view options beside the
 * layout switch, as `?group=course` (a heading per course, its modules in
 * course order inside, "No course" last) or `?group=topic` (a heading per
 * topic in the Learn map's order, "No topic" last, each list row
 * naming its concept first; `?group=concept` is the same), or
 * `?group=conversation` (a heading per studio conversation, newest first, with
 * the day it was last written to, "No conversation" last, Manus's Group by
 * task); each row in the one group its source line names
 * (`@/lib/library-groups`). Every row and
 * card carries a more menu (L5, `RowMenu`), whose items are decided here per
 * asset by `rowMenuItems`, so the stars are read on every visit, not only
 * while Favorites only is on.
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
 * **In pages** (L9): the page draws the first fifty or so rows, the headings
 * with their whole counts, and `LibraryResults` asks `libraryPage` for the
 * rest a screen before the reader reaches them, showing placeholders with a
 * sheen meanwhile. The rows are worked out once for both, in
 * `loadLibraryView` (`@/components/library/library-view`).
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
  // The asset open in the previewer (L6), when the page is loaded with one:
  // its body is in the first paint rather than a skeleton.
  const open = parseOpen(params.open);
  const [listed, preview] = await Promise.all([
    loadLibraryView(params),
    open === null ? Promise.resolve(null) : loadPreview(open),
  ]);
  const { kind, topic, course, q, sort, favorites, group, filters, starred, access, facets, courseChips, chosenCourse, search, matching, view } = listed;
  const { rows, counts, reachable, truncated, titles } = listed.library;
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
      ? "Nothing is starred yet. Press Favorite in a row's menu or on an asset's page to star it."
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
  // The first page of rows (L9): about fifty, rounded up to finish the group
  // they end in; the rest load as the reader scrolls.
  const firstPage = renderLibraryPage(listed, null);
  const here = libraryHref(filters);
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
      {(!reachable || facets.total === 0) && <h1 className={PAGE_TITLE}>Library</h1>}

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
                <h1 className={PAGE_TITLE}>Library</h1>
                <p className={cx(NOTE, "whitespace-nowrap tabular-nums")}>{count}</p>
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
                {group !== "day" && <input type="hidden" name="group" value={group} />}
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
            <p role="status" className={cx(STATUS_TEXT, "text-text2")}>
              Your stars could not be read just now, so nothing is shown as starred. They are where they were.
            </p>
          )}

          {search !== null && !search.searchedText && (
            <p role="status" className={cx(STATUS_TEXT, "text-text2")}>
              Searched titles only: no note or transcript here has a stored copy yet, so they were matched by
              name, not by what they say.
            </p>
          )}
          {search !== null && search.searchedText && search.skipped > 0 && (
            <p role="status" className={cx(STATUS_TEXT, "text-text2")}>
              {search.skipped} {search.skipped === 1 ? "note or transcript was" : "notes and transcripts were"}{" "}
              matched by name only: {search.skipped === 1 ? "it has" : "they have"} no stored copy yet.
            </p>
          )}

          {/* A press on a row or a card opens it in the previewer over the
              list (L6); `?open=` names the one open, so a reload or a link
              reopens it, a filter that now matches nothing included. */}
          <Previewer initial={preview} initialOpen={open}>
          {matching.length === 0 ? (
            <Notice title="No assets match" actions={<TextLink href="/library">Clear every filter</TextLink>}>
              <p>{noMatchSentence}</p>
            </Notice>
          ) : firstPage.state === "ok" ? (
            // Keyed by the view's URL: a new tab, filter, sort or grouping
            // starts again at its own first page.
            <LibraryResults
              key={here}
              href={here}
              view={view}
              label={listLabel}
              first={firstPage}
              more={group === "day" && sort === "newest" ? "Show older" : "Show more"}
            />
          ) : null}
          </Previewer>

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
 * The grid and the list, as the kit's segmented control in its links mode:
 * each is a URL, like every other choice on this page, and the one in use is
 * marked `aria-current`. Icons only, since the tiles and the lines say which
 * is which; each link is named for a screen reader and titled for a hover.
 */
function ViewToggle({ filters, view }: { filters: LibraryFilters; view: LibraryView }) {
  return (
    <SegmentedControl
      mode="links"
      label="Layout"
      iconOnly
      value={view}
      items={[
        { id: "grid", label: "Grid", icon: "assets", href: libraryHref({ ...filters, view: "grid" }) },
        { id: "list", label: "List", icon: "topics", href: libraryHref({ ...filters, view: "list" }) },
      ]}
    />
  );
}
