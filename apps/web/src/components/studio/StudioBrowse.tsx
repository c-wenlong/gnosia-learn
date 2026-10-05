"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, type ReactNode } from "react";

import { DiagramRow, DiagramTile } from "@/components/studio/DiagramTile";
import { useFadeOnChange } from "@/components/studio/motion-parts";
import { NewDiagramJobs } from "@/components/studio/GridJob";
import { useStudioPath } from "@/components/studio/panel-host";
import { EmptyDirectory } from "@/components/studio/StudioBlocked";
import { DisplayMenu, KindSegments, SortMenu, StudioSearch, TopicChips } from "@/components/studio/StudioControls";
import { SettingsLink } from "@/components/studio/StudioSettings";
import { NewVideoJobs, VideoRow, VideoTile } from "@/components/studio/video/VideoGridJob";
import { cx, LABEL } from "@/components/ui/classes";
import { filterVideos, gridSections, sectionItems, sortVideos, type StudioVideo } from "@/lib/studio-video";
import {
  displayTitle,
  filterDiagrams,
  groupDiagrams,
  panelHref,
  parseView,
  rawParamsOf,
  showsKind,
  sortDiagrams,
  studioHref,
  type Diagram,
  type StudioView,
  type TopicChip,
} from "@/lib/studio-view";

/**
 * The strip's controls and the grid, drawn in the browser from the address
 * bar.
 *
 * The page reads the diagrams, the videos and the vocabulary once and hands
 * them here whole. A change to the kind, the search, the topics, Display or Sort moves
 * the URL without a server render (`browserViewMove`), and this redraws from
 * what it already holds: filtering, sorting and grouping are pure functions
 * of the two, and a server render to run them took two seconds or more.
 */

/** The view the address bar names now, not the one the page was drawn for. */
function useStudioView(): StudioView {
  const search = useSearchParams();
  return useMemo(() => parseView(rawParamsOf(new URLSearchParams(search.toString()))), [search]);
}

export function StudioToolbar({ chips }: { chips: TopicChip[] }) {
  const view = useStudioView();
  // Two halves, side by side when the panel has room for both (a container
  // query on the panel's own width, since the sidebar takes 260px of the
  // window from 768px) and one over the other when it has not: the kind and
  // Search, then the topics with Display, Sort and Settings. On one row the
  // controls ran off the right edge of a phone and of a narrow panel, the
  // topic menu's "+N" and Settings with them, where nothing could reach them.
  return (
    <div className="@container min-w-0 flex-1">
      <div className="flex flex-col gap-2 @[52rem]:flex-row @[52rem]:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <KindSegments view={view} />
          <StudioSearch view={view} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TopicChips chips={chips} view={view} />
          <DisplayMenu view={view} />
          <SortMenu view={view} />
          <SettingsLink href={studioHref(view, { settings: true, draft: null, job: null, extend: null, selected: null, shot: null, play: null })} />
        </div>
      </div>
    </div>
  );
}

/** Children only while the URL still carries a verb's outcome, which a view change drops. */
export function WhileOutcome({ children }: { children: ReactNode }) {
  return useSearchParams().get("v") === null ? null : children;
}

export function StudioGrid({
  diagrams,
  videos,
  titles,
  domains,
  dir,
  unreadable,
  path: drawnFor,
}: {
  /** Every diagram in the directory, unfiltered. */
  diagrams: Diagram[];
  /** Every studio video, unfiltered. */
  videos: StudioVideo[];
  /** Topic titles by slug. */
  titles: Record<string, string>;
  /** Topic domains by slug. */
  domains: Record<string, string>;
  /** The directory, for the empty state. */
  dir: string;
  /** How many documents would not parse; the page says which. */
  unreadable: number;
  /** The path the server drew the page for, until the host has its own. */
  path: string;
}) {
  const view = useStudioView();
  const path = useStudioPath(drawnFor);
  const titleMap = useMemo(() => new Map(Object.entries(titles)), [titles]);
  const domainMap = useMemo(() => new Map(Object.entries(domains)), [domains]);
  // Every diagram's path, filtered or not: a job drawing onto one of these is
  // an extend and goes on its tile; any other target is a new diagram's card.
  const targets = useMemo(() => diagrams.map((diagram) => diagram.tldr.path), [diagrams]);
  const videoSlugs = useMemo(() => videos.map((video) => video.slug), [videos]);
  // A change of how the grid is drawn (grid or list, the kind, the grouping)
  // fades it in again. Typing a search does not: it moves too often.
  const box = useRef<HTMLDivElement | null>(null);
  useFadeOnChange(box, `${view.layout}|${view.kind}|${view.group}`);

  const sections = useMemo(() => {
    const groups = groupDiagrams(sortDiagrams(filterDiagrams(diagrams, view), view), view, titleMap, domainMap);
    const shown = sortVideos(filterVideos(videos, view), view);
    return gridSections(groups, shown, view.group, titleMap, domainMap).filter(
      (section) => section.diagrams.length + section.videos.length > 0,
    );
  }, [diagrams, videos, view, titleMap, domainMap]);

  // What Sort compares on a diagram, so its tiles and the videos share one order.
  const sortKey = (diagram: Diagram) => ({
    title: displayTitle(diagram),
    time: view.sort === "created" ? diagram.created : diagram.tldr.modified,
  });
  // Extend patches this view, so the filters are there when the panel closes.
  const extendFrom = (name: string) => panelHref(path, { extend: name, selected: null, job: null, draft: null });
  const grid = view.layout === "grid";

  // The jobs making something new lead the first section. The way in is the
  // home view's composer above the grid (D81 of docs/STUDIO-CHAT-FIRST.md).
  // They follow the kind filter: a new diagram's job is a diagram.
  const layout = grid ? "grid" : "list";
  const lead = (
    <>
      {showsKind(view.kind, "diagram") && <NewDiagramJobs targets={targets} path={path} layout={layout} />}
      {showsKind(view.kind, "video") && <NewVideoJobs slugs={videoSlugs} path={path} layout={layout} />}
    </>
  );
  const frame = grid ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3" : "space-y-0.5";

  if (sections.length === 0) {
    return (
      <div ref={box} className="space-y-6">
        {/* Empty, with no job making anything: no frame at all. */}
        <div className={cx(frame, "empty:hidden")}>{lead}</div>
        {diagrams.length === 0 && unreadable === 0 && videos.length === 0 ? (
          <EmptyDirectory dir={dir} />
        ) : (
          <p className="text-sm text-text2">
            {view.kind === "video"
              ? "No video matches this filter."
              : view.kind === "diagram" || videos.length === 0
                ? "No diagram matches this filter."
                : "No diagram or video matches this filter."}{" "}
            <a className="underline underline-offset-2" href="/studio">
              Clear it
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  // Diagrams and studio videos share the groups, and one order inside each.
  return (
    <div ref={box} className="space-y-6">
      {sections.map((section, at) => (
        <section key={section.key}>
          {section.label !== "" && (
            <h2 className={cx(LABEL, "mb-2")}>
              {section.label} · {section.diagrams.length + section.videos.length}
            </h2>
          )}
          <div className={frame}>
            {at === 0 && lead}
            {sectionItems(section, view, sortKey).map((entry) =>
              entry.kind === "video" ? (
                grid ? (
                  <VideoTile key={`video:${entry.item.slug}`} video={entry.item} path={path} />
                ) : (
                  <VideoRow key={`video:${entry.item.slug}`} video={entry.item} path={path} />
                )
              ) : grid ? (
                <DiagramTile
                  key={`diagram:${entry.item.name}`}
                  diagram={entry.item}
                  path={path}
                  selectHref={studioHref(view, { selected: entry.item.name })}
                  extendHref={extendFrom(entry.item.name)}
                  showConcepts={view.chips}
                />
              ) : (
                <DiagramRow
                  key={`diagram:${entry.item.name}`}
                  diagram={entry.item}
                  path={path}
                  selectHref={studioHref(view, { selected: entry.item.name })}
                  showConcepts={view.chips}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
