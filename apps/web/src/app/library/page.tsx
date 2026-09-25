import Link from "next/link";
import { AssetCard } from "@/components/AssetCard";
import {
  loadFileAccess,
  loadLibrary,
  thumbnailFor,
  thumbnailStatusFor,
  type FileAccess,
} from "@/lib/asset-library";
import {
  assetHref,
  firstParam,
  isCompanionKind,
  kindFacets,
  kindNoun,
  kindRank,
  libraryHref,
  topicFacets,
  type KindFacet,
} from "@/lib/library";

export const metadata = {
  title: "Library",
  description: "Every video, diagram, note, session log and link the catalog holds.",
};

/**
 * `/library` — every asset the catalog knows about, as something to browse.
 *
 * **What the default view shows, and why it is not all 206 rows.** The rule and
 * its reasoning live in `@/lib/library`, next to the set that implements it:
 * sixty-nine of those rows are a caption track, a transcript and a chapter list
 * written beside each of thirty videos, and two more are the canvas each
 * diagram was exported from. The default view is the 135 that stand on their
 * own; the other 71 keep their own chips, their own linkable views, and a place
 * on the detail page of whatever they belong to. The page says out loud how
 * many rows it is not showing.
 *
 * **The filters are the URL.** `?kind=` and `?topic=` are the whole state, so
 * every chip is an `<a>`, a view is linkable, the back button undoes a filter
 * and the page needs no client JavaScript at all. That is also why the topic
 * rail is a `<details>` rather than a popover: eighty topics carry assets and
 * native disclosure needs no script to hide seventy-two of them.
 *
 * **Dynamic, like every page here.** It reads the catalog, and
 * `loadLibrary()` marks the read as request work so `npm run build` still
 * succeeds with no database.
 */

/** One filter chip. A link, always — the filter state is the query string. */
function Chip({
  href,
  active,
  children,
  count,
  tone = "primary",
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
  tone?: "primary" | "quiet";
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-colors duration-150 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const size = tone === "quiet" ? "text-[12px]" : "text-[13px]";
  const style = active
    ? "border-[var(--accent)] bg-[var(--nav-active-bg)] font-medium text-[var(--accent-strong)]"
    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]";
  return (
    <Link href={href} className={`${base} ${size} ${style}`} aria-current={active ? "page" : undefined}>
      {children}
      {count !== undefined && (
        <span
          className={`tabular-nums ${active ? "text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/**
 * The three states in which the bytes are not available, said once for the
 * whole page rather than thirty times on thirty dead players.
 */
function AccessNotice({ access }: { access: FileAccess }) {
  if (access.ok) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h2 className="text-sm font-semibold text-[var(--foreground)]">{access.headline}</h2>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--muted-strong)]">
        {access.detail}
      </p>
      <pre className="mt-2.5 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] px-3 py-2 font-mono text-xs text-[var(--muted-strong)]">
        {access.fix}
      </pre>
    </div>
  );
}

function Unreachable() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-lg font-semibold">The catalog is unreachable</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--muted-strong)]">
        This page is a view over the <code>asset</code> table, and the database
        could not be asked. Nothing has been lost: the videos, the diagrams and
        the notes are all still where they were, and one index run rebuilds
        every row here from the files in git.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] p-3 font-mono text-xs leading-relaxed">
        {`npm run catalog -- status`}
      </pre>
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-lg font-semibold">Nothing indexed yet</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--muted-strong)]">
        The catalog is reachable and holds no assets. Every row on this page is
        derived from files in git — concept notes, session logs, exported
        diagrams, the videos manimkc rendered — so one index run fills it.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--sidebar-bg)] p-3 font-mono text-xs leading-relaxed">
        {`npm run catalog -- index`}
      </pre>
    </div>
  );
}

/** A filter that matched nothing, with the way back. */
function NoMatches({ kind, topic }: { kind: string | null; topic: string | null }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-base font-semibold">No assets match</h2>
      <p className="mt-1.5 max-w-prose text-sm text-[var(--muted-strong)]">
        Nothing in the catalog is both{" "}
        {kind && <span className="font-medium">a {kind}</span>}
        {kind && topic && " and "}
        {topic && <span className="font-mono text-[13px]">{topic}</span>}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {topic && (
          <Chip href={libraryHref({ kind })} active={false}>
            Drop the topic
          </Chip>
        )}
        {kind && (
          <Chip href={libraryHref({ topic })} active={false}>
            Drop the kind
          </Chip>
        )}
        <Chip href="/library" active={false}>
          Clear both
        </Chip>
      </div>
    </div>
  );
}

/**
 * Preview cards and compact rows want different column widths: a 16:9 tile
 * needs room to be a picture, a glyph-and-title row does not and looks sparse
 * given it. `auto-fill` rather than `auto-fit` so a section holding two
 * diagrams leaves two card-sized cards rather than stretching them across the
 * page.
 */
function grid(kind: string): string {
  const previewable = kind === "video" || kind === "diagram_svg";
  return previewable
    ? "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4"
    : "grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const kind = firstParam(params.kind);
  const topic = firstParam(params.topic);

  const [{ rows, counts, reachable, truncated, titles }, access] = await Promise.all([
    loadLibrary(),
    loadFileAccess(),
  ]);

  const facets = kindFacets(counts);
  // The topic rail counts over everything, not over the current view, so a
  // chip's number does not change as other filters move and a topic never
  // disappears because the kind beside it is filtered out.
  const topics = topicFacets(rows);

  const matching = rows.filter(
    (row) =>
      (kind === null ? !isCompanionKind(row.kind) : row.kind === kind) &&
      (topic === null || row.topics.includes(topic)),
  );

  // Sections, in the order `@/lib/library` ranks them. One selected kind is
  // one section, and its heading would only repeat the chip above it.
  const sections = [...new Set(matching.map((row) => row.kind))].sort(
    (a, b) => kindRank(a) - kindRank(b) || (a < b ? -1 : 1),
  );

  const facetOf = (k: string): KindFacet | undefined =>
    [...facets.primary, ...facets.companion].find((f) => f.kind === k);

  return (
    <div data-layout="wide" className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-sm text-[var(--muted)]">Catalog</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Library</h1>
        <p className="max-w-prose text-sm leading-relaxed text-[var(--muted-strong)]">
          Everything the catalog has indexed: the videos manimkc rendered, the
          diagrams drawn on a canvas, the concept notes, the session logs and
          the curated links. Rows are rebuilt from files in git by{" "}
          <code>npm run catalog -- index</code>, so this page can never hold
          something the repository does not.
        </p>
      </header>

      {!reachable ? (
        <Unreachable />
      ) : facets.total === 0 ? (
        <EmptyCatalog />
      ) : (
        <>
          {!access.selfLearn.ok && <AccessNotice access={access.selfLearn} />}
          {access.selfLearn.ok && !access.manimkc.ok && <AccessNotice access={access.manimkc} />}

          <section aria-label="Filters" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip href={libraryHref({ topic })} active={kind === null} count={facets.standalone}>
                Everything
              </Chip>
              <span aria-hidden className="h-5 w-px bg-[var(--border)]" />
              {facets.primary.map((facet) => (
                <Chip
                  key={facet.kind}
                  href={libraryHref({ kind: facet.kind, topic })}
                  active={kind === facet.kind}
                  count={facet.count}
                >
                  {facet.label}
                </Chip>
              ))}
            </div>

            {facets.companion.length > 0 && (
              <div className="space-y-1.5">
                <p className="max-w-prose text-xs leading-relaxed text-[var(--muted)]">
                  <span className="font-medium text-[var(--muted-strong)]">
                    {facets.total - facets.standalone} companion files
                  </span>{" "}
                  are kept out of Everything: each one belongs to a video or a
                  drawing rather than standing alone, and showing them flat would
                  bury {facetOf("video")?.count ?? 0} videos under their own
                  sidecars. They are listed on the page of whatever they came
                  from, and here.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {facets.companion.map((facet) => (
                    <Chip
                      key={facet.kind}
                      href={libraryHref({ kind: facet.kind, topic })}
                      active={kind === facet.kind}
                      count={facet.count}
                      tone="quiet"
                    >
                      {facet.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {topics.length > 0 && (
              <details open={topic !== null} className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 py-0.5 text-[13px] text-[var(--muted-strong)] transition-colors duration-150 hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden
                    className="h-3 w-3 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 2.5 8 6l-3.5 3.5" />
                  </svg>
                  {topic === null ? `Filter by topic (${topics.length})` : "Topics"}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topic !== null && (
                    <Chip href={libraryHref({ kind })} active={false} tone="quiet">
                      All topics
                    </Chip>
                  )}
                  {topics.map((facet) => (
                    <Chip
                      key={facet.slug}
                      href={libraryHref({ kind, topic: facet.slug })}
                      active={topic === facet.slug}
                      count={facet.count}
                      tone="quiet"
                    >
                      <span className="font-mono">{facet.slug}</span>
                    </Chip>
                  ))}
                </div>
              </details>
            )}
          </section>

          <section aria-label="Assets" className="space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--border)] pb-2">
              <p className="text-sm text-[var(--muted-strong)]">
                <span className="font-medium tabular-nums text-[var(--foreground)]">
                  {matching.length}
                </span>{" "}
                {kind === null
                  ? matching.length === 1
                    ? "asset"
                    : "assets"
                  : kindNoun(facetOf(kind)?.label ?? kind, matching.length)}
                {kind === null && ` of ${facets.total} in the catalog`}
                {topic !== null && (
                  <>
                    {" "}
                    filed under <span className="font-mono text-[13px]">{topic}</span>
                  </>
                )}
              </p>
              {truncated && (
                <p className="text-xs text-[var(--muted)]">
                  Read stopped at {rows.length} rows; there may be more.
                </p>
              )}
            </div>

            {matching.length === 0 ? (
              <NoMatches kind={kind === null ? null : (facetOf(kind)?.label.toLowerCase() ?? kind)} topic={topic} />
            ) : (
              sections.map((section) => {
                const inSection = matching.filter((row) => row.kind === section);
                return (
                  <div key={section} className="space-y-3">
                    {sections.length > 1 && (
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {facetOf(section)?.label ?? section}{" "}
                        <span className="tabular-nums font-normal">({inSection.length})</span>
                      </h2>
                    )}
                    <div className={grid(section)}>
                      {inSection.map((row) => (
                        <AssetCard
                          key={row.id}
                          asset={row}
                          // The slug is the identity and the title is the
                          // label, so a slug with no title still draws a chip.
                          topic={row.topics[0] === undefined ? undefined : (titles[row.topics[0]] ?? row.topics[0])}
                          href={assetHref(row.id)}
                          // A diagram is its own thumbnail; a video gets a
                          // frame cut out of it on demand. Both are the same
                          // decision: point the `<img>` at something an `<img>`
                          // can decode. Asking it to decode the `.mp4` is what
                          // the placeholder used to stand in for.
                          thumbnailSrc={thumbnailFor(row, access)}
                          thumbnailStatusHref={thumbnailStatusFor(row, access)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
