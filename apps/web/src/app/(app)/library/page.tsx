import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

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
  loadLibrary,
  loadSearchText,
  thumbnailFor,
  thumbnailStatusFor,
  unservedRows,
} from "@/lib/asset-library";
import {
  addedOn,
  assetHref,
  courseFacets,
  explainedConcepts,
  filterRows,
  firstParam,
  isCompanionKind,
  kindFacets,
  libraryHref,
  parseSort,
  parseView,
  searchHits,
  searchTerms,
  sortRows,
  type LibraryCourse,
  type LibraryFilters,
  type LibraryView,
} from "@/lib/library";
import { isRenderSource, RENDER_SOURCES, uploadCommand } from "@/lib/asset-problems";
import { loadKnowledgeBase } from "@/lib/learner-store";
import { ownValue } from "@/lib/own-key";

export const metadata: Metadata = {
  title: "Library",
  description: "Every video, diagram, note, session log and link the catalog holds.",
};

/**
 * `/library` (hi-fi screen 10): every asset the catalog knows about, as a grid
 * to search and filter, or as a list of rows (`?view=list`) for scanning many.
 *
 * **The filters are the URL.** `?kind=`, `?course=`, `?topic=`, `?q=`,
 * `?sort=` and `?view=` are the whole state, so a view is linkable and the back button
 * undoes a filter. Each filter group is a `FilterMenu` (Type, Course, and
 * Topic when one is set); the page reads the filters and the options here, and
 * the small client `LibraryToolbar` pushes the `libraryHref` of a pick, so
 * the page itself stays a server component. The toolbar puts the filters on
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
 * the canvas beside each diagram) are kept out of All kinds and sit in their
 * own "Companion files" section of the Type menu, with their counts: they are
 * values of the same `?kind=`, so one menu for one parameter means the
 * trigger never contradicts the URL. `@/lib/library` holds the rule and the
 * reason.
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
  const filters: LibraryFilters = { kind, topic, course, q, sort, view };

  const [library, { kb }, courses] = await Promise.all([loadLibrary(), loadKnowledgeBase(), getCourses()]);
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

  const matching = sortRows(filterRows(rows, { kind, topic, courseTopics, hits }), sort);
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
  const filtered = kind !== null || topic !== null || course !== null || q !== null;
  const kindLabel = (k: string) =>
    [...facets.primary, ...facets.companion].find((f) => f.kind === k)?.label ?? k;

  // Out of the rows this view could ever show: the standalone ones, or every
  // row when a companion kind is chosen.
  const universe = kind !== null && isCompanionKind(kind) ? facets.total : facets.standalone;
  const plural = (n: number) => (n === 1 ? "asset" : "assets");
  const conditions = [
    kind !== null && `a ${kindLabel(kind).toLowerCase()}`,
    chosenCourse !== null && `in ${chosenCourse.code}`,
    course !== null && chosenCourse === null && `in a course called "${course}"`,
    topic !== null && `filed under ${ownValue(titles, topic) ?? topic}`,
  ].filter((c): c is string => typeof c === "string");
  const noMatchSentence =
    "Nothing in the catalog" +
    (conditions.length > 0 ? ` is ${conditions.join(", ")}` : "") +
    (q === null ? "" : `${conditions.length > 0 ? " and" : ""} matches "${q}"`) +
    ".";
  const hidden = facets.total - facets.standalone;
  const count =
    (filtered ? `${matching.length} of ${universe} ${plural(universe)}` : `${universe} ${plural(universe)}`) +
    // Said out loud, since the companion rows are only listed inside the Type menu.
    (hidden > 0 && kind === null ? ` · ${hidden} companion ${hidden === 1 ? "file" : "files"} not in All kinds` : "");

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

  const typeOptions: LibraryMenu["options"] = [
    { value: "", label: "All kinds", short: "All", count: facets.standalone },
    ...facets.primary.map((f) => ({ value: f.kind, label: f.label, count: f.count })),
    ...facets.companion.map((f) => ({ value: f.kind, label: f.label, count: f.count, section: "Companion files" })),
  ];
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
  const menus: LibraryMenu[] = [
    { label: "Type", param: "kind", value: kind ?? "", options: typeOptions },
    { label: "Course", param: "course", value: course ?? "", options: courseOptions },
  ];
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
    <div data-layout="app" className={cx("group/library flex flex-col gap-4", PAGE_ENTER)}>
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="font-display text-[28px] leading-tight font-bold text-text">Library</h1>
        {reachable && facets.total > 0 && <p className="text-[12px] text-text2 tabular-nums">{count}</p>}
      </header>

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
            filters={filters}
            menus={menus}
            sort={sortMenu}
            layout={<ViewToggle filters={filters} view={view} />}
            search={
              <Form action="/library" role="search" className="min-w-0 flex-1 md:min-w-[120px] md:max-w-[260px]">
                {/* The other filters ride along, so a search narrows the view the
                    reader is in rather than resetting it. Only the ones that are set,
                    so an unfiltered search is a clean `?q=`. */}
                {kind !== null && <input type="hidden" name="kind" value={kind} />}
                {topic !== null && <input type="hidden" name="topic" value={topic} />}
                {course !== null && <input type="hidden" name="course" value={course} />}
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
          ) : view === "list" ? (
            <ul
              aria-label={listLabel}
              className={cx(
                "flex flex-col divide-y-2 divide-border overflow-hidden rounded-[20px] border-2 border-border bg-surface",
                RESULTS_MOTION,
              )}
            >
              {matching.map((row) => {
                const { concept, topic: topicLabel } = describe(row);
                return (
                  <li key={row.id} className={ARRIVE}>
                    <AssetRow
                      asset={row}
                      concept={concept}
                      topic={topicLabel}
                      added={addedOn(row.createdAt)}
                      href={assetHref(row.id)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul
              aria-label={listLabel}
              className={cx("grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]", RESULTS_MOTION)}
            >
              {matching.map((row) => {
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
