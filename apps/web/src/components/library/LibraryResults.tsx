"use client";

import {
  startTransition,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { libraryPage, type LibraryPageAnswer } from "@/app/(app)/library/page-action";
import { LibraryMoreContext } from "@/components/library/library-more";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { SkeletonCard, SkeletonRow } from "@/components/ui/Skeleton";
import { TextLink } from "@/components/ui/TextLink";
import { cx } from "@/components/ui/classes";
import type { LibraryView } from "@/lib/library";
import {
  cameBack,
  foldPieces,
  heldPagesKey,
  parseHeldPages,
  type FoldedGroup,
  type LibraryPage,
} from "@/lib/library-pages";

type Page = LibraryPage<ReactNode>;
type Status = "idle" | "loading" | "failed" | "stale";

/** Placeholders a loading page shows: a screen's worth in each layout, or fewer when fewer rows are left. */
export const SKELETON_ROWS = { list: 12, grid: 6 } as const;

/** Loads a screen ahead of the reader: the sentinel counts as seen a viewport before it is. */
const AHEAD = "0px 0px 100% 0px";

// When the browser last went back or forward, read when a list mounts
// (`cameBack`). Module state, since the list that mounts after a popstate is
// a new instance. Marked before the app router hears of it: the router
// renders a back navigation inside its own popstate listener, effects
// included, so a listener after it would mark the time once the list had
// already decided (measured). The Navigation API says so first where the
// browser has it, and a capturing listener runs before the router's own.
let lastPop: number | null = null;
let mountedBefore = false;
if (typeof window !== "undefined") {
  const mark = () => {
    lastPop = Date.now();
  };
  window.addEventListener("popstate", mark, { capture: true });
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
  navigation?.addEventListener("navigate", (event) => {
    if ((event as Event & { navigationType?: string }).navigationType === "traverse") mark();
  });
}

function navigationType(): string | null {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type ?? null;
  } catch {
    return null;
  }
}

function readHeld(key: string) {
  try {
    return parseHeldPages(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeHeld(key: string, pages: number, y: number) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ pages, y: Math.max(0, Math.round(y)) }));
  } catch {
    // Storage full or blocked: back then starts at the first page, as it did before.
  }
}

/**
 * The Library's rows, a page at a time (L9 of
 * docs/proposals/library-by-type-and-day.md). The server draws the first
 * page with the page (`renderLibraryPage`); this holds it and every page
 * after, folded into one heading per group (`foldPieces`), each heading's
 * count the group's whole count however much of it is drawn.
 *
 * **The next page loads a screen before the reader reaches it**: a sentinel
 * under the list, watched with a root margin of one viewport, asks
 * `libraryPage` for the rows after the cursor the last page handed over.
 * One request at a time. While it is out, the last group shows placeholders
 * in the layout's shape (`SkeletonRow`, `SkeletonCard`), which the rows
 * replace as they arrive, fading in. Show older under the list does the same
 * for a keyboard or a screen reader, and moves focus to the first row it
 * brought; a load that fails says so in a quiet line with Try again, never a
 * toast.
 *
 * **Back and forward come back to the same place.** The number of pages held
 * and the scroll offset are kept in session storage under the view's URL;
 * a list reached by back, forward or a reload (`cameBack`) asks for the
 * same number of pages again and then scrolls to where the reader was.
 *
 * The previewer around it (`Previewer`) finds this list's loader in
 * `LibraryMoreContext`, so its right arrow on the last row drawn loads the
 * next page and walks into it.
 */
export function LibraryResults({
  href,
  view,
  label,
  first,
  more,
}: {
  /** The view's URL (`libraryHref`), which the server reads the filters from and the scroll is kept under. */
  href: string;
  view: LibraryView;
  /** The list's accessible name. */
  label: string;
  first: Page;
  /** The button's words: "Show older" when the rows run newest first, "Show more" otherwise. */
  more: string;
}) {
  const [pages, setPages] = useState<Page[]>([first]);
  const [status, setStatus] = useState<Status>("idle");
  const last = pages[pages.length - 1];
  const next = last.next;
  const listRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);
  // Set while back or forward draws the pages the reader held, so the
  // sentinel does not race it.
  const restoring = useRef(false);
  // The pages on screen, for code that runs after a commit.
  const drawn = useRef(pages);
  // Resolved once the pages they waited for are on screen.
  const waiting = useRef<Array<(added: boolean) => void>>([]);
  // The link to focus once a page Show older asked for is drawn: its index among the list's links.
  const focusFrom = useRef<number | null>(null);
  const storeKey = heldPagesKey(href);

  const load = useCallback(
    async (cursor: string | null): Promise<boolean> => {
      if (cursor === null || inFlight.current) return false;
      inFlight.current = true;
      setStatus("loading");
      let answer: LibraryPageAnswer | null = null;
      try {
        answer = await libraryPage(href, cursor);
      } catch {
        answer = null;
      }
      inFlight.current = false;
      if (answer === null || answer.state !== "ok") {
        setStatus(answer?.state === "stale" ? "stale" : "failed");
        for (const resolve of waiting.current.splice(0)) resolve(false);
        return false;
      }
      const page = answer;
      const shown = new Promise<boolean>((resolve) => waiting.current.push(resolve));
      // A transition: a row's client components may load their code on first
      // use, and an urgent update that suspended would fall back to the
      // page's loading frame. The placeholders stay until the rows commit.
      startTransition(() => {
        setPages((held) => [...held, page]);
        setStatus("idle");
      });
      return shown;
    },
    [href],
  );

  /** The next page when the sentinel is within a screen of the viewport and nothing else is loading. */
  const loadIfNear = useCallback(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || restoring.current || inFlight.current) return;
    if (sentinel.getBoundingClientRect().top > window.innerHeight * 2) return;
    void load(drawn.current[drawn.current.length - 1].next);
  }, [load]);

  // Back, forward or a reload: as many pages as were held, then the scroll.
  // First among the effects, so it holds the list before the sentinel asks.
  useEffect(() => {
    const back = cameBack({ now: Date.now(), lastPop, navigation: navigationType(), firstMount: !mountedBefore });
    mountedBefore = true;
    const held = back ? readHeld(storeKey) : null;
    if (held === null || held.pages <= 1) return;
    restoring.current = true;
    let cancelled = false;
    void (async () => {
      while (!cancelled && drawn.current.length < held.pages) {
        const added = await load(drawn.current[drawn.current.length - 1].next);
        if (!added) break;
      }
      restoring.current = false;
      if (!cancelled) {
        window.scrollTo({ top: held.y, behavior: "instant" });
        writeHeld(storeKey, drawn.current.length, window.scrollY);
      }
    })();
    return () => {
      cancelled = true;
      restoring.current = false;
    };
    // Once, on mount: the page keys this list by its URL, so `storeKey` is this instance's for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rows drawn: settle whoever waited on them, focus the first new row when
  // Show older asked for it, and keep the count for back and forward.
  useEffect(() => {
    drawn.current = pages;
    for (const resolve of waiting.current.splice(0)) resolve(true);
    if (focusFrom.current !== null) {
      const links = listRef.current?.querySelectorAll<HTMLElement>("a[href]");
      links?.[focusFrom.current]?.focus();
      focusFrom.current = null;
    }
    if (!restoring.current) writeHeld(storeKey, pages.length, window.scrollY);
  }, [pages, storeKey]);

  // A page landed and the reader is still within a screen of the end: the next.
  useEffect(() => {
    if (status === "idle") loadIfNear();
  }, [status, pages, loadIfNear]);

  // The sentinel, a screen ahead.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadIfNear();
      },
      { rootMargin: AHEAD },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadIfNear]);

  // The previewer's right arrow past the last row drawn.
  const moreRowsRef = use(LibraryMoreContext);
  useEffect(() => {
    if (moreRowsRef === null) return;
    moreRowsRef.current = () => load(drawn.current[drawn.current.length - 1].next);
    return () => {
      moreRowsRef.current = null;
    };
  }, [moreRowsRef, load]);

  // Where the reader is, for back and forward; written at most every 200ms.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        if (!restoring.current) writeHeld(storeKey, drawn.current.length, window.scrollY);
      }, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer !== null) clearTimeout(timer);
    };
  }, [storeKey]);

  function showMore() {
    focusFrom.current = listRef.current?.querySelectorAll("a[href]").length ?? null;
    void load(next);
  }

  function retry() {
    void load(next);
  }

  const folded = useMemo(() => foldPieces(pages.flatMap((page) => page.pieces)), [pages]);
  const placeholders = status === "loading" ? Math.min(last.remaining, SKELETON_ROWS[view]) : 0;
  const inset = view === "list";

  return (
    <>
      <section
        ref={listRef}
        aria-label={label}
        aria-busy={status === "loading"}
        // A tab, a filter or a sort keeps the groups whose day is still
        // shown and fades in the ones that arrive.
        className={cx("flex flex-col gap-10", RESULTS_MOTION)}
      >
        {folded.map((held, i) => (
          <GroupSection
            key={held.group.key}
            held={held}
            inset={inset}
            render={(rows, isLast) => (
              <RowList view={view} placeholders={i === folded.length - 1 && isLast ? placeholders : 0}>
                {rows}
              </RowList>
            )}
          />
        ))}
      </section>
      <p role="status" className="sr-only">
        {status === "loading" ? "Loading more rows" : ""}
      </p>
      {(next !== null || status === "stale") && (
        <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1", inset && "px-[var(--shell-row-pad)]")}>
          {status === "failed" ? (
            <p className="text-[13px] leading-5 text-text2">
              The next rows did not load.{" "}
              <TextLink size="sm" onClick={retry}>
                Try again
              </TextLink>
            </p>
          ) : status === "stale" ? (
            <p className="text-[13px] leading-5 text-text2">
              The library changed since this page was drawn.{" "}
              <TextLink size="sm" onClick={() => window.location.reload()}>
                Reload
              </TextLink>
            </p>
          ) : (
            <TextLink size="sm" onClick={showMore} pending={status === "loading"} disabled={status === "loading"}>
              {more}
            </TextLink>
          )}
        </div>
      )}
      {/* A screen ahead of the reader (`AHEAD`), so the next page is usually there before they are. */}
      <div ref={sentinelRef} aria-hidden data-library-sentinel className="h-px" />
    </>
  );
}

/**
 * The results dim while a filter, sort or view picked in the toolbar is
 * being rendered (`LibraryToolbar` marks itself `data-pending` for the
 * length of its transition), so the page says it heard the pick before the
 * new rows arrive.
 */
const RESULTS_MOTION =
  "transition-opacity duration-150 ease-out motion-reduce:transition-none group-has-[[data-pending]]/library:opacity-60";
const ARRIVE = "animate-fade-in motion-reduce:animate-none";

/** A group's rows, with the placeholders of a page still loading after them, in the layout's shape. */
function RowList({ view, placeholders, children }: { view: LibraryView; placeholders: number; children: ReactNode[] }) {
  const skeletons = Array.from({ length: placeholders }, (_, i) =>
    view === "list" ? (
      <li key={`skeleton-${i}`} aria-hidden className="group/item">
        <SkeletonRow index={i} />
      </li>
    ) : (
      <li key={`skeleton-${i}`} aria-hidden className="flex">
        <SkeletonCard index={i} />
      </li>
    ),
  );
  return view === "list" ? (
    <ul className="flex flex-col">
      {children}
      {skeletons}
    </ul>
  ) : (
    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
      {children}
      {skeletons}
    </ul>
  );
}

/**
 * One group's rows under its heading, Manus's `date-heading`: the day ("4 Oct",
 * the year when it is not this one), the course ("CS3230" and its title in
 * grey), the topic (with its mastery dot) or the conversation (the day it was
 * last written to in grey), and the group's whole count in grey, "(5)", even
 * while only part of it is drawn.
 * The heading is the shell's row height (`--shell-row`); in the list it is
 * inset by the row's start padding (`--shell-row-pad`) so it lines up with
 * the glyphs under it, and in the grid it sits flush with the cards. A course
 * group runs its modules in course order, each under a smaller grey heading
 * with its own count, 24px apart. A group that arrives with a tab, a filter,
 * a new grouping or the next page fades in.
 */
function GroupSection({
  held,
  inset,
  render,
}: {
  held: FoldedGroup<ReactNode>;
  inset: boolean;
  render: (rows: ReactNode[], last: boolean) => ReactNode;
}) {
  const { group, sections } = held;
  const id = `group-${(group.key || "none").replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const pad = inset && "px-[var(--shell-row-pad)]";
  const modules = sections.length > 0 && sections[0].section !== null;
  return (
    <section aria-labelledby={id} className={cx("flex flex-col", inset ? "gap-1" : "gap-3", ARRIVE)}>
      <h2
        id={id}
        className={cx("flex h-[var(--shell-row)] min-w-0 items-center gap-1.5 text-[14px] leading-5 font-medium text-text", pad)}
      >
        {group.bucket !== undefined && <MasteryDot bucket={group.bucket} size={12} />}
        <span className="min-w-0 truncate">
          {group.label}
          {group.detail !== undefined && <span className="font-normal text-text2"> {group.detail}</span>}
        </span>
        <span className="shrink-0 text-[12px] font-normal text-text2 tabular-nums">({group.count})</span>
      </h2>
      {!modules ? (
        render(
          sections.flatMap((s) => s.rows),
          true,
        )
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ section, rows }, i) => (
            <section
              key={section?.key || "course"}
              aria-label={`${group.label}, ${section?.label ?? ""}`}
              className={cx("flex flex-col", inset ? "gap-1" : "gap-3")}
            >
              <h3 className={cx("flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-text2", pad)}>
                <span className="min-w-0 truncate">{section?.label}</span>
                <span className="shrink-0 text-[12px] tabular-nums">({section?.count ?? rows.length})</span>
              </h3>
              {render(rows, i === sections.length - 1)}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
