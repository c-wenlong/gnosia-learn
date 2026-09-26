import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { AssetCard, type CardConcept } from "@/components/AssetCard";
import { Notice } from "@/components/library/Notice";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { cx } from "@/components/ui/classes";
import { courses } from "@/data/courses";
import {
  loadFileAccess,
  loadLibrary,
  loadSearchText,
  thumbnailFor,
  thumbnailStatusFor,
} from "@/lib/asset-library";
import {
  assetHref,
  courseFacets,
  explainedConcepts,
  filterRows,
  firstParam,
  isCompanionKind,
  kindFacets,
  libraryHref,
  parseSort,
  searchHits,
  searchTerms,
  sortRows,
  type LibraryCourse,
  type LibraryFilters,
} from "@/lib/library";
import { loadKnowledgeBase } from "@/lib/learner-store";

export const metadata: Metadata = {
  title: "Library",
  description: "Every video, diagram, note, session log and link the catalog holds.",
};

/**
 * `/library` (hi-fi screen 10): every asset the catalog knows about, as a grid
 * to search and filter.
 *
 * **The filters are the URL.** `?kind=`, `?course=`, `?topic=`, `?q=` and
 * `?sort=` are the whole state, so every chip is a link, a view is linkable
 * and the back button undoes a filter. The search box is a GET form
 * (`next/form`, so submitting it is a client-side navigation) that carries the
 * other filters along as hidden fields.
 *
 * **Search runs on the server**, over every row's title, filename and URL,
 * plus the words of each note and transcript when this deployment serves
 * files (`readSearchText` in `@/lib/asset-library` has the limits). A line
 * said in a video's transcript finds the video. With files off it is a title
 * search and the page says so.
 *
 * **What the default view shows, and why it is not every row.** The companion
 * files (a caption track, a transcript and a chapter list beside each video,
 * the canvas beside each diagram) are kept out of All kinds and keep their own
 * chips under the filter row; `@/lib/library` holds the rule and the reason.
 *
 * **Courses, not topics, are the second facet**, because eighty topics carry
 * assets and ten courses organise them. A course's assets are the ones filed
 * under its modules' topics. `?topic=` still works, for the links from an
 * asset page, and shows as a removable chip.
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
  const filters: LibraryFilters = { kind, topic, course, q, sort };

  const [library, access, { kb }] = await Promise.all([
    loadLibrary(),
    loadFileAccess(),
    loadKnowledgeBase(),
  ]);
  const { rows, counts, reachable, truncated, titles, concepts } = library;

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
    topic !== null && `filed under ${titles[topic] ?? topic}`,
  ].filter((c): c is string => typeof c === "string");
  const noMatchSentence =
    "Nothing in the catalog" +
    (conditions.length > 0 ? ` is ${conditions.join(", ")}` : "") +
    (q === null ? "" : `${conditions.length > 0 ? " and" : ""} matches "${q}"`) +
    ".";
  const count = filtered
    ? `${matching.length} of ${universe} ${plural(universe)}`
    : `${universe} ${plural(universe)}`;

  return (
    <div data-layout="app" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="mr-auto flex min-w-0 items-baseline gap-3">
          <h1 className="font-display text-[28px] leading-tight font-bold text-text">Library</h1>
          {reachable && facets.total > 0 && (
            <p className="text-[12px] text-text2 tabular-nums">{count}</p>
          )}
        </div>
        <Form action="/library" role="search" className="w-full sm:w-[340px]">
          {/* The other filters ride along, so a search narrows the view the
              reader is in rather than resetting it. Only the ones that are set,
              so an unfiltered search is a clean `?q=`. */}
          {kind !== null && <input type="hidden" name="kind" value={kind} />}
          {topic !== null && <input type="hidden" name="topic" value={topic} />}
          {course !== null && <input type="hidden" name="course" value={course} />}
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
          <SearchField
            label="Search the library"
            placeholder="Search titles, transcripts, notes"
            defaultValue={q ?? ""}
            maxLength={200}
          />
        </Form>
      </header>

      {!reachable ? (
        <Notice title="The catalog is unreachable" command="npm run catalog -- status">
          This page is a view over the <code>asset</code> table, and the database could not be
          asked. Nothing has been lost: the videos, the diagrams and the notes are all still where
          they were, and one index run rebuilds every row here from the files in git.
        </Notice>
      ) : facets.total === 0 ? (
        <Notice title="Nothing indexed yet" command="npm run catalog -- index">
          The catalog is reachable and holds no assets. Every row on this page is derived from files
          in git (concept notes, session logs, exported diagrams, the videos manimkc rendered), so
          one index run fills it.
        </Notice>
      ) : (
        <>
          <section aria-label="Filters" className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-3">
              {/* One scrolling row on a phone, edge to edge; wrapped rows from
                  768px, with the sort at the right of the first. */}
              <div
                role="group"
                aria-label="Filter by kind and course"
                className="-mx-4 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
              >
                <Chip href={libraryHref({ ...filters, kind: null })} active={kind === null}>
                  All kinds
                </Chip>
                {facets.primary.map((facet) => (
                  <Chip
                    key={facet.kind}
                    href={libraryHref({ ...filters, kind: facet.kind })}
                    active={kind === facet.kind}
                  >
                    {facet.label}
                  </Chip>
                ))}
                {courseChips.length > 0 && <span aria-hidden className="w-2 shrink-0" />}
                {courseChips.map((facet) => (
                  <Chip
                    key={facet.slug}
                    // The active course chip clears itself: there is no "All
                    // courses" chip, as in the hi-fi.
                    href={libraryHref({ ...filters, course: course === facet.slug ? null : facet.slug })}
                    active={course === facet.slug}
                    title={`${facet.code} ${facet.title}: ${facet.count} ${facet.count === 1 ? "asset" : "assets"}`}
                  >
                    {facet.code}
                  </Chip>
                ))}
                {course !== null && chosenCourse === null && (
                  <Chip href={libraryHref({ ...filters, course: null })} active title="Remove this filter">
                    Course {course} <span aria-hidden>×</span>
                  </Chip>
                )}
                {topic !== null && (
                  <Chip href={libraryHref({ ...filters, topic: null })} active title="Remove this filter">
                    {titles[topic] ?? topic} <span aria-hidden>×</span>
                  </Chip>
                )}
              </div>
              <SortToggle filters={filters} sort={sort} />
            </div>

            {facets.companion.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-[12px] text-text3">
                  {facets.total - facets.standalone} companion files, kept out of All kinds:
                </span>
                {facets.companion.map((facet) => (
                  <Chip
                    key={facet.kind}
                    size="sm"
                    href={libraryHref({ ...filters, kind: facet.kind })}
                    active={kind === facet.kind}
                  >
                    {facet.label}
                    <span className="tabular-nums opacity-70">{facet.count}</span>
                  </Chip>
                ))}
              </div>
            )}
          </section>

          {!access.selfLearn.ok ? (
            <Notice role="status" title={access.selfLearn.headline} command={access.selfLearn.fix}>
              {access.selfLearn.detail}
            </Notice>
          ) : !access.manimkc.ok ? (
            <Notice role="status" title={access.manimkc.headline} command={access.manimkc.fix}>
              {access.manimkc.detail}
            </Notice>
          ) : null}

          {search !== null && !search.searchedText && (
            <p role="status" className="text-[12px] text-text2">
              Searched titles only: this deployment does not read asset files, so notes and
              transcripts were matched by name, not by what they say.
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
            <ul
              aria-label={q === null ? "Assets" : `Assets matching ${q}`}
              className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]"
            >
              {matching.map((row) => {
                const explained = explainedConcepts(concepts[row.id] ?? [], kbById);
                const first = explained[0];
                const concept: CardConcept | undefined =
                  first === undefined
                    ? undefined
                    : { title: first.title, bucket: first.bucket, more: explained.length - 1 };
                const topicSlug = row.topics[0];
                return (
                  <li key={row.id} className="flex">
                    <AssetCard
                      asset={row}
                      concept={concept}
                      topic={topicSlug === undefined ? undefined : (titles[topicSlug] ?? topicSlug)}
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
 * "Sort: newest" from the hi-fi, as a link that flips to the other order.
 * Newest is when the row entered the catalog; title is A to Z by the name on
 * the card.
 */
function SortToggle({ filters, sort }: { filters: LibraryFilters; sort: "newest" | "title" }) {
  const other = sort === "newest" ? "title" : "newest";
  return (
    <Link
      href={libraryHref({ ...filters, sort: other })}
      aria-label={`Sorted by ${sort}. Sort by ${other} instead.`}
      className={cx(
        "shrink-0 self-end rounded-sm text-[12px] whitespace-nowrap text-text2 underline-offset-4 hover:text-text hover:underline md:mt-2 md:self-auto",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      Sort: {sort}
    </Link>
  );
}
