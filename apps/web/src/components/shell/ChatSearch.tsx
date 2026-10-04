"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";

import { SEARCH_MAX, type HistorySearch } from "@/components/studio/history-search";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { isCurrentRow } from "@/lib/nav";
import type { RecentItem } from "@/lib/recent-core";
import { matchParts, searchRows, type SearchRow } from "@/lib/studio-draft-list";
import { conversationHref, relativeTime } from "@/lib/studio-view";

import { FADE, FADE_IN } from "./motion";
import { rowClick } from "./row-click";
import { RECENT_GLYPHS, ROW, rowFill } from "./rows";
import { useRecentSearch } from "./use-recent";

/**
 * The sidebar's search (D87 of docs/STUDIO-CHAT-FIRST.md, widened by L7 of
 * docs/proposals/library-by-type-and-day.md): the field under New chat, and
 * the matches that take the place of Recent's day groups while it holds
 * words. It searches everything Recent holds: the studio's conversations
 * through the runner, which matches their first messages too
 * (`useHistorySearch`), and every other row's title through the catalog
 * (`useRecentSearch`); the two are merged newest first.
 *
 * What is drawn here is marked `data-peek-hold`: the folded sidebar slid out
 * over the page stays out while focus is in the field or a match, and slides
 * back once focus and the pointer have both left (`AppSidebar`).
 */

/** A magnifying glass, the field's and the rail's. */
export function SearchIcon({ className = "size-[18px] shrink-0 text-text2" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.2 13.2 3.3 3.3" />
    </svg>
  );
}

/**
 * The field. Escape clears it when it holds words and does nothing else, so a
 * drawer or a slid-out sidebar is not closed by the same press; with the field
 * empty Escape goes on to close them.
 */
export function SearchField({
  search,
  inputRef,
  compact = false,
}: {
  search: HistorySearch;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Narrowed to its icon on the folded rail: no fill, so it reads as one of the rail's icons. */
  compact?: boolean;
}) {
  return (
    <div
      data-peek-hold=""
      className={cx(
        "relative flex h-[var(--shell-row,36px)] items-center overflow-hidden rounded-[var(--shell-row-radius,10px)] text-text2 transition-colors duration-150 motion-reduce:transition-none",
        compact ? "bg-transparent" : "bg-surface2",
        "focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-accent",
      )}
    >
      <SearchIcon className="pointer-events-none absolute left-[var(--shell-row-pad,8px)] size-[18px] shrink-0" />
      <input
        ref={inputRef}
        type="search"
        name="history-search"
        value={search.query}
        maxLength={SEARCH_MAX}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search"
        aria-label="Search recent"
        onChange={(event) => search.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || search.query === "") return;
          event.stopPropagation();
          search.clear();
        }}
        className={cx(
          "h-full min-w-0 flex-1 appearance-none bg-transparent pl-[34px] pr-8 text-[16px] text-text outline-none md:text-[14px]",
          // The words fade with the sidebar's labels; the icon beside them stays.
          FADE,
          compact ? "opacity-0" : FADE_IN,
          "placeholder:text-text3 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
        )}
      />
      {/* Not on the folded rail: it would sit on the icon, under the rail's search button. */}
      {search.query !== "" && !compact && (
        // Fades in with the first letter typed; it goes with the last.
        <button
          type="button"
          aria-label="Clear the search"
          title="Clear the search"
          onClick={() => {
            search.clear();
            inputRef.current?.focus();
          }}
          className="absolute right-1 inline-flex size-7 animate-fade-in items-center justify-center rounded-md text-text3 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-accent motion-reduce:animate-none"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="m5.5 5.5 9 9m0-9-9 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** What the field found, in place of Recent's day groups: one flat list, newest first, or why there is none. */
export function SearchResults({
  search,
  studio,
  names,
  path,
  active,
  navigate,
  onPick,
}: {
  search: HistorySearch;
  /** Whether the runner's conversations are searched too. */
  studio: boolean;
  /** The owner's names for conversations, by row key. */
  names: Readonly<Record<string, string>>;
  path: string;
  active: string | null;
  /** The studio page's browser move, or null off the studio. */
  navigate: ((href: string) => boolean) | null;
  onPick: () => void;
}) {
  const recent = useRecentSearch(search.words, studio);
  const conversations =
    search.found === null
      ? []
      : searchRows(search.found.drafts, {}, search.words).map((row) =>
          names[`draft:${row.draftId}`] === undefined ? row : { ...row, heading: names[`draft:${row.draftId}`], quoted: false },
        );
  const others = (recent.found ?? []).filter((item) => !(studio && item.kind === "draft"));
  const hits: ({ type: "draft"; at: string; row: SearchRow } | { type: "item"; at: string; item: RecentItem })[] = [
    ...conversations.map((row) => ({ type: "draft" as const, at: row.updated, row })),
    ...others.map((item) => ({ type: "item" as const, at: item.at, item })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const searching = (studio && search.searching) || (recent.found === null && recent.error === null);
  const settled = !searching && (!studio || search.found !== null || search.error !== null);
  const errors = [studio ? search.error : null, recent.error].filter((e): e is string => e !== null);
  // Fades in over the list it replaces, once, as the search starts; the
  // words that follow redraw it in place.
  return (
    <div data-peek-hold="" className="animate-fade-in pt-1 motion-reduce:animate-none">
      {errors.map((error) => (
        <p key={error} role="alert" className="px-2 pt-1 text-[13px] leading-5 text-danger">
          {error}
        </p>
      ))}
      {searching && hits.length === 0 && (
        <p role="status" className="px-2 pt-1 text-[13px] leading-5 text-text3">
          Searching…
        </p>
      )}
      {settled && hits.length === 0 && search.found?.more !== true && errors.length === 0 && (
        <p role="status" className="px-2 pt-1 text-[13px] leading-5 text-text3">
          Nothing matches
        </p>
      )}
      {hits.length > 0 && (
        <>
          <p role="status" className="sr-only">
            {hits.length} {hits.length === 1 ? "row matches" : "rows match"}
          </p>
          <ul className="flex flex-col gap-px">
            {hits.map((hit) =>
              hit.type === "draft" ? (
                <li key={`draft:${hit.row.draftId}`}>
                  <SearchHit
                    row={hit.row}
                    words={search.words}
                    href={conversationHref(path, hit.row.draftId)}
                    current={hit.row.draftId === active}
                    navigate={navigate}
                    onPick={onPick}
                  />
                </li>
              ) : (
                <li key={hit.item.key}>
                  <RecentHit item={hit.item} words={search.words} onPick={onPick} />
                </li>
              ),
            )}
          </ul>
        </>
      )}
      {studio && search.found?.more === true && (
        <div className="px-0.5 pt-2">
          <button
            type="button"
            onClick={search.showMore}
            disabled={search.loadingMore}
            className="rounded-lg px-1.5 py-1 text-[13px] font-medium text-accent-text underline-offset-4 hover:underline disabled:cursor-progress disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {search.loadingMore ? "Reading more matches…" : "Show more matches"}
          </button>
          {search.moreError !== null && (
            <p role="alert" className="px-1.5 text-[12px] text-danger">
              {search.moreError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** A catalog row that matched: its glyph and its title, the words marked. */
function RecentHit({ item, words, onPick }: { item: RecentItem; words: string; onPick: () => void }) {
  const pathname = usePathname();
  const current = isCurrentRow(item.href, pathname, item.kind === "module");
  const kind = RECENT_GLYPHS[item.kind];
  return (
    <Link href={item.href} onClick={onPick} aria-current={current ? "page" : undefined} title={item.title} className={cx(ROW, rowFill(current))}>
      <Glyph name={kind.glyph} size={18} className="text-text2" />
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">{kind.word}: </span>
        <Marked text={item.title} words={words} />
      </span>
    </Link>
  );
}

/** The matched words, in bold and the accent's text colour. */
function Marked({ text, words }: { text: string; words: string }) {
  return (
    <>
      {matchParts(text, words).map((part, at) =>
        part.hit ? (
          <mark key={at} className="bg-transparent font-semibold text-accent-text">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** A hit is two lines (the heading, and the words around the match), so it stacks where a history row centres. */
const HIT = cx(
  "flex min-h-[var(--shell-row,36px)] w-full flex-col items-start justify-center rounded-[var(--shell-row-radius,10px)] py-1.5 ps-[34px] pe-2 text-[14px] text-text",
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent",
);

function SearchHit({
  row,
  words,
  href,
  current,
  navigate,
  onPick,
}: {
  row: SearchRow;
  words: string;
  href: string;
  current: boolean;
  navigate: ((href: string) => boolean) | null;
  onPick: () => void;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      onClick={rowClick(navigate, href, onPick)}
      aria-current={current ? "page" : undefined}
      title={`${row.heading}\n${row.state} · ${relativeTime(row.updated)}`}
      suppressHydrationWarning
      className={cx(HIT, "relative transition-colors", rowFill(current))}
    >
      <Glyph name="compose" size={18} className="absolute left-[var(--shell-row-pad,8px)] top-[9px] text-text2" />
      <span className={cx("block w-full min-w-0 truncate", row.quoted && !current && "text-text2")}>
        <span className="sr-only">Conversation: </span>
        <Marked text={row.heading} words={words} />
      </span>
      {row.snippet !== null && (
        <span className="block w-full min-w-0 truncate text-[12px] font-normal leading-4 text-text3">
          <Marked text={row.snippet} words={words} />
        </span>
      )}
      <span className="sr-only">, {row.state}</span>
    </Link>
  );
}
